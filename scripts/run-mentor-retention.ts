import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { runMentorCleanup } from "../src/lib/mentor-cleanup";
import { withTx } from "../src/lib/db";
import { persistOperationalJobRunTx } from "../src/lib/ops/operational-job-evidence";

const JOB_NAME = "mentor-retention-cleanup";
const SCHEDULER_UNIT = "tecpey-mentor-retention.service";

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return value;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const batchSize = boundedIntegerEnv("MENTOR_RETENTION_BATCH_SIZE", 200, 1, 1_000);
  const maxBatches = boundedIntegerEnv("MENTOR_RETENTION_MAX_BATCHES", 20, 1, 100);

  const result = await runMentorCleanup({ batchSize, maxBatches });
  const completedAt = new Date().toISOString();

  if (!result.storageAvailable) {
    console.error("[mentor-retention] authority unavailable", {
      runId,
      batches: result.batches,
    });
    process.exitCode = 2;
    return;
  }

  const drainLimitFingerprint = result.limitReached
    ? fingerprint("mentor-retention-drain-limit")
    : null;
  const resultStatus = result.limitReached ? "partial_failure" : "succeeded";

  const evidence = {
    runId,
    jobName: JOB_NAME,
    schedulerUnit: SCHEDULER_UNIT,
    hostName: hostname(),
    resultStatus,
    startedAt,
    completedAt,
    batchesProcessed: result.batches,
    selectedCount: result.deleted,
    finalizedCompletedCount: result.deleted,
    finalizedNotCompletedCount: 0,
    failureCount: drainLimitFingerprint ? 1 : 0,
    drainLimitReached: result.limitReached,
    failureFingerprints: drainLimitFingerprint ? [drainLimitFingerprint] : [],
    reasonCodes: result.limitReached ? ["drain_limit_reached"] : [],
  } as const;

  const persisted = await withTx((client) =>
    persistOperationalJobRunTx(client, evidence),
  );
  if (!persisted.enabled) {
    console.error("[mentor-retention] evidence persistence unavailable", { runId });
    process.exitCode = 3;
    return;
  }

  console.log("[mentor-retention] completed", {
    runId,
    resultStatus,
    deleted: result.deleted,
    memoryDeleted: result.memoryDeleted,
    conversationDeleted: result.conversationDeleted,
    batches: result.batches,
    evidenceHash: persisted.value.resultHash,
  });

  if (result.limitReached) process.exitCode = 4;
}

void main().catch((error) => {
  console.error("[mentor-retention] fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
