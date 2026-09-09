import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyNewsEnrichmentFailure,
  decideNewsEnrichmentRetry,
} from "../../lib/ops/news-enrichment-policy";

describe("news enrichment retry policy", () => {
  it("retries only transient failures after the configured cooldown", () => {
    const generatedAt = "2026-09-09T09:00:00.000Z";

    assert.deepEqual(
      decideNewsEnrichmentRetry({
        failureReason: "translation_timeout",
        generatedAt,
        failureCount: 1,
        retryMinutes: 2,
        maximumFailures: 3,
        nowMs: Date.parse("2026-09-09T09:01:59.000Z"),
      }),
      {
        action: "defer",
        until: "2026-09-09T09:02:00.000Z",
        failureClass: "transient",
      },
    );

    assert.deepEqual(
      decideNewsEnrichmentRetry({
        failureReason: "translation_timeout",
        generatedAt,
        failureCount: 1,
        retryMinutes: 2,
        maximumFailures: 3,
        nowMs: Date.parse("2026-09-09T09:02:00.000Z"),
      }),
      { action: "process", reason: "transient_retry" },
    );
  });

  it("never scheduler-retries final validation failures", () => {
    for (const reason of [
      "translation_numeric_integrity_failed",
      "translation_language_or_shape_invalid",
      "translation_summary_unsupported_entity",
      "translation_summary_expansion_exceeded",
    ]) {
      const decision = decideNewsEnrichmentRetry({
        failureReason: reason,
        generatedAt: "2026-09-09T09:00:00.000Z",
        failureCount: 1,
        retryMinutes: 2,
        maximumFailures: 3,
        nowMs: Date.parse("2026-09-10T09:00:00.000Z"),
      });
      assert.equal(decision.action, "terminal_failure", reason);
      assert.equal(classifyNewsEnrichmentFailure(reason), "terminal_quality", reason);
    }
  });

  it("stops transient retries at the immutable version attempt budget", () => {
    assert.deepEqual(
      decideNewsEnrichmentRetry({
        failureReason: "translation_network_error",
        generatedAt: "2026-09-09T09:00:00.000Z",
        failureCount: 3,
        retryMinutes: 2,
        maximumFailures: 3,
        nowMs: Date.parse("2026-09-09T10:00:00.000Z"),
      }),
      {
        action: "attempt_budget_exhausted",
        failures: 3,
        failureClass: "transient",
      },
    );
  });

  it("fails closed for configuration, provider and unknown failures", () => {
    for (const reason of [
      "translation_provider_unavailable",
      "translation_quota_exhausted",
      "translation_provider_rejected",
      "translation_invalid_response",
      "translation_some_future_unknown_reason",
    ]) {
      const decision = decideNewsEnrichmentRetry({
        failureReason: reason,
        generatedAt: "2026-09-09T09:00:00.000Z",
        failureCount: 1,
        retryMinutes: 2,
        maximumFailures: 3,
      });
      assert.equal(decision.action, "terminal_failure", reason);
    }
  });
});
