import type { ContentLocale } from "../content-growth";
import type {
  NewsMaterializationSchedulerFailure,
  NewsMaterializationWorkerResult,
} from "../news-materialization-worker";
import type { OperationalJobRunEvidence } from "./operational-job-evidence";

export const DEFAULT_NEWS_FEED_MIN_SUCCESSFUL_SOURCES = 2;
export const DEFAULT_NEWS_FEED_MAX_ATTEMPTS = 2;
export const DEFAULT_NEWS_FEED_RETRY_BASE_DELAY_MS = 350;

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429]);

export type NewsMaterializationRuntimeHealth = {
  exitCode: 0 | 1 | 2;
  degraded: boolean;
  hardFailureReasons: string[];
  softFailureReasons: string[];
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isFeedDegradationReason(reasonCode: string): boolean {
  return reasonCode.startsWith("news_feed_failed_") || reasonCode.startsWith("news_feed_empty_");
}

function isInformationalFeedReason(reasonCode: string): boolean {
  return reasonCode.startsWith("news_feed_stale_");
}

function hasHealthyLocaleSnapshot(
  results: readonly NewsMaterializationWorkerResult[],
  locale: ContentLocale,
): boolean {
  return results.some(
    (result) =>
      result.locale === locale &&
      result.skipped === false &&
      result.rawInputCount > 0 &&
      Boolean(result.persisted?.snapshotId) &&
      Boolean(result.persisted?.snapshotHash),
  );
}

export function evaluateNewsMaterializationRuntimeHealth(input: {
  run: OperationalJobRunEvidence;
  results: readonly NewsMaterializationWorkerResult[];
  failures: readonly NewsMaterializationSchedulerFailure[];
  successfulSourceCount: number;
  minimumSuccessfulSources: number;
  archiveTransactionCommitted: boolean;
  databaseEvidencePersisted: boolean;
  requiredLocales?: readonly ContentLocale[];
}): NewsMaterializationRuntimeHealth {
  if (input.run.resultStatus === "authority_unavailable") {
    return {
      exitCode: 1,
      degraded: false,
      hardFailureReasons: ["authority_unavailable"],
      softFailureReasons: [],
    };
  }

  const requiredLocales = input.requiredLocales ?? (["en", "fa"] as const);
  const softFailureReasons = uniqueSorted(
    input.failures
      .map((failure) => failure.reasonCode.trim().toLowerCase())
      .filter(isFeedDegradationReason),
  );
  const hardFailureReasons = input.failures
    .map((failure) => failure.reasonCode.trim().toLowerCase())
    .filter(
      (reasonCode) =>
        !isFeedDegradationReason(reasonCode)
        && !isInformationalFeedReason(reasonCode),
    );

  if (!input.archiveTransactionCommitted) {
    hardFailureReasons.push("archive_transaction_not_committed");
  }
  if (!input.databaseEvidencePersisted) {
    hardFailureReasons.push("operational_evidence_not_persisted");
  }
  if (input.successfulSourceCount < input.minimumSuccessfulSources) {
    hardFailureReasons.push("news_feed_source_quorum_lost");
  }
  for (const locale of requiredLocales) {
    if (!hasHealthyLocaleSnapshot(input.results, locale)) {
      hardFailureReasons.push(`news_required_locale_missing_${locale}`);
    }
  }

  const normalizedHardFailures = uniqueSorted(hardFailureReasons);
  if (normalizedHardFailures.length > 0) {
    return {
      exitCode: 2,
      degraded: false,
      hardFailureReasons: normalizedHardFailures,
      softFailureReasons,
    };
  }

  return {
    exitCode: 0,
    degraded: softFailureReasons.length > 0 || input.run.resultStatus === "partial_failure",
    hardFailureReasons: [],
    softFailureReasons,
  };
}

export function shouldRetryNewsFeedFailure(input: {
  attempt: number;
  maximumAttempts: number;
  httpStatus?: number | null;
}): boolean {
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) return false;
  if (!Number.isSafeInteger(input.maximumAttempts) || input.maximumAttempts < 1) return false;
  if (input.attempt >= input.maximumAttempts) return false;
  if (input.httpStatus === undefined || input.httpStatus === null) return true;
  return RETRYABLE_HTTP_STATUSES.has(input.httpStatus) || input.httpStatus >= 500;
}

export function newsFeedRetryDelayMs(input: {
  attempt: number;
  baseDelayMs: number;
}): number {
  const attempt = Number.isSafeInteger(input.attempt) && input.attempt > 0 ? input.attempt : 1;
  const baseDelayMs = Number.isSafeInteger(input.baseDelayMs) && input.baseDelayMs > 0
    ? input.baseDelayMs
    : DEFAULT_NEWS_FEED_RETRY_BASE_DELAY_MS;
  return Math.min(5_000, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

export function shouldDeferNewsTranslationRetry(input: {
  failureReason: string | null | undefined;
  generatedAt: string;
  nowMs?: number;
  retryMinutes: number;
}): boolean {
  const failureReason = input.failureReason?.trim();
  if (!failureReason) return false;
  if (failureReason === "translation_circuit_open") return false;
  if (failureReason === "translation_timeout") return false;

  const generatedAtMs = Date.parse(input.generatedAt);
  if (!Number.isFinite(generatedAtMs)) return false;

  const retryMinutes = Number.isFinite(input.retryMinutes) && input.retryMinutes > 0
    ? input.retryMinutes
    : 60;

  const nowMs = input.nowMs ?? Date.now();
  return nowMs - generatedAtMs < retryMinutes * 60_000;
}
