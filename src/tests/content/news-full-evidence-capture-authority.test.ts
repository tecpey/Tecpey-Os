import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function read(path: string): Promise<string> {
  return readFile(path, "utf8");
}

describe("news full-evidence capture authority", () => {
  it("keeps publisher hydration inside capture and independent from paid AI", async () => {
    const capture = await read("scripts/run-news-capture-worker.ts");
    const publisher = await read("src/lib/news-publisher-evidence.ts");

    assert.doesNotMatch(
      capture,
      /translateNewsFeedToPersian|callAiProvider|OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY/,
    );
    assert.doesNotMatch(
      publisher,
      /translateNewsFeedToPersian|callAiProvider|OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY/,
    );

    assert.match(capture, /fetchNewsPublisherEvidence/);
    assert.match(capture, /allowFullArticleFetch/);
    assert.match(capture, /article_full/);
    assert.match(publisher, /extractNewsArticleEvidence/);
  });

  it("requires explicit source coverage instead of inferring rich evidence from body length", async () => {
    const capture = await read("scripts/run-news-capture-worker.ts");

    assert.match(
      capture,
      /sourceCoverage:\s*"feed_full"\s*\|\s*"feed_summary"\s*\|\s*"article_full"/,
    );

    assert.doesNotMatch(
      capture,
      /sourceBody\.length\s*[><=]|body\.length\s*[><=].*article_full/,
    );
  });

  it("looks up already hydrated article URLs before publisher network fetch", async () => {
    const capture = await read("scripts/run-news-capture-worker.ts");

    assert.match(capture, /platform_news_archive_items/);
    assert.match(capture, /article_url/);
    assert.match(capture, /source_coverage/);
    assert.match(capture, /article_full/);

    assert.match(
      capture,
      /allowFullArticleFetch[\s\S]*feed_summary|feed_summary[\s\S]*allowFullArticleFetch/,
    );
  });

  it("bounds publisher evidence acquisition through the shared publisher authority", async () => {
    const capture = await read("scripts/run-news-capture-worker.ts");
    const publisher = await read("src/lib/news-publisher-evidence.ts");

    assert.match(capture, /NEWS_ARTICLE_FETCH_CONCURRENCY/);
    assert.match(capture, /fetchNewsPublisherEvidence/);

    assert.match(publisher, /NEWS_ARTICLE_TIMEOUT_MS/);
    assert.match(publisher, /MAX_NEWS_ARTICLE_BYTES/);
    assert.match(publisher, /NEWS_ARTICLE_MAX_REDIRECTS/);
    assert.match(publisher, /readBoundedResponseText/);
    assert.match(publisher, /extractNewsArticleEvidence/);
    assert.match(publisher, /AbortSignal\.timeout/);
    assert.match(publisher, /text\/html|application\/xhtml\+xml/);
    assert.match(publisher, /isApprovedNewsSourceHost|safePublisherUrl/);
    assert.match(publisher, /redirect:\s*"manual"/);
    assert.doesNotMatch(publisher, /redirect:\s*"follow"/);

    for (const outcome of [
      "host_rejected",
      "redirect_rejected",
      "redirect_limit",
      "timeout",
      "network_error",
      "http_failure",
      "content_type_rejected",
      "too_large",
      "extraction_empty",
    ]) {
      assert.match(publisher, new RegExp(outcome));
    }

    assert.match(capture, /hydrated/);
    assert.match(capture, /hydrationAudit/);
    assert.match(capture, /attemptedCount/);
    assert.match(capture, /skippedPolicyCount/);
    assert.match(capture, /skippedExistingRichCount/);
    assert.doesNotMatch(capture, /hydratedArticleCount:/);

    assert.doesNotMatch(capture, /extractNewsArticleEvidence/);
    assert.doesNotMatch(capture, /NEWS_ARTICLE_TIMEOUT_MS/);
    assert.doesNotMatch(capture, /NEWS_ARTICLE_MAX_REDIRECTS/);
  });

  it("does not hydrate archive history indiscriminately", async () => {
    const capture = await read("scripts/run-news-capture-worker.ts");

    assert.doesNotMatch(
      capture,
      /SELECT[\s\S]*FROM platform_news_archive_items[\s\S]*LIMIT 300[\s\S]*fetch\(/i,
    );

    assert.match(capture, /alreadyHydrated|hydratedArticleUrls|fullEvidenceUrls/);
  });
});
