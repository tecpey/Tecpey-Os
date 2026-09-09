export type NewsEnrichmentFailureClass =
  | "transient"
  | "configuration"
  | "terminal_quality"
  | "terminal_provider";

export type NewsEnrichmentRetryDecision =
  | { action: "process"; reason: "fresh" | "transient_retry" }
  | { action: "defer"; until: string; failureClass: "transient" }
  | { action: "attempt_budget_exhausted"; failures: number; failureClass: "transient" }
  | { action: "terminal_failure"; failureClass: Exclude<NewsEnrichmentFailureClass, "transient">; reason: string };

const TRANSIENT_FAILURES = new Set([
  "translation_timeout",
  "translation_network_error",
  "translation_rate_limited",
  "translation_circuit_open",
  "translation_cancelled",
]);

const CONFIGURATION_FAILURES = new Set([
  "translation_provider_unavailable",
  "translation_provider_disabled",
  "translation_quota_exhausted",
]);

const TERMINAL_PROVIDER_FAILURES = new Set([
  "translation_provider_rejected",
  "translation_invalid_response",
  "translation_response_too_large",
]);

function boundedFailureBudget(value: number): number {
  if (!Number.isSafeInteger(value)) return 3;
  return Math.max(1, Math.min(5, value));
}

function boundedRetryMinutes(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 2;
  return Math.max(1, Math.min(24 * 60, Math.trunc(value)));
}

export function classifyNewsEnrichmentFailure(reason: string | null | undefined): NewsEnrichmentFailureClass {
  const normalized = reason?.trim() ?? "";
  if (TRANSIENT_FAILURES.has(normalized)) return "transient";
  if (CONFIGURATION_FAILURES.has(normalized)) return "configuration";
  if (TERMINAL_PROVIDER_FAILURES.has(normalized)) return "terminal_provider";

  // Validation/quality failures have already consumed the translator's single
  // governed repair pass when applicable. Retrying them on a scheduler cadence
  // is both expensive and unlikely to change the outcome for immutable input.
  // Unknown failures also fail closed into this class rather than silently
  // becoming paid transient retries.
  return "terminal_quality";
}

export function decideNewsEnrichmentRetry(input: {
  failureReason: string | null | undefined;
  generatedAt: string | null | undefined;
  failureCount: number;
  retryMinutes: number;
  maximumFailures: number;
  nowMs?: number;
}): NewsEnrichmentRetryDecision {
  if (!input.failureReason || !input.generatedAt || input.failureCount <= 0) {
    return { action: "process", reason: "fresh" };
  }

  const failureClass = classifyNewsEnrichmentFailure(input.failureReason);
  if (failureClass !== "transient") {
    return {
      action: "terminal_failure",
      failureClass,
      reason: input.failureReason,
    };
  }

  const maximumFailures = boundedFailureBudget(input.maximumFailures);
  if (input.failureCount >= maximumFailures) {
    return {
      action: "attempt_budget_exhausted",
      failures: input.failureCount,
      failureClass: "transient",
    };
  }

  const generatedAtMs = Date.parse(input.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    return {
      action: "terminal_failure",
      failureClass: "terminal_quality",
      reason: "translation_failure_timestamp_invalid",
    };
  }

  const retryMinutes = boundedRetryMinutes(input.retryMinutes);
  const retryAtMs = generatedAtMs + retryMinutes * 60_000;
  const nowMs = input.nowMs ?? Date.now();
  if (nowMs < retryAtMs) {
    return {
      action: "defer",
      until: new Date(retryAtMs).toISOString(),
      failureClass: "transient",
    };
  }

  return { action: "process", reason: "transient_retry" };
}
