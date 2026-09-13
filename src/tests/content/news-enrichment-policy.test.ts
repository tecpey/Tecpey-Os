import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyNewsEnrichmentFailure,
  decideNewsEnrichmentRetry,
} from "../../lib/ops/news-enrichment-policy";

describe("news enrichment retry policy", () => {
  it("retries transient failures after the configured cooldown", () => {
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

  it("gives deterministic translation-quality variability a bounded retry lane", () => {
    for (const reason of [
      "translation_numeric_integrity_failed",
      "translation_language_or_shape_invalid",
      "translation_summary_unsupported_entity",
      "translation_summary_expansion_exceeded",
      "editorial_quality_unsupported_latin_entity",
      "editorial_quality_ticker_integrity_failed",
      "editorial_quality_persian_field_quality_failed",
      "editorial_quality_title_shape_failed",
      "editorial_quality_title_density_failed",
    ]) {
      assert.equal(classifyNewsEnrichmentFailure(reason), "transient", reason);
      assert.deepEqual(
        decideNewsEnrichmentRetry({
          failureReason: reason,
          generatedAt: "2026-09-09T09:00:00.000Z",
          failureCount: 1,
          retryMinutes: 2,
          maximumFailures: 3,
          nowMs: Date.parse("2026-09-09T09:02:00.000Z"),
        }),
        { action: "process", reason: "transient_retry" },
        reason,
      );
    }
  });

  it("recovers after provider/key configuration incidents with slow capped backoff", () => {
    for (const reason of [
      "translation_provider_unavailable",
      "translation_provider_disabled",
      "translation_quota_exhausted",
      "translation_provider_rejected",
    ]) {
      assert.equal(classifyNewsEnrichmentFailure(reason), "recoverable_configuration", reason);
      assert.deepEqual(
        decideNewsEnrichmentRetry({
          failureReason: reason,
          generatedAt: "2026-09-09T09:00:00.000Z",
          failureCount: 1,
          retryMinutes: 2,
          maximumFailures: 3,
          nowMs: Date.parse("2026-09-09T09:14:59.000Z"),
        }),
        {
          action: "defer",
          until: "2026-09-09T09:15:00.000Z",
          failureClass: "recoverable_configuration",
        },
        reason,
      );
      assert.deepEqual(
        decideNewsEnrichmentRetry({
          failureReason: reason,
          generatedAt: "2026-09-09T09:00:00.000Z",
          failureCount: 1,
          retryMinutes: 2,
          maximumFailures: 3,
          nowMs: Date.parse("2026-09-09T09:15:00.000Z"),
        }),
        { action: "process", reason: "configuration_retry" },
        reason,
      );
    }

    assert.deepEqual(
      decideNewsEnrichmentRetry({
        failureReason: "translation_provider_rejected",
        generatedAt: "2026-09-09T09:00:00.000Z",
        failureCount: 4,
        retryMinutes: 2,
        maximumFailures: 3,
        nowMs: Date.parse("2026-09-09T10:59:59.000Z"),
      }),
      {
        action: "defer",
        until: "2026-09-09T11:00:00.000Z",
        failureClass: "recoverable_configuration",
      },
    );
  });

  it("stops transient retries at the immutable version failure budget", () => {
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

  it("keeps response-size and unknown failures fail-closed", () => {
    for (const reason of [
      "translation_response_too_large",
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
    assert.equal(classifyNewsEnrichmentFailure("translation_response_too_large"), "terminal_provider");
    assert.equal(classifyNewsEnrichmentFailure("translation_some_future_unknown_reason"), "terminal_quality");
  });
});
