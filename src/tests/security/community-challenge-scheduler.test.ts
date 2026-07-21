import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runScheduledCommunityChallengeFinalization,
  type ScheduledCommunityChallengeFinalizationOptions,
} from "../../lib/ops/community-challenge-finalization-job";
import type { OfficialJournalChallengeFinalizationResult } from "../../lib/community-journal-challenge-finalization";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const FINGERPRINT = "0123456789abcdef01234567";

function harness(
  results: OfficialJournalChallengeFinalizationResult[],
  overrides: Partial<ScheduledCommunityChallengeFinalizationOptions> = {},
) {
  const finalizerCalls: Array<{ limit: number; runId: string | undefined }> = [];
  const written: unknown[] = [];
  const alerts: unknown[] = [];
  let index = 0;
  let clockIndex = 0;
  const options: ScheduledCommunityChallengeFinalizationOptions = {
    stateDirectory: "/var/lib/tecpey-test/ops",
    batchSize: 2,
    maxBatches: 4,
    runId: RUN_ID,
    hostName: "scheduler-test",
    clock: () => new Date(clockIndex++ === 0
      ? "2026-07-21T08:00:00.000Z"
      : "2026-07-21T08:00:01.000Z"),
    finalizer: async (limit, runId) => {
      finalizerCalls.push({ limit, runId });
      const result = results[index++];
      if (!result) throw new Error("unexpected_finalizer_call");
      return result;
    },
    persistEvidence: async () => true,
    writeLastRun: async (_directory, run) => {
      written.push(run);
    },
    enqueueAlert: async (_directory, alert) => {
      alerts.push(alert);
      return { replayed: false, filePath: "/tmp/alert.json" };
    },
    ...overrides,
  };
  return { options, finalizerCalls, written, alerts };
}

describe("Community challenge scheduled finalization", () => {
  it("records a healthy empty run without emitting an alert", async () => {
    const test = harness([{
      available: true,
      runId: RUN_ID,
      selected: 0,
      finalizedCompleted: 0,
      finalizedNotCompleted: 0,
      failures: [],
    }]);
    const result = await runScheduledCommunityChallengeFinalization(test.options);
    assert.equal(result.exitCode, 0);
    assert.equal(result.run.resultStatus, "succeeded");
    assert.equal(result.run.batchesProcessed, 1);
    assert.equal(result.alert, null);
    assert.equal(test.alerts.length, 0);
    assert.equal(test.written.length, 1);
  });

  it("drains multiple bounded batches with one stable run identity", async () => {
    const test = harness([
      {
        available: true,
        runId: RUN_ID,
        selected: 2,
        finalizedCompleted: 1,
        finalizedNotCompleted: 1,
        failures: [],
      },
      {
        available: true,
        runId: RUN_ID,
        selected: 1,
        finalizedCompleted: 1,
        finalizedNotCompleted: 0,
        failures: [],
      },
    ]);
    const result = await runScheduledCommunityChallengeFinalization(test.options);
    assert.equal(result.exitCode, 0);
    assert.equal(result.run.batchesProcessed, 2);
    assert.equal(result.run.selectedCount, 3);
    assert.equal(result.run.finalizedCompletedCount, 2);
    assert.equal(result.run.finalizedNotCompletedCount, 1);
    assert.deepEqual(test.finalizerCalls, [
      { limit: 2, runId: RUN_ID },
      { limit: 2, runId: RUN_ID },
    ]);
  });

  it("stops on isolated evidence failure and emits one warning", async () => {
    const test = harness([{
      available: true,
      runId: RUN_ID,
      selected: 2,
      finalizedCompleted: 1,
      finalizedNotCompleted: 0,
      failures: [{
        enrollmentFingerprint: FINGERPRINT,
        reason: "evidence_invalid",
      }],
    }]);
    const result = await runScheduledCommunityChallengeFinalization(test.options);
    assert.equal(result.exitCode, 2);
    assert.equal(result.run.resultStatus, "partial_failure");
    assert.equal(result.run.failureCount, 1);
    assert.deepEqual(result.run.failureFingerprints, [FINGERPRINT]);
    assert.equal(result.alert?.severity, "warning");
    assert.equal(test.finalizerCalls.length, 1);
    assert.equal(test.alerts.length, 1);
  });

  it("creates a critical outage alert when database authority is unavailable", async () => {
    const test = harness([{ available: false, runId: RUN_ID }]);
    const result = await runScheduledCommunityChallengeFinalization(test.options);
    assert.equal(result.exitCode, 1);
    assert.equal(result.run.resultStatus, "authority_unavailable");
    assert.deepEqual(result.run.reasonCodes, ["database_authority_unavailable"]);
    assert.equal(result.alert?.severity, "critical");
    assert.equal(test.alerts.length, 1);
  });

  it("fails closed when the configured drain bound is exhausted", async () => {
    const test = harness([
      {
        available: true,
        runId: RUN_ID,
        selected: 2,
        finalizedCompleted: 2,
        finalizedNotCompleted: 0,
        failures: [],
      },
      {
        available: true,
        runId: RUN_ID,
        selected: 2,
        finalizedCompleted: 2,
        finalizedNotCompleted: 0,
        failures: [],
      },
    ], { maxBatches: 2 });
    const result = await runScheduledCommunityChallengeFinalization(test.options);
    assert.equal(result.exitCode, 2);
    assert.equal(result.run.resultStatus, "partial_failure");
    assert.equal(result.run.drainLimitReached, true);
    assert.ok(result.run.reasonCodes.includes("drain_limit_reached"));
  });

  it("preserves finalized counts when operational evidence persistence fails", async () => {
    const test = harness([{
      available: true,
      runId: RUN_ID,
      selected: 1,
      finalizedCompleted: 1,
      finalizedNotCompleted: 0,
      failures: [],
    }], { persistEvidence: async () => false });
    const result = await runScheduledCommunityChallengeFinalization(test.options);
    assert.equal(result.exitCode, 2);
    assert.equal(result.run.resultStatus, "partial_failure");
    assert.equal(result.run.finalizedCompletedCount, 1);
    assert.ok(result.run.reasonCodes.includes("operational_evidence_unavailable"));
    assert.equal(result.databaseEvidencePersisted, false);
    assert.equal(test.alerts.length, 1);
  });
});
