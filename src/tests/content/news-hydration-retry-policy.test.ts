import assert from "node:assert/strict";
import test from "node:test";

import {
  newsHydrationNextRetryAt,
  selectNewsHydrationCandidates,
} from "../../lib/news-full-evidence-capture";

test("publisher hydration transient failures use bounded exponential cooldown", () => {
  const attemptedAt = "2026-09-11T00:00:00.000Z";

  assert.equal(
    newsHydrationNextRetryAt({
      outcome: "timeout",
      attemptCount: 1,
      attemptedAt,
    }),
    "2026-09-11T00:15:00.000Z",
  );

  assert.equal(
    newsHydrationNextRetryAt({
      outcome: "network_error",
      attemptCount: 2,
      attemptedAt,
    }),
    "2026-09-11T01:00:00.000Z",
  );

  assert.equal(
    newsHydrationNextRetryAt({
      outcome: "http_failure",
      attemptCount: 3,
      attemptedAt,
    }),
    "2026-09-11T06:00:00.000Z",
  );

  assert.equal(
    newsHydrationNextRetryAt({
      outcome: "timeout",
      attemptCount: 50,
      attemptedAt,
    }),
    "2026-09-12T00:00:00.000Z",
  );
});

test("publisher evidence/content failures receive a long cooldown", () => {
  const attemptedAt = "2026-09-11T00:00:00.000Z";

  for (const outcome of [
    "host_rejected",
    "redirect_rejected",
    "redirect_limit",
    "content_type_rejected",
    "too_large",
    "extraction_empty",
    "identity_collision",
  ] as const) {
    assert.equal(
      newsHydrationNextRetryAt({
        outcome,
        attemptCount: 1,
        attemptedAt,
      }),
      "2026-09-12T00:00:00.000Z",
    );
  }
});

test("successful hydration becomes terminal", () => {
  assert.equal(
    newsHydrationNextRetryAt({
      outcome: "hydrated",
      attemptCount: 1,
      attemptedAt: "2026-09-11T00:00:00.000Z",
    }),
    null,
  );
});

test("hydration planner excludes URLs still inside durable cooldown", () => {
  const selected = selectNewsHydrationCandidates(
    [
      {
        articleUrl: "https://example.com/cooldown",
        sourceCoverage: "feed_summary" as const,
        allowFullArticleFetch: true,
      },
      {
        articleUrl: "https://example.com/fresh",
        sourceCoverage: "feed_summary" as const,
        allowFullArticleFetch: true,
      },
    ],
    new Set(),
    new Set(["https://example.com/cooldown"]),
  );

  assert.deepEqual(
    selected.map((item) => item.articleUrl),
    ["https://example.com/fresh"],
  );
});
