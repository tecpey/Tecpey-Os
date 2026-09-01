import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_NEWS_FEED_RETRY_BASE_DELAY_MS,
  evaluateNewsMaterializationRuntimeHealth,
  newsFeedRetryDelayMs,
  shouldRetryNewsFeedFailure,
} from "../../lib/news-materialization-runtime-policy";
import type { NewsMaterializationWorkerResult } from "../../lib/news-materialization-worker";
import type { OperationalJobRunEvidence } from "../../lib/ops/operational-job-evidence";

function run(status: OperationalJobRunEvidence["resultStatus"]): OperationalJobRunEvidence {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    jobName: "news-materialization",
    schedulerUnit: "tecpey-news-materialization.service",
    hostName: "test-host",
    resultStatus: status,
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:10.000Z",
    batchesProcessed: 2,
    selectedCount: 20,
    finalizedCompletedCount: 18,
    finalizedNotCompletedCount: 2,
    failureCount: status === "succeeded" ? 0 : 1,
    drainLimitReached: false,
    failureFingerprints: status === "succeeded" ? [] : ["aaaaaaaaaaaaaaaaaaaaaaaa"],
    reasonCodes: status === "succeeded" ? [] : ["news_feed_failed_the_block"],
  };
}

function localeResult(locale: "en" | "fa"): NewsMaterializationWorkerResult {
  return {
    skipped: false,
    locale,
    sourceMode: "live",
    fetchedAt: "2026-09-01T00:00:05.000Z",
    rawInputCount: 10,
    publishable: 9,
    needsReview: 1,
    rejected: 0,
    persisted: {
      replayed: false,
      snapshotId: locale === "en"
        ? "11111111-1111-4111-8111-111111111112"
        : "11111111-1111-4111-8111-111111111113",
      snapshotHash: "a".repeat(64),
      insertedHistoryItems: 0,
    },
  };
}

const healthyResults = [localeResult("en"), localeResult("fa")];

describe("news materialization runtime health policy", () => {
  it("keeps a fully healthy bilingual run green", () => {
    const health = evaluateNewsMaterializationRuntimeHealth({
      run: run("succeeded"),
      results: healthyResults,
      failures: [],
      successfulSourceCount: 4,
      minimumSuccessfulSources: 2,
      archiveTransactionCommitted: true,
      databaseEvidencePersisted: true,
    });
    assert.deepEqual(health, {
      exitCode: 0,
      degraded: false,
      hardFailureReasons: [],
      softFailureReasons: [],
    });
  });

  it("treats one upstream feed outage as degraded success when quorum and bilingual snapshots remain healthy", () => {
    const health = evaluateNewsMaterializationRuntimeHealth({
      run: run("partial_failure"),
      results: healthyResults,
      failures: [{ reasonCode: "news_feed_failed_the_block" }],
      successfulSourceCount: 3,
      minimumSuccessfulSources: 2,
      archiveTransactionCommitted: true,
      databaseEvidencePersisted: true,
    });
    assert.equal(health.exitCode, 0);
    assert.equal(health.degraded, true);
    assert.deepEqual(health.softFailureReasons, ["news_feed_failed_the_block"]);
    assert.deepEqual(health.hardFailureReasons, []);
  });

  it("permits exactly the configured two-source quorum while preserving degraded evidence", () => {
    const health = evaluateNewsMaterializationRuntimeHealth({
      run: run("partial_failure"),
      results: healthyResults,
      failures: [
        { reasonCode: "news_feed_failed_cointelegraph" },
        { reasonCode: "news_feed_empty_the_block" },
      ],
      successfulSourceCount: 2,
      minimumSuccessfulSources: 2,
      archiveTransactionCommitted: true,
      databaseEvidencePersisted: true,
    });
    assert.equal(health.exitCode, 0);
    assert.equal(health.degraded, true);
  });

  it("fails closed when source quorum is lost", () => {
    const health = evaluateNewsMaterializationRuntimeHealth({
      run: run("partial_failure"),
      results: healthyResults,
      failures: [
        { reasonCode: "news_feed_failed_coindesk" },
        { reasonCode: "news_feed_failed_cointelegraph" },
        { reasonCode: "news_feed_failed_the_block" },
      ],
      successfulSourceCount: 1,
      minimumSuccessfulSources: 2,
      archiveTransactionCommitted: true,
      databaseEvidencePersisted: true,
    });
    assert.equal(health.exitCode, 2);
    assert.ok(health.hardFailureReasons.includes("news_feed_source_quorum_lost"));
  });

  it("fails closed when Persian output is missing even if the run evidence would otherwise be green", () => {
    const health = evaluateNewsMaterializationRuntimeHealth({
      run: run("succeeded"),
      results: [localeResult("en")],
      failures: [],
      successfulSourceCount: 4,
      minimumSuccessfulSources: 2,
      archiveTransactionCommitted: true,
      databaseEvidencePersisted: true,
    });
    assert.equal(health.exitCode, 2);
    assert.ok(health.hardFailureReasons.includes("news_required_locale_missing_fa"));
  });

  it("fails closed on persistence or operational evidence failures", () => {
    const health = evaluateNewsMaterializationRuntimeHealth({
      run: run("partial_failure"),
      results: healthyResults,
      failures: [{ reasonCode: "operational_evidence_unavailable" }],
      successfulSourceCount: 4,
      minimumSuccessfulSources: 2,
      archiveTransactionCommitted: true,
      databaseEvidencePersisted: false,
    });
    assert.equal(health.exitCode, 2);
    assert.ok(health.hardFailureReasons.includes("operational_evidence_unavailable"));
    assert.ok(health.hardFailureReasons.includes("operational_evidence_not_persisted"));
  });

  it("preserves authority-unavailable exit code semantics", () => {
    const health = evaluateNewsMaterializationRuntimeHealth({
      run: run("authority_unavailable"),
      results: [],
      failures: [{ reasonCode: "news_materialization_database_unavailable" }],
      successfulSourceCount: 4,
      minimumSuccessfulSources: 2,
      archiveTransactionCommitted: false,
      databaseEvidencePersisted: false,
    });
    assert.equal(health.exitCode, 1);
    assert.equal(health.degraded, false);
  });
});

describe("news feed retry policy", () => {
  it("retries network, timeout and retryable HTTP failures only within the bounded attempt budget", () => {
    assert.equal(shouldRetryNewsFeedFailure({ attempt: 1, maximumAttempts: 2, httpStatus: null }), true);
    assert.equal(shouldRetryNewsFeedFailure({ attempt: 1, maximumAttempts: 2, httpStatus: 429 }), true);
    assert.equal(shouldRetryNewsFeedFailure({ attempt: 1, maximumAttempts: 2, httpStatus: 503 }), true);
    assert.equal(shouldRetryNewsFeedFailure({ attempt: 1, maximumAttempts: 2, httpStatus: 404 }), false);
    assert.equal(shouldRetryNewsFeedFailure({ attempt: 2, maximumAttempts: 2, httpStatus: 503 }), false);
  });

  it("uses bounded exponential backoff", () => {
    assert.equal(newsFeedRetryDelayMs({ attempt: 1, baseDelayMs: 350 }), 350);
    assert.equal(newsFeedRetryDelayMs({ attempt: 2, baseDelayMs: 350 }), 700);
    assert.equal(newsFeedRetryDelayMs({ attempt: 8, baseDelayMs: 2_000 }), 5_000);
    assert.equal(newsFeedRetryDelayMs({ attempt: 1, baseDelayMs: 0 }), DEFAULT_NEWS_FEED_RETRY_BASE_DELAY_MS);
  });
});
