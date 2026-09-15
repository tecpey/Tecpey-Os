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

  it("uses canonical publication eligibility before public trend-history limits", () => {
    const authority = source("src/lib/growth-trend-authority.ts");
    assert.match(authority, /FROM platform_news_impact_history_items/);
    assert.match(authority, /approvedNewsPublicationSources\(\)/);
    assert.match(authority, /source_name = ANY\(\$3::text\[\]\)/);
    assert.match(authority, /isNewsPublicationSourceEligible\(articleUrl\)/);
    assert.doesNotMatch(authority, /resolveNewsSourceAuthority\(articleUrl\)/);
    assert.doesNotMatch(authority, /FROM platform_news_archive_items/);
  });

  it("revalidates public history and detail body reads through one publication authority", () => {
    const history = source("src/lib/news-impact-history-authority.ts");
    const body = source("src/lib/news-detail-body-authority.ts");
    assert.match(history, /approvedNewsPublicationSources\(\)/);
    assert.match(history, /source_name = ANY/);
    assert.match(history, /isNewsPublicationSourceEligible\(item\.sourceUrl\)/);
    assert.doesNotMatch(history, /resolveNewsSourceAuthority\(item\.sourceUrl\)/);
    assert.match(body, /isNewsPublicationSourceEligible\(articleUrl\)/);
  });
});
