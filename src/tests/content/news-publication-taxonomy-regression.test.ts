import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildNewsAutomationDecision, type ApprovedNewsSource } from "../../lib/news-automation";
import { extractNewsTaxonomy } from "../../lib/news-taxonomy";
import {
  buildOrganicGrowthProfile,
  validateOrganicGrowthProfile,
} from "../../lib/organic-growth-automation";

const SOURCES: ApprovedNewsSource[] = [
  {
    name: "Cointelegraph",
    domain: "cointelegraph.com",
    tier: "trusted_media",
    trustScore: 0.7,
  },
];

const publishedAt = "2026-09-14T00:54:08.000Z";
const fetchedAt = "2026-09-14T03:30:45.319Z";
const sourceUrl = "https://cointelegraph.com/news/revolut-attackers-threaten-daily-customer-data-leaks";

describe("news publication taxonomy regression", () => {
  it("classifies governed customer-data incidents as security in English and Persian", () => {
    const en = extractNewsTaxonomy(
      "Revolut attackers threaten daily customer data leaks after obtaining customer records",
    );
    const fa = extractNewsTaxonomy(
      "تهدید منتشرکنندگان داده‌های مشتریان Revolut به افشای روزانه اطلاعات کاربران",
    );

    assert.ok(en.topicTags.includes("security"));
    assert.ok(fa.topicTags.includes("security"));
    assert.ok(en.searchIntents.length > 0);
    assert.ok(fa.searchIntents.length > 0);
  });

  it("allows the validated Revolut security story through publication without weakening unrelated-news review", () => {
    const revolutEn = buildNewsAutomationDecision(
      {
        id: "archive-revolut-en",
        locale: "en",
        title: "Revolut attackers threaten daily customer data leaks",
        summary:
          "Attackers say they obtained customer records and threaten recurring data leaks, creating a material security and privacy risk for affected users.",
        sourceName: "Cointelegraph",
        sourceUrl,
        url: sourceUrl,
        publishedAt,
        fetchedAt,
      },
      SOURCES,
    );

    const revolutFa = buildNewsAutomationDecision(
      {
        id: "archive-revolut-fa",
        locale: "fa",
        title: "تهدید منتشرکنندگان داده‌های مشتریان Revolut به افشای روزانه اطلاعات",
        summary:
          "مهاجمان می‌گویند به سوابق مشتریان دست یافته‌اند و تهدید کرده‌اند اطلاعات کاربران را به‌صورت روزانه منتشر کنند؛ موضوعی که یک ریسک امنیتی و حریم خصوصی برای کاربران ایجاد می‌کند.",
        sourceName: "Cointelegraph",
        sourceUrl,
        url: sourceUrl,
        publishedAt,
        fetchedAt,
      },
      SOURCES,
    );

    for (const decision of [revolutEn, revolutFa]) {
      assert.equal(decision.status, "publishable");
      assert.deepEqual(decision.reasons, []);
      assert.ok(decision.article.topicTags.includes("security"));
      assert.ok(decision.organicGrowth.searchIntents.length > 0);
      assert.equal(decision.organicGrowth.readiness.ready, true);
      assert.equal(decision.historyItems.length, 1);
    }

    const unrelated = buildNewsAutomationDecision(
      {
        id: "archive-unrelated-en",
        locale: "en",
        title: "Company announces a routine office furniture refresh",
        summary:
          "The organization replaced desks and chairs at one office during a routine facilities update unrelated to the subject matter covered by this regression test.",
        sourceName: "Cointelegraph",
        sourceUrl: "https://cointelegraph.com/news/routine-office-furniture-refresh",
        url: "https://cointelegraph.com/news/routine-office-furniture-refresh",
        publishedAt,
        fetchedAt,
      },
      SOURCES,
    );

    assert.equal(unrelated.status, "needs_review");
    assert.ok(unrelated.reasons.includes("no_supported_entity"));
    assert.equal(unrelated.historyItems.length, 0);
  });

  it("keeps readiness scoring and validation aligned when search intent is absent", () => {
    const profile = buildOrganicGrowthProfile({
      entityType: "news",
      locale: "en",
      canonicalPath: "/en/crypto-news/search-intent-contract",
      title: "Search intent contract regression coverage",
      metaDescription:
        "A sufficiently descriptive regression fixture that isolates the organic growth search-intent readiness contract without relying on unrelated blockers.",
      schemaTypes: ["NewsArticle", "WebPage", "BreadcrumbList"],
      keywords: ["news", "security", "publication", "governance", "regression", "tecpey"],
      entityTags: ["content:news", "locale:en", "tone:neutral", "topic:security"],
      internalLinks: [
        "/en/crypto-news/search-intent-contract",
        "/en/crypto-news",
        "/en/academy/term-2",
        "/en/trading-tools",
      ],
      answerSummary:
        "This fixture verifies that a profile with no search intent cannot be marked ready by scoring when validation explicitly requires at least one search intent.",
      llmSummary:
        "TecPey regression coverage keeps organic growth scoring and structural validation aligned so a missing search-intent contract fails closed rather than receiving implicit readiness credit.",
      citationSummary:
        "This synthetic regression fixture is generated by TecPey test coverage and does not represent third-party reporting.",
      searchIntents: [],
      questionIntents: ["Why must search intent exist?", "How is readiness validated?", "What fails closed?"],
      keyFacts: ["Search intent is required", "Readiness must fail closed", "Scoring and validation must agree"],
      sourceAttributions: [
        { name: "TecPey", url: "https://tecpey.ir/en/crypto-news/search-intent-contract", role: "tecpey" },
      ],
      contentValue:
        "The fixture protects consistency between readiness scoring and final validation so diagnostics expose the real publication blocker.",
      safetyDisclaimer: "This regression fixture is not financial advice or a trading signal.",
      freshnessTag: "fresh",
    });

    assert.ok(profile.readiness.blockers.includes("search_intent_missing"));
    assert.equal(profile.readiness.ready, false);
    assert.equal(validateOrganicGrowthProfile(profile), false);
  });
});
