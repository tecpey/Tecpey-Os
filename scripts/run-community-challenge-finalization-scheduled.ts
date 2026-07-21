import { runScheduledCommunityChallengeFinalization } from "../src/lib/ops/community-challenge-finalization-job";

function requiredAbsoluteDirectory(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value.startsWith("/") || value.length < 2 || value.length > 500 || value.includes("\0")) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return value;
}

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const result = await runScheduledCommunityChallengeFinalization({
    stateDirectory: requiredAbsoluteDirectory("TECPEY_OPS_STATE_DIR"),
    batchSize: boundedIntegerEnv(
      "COMMUNITY_CHALLENGE_FINALIZATION_BATCH",
      100,
      1,
      250,
    ),
    maxBatches: boundedIntegerEnv(
      "COMMUNITY_CHALLENGE_FINALIZATION_MAX_BATCHES",
      10,
      1,
      100,
    ),
  });
  console.log(JSON.stringify({
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    runId: result.run.runId,
    status: result.run.resultStatus,
    batchesProcessed: result.run.batchesProcessed,
    selected: result.run.selectedCount,
    finalizedCompleted: result.run.finalizedCompletedCount,
    finalizedNotCompleted: result.run.finalizedNotCompletedCount,
    failures: result.run.failureCount,
    drainLimitReached: result.run.drainLimitReached,
    databaseEvidencePersisted: result.databaseEvidencePersisted,
  }));
  process.exitCode = result.exitCode;
}

void main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,120}$/.test(error.message)
    ? error.message
    : "community_challenge_scheduler_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
