import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchNewsPublisherEvidence,
  inferNewsPublisherEvidenceCoverage,
} from "../../lib/news-publisher-evidence";
import type { NewsSourceRegistryEntry } from "../../lib/news-source-registry";

const source = (allowFullArticleFetch: boolean): NewsSourceRegistryEntry => ({
  id: "example",
  name: "Example",
  feedUrl: "https://example.com/feed",
  canonicalDomains: ["example.com"],
  category: "general_crypto",
  trustTier: "tier_2",
  firstParty: false,
  allowFullArticleFetch,
  corroborationWeight: 0.8,
});

describe("publisher evidence authority", () => {
  it("classifies a short feed body that mirrors the lead as summary-only", () => {
    assert.equal(
      inferNewsPublisherEvidenceCoverage({ lead: "Short summary", body: "Short summary" }),
      "feed_summary",
    );
  });

  it("does not make article requests when the feed already contains full evidence", async () => {
    let calls = 0;
    const body = `Opening ${"publisher evidence ".repeat(90)}`;
    const result = await fetchNewsPublisherEvidence({
      source: source(true),
      articleUrl: "https://example.com/news/1",
      lead: "Opening",
      body,
      fetchImpl: async () => {
        calls += 1;
        return new Response("unexpected");
      },
    });

    assert.equal(result.coverage, "feed_full");
    assert.equal(result.attemptedArticleFetch, false);
    assert.equal(calls, 0);
  });

  it("honors source policy and never fetches a full article when disabled", async () => {
    let calls = 0;
    const result = await fetchNewsPublisherEvidence({
      source: source(false),
      articleUrl: "https://example.com/news/2",
      lead: "Lead",
      body: "Lead",
      fetchImpl: async () => {
        calls += 1;
        return new Response("unexpected");
      },
    });

    assert.equal(result.coverage, "feed_summary");
    assert.equal(result.reason, "policy_disabled");
    assert.equal(calls, 0);
  });

  it("promotes bounded same-publisher HTML evidence to article_full", async () => {
    const articleBody = `Material fact. ${"Detailed publisher paragraph with verifiable context. ".repeat(35)}`;
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "NewsArticle",
      articleBody,
    })}</script></head><body></body></html>`;

    const result = await fetchNewsPublisherEvidence({
      source: source(true),
      articleUrl: "https://example.com/news/3",
      lead: "Short lead",
      body: "Short lead",
      fetchImpl: async () => new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    });

    assert.equal(result.coverage, "article_full");
    assert.equal(result.reason, "article_full");
    assert.equal(result.extractionMethod, "json_ld_article_body");
    assert.ok(result.body.length > 600);
  });

  it("fails closed before network on an off-registry article host", async () => {
    let calls = 0;
    const result = await fetchNewsPublisherEvidence({
      source: source(true),
      articleUrl: "https://evil.example/news/4",
      lead: "Short lead",
      body: "Short lead",
      fetchImpl: async () => {
        calls += 1;
        return new Response("unexpected");
      },
    });

    assert.equal(result.coverage, "feed_summary");
    assert.equal(result.reason, "article_redirect_or_host_rejected");
    assert.equal(calls, 0);
  });

  it("rejects non-HTML publisher responses without replacing feed evidence", async () => {
    const result = await fetchNewsPublisherEvidence({
      source: source(true),
      articleUrl: "https://example.com/news/5",
      lead: "Short lead",
      body: "Short lead",
      fetchImpl: async () => new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    assert.equal(result.coverage, "feed_summary");
    assert.equal(result.reason, "article_content_type_rejected");
    assert.equal(result.body, "Short lead");
  });

  it("follows a bounded same-publisher redirect and promotes the final HTML evidence", async () => {
    const requestedUrls: string[] = [];
    const articleBody =
      `Verified material fact. ${"Detailed same-publisher evidence with attributable context. ".repeat(35)}`;

    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "NewsArticle",
      articleBody,
    })}</script></head><body></body></html>`;

    const result = await fetchNewsPublisherEvidence({
      source: source(true),
      articleUrl: "https://example.com/news/redirect-start",
      lead: "Short lead",
      body: "Short lead",
      fetchImpl: async (input) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url === "https://example.com/news/redirect-start") {
          return new Response(null, {
            status: 302,
            headers: {
              location: "/news/redirect-final",
            },
          });
        }

        assert.equal(url, "https://example.com/news/redirect-final");

        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      },
    });

    assert.deepEqual(requestedUrls, [
      "https://example.com/news/redirect-start",
      "https://example.com/news/redirect-final",
    ]);
    assert.equal(result.coverage, "article_full");
    assert.equal(result.hydrationOutcome, "hydrated");
    assert.equal(result.reason, "article_full");
    assert.equal(result.extractionMethod, "json_ld_article_body");
  });

  it("fails closed after the bounded redirect limit", async () => {
    let calls = 0;

    const result = await fetchNewsPublisherEvidence({
      source: source(true),
      articleUrl: "https://example.com/news/redirect-0",
      lead: "Short lead",
      body: "Short lead",
      fetchImpl: async () => {
        calls += 1;

        return new Response(null, {
          status: 302,
          headers: {
            location: `/news/redirect-${calls}`,
          },
        });
      },
    });

    assert.equal(calls, 4);
    assert.equal(result.coverage, "feed_summary");
    assert.equal(result.hydrationOutcome, "redirect_limit");
    assert.equal(result.reason, "article_redirect_or_host_rejected");
    assert.equal(result.body, "Short lead");
  });

  it("classifies an oversized publisher response as too_large without replacing feed evidence", async () => {
    const oversizedHtml = `<html><body>${"x".repeat(2_500_100)}</body></html>`;

    const result = await fetchNewsPublisherEvidence({
      source: source(true),
      articleUrl: "https://example.com/news/oversized",
      lead: "Short lead",
      body: "Short lead",
      fetchImpl: async () => new Response(oversizedHtml, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    });

    assert.equal(result.coverage, "feed_summary");
    assert.equal(result.hydrationOutcome, "too_large");
    assert.equal(result.reason, "article_too_large");
    assert.equal(result.body, "Short lead");
  });
});
