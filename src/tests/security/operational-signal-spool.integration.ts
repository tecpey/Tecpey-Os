import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createOperationalSignalEvidence } from "../../lib/ops/operational-signal-evidence";
import {
  deliverOperationalSignals,
  enqueueOperationalSignal,
  ensureOperationalSignalSpoolDirectories,
  operationalSignalRetryDelayMs,
} from "../../lib/ops/operational-signal-spool";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-ops-signal-"));
  roots.push(root);
  return root;
}

function signal(
  occurredAt: string,
  measurements: Record<string, number | boolean | null> = {
    unresolved_dead_letters: 1,
    ready_backlog: 500,
  },
) {
  return createOperationalSignalEvidence({
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit: "tecpey-mentor-profile-health.service",
    severity: "critical",
    lifecycle: "firing",
    occurredAt,
    dedupeWindowSeconds: 3_600,
    reasonCodes: ["dead_letter_present", "ready_backlog_critical"],
    measurements,
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Operational signal spool", () => {
  it("atomically deduplicates one incident per window and preserves first observation", async () => {
    const root = await tempRoot();
    const firstSignal = signal("2026-09-18T12:05:00.000Z");
    const laterObservation = signal("2026-09-18T12:55:00.000Z", {
      unresolved_dead_letters: 4,
      ready_backlog: 900,
    });

    const first = await enqueueOperationalSignal(root, firstSignal);
    const replay = await enqueueOperationalSignal(root, laterObservation);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.filePath, replay.filePath);
    assert.equal((await stat(first.filePath)).mode & 0o777, 0o600);

    const stored = JSON.parse(await readFile(first.filePath, "utf8")) as {
      signal: {
        signalId: string;
        measurements: Record<string, number>;
      };
    };
    assert.equal(stored.signal.signalId, firstSignal.signalId);
    assert.equal(stored.signal.measurements.unresolved_dead_letters, 1);
    assert.equal(JSON.stringify(stored).includes("student"), false);
  });

  it("publishes exactly one first observation under concurrent enqueue", async () => {
    const root = await tempRoot();
    const left = signal("2026-09-18T12:05:00.000Z", {
      unresolved_dead_letters: 1,
      ready_backlog: 500,
    });
    const right = signal("2026-09-18T12:45:00.000Z", {
      unresolved_dead_letters: 9,
      ready_backlog: 999,
    });
    assert.equal(left.signalId, right.signalId);

    const results = await Promise.all([
      enqueueOperationalSignal(root, left),
      enqueueOperationalSignal(root, right),
    ]);
    assert.equal(results.filter((result) => result.replayed === false).length, 1);
    assert.equal(results.filter((result) => result.replayed === true).length, 1);
    assert.equal(results[0].filePath, results[1].filePath);

    const stored = JSON.parse(
      await readFile(results[0].filePath, "utf8"),
    ) as {
      signal: {
        occurredAt: string;
        measurements: { unresolved_dead_letters: number };
      };
    };
    const winner = results[0].replayed === false ? left : right;
    assert.equal(stored.signal.occurredAt, winner.occurredAt);
    assert.equal(
      stored.signal.measurements.unresolved_dead_letters,
      winner.measurements.unresolved_dead_letters,
    );
  });

  it("delivers once with webhook idempotency and never redelivers archived signal", async () => {
    const root = await tempRoot();
    const queued = signal("2026-09-18T12:05:00.000Z");
    await enqueueOperationalSignal(root, queued);
    const requests: Array<{
      headers: HeadersInit | undefined;
      body: BodyInit | null | undefined;
    }> = [];

    const summary = await deliverOperationalSignals({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      bearerToken: "test-token",
      now: new Date("2026-09-18T12:06:00.000Z"),
      fetchImpl: async (_input, init) => {
        requests.push({ headers: init?.headers, body: init?.body });
        return new Response(null, { status: 204 });
      },
    });
    assert.deepEqual(summary, {
      selected: 1,
      delivered: 1,
      retryable: 0,
      quarantined: 0,
      skippedUntilLater: 0,
    });
    assert.equal(requests.length, 1);
    const headers = new Headers(requests[0].headers);
    assert.equal(headers.get("Idempotency-Key"), queued.signalId);
    assert.equal(headers.get("Authorization"), "Bearer test-token");

    const dirs = await ensureOperationalSignalSpoolDirectories(root);
    assert.equal((await readdir(dirs.pending)).length, 0);
    assert.equal((await readdir(dirs.delivered)).length, 1);

    const replay = await enqueueOperationalSignal(
      root,
      signal("2026-09-18T12:30:00.000Z"),
    );
    assert.equal(replay.replayed, true);
    assert.equal(path.dirname(replay.filePath), dirs.delivered);

    const rerun = await deliverOperationalSignals({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      now: new Date("2026-09-18T12:31:00.000Z"),
      fetchImpl: async () => {
        throw new Error("must_not_redeliver");
      },
    });
    assert.equal(rerun.selected, 0);
  });

  it("keeps transient failures pending with deterministic bounded jitter", async () => {
    const root = await tempRoot();
    const queued = signal("2026-09-18T12:05:00.000Z");
    await enqueueOperationalSignal(root, queued);

    const firstDelay = operationalSignalRetryDelayMs(1, queued.signalId);
    assert.equal(firstDelay, operationalSignalRetryDelayMs(1, queued.signalId));
    assert.equal(firstDelay >= 15_000 && firstDelay <= 18_000, true);

    const now = new Date("2026-09-18T12:06:00.000Z");
    const summary = await deliverOperationalSignals({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      now,
      fetchImpl: async () => new Response(null, { status: 503 }),
    });
    assert.equal(summary.retryable, 1);

    const dirs = await ensureOperationalSignalSpoolDirectories(root);
    const [name] = await readdir(dirs.pending);
    const item = JSON.parse(
      await readFile(path.join(dirs.pending, name), "utf8"),
    ) as {
      delivery: {
        attemptCount: number;
        nextAttemptAt: string;
        lastErrorCode: string;
      };
    };
    assert.equal(item.delivery.attemptCount, 1);
    assert.equal(item.delivery.lastErrorCode, "webhook_http_503");
    assert.equal(
      Date.parse(item.delivery.nextAttemptAt),
      now.getTime() + firstDelay,
    );

    const early = await deliverOperationalSignals({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      now: new Date(now.getTime() + firstDelay - 1),
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    assert.equal(early.skippedUntilLater, 1);
  });

  it("quarantines terminal responses and unsafe filesystem entries", async () => {
    const root = await tempRoot();
    await enqueueOperationalSignal(root, signal("2026-09-18T12:05:00.000Z"));
    const terminal = await deliverOperationalSignals({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      now: new Date("2026-09-18T12:06:00.000Z"),
      fetchImpl: async () => new Response(null, { status: 400 }),
    });
    assert.equal(terminal.quarantined, 1);

    const dirs = await ensureOperationalSignalSpoolDirectories(root);
    const target = path.join(root, "outside.json");
    await writeFile(target, "{}", { mode: 0o600 });
    await symlink(target, path.join(dirs.pending, `${"a".repeat(64)}.json`));
    await writeFile(
      path.join(dirs.pending, `${"b".repeat(64)}.json`),
      "x".repeat(70 * 1024),
      { mode: 0o600 },
    );
    await writeFile(path.join(dirs.pending, "invalid-name.json"), "{}", {
      mode: 0o600,
    });

    const unsafe = await deliverOperationalSignals({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      now: new Date("2026-09-18T12:07:00.000Z"),
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    assert.equal(unsafe.quarantined, 3);
    assert.equal((await readdir(dirs.pending)).length, 0);
  });
});
