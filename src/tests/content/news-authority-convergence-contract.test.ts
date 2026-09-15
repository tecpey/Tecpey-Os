import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("news authority convergence contract", () => {
  it("keeps the publication worker on the governed snapshot path", () => {
    const worker = source("scripts/run-news-publication-worker.ts");
    assert.match(worker, /buildGovernedNewsSnapshot/);
    assert.doesNotMatch(worker, /buildNewsAutomationBatch/);
    assert.doesNotMatch(worker, /materializeNewsAutomationDecisions/);
  });

  it("allows only governed publishable news to create growth signals", () => {
    const worker = source("scripts/run-news-materialization-worker.ts");
    assert.match(worker, /buildGovernedNewsAutomationBatch/);
    assert.match(worker, /decision\.status !== "publishable"/);
    assert.match(worker, /publicationDisposition !== "auto_publish_eligible"/);
    assert.doesNotMatch(worker, /enDecisions = buildNewsAutomationBatch/);
  });

  it("uses governed publication history rather than raw archive as public trend-highlight authority", () => {
    const authority = source("src/lib/growth-trend-authority.ts");
    assert.match(authority, /FROM platform_news_impact_history_items/);
    assert.match(authority, /resolveNewsSourceAuthority\(articleUrl\)/);
    assert.doesNotMatch(authority, /FROM platform_news_archive_items/);
  });

  it("revalidates public history and detail body reads against current source authority", () => {
    const history = source("src/lib/news-impact-history-authority.ts");
    const body = source("src/lib/news-detail-body-authority.ts");
    assert.match(history, /isCurrentlyPublishableNewsImpactItem/);
    assert.match(history, /resolveNewsSourceAuthority\(item\.sourceUrl\)/);
    assert.match(body, /isNewsPublicationSourceEligible\(articleUrl\)/);
  });
});
