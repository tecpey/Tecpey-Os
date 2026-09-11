import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeNewsHydrationPlan,
  selectNewsHydrationCandidates,
  type NewsHydrationPlanningItem,
} from "../../lib/news-full-evidence-capture";

describe("news full-evidence hydration planning", () => {
  it("never selects 300 already hydrated archive URLs for publisher fetch", () => {
    const archive: NewsHydrationPlanningItem[] = Array.from(
      { length: 300 },
      (_, index) => ({
        articleUrl: `https://publisher.example/archive-${index}`,
        sourceCoverage: "feed_summary",
        allowFullArticleFetch: true,
      }),
    );

    const alreadyHydratedArticleUrls = new Set(
      archive.map((article) => article.articleUrl),
    );

    const selected = selectNewsHydrationCandidates(
      archive,
      alreadyHydratedArticleUrls,
    );

    assert.equal(selected.length, 0);
  });

  it("caps publisher requests at 24 while leaving excess ready evidence deferred", () => {
    const articles: NewsHydrationPlanningItem[] = Array.from(
      { length: 30 },
      (_, index) => ({
        articleUrl: `https://publisher.example/ready-${index}`,
        sourceCoverage: "feed_summary",
        allowFullArticleFetch: true,
      }),
    );

    const selected = selectNewsHydrationCandidates(
      articles,
      new Set(),
      new Set(),
    );

    assert.equal(selected.length, 24);
    assert.equal(articles.length - selected.length, 6);
  });

  it("selects only fresh feed-summary URLs whose source policy allows full fetch", () => {
    const articles: NewsHydrationPlanningItem[] = [
      {
        articleUrl: "https://publisher.example/already-full",
        sourceCoverage: "article_full",
        allowFullArticleFetch: true,
      },
      {
        articleUrl: "https://publisher.example/feed-full",
        sourceCoverage: "feed_full",
        allowFullArticleFetch: true,
      },
      {
        articleUrl: "https://publisher.example/policy-blocked",
        sourceCoverage: "feed_summary",
        allowFullArticleFetch: false,
      },
      {
        articleUrl: "https://publisher.example/already-hydrated",
        sourceCoverage: "feed_summary",
        allowFullArticleFetch: true,
      },
      {
        articleUrl: "https://publisher.example/fresh",
        sourceCoverage: "feed_summary",
        allowFullArticleFetch: true,
      },
    ];

    const selected = selectNewsHydrationCandidates(
      articles,
      new Set(["https://publisher.example/already-hydrated"]),
    );

    assert.deepEqual(
      selected.map((article) => article.articleUrl),
      ["https://publisher.example/fresh"],
    );
  });
});

it("already hydrated URLs cause zero publisher hydration calls", async () => {
  let hydrationCalls = 0;

  const results = await executeNewsHydrationPlan({
    articles: [{
      articleUrl: "https://example.com/already-rich",
      sourceCoverage: "feed_summary" as const,
      allowFullArticleFetch: true,
    }],
    alreadyHydratedArticleUrls: new Set([
      "https://example.com/already-rich",
    ]),
    concurrency: 4,
    hydrate: async () => {
      hydrationCalls += 1;
      return "unexpected";
    },
  });

  assert.equal(hydrationCalls, 0);
  assert.deepEqual(results, []);
});

it("cooldown blocked URLs cause zero publisher hydration calls", async () => {
  let hydrationCalls = 0;

  const results = await executeNewsHydrationPlan({
    articles: [{
      articleUrl: "https://example.com/in-cooldown",
      sourceCoverage: "feed_summary" as const,
      allowFullArticleFetch: true,
    }],
    alreadyHydratedArticleUrls: new Set(),
    cooldownBlockedArticleUrls: new Set([
      "https://example.com/in-cooldown",
    ]),
    concurrency: 4,
    hydrate: async () => {
      hydrationCalls += 1;
      return "unexpected";
    },
  });

  assert.equal(hydrationCalls, 0);
  assert.deepEqual(results, []);
});

it("hydration executor calls only eligible publisher candidates", async () => {
  const called: string[] = [];

  const results = await executeNewsHydrationPlan({
    articles: [
      {
        articleUrl: "https://example.com/eligible",
        sourceCoverage: "feed_summary" as const,
        allowFullArticleFetch: true,
      },
      {
        articleUrl: "https://example.com/feed-full",
        sourceCoverage: "feed_full" as const,
        allowFullArticleFetch: true,
      },
      {
        articleUrl: "https://example.com/policy-blocked",
        sourceCoverage: "feed_summary" as const,
        allowFullArticleFetch: false,
      },
    ],
    alreadyHydratedArticleUrls: new Set(),
    cooldownBlockedArticleUrls: new Set(),
    concurrency: 4,
    hydrate: async (article) => {
      called.push(article.articleUrl);
      return article.articleUrl;
    },
  });

  assert.deepEqual(called, ["https://example.com/eligible"]);
  assert.deepEqual(results, ["https://example.com/eligible"]);
});
