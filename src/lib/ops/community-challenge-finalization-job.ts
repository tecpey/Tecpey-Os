import "server-only";

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { withTx } from "@/lib/db";
import {
  finalizeEndedOfficialJournalChallenges,
  type OfficialJournalChallengeFinalizationResult,
} from "@/lib/community-journal-challenge-finalization";
import {
  enqueueOperationalAlert,
  writeOperationalLastRun,
} from "@/lib/ops/operational-alert-spool";
import {
  persistOperationalAlertTx,
  persistOperationalJobRunTx,
  validateOperationalJobRunEvidence,
  type OperationalAlertEvidence,
  type OperationalJobRunEvidence,
} from "@/lib/ops/operational-job-evidence";

export const COMMUNITY_CHALLENGE_FINALIZATION_JOB =
  "community-challenge-finalization";
export const COMMUNITY_CHALLENGE_FINALIZATION_UNIT =
  "tecpey-community-challenge-finalizer.service";

export type ScheduledCommunityChallengeFinalizationOptions = {
  stateDirectory: string;
  batchSize?: number;
  maxBatches?: number;
  runId?: string;
  hostName?: string;
  clock?: () => Date;
  finalizer?: typeof finalizeEndedOfficialJournalChallenges;
};

export type ScheduledCommunityChallengeFinalizationResult = {
  exitCode: 0 | 1 | 2;
  run: OperationalJobRunEvidence;
  alert: OperationalAlertEvidence | null;
  databaseEvidencePersisted: boolean;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) {
    throw new Error(code);
  }
  return selected;
}

function nowIso(clock: () => Date): string {
  const date = clock();
  if (!Number.isFinite(date.getTime())) {
    throw new Error("community_challenge_scheduler_clock_invalid");
  }
  return date.toISOString();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function buildAlert(run: OperationalJobRunEvidence): OperationalAlertEvidence | null {
  if (run.resultStatus === "succeeded") return null;
  return {
    schemaVersion: 1,
    alertId: `${run.jobName}:${run.runId}`,
    run,
    severity: run.resultStatus === "authority_unavailable" ? "critical" : "warning",
    occurredAt: run.completedAt,
  };
}

async function persistRunAndAlert(
  run: OperationalJobRunEvidence,
  alert: OperationalAlertEvidence | null,
): Promise<boolean> {
  try {
    const persisted = await withTx(async (client) => {
      await persistOperationalJobRunTx(client, run);
      if (alert) await persistOperationalAlertTx(client, alert);
    });
    return persisted.enabled;
  } catch {
    return false;
  }
}

export async function runScheduledCommunityChallengeFinalization(
  options: ScheduledCommunityChallengeFinalizationOptions,
): Promise<ScheduledCommunityChallengeFinalizationResult> {
  const batchSize = boundedInteger(
    options.batchSize,
    100,
    1,
    250,
    "community_challenge_scheduler_batch_invalid",
  );
  const maxBatches = boundedInteger(
    options.maxBatches,
    10,
    1,
    100,
    "community_challenge_scheduler_max_batches_invalid",
  );
  const runId = options.runId ?? randomUUID();
  const clock = options.clock ?? (() => new Date());
  const finalizer = options.finalizer ?? finalizeEndedOfficialJournalChallenges;
  const startedAt = nowIso(clock);
  let completedAt = startedAt;
  let batchesProcessed = 0;
  let selectedCount = 0;
  let finalizedCompletedCount = 0;
  let finalizedNotCompletedCount = 0;
  let drainLimitReached = false;
  let authorityUnavailable = false;
  const failureFingerprints: string[] = [];
  const reasonCodes: string[] = [];

  for (let index = 0; index < maxBatches; index += 1) {
    const result: OfficialJournalChallengeFinalizationResult = await finalizer(
      batchSize,
      runId,
    );
    if (!result.available) {
      authorityUnavailable = true;
      reasonCodes.push("database_authority_unavailable");
      break;
    }
    batchesProcessed += 1;
    selectedCount += result.selected;
    finalizedCompletedCount += result.finalizedCompleted;
    finalizedNotCompletedCount += result.finalizedNotCompleted;
    for (const failure of result.failures) {
      failureFingerprints.push(failure.enrollmentFingerprint);
      reasonCodes.push(failure.reason);
    }
    if (result.failures.length > 0) break;
    if (result.selected < batchSize) break;
    if (index === maxBatches - 1) {
      drainLimitReached = true;
      reasonCodes.push("drain_limit_reached");
    }
  }
  completedAt = nowIso(clock);

  let resultStatus: OperationalJobRunEvidence["resultStatus"] = "succeeded";
  if (authorityUnavailable) resultStatus = "authority_unavailable";
  else if (failureFingerprints.length > 0 || drainLimitReached) {
    resultStatus = "partial_failure";
  }

  let run = validateOperationalJobRunEvidence({
    runId,
    jobName: COMMUNITY_CHALLENGE_FINALIZATION_JOB,
    schedulerUnit: COMMUNITY_CHALLENGE_FINALIZATION_UNIT,
    hostName: options.hostName ?? hostname(),
    resultStatus,
    startedAt,
    completedAt,
    batchesProcessed,
    selectedCount,
    finalizedCompletedCount,
    finalizedNotCompletedCount,
    failureCount: uniqueSorted(failureFingerprints).length,
    drainLimitReached,
    failureFingerprints: uniqueSorted(failureFingerprints),
    reasonCodes: uniqueSorted(reasonCodes),
  });
  let alert = buildAlert(run);
  const databaseEvidencePersisted = await persistRunAndAlert(run, alert);

  if (!databaseEvidencePersisted && run.resultStatus !== "authority_unavailable") {
    run = validateOperationalJobRunEvidence({
      ...run,
      resultStatus: "partial_failure",
      reasonCodes: uniqueSorted([
        ...run.reasonCodes,
        "operational_evidence_unavailable",
      ]),
    });
    alert = buildAlert(run);
  }

  await writeOperationalLastRun(options.stateDirectory, run);
  if (alert) await enqueueOperationalAlert(options.stateDirectory, alert);

  const exitCode: 0 | 1 | 2 = run.resultStatus === "succeeded"
    ? 0
    : run.resultStatus === "authority_unavailable"
      ? 1
      : 2;
  return { exitCode, run, alert, databaseEvidencePersisted };
}
