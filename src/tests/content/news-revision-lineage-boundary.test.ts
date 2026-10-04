import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("News correction and revision lineage boundary", () => {
  it("presents the newest observed revision before preferring richer evidence", () => {
    const authority = read("src/services/news/archive-presentation-authority.ts");
    const orderStart = authority.indexOf("ORDER BY article_url,");
    const fetchedAt = authority.indexOf("fetched_at DESC", orderStart);
    const richCoverage = authority.indexOf("WHEN 'article_full' THEN 3", orderStart);

    assert.ok(orderStart >= 0, "latest_article ordering is missing");
    assert.ok(fetchedAt > orderStart, "revision recency is missing from presentation ordering");
    assert.ok(
      richCoverage > fetchedAt,
      "rich coverage must only break ties inside the newest observed revision",
    );
    assert.match(authority, /newer fetched revision always supersedes an older revision/);
  });

  it("derives hydration identity from the same immutable archive content hash", () => {
    const worker = read("scripts/run-news-capture-worker.ts");

    assert.match(worker, /newsArchiveContentHash/);
    assert.match(worker, /function sourceRevision\(article: CaptureArticle\)/);
    assert.match(worker, /identity: `\$\{articleUrl\}\\0\$\{contentHash\}`/);
    assert.match(worker, /hydrationIdentity: sourceRevision\(article\)\.identity/);
    assert.match(worker, /alreadyHydratedArticleIdentities: alreadyHydrated/);
    assert.match(worker, /cooldownBlockedArticleIdentities: cooldownBlocked/);
  });

  it("requires rich evidence to belong to the same captured feed revision", () => {
    const worker = read("scripts/run-news-capture-worker.ts");

    assert.match(worker, /rich\.source_coverage = 'article_full'/);
    assert.match(worker, /rich\.fetched_at = feed_revision\.fetched_at/);
    assert.match(worker, /archive\.content_hash = requested\.content_hash/);
    assert.match(worker, /state\.last_attempt_at >= feed_revision\.fetched_at/);
  });

  it("resets URL-scoped hydration state when a new immutable revision is inserted", () => {
    const worker = read("scripts/run-news-capture-worker.ts");

    assert.match(worker, /revisionInserted: boolean/);
    assert.match(worker, /WHEN \$5::boolean THEN 1/);
    assert.match(worker, /ELSE NULL\s+END,\s+updated_at = NOW\(\)/);
    assert.match(worker, /revisionInserted: feedArchive\.inserted/);
    assert.doesNotMatch(worker, /WHERE platform_news_hydration_state\.hydrated_at IS NULL/);
  });

  it("withholds an older translated revision as soon as a newer correction is observed", () => {
    const publication = read("src/lib/ops/news-publication-authority.ts");
    const latestArchive = publication.indexOf("WITH latest_archive AS");
    const translationJoin = publication.indexOf("JOIN LATERAL", latestArchive);
    const fetchedAt = publication.indexOf("archive.fetched_at DESC", latestArchive);
    const exactHash = publication.indexOf("source_content_hash = archive.content_hash", translationJoin);

    assert.ok(latestArchive >= 0, "publication must choose latest archive revision first");
    assert.ok(fetchedAt > latestArchive, "latest publication revision must use observed recency");
    assert.ok(translationJoin > fetchedAt, "translation eligibility must be evaluated after revision selection");
    assert.ok(exactHash > translationJoin, "translation must match the selected correction hash");
    assert.match(publication, /withheld rather than silently falling back/);
  });
});
