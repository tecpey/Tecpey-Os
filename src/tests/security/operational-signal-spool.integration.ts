import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  deliverOperationalAlerts,
  enqueueOperationalSignal,
  ensureOperationalSpoolDirectories,
} from "@/lib/ops/operational-alert-spool";
import {
  createOperationalSignalEvidence,
  validateOperationalSignalEvidence,
} from "@/lib/ops/operational-signal-evidence";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-ops-signal-"));
  roots.push(root);
  return root;
}

function signal(occurredAt = "2026-09-18T12:00:30.000Z") {
  return createOperationalSignalEvidence({
    signalType: "mentor.profile.projection_stalled",
    component: "mentor-profile",
    detector: "mentor-profile-health-probe",
    severity: "critical",
    statusClassification: "active",
    occurredAt,
    reasonCodes: ["dead_letter_present", "ready_age_critical"],
    attributes: {
      policyVersion: "2026-09-18.3",
      criticalReadyAgeSeconds: 300,
    },
    dedupeWindowSeconds: 900,
  });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Operational signal evidence and durable spool", () => {
  it("derives stable low-cardinality identity inside one dedupe bucket", () => {
    const first = signal("2026-09-18T12:00:30.000Z");
    const replay = signal("2026-09-18T12:14:59.000Z");
    const later = signal("2026-09-18T12:15:00.000Z");

    assert.equal(first.signalId, replay.signalId);
    assert.equal(first.fingerprint, replay.fingerprint);
    assert.equal(first.dedupeBucketAt, "2026-09-18T12:00:00.000Z");
    assert.notEqual(first.signalId, later.signalId);
    assert.equal(later.dedupeBucketAt, "2026-09-18T12:15:00.000Z");
  });

  it("rejects high-cardinality or tampered signal attributes", () => {
    assert.throws(
      () =>
        createOperationalSignalEvidence({
          signalType: "mentor.profile.projection_stalled",
          component: "mentor-profile",
          detector: "mentor-profile-health-probe",
          severity: "critical",
          statusClassification: "active",
          occurredAt: "2026-09-18T12:00:30.000Z",
          reasonCodes: ["dead_letter_present"],
          attributes: { studentId: "123" },
        }),
      /operational_signal_attribute_key_invalid/,
    );

    const valid = signal();
    assert.throws(
      () =>
        validateOperationalSignalEvidence({
          ...valid,
          fingerprint: "a".repeat(64),
        }),
      /operational_signal_fingerprint_mismatch/,
    );
  });

  it("writes schema v2 privately, deduplicates, and delivers with signal idempotency", async () => {
    const root = await tempRoot();
    const evidence = signal();
    const first = await enqueueOperationalSignal(root, evidence);
    const replay = await enqueueOperationalSignal(root, evidence);

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.filePath, replay.filePath);
    assert.equal((await stat(first.filePath)).mode & 0o777, 0o600);

    const stored = JSON.parse(await readFile(first.filePath, "utf8")) as {
      schemaVersion: number;
      signal: { signalId: string; reasonCodes: string[] };
    };
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.signal.signalId, evidence.signalId);
    assert.deepEqual(stored.signal.reasonCodes, [
      "dead_letter_present",
      "ready_age_critical",
    ]);

    const requests: Array<{ headers: HeadersInit | undefined; body: string }> = [];
    const delivered = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now: new Date("2026-09-18T12:01:00.000Z"),
      fetchImpl: async (_input, init) => {
        requests.push({
          headers: init?.headers,
          body: String(init?.body ?? ""),
        });
        return new Response(null, { status: 204 });
      },
    });
    assert.equal(delivered.delivered, 1);
    assert.equal(requests.length, 1);
    assert.equal(
      new Headers(requests[0]!.headers).get("Idempotency-Key"),
      evidence.signalId,
    );
    assert.equal(
      (JSON.parse(requests[0]!.body) as { signalId: string }).signalId,
      evidence.signalId,
    );

    const dirs = await ensureOperationalSpoolDirectories(root);
    assert.equal((await readdir(dirs.pending)).length, 0);
    assert.equal((await readdir(dirs.delivered)).length, 1);
  });

  it("keeps transient signal delivery pending with deterministic bounded jitter", async () => {
    const root = await tempRoot();
    const evidence = signal();
    await enqueueOperationalSignal(root, evidence);
    const now = new Date("2026-09-18T12:01:00.000Z");
    const summary = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now,
      fetchImpl: async () => new Response(null, { status: 503 }),
    });
    assert.equal(summary.retryable, 1);

    const dirs = await ensureOperationalSpoolDirectories(root);
    const [name] = await readdir(dirs.pending);
    const pending = JSON.parse(
      await readFile(path.join(dirs.pending, name!), "utf8"),
    ) as {
      delivery: {
        attemptCount: number;
        nextAttemptAt: string;
        lastErrorCode: string;
      };
    };
    assert.equal(pending.delivery.attemptCount, 1);
    assert.equal(pending.delivery.lastErrorCode, "webhook_http_503");
    const delayMs = Date.parse(pending.delivery.nextAttemptAt) - now.getTime();
    assert.equal(delayMs >= 15_000 && delayMs <= 18_000, true);

    const tooEarly = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now: new Date(now.getTime() + 14_000),
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    assert.equal(tooEarly.skippedUntilLater, 1);
  });
});
