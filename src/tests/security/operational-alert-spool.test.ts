import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { rm } from "node:fs/promises";
import {
  deliverOperationalAlerts,
  enqueueOperationalAlert,
  ensureOperationalSpoolDirectories,
  writeOperationalLastRun,
} from "../../lib/ops/operational-alert-spool";
import type {
  OperationalAlertEvidence,
  OperationalJobRunEvidence,
} from "../../lib/ops/operational-job-evidence";

const roots: string[] = [];
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const FINGERPRINT = "abcdef0123456789abcdef01";

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-ops-spool-"));
  roots.push(root);
  return root;
}

function run(status: OperationalJobRunEvidence["resultStatus"]): OperationalJobRunEvidence {
  return {
    runId: RUN_ID,
    jobName: "community-challenge-finalization",
    schedulerUnit: "tecpey-community-challenge-finalizer.service",
    hostName: "ops-test",
    resultStatus: status,
    startedAt: "2026-07-21T08:00:00.000Z",
    completedAt: "2026-07-21T08:00:01.000Z",
    batchesProcessed: status === "authority_unavailable" ? 0 : 1,
    selectedCount: status === "authority_unavailable" ? 0 : 2,
    finalizedCompletedCount: status === "authority_unavailable" ? 0 : 1,
    finalizedNotCompletedCount: 0,
    failureCount: status === "partial_failure" ? 1 : 0,
    drainLimitReached: false,
    failureFingerprints: status === "partial_failure" ? [FINGERPRINT] : [],
    reasonCodes: status === "authority_unavailable"
      ? ["database_authority_unavailable"]
      : ["evidence_invalid"],
  };
}

function alert(status: "partial_failure" | "authority_unavailable"): OperationalAlertEvidence {
  const evidence = run(status);
  return {
    schemaVersion: 1,
    alertId: `${evidence.jobName}:${evidence.runId}`,
    run: evidence,
    severity: status === "authority_unavailable" ? "critical" : "warning",
    occurredAt: evidence.completedAt,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Operational alert spool", () => {
  it("writes last-run and pending alert atomically with private permissions", async () => {
    const root = await tempRoot();
    await writeOperationalLastRun(root, run("partial_failure"));
    const first = await enqueueOperationalAlert(root, alert("partial_failure"));
    const replay = await enqueueOperationalAlert(root, alert("partial_failure"));
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.filePath, replay.filePath);
    assert.equal((await stat(first.filePath)).mode & 0o777, 0o600);
    const content = JSON.parse(await readFile(first.filePath, "utf8")) as {
      alert: { run: { failureFingerprints: string[] } };
    };
    assert.deepEqual(content.alert.run.failureFingerprints, [FINGERPRINT]);
    assert.equal(JSON.stringify(content).includes("DATABASE_URL"), false);
  });

  it("delivers a pending alert once with an idempotency header", async () => {
    const root = await tempRoot();
    const queued = alert("partial_failure");
    await enqueueOperationalAlert(root, queued);
    const requests: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    const summary = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      bearerToken: "test-token",
      now: new Date("2026-07-21T08:01:00.000Z"),
      fetchImpl: async (input, init) => {
        requests.push({ url: String(input), headers: init?.headers });
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
    assert.equal(headers.get("Idempotency-Key"), queued.alertId);
    assert.equal(headers.get("Authorization"), "Bearer test-token");
    const dirs = await ensureOperationalSpoolDirectories(root);
    assert.equal((await readdir(dirs.pending)).length, 0);
    assert.equal((await readdir(dirs.delivered)).length, 1);
    const rerun = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now: new Date("2026-07-21T08:02:00.000Z"),
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    assert.equal(rerun.selected, 0);
  });

  it("keeps timeout and 5xx failures pending with bounded backoff", async () => {
    const root = await tempRoot();
    await enqueueOperationalAlert(root, alert("authority_unavailable"));
    const summary = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now: new Date("2026-07-21T08:01:00.000Z"),
      fetchImpl: async () => new Response(null, { status: 503 }),
    });
    assert.equal(summary.retryable, 1);
    const dirs = await ensureOperationalSpoolDirectories(root);
    const [name] = await readdir(dirs.pending);
    const item = JSON.parse(await readFile(path.join(dirs.pending, name), "utf8")) as {
      delivery: { attemptCount: number; nextAttemptAt: string; lastErrorCode: string };
    };
    assert.equal(item.delivery.attemptCount, 1);
    assert.equal(item.delivery.lastErrorCode, "webhook_http_503");
    assert.equal(item.delivery.nextAttemptAt, "2026-07-21T08:01:15.000Z");
    const early = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now: new Date("2026-07-21T08:01:10.000Z"),
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    assert.equal(early.skippedUntilLater, 1);
  });

  it("quarantines terminal HTTP responses, symlinks and oversized files", async () => {
    const root = await tempRoot();
    await enqueueOperationalAlert(root, alert("partial_failure"));
    const terminal = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now: new Date("2026-07-21T08:01:00.000Z"),
      fetchImpl: async () => new Response(null, { status: 400 }),
    });
    assert.equal(terminal.quarantined, 1);

    const dirs = await ensureOperationalSpoolDirectories(root);
    const target = path.join(root, "outside.json");
    await writeFile(target, "{}", { mode: 0o600 });
    await symlink(target, path.join(dirs.pending, `${"a".repeat(64)}.json`));
    await writeFile(
      path.join(dirs.pending, `${"b".repeat(64)}.json`),
      "x".repeat(70 * 1024),
      { mode: 0o600 },
    );
    const unsafe = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-alert",
      now: new Date("2026-07-21T08:02:00.000Z"),
      fetchImpl: async () => new Response(null, { status: 204 }),
    });
    assert.equal(unsafe.quarantined, 2);
    assert.equal((await readdir(dirs.pending)).length, 0);
  });
});
