import assert from "node:assert/strict";
import {
  mkdir,
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
import {
  createOperationalSignalEpisodeEvidence,
  createOperationalSignalEvidence,
} from "../../lib/ops/operational-signal-evidence";
import { observeOperationalSignalEpisode } from "../../lib/ops/operational-signal-episode-state";
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
      deferredDueToBatchLimit: 0,
      recoveredDeliveredArchives: 0,
      recoveredQuarantinedArchives: 0,
    });
    assert.equal(requests.length, 1);
    const headers = new Headers(requests[0].headers);
    assert.equal(headers.get("Idempotency-Key"), queued.signalId);
    assert.equal(headers.get("Authorization"), "Bearer test-token");

    const dirs = await ensureOperationalSignalSpoolDirectories(root);
    assert.equal((await readdir(dirs.pending)).length, 0);
    assert.equal((await readdir(dirs.delivered)).length, 1);
    const [deliveredName] = await readdir(dirs.delivered);
    const archived = JSON.parse(
      await readFile(path.join(dirs.delivered, deliveredName), "utf8"),
    ) as {
      delivery: { attemptCount: number };
      attempts: Array<{
        attemptNumber: number;
        deliveryResult: string;
        httpStatus: number | null;
      }>;
    };
    assert.equal(archived.delivery.attemptCount, 1);
    assert.deepEqual(archived.attempts, [
      {
        signalId: queued.signalId,
        attemptNumber: 1,
        deliveryResult: "delivered",
        httpStatus: 204,
        errorCode: null,
        attemptedAt: "2026-09-18T12:06:00.000Z",
        evidence: { provider: "webhook", responseBodyBytes: 0 },
      },
    ]);

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
    const retried = item as typeof item & {
      attempts: Array<{
        attemptNumber: number;
        deliveryResult: string;
        httpStatus: number | null;
      }>;
    };
    assert.equal(retried.attempts.length, 1);
    assert.equal(retried.attempts[0]?.attemptNumber, 1);
    assert.equal(retried.attempts[0]?.deliveryResult, "retryable_failure");
    assert.equal(retried.attempts[0]?.httpStatus, 503);
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
    await writeFile(target, "{}", { mode: 0o644 });
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
    assert.equal((await stat(target)).mode & 0o777, 0o644);
    const quarantineNames = await readdir(dirs.quarantine);
    assert.equal(
      quarantineNames.filter((name) => name.startsWith("unsafe-")).length >= 3,
      true,
    );
  });

  it("rejects a state root that resolves through a symlinked ancestor", async () => {
    const root = await tempRoot();
    const realParent = path.join(root, "real-parent");
    const aliasParent = path.join(root, "alias-parent");
    await mkdir(realParent, { mode: 0o700 });
    await symlink(realParent, aliasParent);

    await assert.rejects(
      ensureOperationalSignalSpoolDirectories(path.join(aliasParent, "state")),
      /operational_signal_state_directory_alias_forbidden/,
    );
    await assert.rejects(
      stat(path.join(realParent, "state")),
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    );
  });

  it("finishes a fsync-recorded delivered archive after crash without redelivering", async () => {
    const root = await tempRoot();
    const queued = signal("2026-09-18T12:05:00.000Z");
    await enqueueOperationalSignal(root, queued);
    const dirs = await ensureOperationalSignalSpoolDirectories(root);
    const [pendingName] = await readdir(dirs.pending);
    const pendingPath = path.join(dirs.pending, pendingName);
    const raw = JSON.parse(await readFile(pendingPath, "utf8")) as {
      signal: { signalId: string };
      delivery: {
        attemptCount: number;
        nextAttemptAt: string;
        lastErrorCode: string | null;
      };
      attempts: unknown[];
    };
    raw.delivery = {
      attemptCount: 1,
      nextAttemptAt: "2026-09-18T12:06:00.000Z",
      lastErrorCode: null,
    };
    raw.attempts = [{
      signalId: raw.signal.signalId,
      attemptNumber: 1,
      deliveryResult: "delivered",
      httpStatus: 204,
      errorCode: null,
      attemptedAt: "2026-09-18T12:06:00.000Z",
      evidence: { provider: "webhook", responseBodyBytes: 0 },
    }];
    await writeFile(pendingPath, `${JSON.stringify(raw)}\n`, { mode: 0o600 });

    let networkCalls = 0;
    const summary = await deliverOperationalSignals({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      now: new Date("2026-09-18T12:10:00.000Z"),
      fetchImpl: async () => {
        networkCalls += 1;
        throw new Error("network must not be called for terminal recovery");
      },
    });

    assert.equal(networkCalls, 0);
    assert.equal(summary.selected, 0);
    assert.equal(summary.recoveredDeliveredArchives, 1);
    assert.equal(summary.recoveredQuarantinedArchives, 0);
    assert.equal((await readdir(dirs.pending)).length, 0);
    assert.equal((await readdir(dirs.delivered)).length, 1);
  });

  it("selects due signals before future retries so hashed filenames cannot starve delivery", async () => {
    const root = await tempRoot();
    const first = signal("2026-09-18T12:05:00.000Z");
    const second = createOperationalSignalEvidence({
      signalType: "mentor_profile_projection_health",
      component: "mentor_profile_projection",
      sourceUnit: "tecpey-mentor-profile-health.service",
      severity: "critical",
      lifecycle: "firing",
      occurredAt: "2026-09-18T12:05:00.000Z",
      dedupeWindowSeconds: 3_600,
      reasonCodes: ["lease_overdue_critical"],
      measurements: { overdue_leases: 1 },
    });
    await enqueueOperationalSignal(root, first);
    await enqueueOperationalSignal(root, second);
    const dirs = await ensureOperationalSignalSpoolDirectories(root);
    const names = (await readdir(dirs.pending)).sort();
    assert.equal(names.length, 2);

    const firstPath = path.join(dirs.pending, names[0]!);
    const firstItem = JSON.parse(await readFile(firstPath, "utf8")) as {
      delivery: {
        attemptCount: number;
        nextAttemptAt: string;
        lastErrorCode: string | null;
      };
    };
    firstItem.delivery.nextAttemptAt = "2026-09-18T13:00:00.000Z";
    await writeFile(firstPath, `${JSON.stringify(firstItem)}\n`, {
      mode: 0o600,
    });

    const deliveredIds: string[] = [];
    const summary = await deliverOperationalSignals({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      limit: 1,
      now: new Date("2026-09-18T12:10:00.000Z"),
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { signalId: string };
        deliveredIds.push(body.signalId);
        return new Response(null, { status: 204 });
      },
    });
    assert.equal(summary.selected, 1);
    assert.equal(summary.delivered, 1);
    assert.equal(summary.skippedUntilLater, 1);
    assert.equal(summary.deferredDueToBatchLimit, 0);
    assert.equal(deliveredIds.length, 1);
    assert.equal((await readdir(dirs.pending)).length, 1);
  });
});


describe("Operational signal episode state", () => {
  it("emits firing, updated, resolved and a distinct recurrence inside one dedupe window", async () => {
    const root = await tempRoot();
    const common = {
      stateDirectory: root,
      signalType: "mentor_profile_projection_health",
      component: "mentor_profile_projection",
      sourceUnit: "tecpey-mentor-profile-health.service",
      severity: "critical" as const,
      dedupeWindowSeconds: 3_600,
    };

    const firing = await observeOperationalSignalEpisode({
      ...common,
      active: true,
      occurredAt: "2026-09-18T12:05:00.000Z",
      reasonCodes: ["dead_letter_present"],
      measurements: { unresolved_dead_letters: 1 },
    });
    assert.equal(firing.emitted.length, 1);
    assert.equal(firing.emitted[0]?.lifecycle, "firing");
    const firstEpisode = firing.emitted[0]!.episodeId;

    const duplicate = await observeOperationalSignalEpisode({
      ...common,
      active: true,
      occurredAt: "2026-09-18T12:10:00.000Z",
      reasonCodes: ["dead_letter_present"],
      measurements: { unresolved_dead_letters: 7 },
    });
    assert.equal(duplicate.emitted.length, 0);
    assert.equal(duplicate.activeEpisodeId, firstEpisode);

    const updated = await observeOperationalSignalEpisode({
      ...common,
      active: true,
      occurredAt: "2026-09-18T12:15:00.000Z",
      reasonCodes: ["lease_overdue_critical"],
      measurements: { overdue_leases: 1 },
    });
    assert.equal(updated.emitted.length, 1);
    assert.equal(updated.emitted[0]?.lifecycle, "updated");
    assert.equal(updated.emitted[0]?.episodeId, firstEpisode);
    assert.equal(updated.emitted[0]?.episodeSequence, 2);

    const resolved = await observeOperationalSignalEpisode({
      ...common,
      active: false,
      occurredAt: "2026-09-18T12:20:00.000Z",
      measurements: { ready_backlog: 0 },
    });
    assert.equal(resolved.emitted.length, 1);
    assert.equal(resolved.emitted[0]?.lifecycle, "resolved");
    assert.equal(resolved.emitted[0]?.episodeId, firstEpisode);
    assert.equal(resolved.emitted[0]?.episodeSequence, 3);
    assert.equal(resolved.activeEpisodeId, null);

    const recurrence = await observeOperationalSignalEpisode({
      ...common,
      active: true,
      occurredAt: "2026-09-18T12:25:00.000Z",
      reasonCodes: ["dead_letter_present"],
      measurements: { unresolved_dead_letters: 1 },
    });
    assert.equal(recurrence.emitted.length, 1);
    assert.equal(recurrence.emitted[0]?.lifecycle, "firing");
    assert.notEqual(recurrence.emitted[0]?.episodeId, firstEpisode);

    const dirs = await ensureOperationalSignalSpoolDirectories(root);
    assert.equal((await readdir(dirs.pending)).length, 4);
  });

  it("recovers a fsync-staged transition after crash before enqueue", async () => {
    const root = await tempRoot();
    const common = {
      stateDirectory: root,
      signalType: "mentor_profile_projection_health",
      component: "mentor_profile_projection",
      sourceUnit: "tecpey-mentor-profile-health.service",
      severity: "critical" as const,
      dedupeWindowSeconds: 3_600,
    };
    const firing = await observeOperationalSignalEpisode({
      ...common,
      active: true,
      occurredAt: "2026-09-18T12:05:00.000Z",
      reasonCodes: ["dead_letter_present"],
      measurements: { unresolved_dead_letters: 1 },
    });
    const dirs = await ensureOperationalSignalSpoolDirectories(root);
    const statePath = path.join(dirs.state, `${firing.detectorKey}.json`);
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      schemaVersion: 1;
      detectorKey: string;
      active: {
        episodeId: string;
        episodeSequence: number;
        incidentKey: string;
        severity: "critical";
        reasonCodes: string[];
      };
      pending: null;
    };

    const stagedSignal = createOperationalSignalEpisodeEvidence({
      signalType: common.signalType,
      component: common.component,
      sourceUnit: common.sourceUnit,
      severity: "critical",
      lifecycle: "updated",
      episodeId: state.active.episodeId,
      episodeSequence: state.active.episodeSequence + 1,
      occurredAt: "2026-09-18T12:10:00.000Z",
      dedupeWindowSeconds: 3_600,
      reasonCodes: ["lease_overdue_critical"],
      measurements: { overdue_leases: 1 },
    });
    const nextActive = {
      episodeId: stagedSignal.episodeId,
      episodeSequence: stagedSignal.episodeSequence,
      incidentKey: stagedSignal.incidentKey,
      severity: stagedSignal.severity,
      reasonCodes: [...stagedSignal.reasonCodes],
    };
    await writeFile(
      statePath,
      `${JSON.stringify({
        ...state,
        pending: { signal: stagedSignal, nextActive },
      })}\n`,
      { mode: 0o600 },
    );

    const recovered = await observeOperationalSignalEpisode({
      ...common,
      active: true,
      occurredAt: "2026-09-18T12:11:00.000Z",
      reasonCodes: ["lease_overdue_critical"],
      measurements: { overdue_leases: 2 },
    });
    assert.equal(recovered.recoveredPending, true);
    assert.equal(recovered.emitted.length, 1);
    assert.equal(recovered.emitted[0]?.signalId, stagedSignal.signalId);
    assert.equal(recovered.emitted[0]?.replayed, false);
    assert.equal(recovered.activeEpisodeId, stagedSignal.episodeId);
  });

  it("rejects different payload under the same episode event identity in the filesystem", async () => {
    const root = await tempRoot();
    const base = createOperationalSignalEpisodeEvidence({
      signalType: "mentor_profile_projection_health",
      component: "mentor_profile_projection",
      sourceUnit: "tecpey-mentor-profile-health.service",
      severity: "critical",
      lifecycle: "firing",
      episodeId: "44444444-4444-4444-8444-444444444444",
      episodeSequence: 1,
      occurredAt: "2026-09-18T12:05:00.000Z",
      reasonCodes: ["dead_letter_present"],
      measurements: { unresolved_dead_letters: 1 },
    });
    const changed = createOperationalSignalEpisodeEvidence({
      signalType: base.signalType,
      component: base.component,
      sourceUnit: base.sourceUnit,
      severity: base.severity,
      lifecycle: base.lifecycle,
      episodeId: base.episodeId,
      episodeSequence: base.episodeSequence,
      occurredAt: base.occurredAt,
      dedupeWindowSeconds: base.dedupeWindowSeconds,
      reasonCodes: base.reasonCodes,
      measurements: { unresolved_dead_letters: 99 },
    });
    assert.equal(base.signalId, changed.signalId);
    await enqueueOperationalSignal(root, base);
    await assert.rejects(
      enqueueOperationalSignal(root, changed),
      /operational_signal_spool_payload_identity_conflict/,
    );
  });
});
