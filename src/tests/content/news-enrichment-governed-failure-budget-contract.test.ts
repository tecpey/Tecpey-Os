import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const authorityPath = new URL(
  "../../lib/ops/news-enrichment-authority.ts",
  import.meta.url,
);
const workerPath = new URL(
  "../../../scripts/run-news-enrichment-worker.ts",
  import.meta.url,
);

describe("news enrichment governed failure budget contract", () => {
  it("keeps legacy pre-ledger failures out of the bounded retry budget", async () => {
    const authority = await readFile(authorityPath, "utf8");

    assert.match(
      authority,
      /\(evidence->>'translationAttempt'\) ~ '\^\[1-9\]\[0-9\]\*\$'/,
    );
    assert.match(
      authority,
      /\(evidence->>'translationAttempt'\)::int BETWEEN 1 AND 20/,
    );
    assert.doesNotMatch(
      authority,
      /\(SELECT count\(\*\)::int FROM scoped WHERE status = 'failed'\) AS failure_count/,
    );
  });

  it("persists the governed translation attempt identity on new failures", async () => {
    const worker = await readFile(workerPath, "utf8");

    assert.match(worker, /translationAttempt,/);
    assert.match(worker, /persistNewsEnrichmentFailure/);
    assert.match(worker, /NEWS_AI_TRANSLATION_ATTEMPT_SEQUENCE_MAX = 20/);
  });
});
