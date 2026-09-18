import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
    assert.equal(first.occurredAt, "2026-09-18T12:00:30.000Z");
    assert.equal(replay.occurredAt, "2026-09-18T12:14:59.000Z");
    assert.notEqual(first.occurredAt, replay.occurredAt);
    assert.notEqual(first.signalId, later.signalId);
    assert.equal(later.dedupeBucketAt, "2026-09-18T12:15:00.000Z");
  });

  it("rejects hidden high-cardinality strings and sensitive reason codes", () => {
    assert.doesNotThrow(() =>
      createOperationalSignalEvidence({
        signalType: "mentor.profile.projection_stalled",
        component: "mentor-profile",
        detector: "mentor-profile-health-probe",
        severity: "critical",
        statusClassification: "active",
        occurredAt: "2026-09-18T12:00:30.000Z",
        reasonCodes: ["ready_age_critical"],
        attributes: {
          policyVersion: "2026-09-18.3",
          criticalReadyAgeSeconds: 300,
        },
      }),
    );

    assert.throws(
      () =>
        createOperationalSignalEvidence({
          signalType: "mentor.profile.projection_stalled",
          component: "mentor-profile",
          detector: "mentor-profile-health-probe",
          severity: "critical",
          statusClassification: "active",
          occurredAt: "2026-09-18T12:00:30.000Z",
          reasonCodes: ["ready_age_critical"],
          attributes: { correlation: "opaque-user-123" },
        }),
      /operational_signal_attribute_value_invalid/,
    );

    assert.throws(
      () =>
        createOperationalSignalEvidence({
          signalType: "mentor.profile.projection_stalled",
          component: "mentor-profile",
          detector: "mentor-profile-health-probe",
          severity: "critical",
          statusClassification: "active",
          occurredAt: "2026-09-18T12:00:30.000Z",
          reasonCodes: ["student_lookup_failed"],
          attributes: { policyVersion: "2026-09-18.3" },
        }),
      /operational_signal_reason_code_invalid/,
    );
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

    assert.throws(
      () =>
        validateOperationalSignalEvidence({
          ...valid,
          signalId: `${valid.signalId}:tampered`,
        }),
      /operational_signal_id_mismatch/,
    );
  });

  it("writes schema v2 privately, deduplicates, and delivers with signal idempotency", async () => {
    const root = await tempRoot();
    const evidence = signal("2026-09-18T12:00:30.000Z");
    const sameBucketReplay = signal("2026-09-18T12:14:59.000Z");
    assert.equal(sameBucketReplay.signalId, evidence.signalId);
    assert.equal(sameBucketReplay.fingerprint, evidence.fingerprint);
    assert.notEqual(sameBucketReplay.occurredAt, evidence.occurredAt);

    const first = await enqueueOperationalSignal(root, evidence);
    const replay = await enqueueOperationalSignal(root, sameBucketReplay);

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.filePath, replay.filePath);
    assert.equal((await stat(first.filePath)).mode & 0o777, 0o600);

    const stored = JSON.parse(await readFile(first.filePath, "utf8")) as {
      schemaVersion: number;
      signal: { signalId: string; reasonCodes: string[]; occurredAt: string };
    };
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.signal.signalId, evidence.signalId);
    assert.equal(stored.signal.occurredAt, "2026-09-18T12:00:30.000Z");
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
    const deliveredNames = await readdir(dirs.delivered);
    assert.equal(deliveredNames.length, 1);
    const archived = JSON.parse(
      await readFile(path.join(dirs.delivered, deliveredNames[0]!), "utf8"),
    ) as {
      delivery: {
        attemptCount: number;
        attemptHistory: Array<{
          attemptNumber: number;
          deliveryResult: string;
          httpStatus: number | null;
          attemptedAt: string;
        }>;
      };
    };
    assert.equal(archived.delivery.attemptCount, 1);
    assert.deepEqual(archived.delivery.attemptHistory, [
      {
        attemptNumber: 1,
        deliveryResult: "delivered",
        httpStatus: 204,
        errorCode: null,
        attemptedAt: "2026-09-18T12:01:00.000Z",
      },
    ]);
  });

  it("does not clobber the first durable signal under concurrent same-bucket enqueue", async () => {
    const root = await tempRoot();
    const first = signal("2026-09-18T12:00:30.000Z");
    const second = signal("2026-09-18T12:14:59.000Z");
    assert.equal(first.signalId, second.signalId);
    assert.notEqual(first.occurredAt, second.occurredAt);

    const results = await Promise.all([
      enqueueOperationalSignal(root, first),
      enqueueOperationalSignal(root, second),
    ]);
    assert.deepEqual(
      results.map((result) => result.replayed).sort(),
      [false, true],
    );
    assert.equal(results[0]!.filePath, results[1]!.filePath);

    const stored = JSON.parse(
      await readFile(results[0]!.filePath, "utf8"),
    ) as { schemaVersion: number; signal: { occurredAt: string; signalId: string } };
    assert.equal(stored.schemaVersion, 2);
    assert.equal(stored.signal.signalId, first.signalId);
    assert.equal(
      [first.occurredAt, second.occurredAt].includes(stored.signal.occurredAt),
      true,
    );

    const dirs = await ensureOperationalSpoolDirectories(root);
    assert.equal((await readdir(dirs.pending)).length, 1);
  });

  it("does not let future-backoff files starve a due signal behind the batch limit", async () => {
    const root = await tempRoot();
    const first = signal("2026-09-18T12:00:30.000Z");
    const second = createOperationalSignalEvidence({
      signalType: "mentor.profile.authority_unavailable",
      component: "mentor-profile",
      detector: "mentor-profile-health-probe",
      severity: "critical",
      statusClassification: "authority_unavailable",
      occurredAt: "2026-09-18T12:00:31.000Z",
      reasonCodes: ["database_unavailable"],
      attributes: { policyVersion: "2026-09-18.3" },
      dedupeWindowSeconds: 900,
    });
    await enqueueOperationalSignal(root, first);
    await enqueueOperationalSignal(root, second);

    const dirs = await ensureOperationalSpoolDirectories(root);
    const names = (await readdir(dirs.pending)).sort();
    assert.equal(names.length, 2);

    const futurePath = path.join(dirs.pending, names[0]!);
    const duePath = path.join(dirs.pending, names[1]!);
    const future = JSON.parse(await readFile(futurePath, "utf8")) as {
      delivery: { nextAttemptAt: string };
    };
    future.delivery.nextAttemptAt = "2026-09-18T13:00:00.000Z";
    await writeFile(futurePath, `${JSON.stringify(future)}\n`, { mode: 0o600 });

    const due = JSON.parse(await readFile(duePath, "utf8")) as {
      delivery: { nextAttemptAt: string };
    };
    due.delivery.nextAttemptAt = "2026-09-18T12:00:00.000Z";
    await writeFile(duePath, `${JSON.stringify(due)}\n`, { mode: 0o600 });

    let requests = 0;
    const summary = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now: new Date("2026-09-18T12:10:00.000Z"),
      limit: 1,
      fetchImpl: async () => {
        requests += 1;
        return new Response(null, { status: 204 });
      },
    });

    assert.equal(summary.selected, 1);
    assert.equal(summary.delivered, 1);
    assert.equal(summary.skippedUntilLater, 1);
    assert.equal(requests, 1);
    assert.equal((await readdir(dirs.pending)).length, 1);
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
    const pendingFull = JSON.parse(
      await readFile(path.join(dirs.pending, name!), "utf8"),
    ) as {
      delivery: {
        attemptHistory: Array<{
          attemptNumber: number;
          deliveryResult: string;
          httpStatus: number | null;
          errorCode: string | null;
        }>;
      };
    };
    assert.deepEqual(pendingFull.delivery.attemptHistory, [
      {
        attemptNumber: 1,
        deliveryResult: "retryable_failure",
        httpStatus: 503,
        errorCode: "webhook_http_503",
        attemptedAt: "2026-09-18T12:01:00.000Z",
      },
    ]);
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
