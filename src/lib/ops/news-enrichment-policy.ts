export type NewsEnrichmentFailureClass =
  | "transient"
  | "recoverable_configuration"
  | "terminal_quality"
  | "terminal_provider";

export type NewsEnrichmentRetryDecision =
  | { action: "process"; reason: "fresh" | "transient_retry" | "configuration_retry" }
  | { action: "defer"; until: string; failureClass: "transient" | "recoverable_configuration" }
  | { action: "attempt_budget_exhausted"; failures: number; failureClass: "transient" }
  | { action: "terminal_failure"; failureClass: "terminal_quality" | "terminal_provider"; reason: string };

const TRANSIENT_FAILURES = new Set([
  "translation_timeout",
  "translation_network_error",
  "translation_rate_limited",
  "translation_circuit_open",
  "translation_cancelled",
  "translation_invalid_response",
  "translation_numeric_integrity_failed",
  "translation_language_or_shape_invalid",
  "translation_summary_unsupported_entity",
  "translation_summary_expansion_exceeded",
  "editorial_quality_unsupported_latin_entity",
  "editorial_quality_ticker_integrity_failed",
  "editorial_quality_persian_field_quality_failed",
  "editorial_quality_title_shape_failed",
  "editorial_quality_title_density_failed",
]);

const RECOVERABLE_CONFIGURATION_FAILURES = new Set([
  "translation_provider_unavailable",
  "translation_provider_disabled",
  "translation_quota_exhausted",
  "translation_provider_rejected",
]);

const TERMINAL_PROVIDER_FAILURES = new Set([
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

function recoverableConfigurationDelayMinutes(input: {
  failureCount: number;
  retryMinutes: number;
}): number {
  // Credentials, quotas and provider access can change without the immutable
  // publisher evidence changing. Keep those failures retryable, but use a
  // deliberately slower capped backoff so a bad key cannot create a paid-call
  // storm. The archive remains public independently while enrichment waits.
  const base = Math.max(15, boundedRetryMinutes(input.retryMinutes));
  const exponent = Math.max(0, Math.min(5, Math.trunc(input.failureCount) - 1));
  return Math.min(6 * 60, base * 2 ** exponent);
}

export function classifyNewsEnrichmentFailure(reason: string | null | undefined): NewsEnrichmentFailureClass {
  const normalized = reason?.trim() ?? "";
  if (TRANSIENT_FAILURES.has(normalized)) return "transient";
  if (RECOVERABLE_CONFIGURATION_FAILURES.has(normalized)) return "recoverable_configuration";
  if (TERMINAL_PROVIDER_FAILURES.has(normalized)) return "terminal_provider";

  // Unknown or policy-only validation failures stay fail-closed. Archive
  // preservation is a separate authority, so terminal enrichment never means
  // deleting or hiding the captured source record.
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
  const generatedAtMs = Date.parse(input.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    return {
      action: "terminal_failure",
      failureClass: "terminal_quality",
      reason: "translation_failure_timestamp_invalid",
    };
  }

  const nowMs = input.nowMs ?? Date.now();

  if (failureClass === "recoverable_configuration") {
    const delayMinutes = recoverableConfigurationDelayMinutes({
      failureCount: input.failureCount,
      retryMinutes: input.retryMinutes,
    });
    const retryAtMs = generatedAtMs + delayMinutes * 60_000;
    if (nowMs < retryAtMs) {
      return {
        action: "defer",
        until: new Date(retryAtMs).toISOString(),
        failureClass,
      };
    }
    return { action: "process", reason: "configuration_retry" };
  }

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

  const retryMinutes = boundedRetryMinutes(input.retryMinutes);
  const retryAtMs = generatedAtMs + retryMinutes * 60_000;
  if (nowMs < retryAtMs) {
    return {
      action: "defer",
      until: new Date(retryAtMs).toISOString(),
      failureClass,
    };
  }

  return { action: "process", reason: "transient_retry" };
}
