import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("news enrichment provider-attempt sequence contract", () => {
  it("keeps immutable ledger sequence capacity separate from retry failure budget", () => {
    const worker = read("scripts/run-news-enrichment-worker.ts");
    const migration = read("src/lib/db-migrate-news-ai-cost-authority.ts");

    assert.match(
      migration,
      /translation_attempt SMALLINT NOT NULL CHECK \(translation_attempt BETWEEN 1 AND 20\)/,
    );
    assert.match(worker, /const NEWS_AI_TRANSLATION_ATTEMPT_SEQUENCE_MAX = 20;/);
    assert.match(worker, /maximumFailures,/);
    assert.match(worker, /NEWS_TRANSLATION_MAX_FAILURES_PER_VERSION/);
    assert.doesNotMatch(worker, /maximumAttempts:\s*maximumFailures/);
  });
});
