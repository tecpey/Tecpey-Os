import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import {
  isAnswerEngineReadyContent,
  isOrganicGrowthReadyContent,
  isPublishableContent,
  rankCoinPriorities,
  rankTools,
  scoreCoinPriority,
  scoreToolRanking,
  type CoinPriorityInput,
  type ContentItem,
  type ToolRankingInput,
} from "../../lib/content-growth";
import { buildOrganicGrowthProfile, validateOrganicGrowthProfile } from "../../lib/organic-growth-automation";
import {
  buildTraderToolDetailSchemas,
  buildTradingToolsSchemas,
  getFeaturedTraderTools,
  getTraderToolBySlug,
  getTraderToolSlugs,
} from "../../lib/trading-tools-growth";
import {
  buildLandingGrowthSchemas,
  getLandingGrowthRadarFromNewsItems,
  getFeaturedLandingCoins,
  getLandingGrowthRadar,
} from "../../lib/landing-growth";
import {
  buildNewsImpactItemListSchema,
  getNewsImpactHistoryItems,
  getNewsImpactDetailPath,
  getHighPriorityNewsForCoin,
  getHighPriorityNewsForTool,
  getNewsImpactScoreForTool,
  type NewsImpactHistoryItem,
} from "../../lib/news-impact-history";
import {
  mapNewsImpactHistoryRow,
  mergeNewsImpactHistoryItems,
} from "../../lib/news-impact-history-authority";
import {
  buildNewsDetailSchemas,
  buildNewsHubSchemas,
  getNewsDetailMetadata,
  getNewsDetailPageModel,
  getNewsDetailSitemapEntries,
  getNewsDetailStaticParams,
  getNewsHubMetadata,
  getNewsHubPageModel,
} from "../../lib/news-detail-pages";
import {
  buildNewsAutomationBatch,
  buildNewsAutomationDecision,
  normalizeNewsInput,
  type RawNewsInput,
} from "../../lib/news-automation";
import { materializeNewsAutomationDecisions } from "../../lib/news-materialization";
import {
  buildNewsMaterializationFreshnessReport,
  buildNewsMaterializationIdempotencyKey,
  buildNewsMaterializationRunEvidence,
  fingerprintNewsMaterializationFailure,
  runNewsMaterializationWorkerTx,
} from "../../lib/news-materialization-worker";
import {
  persistMaterializedNewsSnapshotTx,
  type PersistMaterializedNewsSnapshotInput,
} from "../../lib/news-materialization-persistence";

class FakeNewsMaterializationClient {
  snapshots = new Map<string, { snapshot_id: string; snapshot_hash: string; decisions: string }>();
  history = new Map<string, { history_id: string; payload_hash: string }>();
  snapshotItems: Array<{ snapshotId: string; historyId: string; position: number }> = [];

  async query<T = Record<string, unknown>>(sql: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
    if (sql.includes("FROM platform_news_materialization_snapshots") && sql.includes("WHERE idempotency_key")) {
      const row = this.snapshots.get(String(values[0]));
      return { rows: row ? [row as T] : [] };
    }
    if (sql.includes("INSERT INTO platform_news_materialization_snapshots")) {
      this.snapshots.set(String(values[3]), {
        snapshot_id: String(values[0]),
        snapshot_hash: String(values[5]),
        decisions: String(values[13]),
      });
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO platform_news_impact_history_items")) {
      const key = `${values[1]}:${values[2]}`;
      if (this.history.has(key)) return { rows: [] };
      const row = {
        history_id: String(values[0]),
        payload_hash: String(values[18]),
      };
      this.history.set(key, row);
      return { rows: [row as T] };
    }
    if (sql.includes("FROM platform_news_impact_history_items")) {
      const row = this.history.get(`${values[0]}:${values[1]}`);
      return { rows: row ? [row as T] : [] };
    }
    if (sql.includes("INSERT INTO platform_news_materialization_snapshot_items")) {
      this.snapshotItems.push({
        snapshotId: String(values[0]),
        historyId: String(values[1]),
        position: Number(values[2]),
      });
      return { rows: [] };
    }
    throw new Error(`unexpected_fake_query:${sql}`);
  }
}

describe("Content growth entity contract", () => {
  it("scores coin priorities with the documented weighted model", () => {
    const scored = scoreCoinPriority({
      symbol: "BTC",
      newsId: "news-1",
      freshnessScore: 1,
      newsImpactScore: 0.8,
      symbolConfidence: 0.9,
      sourceTrust: 0.7,
      marketImportance: 1,
      learningRelevance: 0.6,
      editorialWeight: 0.5,
    });

    assert.equal(scored.priorityScore, 0.84);
  });

  it("returns the top five news-impacted coins deterministically", () => {
    const rows: CoinPriorityInput[] = [
      { symbol: "ETH", newsId: "n2", freshnessScore: 0.7, newsImpactScore: 0.7, symbolConfidence: 0.8, sourceTrust: 0.8, marketImportance: 0.9, learningRelevance: 0.8 },
      { symbol: "BTC", newsId: "n1", freshnessScore: 1, newsImpactScore: 1, symbolConfidence: 1, sourceTrust: 1, marketImportance: 1, learningRelevance: 1 },
      { symbol: "TON", newsId: "n3", freshnessScore: 0.5, newsImpactScore: 0.7, symbolConfidence: 0.7, sourceTrust: 0.8, marketImportance: 0.4, learningRelevance: 0.9 },
      { symbol: "SOL", newsId: "n4", freshnessScore: 0.9, newsImpactScore: 0.7, symbolConfidence: 0.8, sourceTrust: 0.7, marketImportance: 0.8, learningRelevance: 0.7 },
      { symbol: "XRP", newsId: "n5", freshnessScore: 0.6, newsImpactScore: 0.8, symbolConfidence: 0.8, sourceTrust: 0.8, marketImportance: 0.7, learningRelevance: 0.5 },
      { symbol: "DOGE", newsId: "n6", freshnessScore: 0.1, newsImpactScore: 0.2, symbolConfidence: 0.5, sourceTrust: 0.4, marketImportance: 0.4, learningRelevance: 0.4 },
    ];

    assert.deepEqual(
      rankCoinPriorities(rows).map((row) => row.symbol),
      ["BTC", "SOL", "ETH", "XRP", "TON"],
    );
  });

  it("clamps malformed score inputs instead of over-ranking them", () => {
    const scored = scoreCoinPriority({
      symbol: "BAD",
      newsId: "news",
      freshnessScore: 99,
      newsImpactScore: Number.NaN,
      symbolConfidence: -3,
      sourceTrust: 1,
      marketImportance: 1,
      learningRelevance: 1,
      editorialWeight: 1,
    });

    assert.equal(scored.priorityScore, 0.6);
  });

  it("scores tool ranking with safety and usefulness ahead of popularity", () => {
    const safe: ToolRankingInput = {
      slug: "risk-calculator",
      name: "Risk Calculator",
      featuredWeight: 0.5,
      newsImpactScore: 0.8,
      safetyScore: 1,
      beginnerUsefulness: 1,
      proUsefulness: 0.8,
      categoryImportance: 0.8,
      popularitySignal: 0.2,
      officialLinkCompleteness: 1,
    };
    const popularButWeak: ToolRankingInput = {
      slug: "hype-tool",
      name: "Hype Tool",
      featuredWeight: 0,
      safetyScore: 0.3,
      beginnerUsefulness: 0.2,
      proUsefulness: 0.2,
      categoryImportance: 0.5,
      popularitySignal: 1,
      officialLinkCompleteness: 0.2,
    };

    assert.ok(scoreToolRanking(safe).rankScore > scoreToolRanking(popularButWeak).rankScore);
  });

  it("returns the featured five tools by governed rank", () => {
    const tools: ToolRankingInput[] = [
      { slug: "c", name: "C", featuredWeight: 0.1, safetyScore: 0.9, beginnerUsefulness: 0.8, proUsefulness: 0.6, categoryImportance: 0.7, popularitySignal: 0.5, officialLinkCompleteness: 1 },
      { slug: "a", name: "A", featuredWeight: 1, safetyScore: 1, beginnerUsefulness: 1, proUsefulness: 1, categoryImportance: 1, popularitySignal: 1, officialLinkCompleteness: 1 },
      { slug: "f", name: "F", featuredWeight: 0, safetyScore: 0.2, beginnerUsefulness: 0.2, proUsefulness: 0.2, categoryImportance: 0.2, popularitySignal: 0.2, officialLinkCompleteness: 0.2 },
      { slug: "b", name: "B", featuredWeight: 0.8, safetyScore: 0.9, beginnerUsefulness: 0.8, proUsefulness: 0.9, categoryImportance: 0.8, popularitySignal: 0.7, officialLinkCompleteness: 1 },
      { slug: "d", name: "D", featuredWeight: 0.2, safetyScore: 0.8, beginnerUsefulness: 0.7, proUsefulness: 0.6, categoryImportance: 0.6, popularitySignal: 0.4, officialLinkCompleteness: 1 },
      { slug: "e", name: "E", featuredWeight: 0.1, safetyScore: 0.5, beginnerUsefulness: 0.5, proUsefulness: 0.4, categoryImportance: 0.4, popularitySignal: 0.3, officialLinkCompleteness: 1 },
    ];

    assert.deepEqual(
      rankTools(tools).map((tool) => tool.slug),
      ["a", "b", "c", "d", "e"],
    );
  });

  it("requires SEO/schema evidence before content can be published", () => {
    const base: ContentItem = {
      id: "coin-btc-fa",
      type: "coin",
      locale: "fa",
      slug: "bitcoin",
      title: "بیت کوین چیست؟",
      status: "ready",
      canonicalUrl: "https://tecpey.ir/coins/bitcoin",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };

    assert.equal(isPublishableContent(base), false);
    assert.equal(
      isPublishableContent({
        ...base,
        seo: {
          title: "بیت کوین چیست؟",
          description: "راهنمای آموزشی بیت کوین در تک پی.",
          canonical: "https://tecpey.ir/coins/bitcoin",
          hreflang: { fa: "https://tecpey.ir/coins/bitcoin" },
          schemaTypes: ["Article", "FAQPage"],
          aeoAnswer: "بیت کوین یک دارایی دیجیتال غیرمتمرکز است.",
        },
      }),
      true,
    );
  });

  it("requires direct answers and LLM summaries for answer-engine readiness", () => {
    const base: ContentItem = {
      id: "page-home-fa",
      type: "page",
      locale: "fa",
      slug: "home",
      title: "تک‌پی چیست؟",
      status: "ready",
      canonicalUrl: "https://tecpey.ir",
      updatedAt: "2026-08-10T00:00:00.000Z",
      seo: {
        title: "تک‌پی چیست؟",
        description: "معرفی تک‌پی برای آموزش رمزارز، تمرین مجازی و ورود آگاهانه.",
        canonical: "https://tecpey.ir",
        hreflang: { fa: "https://tecpey.ir", en: "https://tecpey.ir/en" },
        schemaTypes: ["WebPage", "FAQPage", "HowTo"],
        aeoAnswer: "تک‌پی یک اکوسیستم فارسی برای آموزش رمزارز و تمرین معاملاتی بدون ریسک است.",
      },
    };

    assert.equal(isPublishableContent(base), true);
    assert.equal(isAnswerEngineReadyContent(base), false);
    assert.equal(
      isAnswerEngineReadyContent({
        ...base,
        seo: {
          ...base.seo!,
          llmSummary:
            "TecPey is a Persian-first crypto education and virtual market-practice platform with launch-gated real-money capabilities.",
        },
      }),
      true,
    );
  });

  it("requires the shared organic growth package for automated publication readiness", () => {
    const canonicalUrl = "https://tecpey.ir/crypto-news/btc-etf-flow";
    const item: ContentItem = {
      id: "news-fa-btc-etf-flow",
      type: "news",
      locale: "fa",
      slug: "btc-etf-flow",
      title: "جریان سرمایه ETF بیت‌کوین",
      status: "ready",
      canonicalUrl,
      updatedAt: "2026-08-10T00:00:00.000Z",
      seo: {
        title: "جریان سرمایه ETF بیت‌کوین | اخبار رمزارز تک‌پی",
        description: "تحلیل آموزشی جریان سرمایه ETF بیت‌کوین و اثر آن بر زمینه بازار، نقدشوندگی و مدیریت ریسک.",
        canonical: canonicalUrl,
        hreflang: { fa: canonicalUrl },
        schemaTypes: ["NewsArticle", "FAQPage", "BreadcrumbList"],
        aeoAnswer: "تک‌پی این خبر را زمینه آموزشی بازار می‌داند، نه سیگنال معامله.",
        llmSummary: "جریان سرمایه ETF بیت‌کوین می‌تواند زمینه بازار و نقدشوندگی را توضیح دهد، اما توصیه معامله نیست.",
      },
    };

    assert.equal(isOrganicGrowthReadyContent(item), false);
    assert.equal(validateOrganicGrowthProfile(undefined), false);
    assert.equal(
      validateOrganicGrowthProfile({
        policyVersion: "tecpey-organic-growth-policy-v1",
        entityType: "news",
        locale: "en",
        canonicalPath: "/crypto-news/wrong-locale",
      }),
      false,
    );
    assert.equal(
      isOrganicGrowthReadyContent({
        ...item,
        organicGrowth: buildOrganicGrowthProfile({
          entityType: "news",
          locale: "fa",
          canonicalPath: "/crypto-news/btc-etf-flow",
          title: "جریان سرمایه ETF بیت‌کوین | اخبار رمزارز تک‌پی",
          metaDescription: "تحلیل آموزشی جریان سرمایه ETF بیت‌کوین و اثر آن بر زمینه بازار، نقدشوندگی و مدیریت ریسک.",
          schemaTypes: ["NewsArticle", "FAQPage", "BreadcrumbList"],
          keywords: ["ETF بیت‌کوین", "اخبار رمزارز", "مدیریت ریسک"],
          entityTags: ["content:news", "coin:btc", "tone:neutral"],
          internalLinks: ["/crypto-news/btc-etf-flow", "/crypto-news", "/academy/term-5"],
          answerSummary: "تک‌پی این خبر را برای توضیح زمینه بازار، نقدشوندگی و مدیریت ریسک ثبت می‌کند.",
          llmSummary: "جریان سرمایه ETF بیت‌کوین می‌تواند زمینه بازار و نقدشوندگی را توضیح دهد، اما توصیه معامله نیست و فقط برای آموزش منتشر می‌شود.",
          safetyDisclaimer: "این صفحه توصیه مالی، سیگنال معامله یا وعده سود نیست.",
          freshnessTag: "fresh",
        }),
      }),
      true,
    );
  });

  it("features the governed trader tools deterministically", () => {
    assert.deepEqual(
      getFeaturedTraderTools(5).map((tool) => tool.slug),
      ["coinmarketcap", "tradingview", "coingecko", "coinglass", "cryptoquant"],
    );
  });

  it("builds the landing growth radar with five coins and five tools", () => {
    const faRadar = getLandingGrowthRadar("fa");
    const enRadar = getLandingGrowthRadar("en");

    assert.deepEqual(
      getFeaturedLandingCoins("fa").map((coin) => coin.symbol),
      ["BTC", "ETH", "USDT", "TON", "SOL"],
    );
    assert.deepEqual(
      getFeaturedLandingCoins("en").map((coin) => coin.symbol),
      ["BTC", "ETH", "USDT", "TON", "SOL"],
    );
    assert.equal(faRadar.coins.length, 5);
    assert.equal(faRadar.tools.length, 5);
    assert.ok(faRadar.coins.every((coin) => coin.impactNews.priority >= 75));
    assert.ok(faRadar.coins.every((coin) => coin.newsDetailPath.startsWith("/crypto-news/")));
    assert.ok(enRadar.coins.every((coin) => coin.newsDetailPath.startsWith("/en/crypto-news/")));
    assert.equal(faRadar.evidence.status, "degraded");
    assert.equal(faRadar.evidence.sourceAuthority, "news-impact-history:seed-fallback");
    assert.equal(faRadar.evidence.coinCount, 5);
    assert.equal(faRadar.evidence.toolCount, 5);
    assert.ok(faRadar.evidence.highPriorityNewsCount >= 5);
    assert.equal(faRadar.evidence.authorityHighPriorityNewsCount, 0);
    assert.equal(faRadar.evidence.authorityFreshnessAgeMs, null);
    assert.equal(faRadar.updatedAt, faRadar.evidence.updatedAt);
    assert.deepEqual(
      enRadar.tools.map((tool) => tool.slug),
      ["coinmarketcap", "tradingview", "coingecko", "coinglass", "cryptoquant"],
    );
    assert.ok(faRadar.coins.every((coin) => coin.impactRankScore >= 0.89));
  });

  it("keeps five clickable coin routes when the live authority is temporarily empty", () => {
    const radar = getLandingGrowthRadarFromNewsItems(
      "fa",
      [],
      {
        sourceAuthority: "news-impact-history:seed-fallback",
        authorityHighPriorityNewsCount: 0,
        now: "2026-08-27T12:00:00.000Z",
      },
      getNewsImpactHistoryItems("fa"),
    );

    assert.deepEqual(radar.coins.map((coin) => coin.symbol), ["BTC", "ETH", "USDT", "TON", "SOL"]);
    assert.ok(radar.coins.every((coin) => coin.newsDetailPath.startsWith("/crypto-news/")));
    assert.equal(radar.evidence.coinCount, 5);
    assert.equal(radar.evidence.status, "degraded");
  });

  it("marks the landing growth gate ready only with fresh materialized authority", () => {
    const newsItems = getNewsImpactHistoryItems("fa");
    const radar = getLandingGrowthRadarFromNewsItems("fa", newsItems, {
      sourceAuthority: "news-impact-history:materialized",
      authorityUpdatedAt: "2026-08-09T08:00:00.000Z",
      authorityHighPriorityNewsCount: newsItems.filter((item) => item.priority >= 75).length,
      now: "2026-08-09T08:04:00.000Z",
    });

    assert.equal(radar.evidence.status, "ready");
    assert.equal(radar.evidence.sourceAuthority, "news-impact-history:materialized");
    assert.equal(radar.evidence.authorityFreshnessAgeMs, 240000);
    assert.ok(radar.evidence.authorityHighPriorityNewsCount >= 5);
  });

  it("builds landing ItemList schemas for featured coins and tools", () => {
    const schemas = buildLandingGrowthSchemas("en");
    const coinList = schemas[0] as Record<string, unknown>;
    const toolList = schemas[1] as Record<string, unknown>;
    const coinItems = coinList.itemListElement as Array<Record<string, unknown>>;
    const toolItems = toolList.itemListElement as Array<Record<string, unknown>>;

    assert.deepEqual(
      schemas.map((schema) => schema["@type"]),
      ["ItemList", "ItemList"],
    );
    assert.equal(coinList.numberOfItems, 5);
    assert.equal(toolList.numberOfItems, 5);
    assert.equal(coinItems[0].url, "https://tecpey.ir/en/coins/bitcoin");
    assert.equal(toolItems[0].url, "https://tecpey.ir/en/trading-tools/coinmarketcap");
  });

  it("uses high-priority news impact as ranking evidence for tools", () => {
    assert.equal(getNewsImpactScoreForTool("tradingview"), 0.94);
    assert.equal(getNewsImpactScoreForTool("unknown-tool"), 0);

    assert.deepEqual(
      getHighPriorityNewsForTool("coinglass", "fa", 2).map((item) => item.id),
      ["fa-security-phishing-risk-tools", "fa-derivatives-liquidation-coinglass"],
    );
  });

  it("returns high-priority news history for coin pages", () => {
    const btcNews = getHighPriorityNewsForCoin("btc", "fa", 3);

    assert.deepEqual(
      btcNews.map((item) => item.id),
      ["fa-btc-etf-flows-tradingview-cmc", "fa-security-phishing-risk-tools", "fa-derivatives-liquidation-coinglass"],
    );
    assert.ok(btcNews.every((item) => item.priority >= 75));
  });

  it("builds bilingual trading tools schemas for organic discovery", () => {
    const faSchemas = buildTradingToolsSchemas("fa");
    const enSchemas = buildTradingToolsSchemas("en");
    const faCollection = faSchemas[0] as Record<string, unknown>;
    const enCollection = enSchemas[0] as Record<string, unknown>;
    const faItemList = faSchemas[1] as Record<string, unknown>;
    const enFaq = enSchemas[2] as { mainEntity: unknown[] };

    assert.deepEqual(
      faSchemas.map((schema) => schema["@type"]),
      ["CollectionPage", "ItemList", "FAQPage", "BreadcrumbList"],
    );
    assert.equal(faCollection.url, "https://tecpey.ir/trading-tools");
    assert.equal(enCollection.url, "https://tecpey.ir/en/trading-tools");
    assert.equal(faItemList.numberOfItems, 5);
    assert.equal(enFaq.mainEntity.length, 2);
  });

  it("builds detail routes and schemas for every ranked trader tool", () => {
    const slugs = getTraderToolSlugs();
    const tradingView = getTraderToolBySlug("tradingview");

    assert.ok(slugs.includes("tradingview"));
    assert.equal(getTraderToolBySlug("missing-tool"), undefined);
    assert.ok(tradingView);
    assert.deepEqual(
      buildTraderToolDetailSchemas(tradingView, "fa").map((schema) => schema["@type"]),
      ["Article", "FAQPage", "BreadcrumbList"],
    );
    assert.equal(
      (buildTraderToolDetailSchemas(tradingView, "en")[0] as Record<string, unknown>).url,
      "https://tecpey.ir/en/trading-tools/tradingview",
    );
  });

  it("builds news-impact history schema for tool and coin detail pages", () => {
    const items = getHighPriorityNewsForTool("tradingview", "en", 2);
    const schema = buildNewsImpactItemListSchema({
      items,
      locale: "en",
      pageUrl: "https://tecpey.ir/en/trading-tools/tradingview",
      name: "TradingView news history",
    }) as Record<string, unknown>;
    const elements = schema.itemListElement as Array<{ item: Record<string, unknown> }>;

    assert.equal(schema["@type"], "ItemList");
    assert.equal(schema.numberOfItems, 2);
    assert.equal(elements[0].item["@type"], "NewsArticle");
    assert.equal(elements[0].item.url, "https://tecpey.ir/en/crypto-news/btc-etf-flows-tradingview-cmc");
    assert.equal(elements[0].item.datePublished, "2026-08-09T06:15:00.000Z");
    assert.equal(elements[0].item.dateModified, "2026-08-09T06:22:00.000Z");
  });

  it("creates canonical bilingual news detail routes from impact history", () => {
    const faParams = getNewsDetailStaticParams("fa");
    const enParams = getNewsDetailStaticParams("en");
    const faModel = getNewsDetailPageModel("btc-etf-flows-tradingview-cmc", "fa");
    const enModel = getNewsDetailPageModel("btc-etf-flows-tradingview-cmc", "en");

    assert.ok(faParams.some((param) => param.slug === "btc-etf-flows-tradingview-cmc"));
    assert.ok(enParams.some((param) => param.slug === "btc-etf-flows-tradingview-cmc"));
    assert.ok(faModel);
    assert.ok(enModel);
    assert.equal(faModel.url, "https://tecpey.ir/crypto-news/btc-etf-flows-tradingview-cmc");
    assert.equal(enModel.url, "https://tecpey.ir/en/crypto-news/btc-etf-flows-tradingview-cmc");
    assert.deepEqual(faModel.relatedCoins.map((coin) => coin.symbol), ["BTC", "ETH"]);
    assert.ok(faModel.relatedTools.some((tool) => tool.slug === "tradingview"));
    assert.equal(getNewsImpactDetailPath(faModel.item), "/crypto-news/btc-etf-flows-tradingview-cmc");
  });

  it("builds NewsArticle metadata, schema and sitemap entries for canonical news pages", () => {
    const model = getNewsDetailPageModel("security-phishing-risk-tools", "en");
    assert.ok(model);

    const metadata = getNewsDetailMetadata(model, "en");
    const schemas = buildNewsDetailSchemas(model, "en");
    const newsSchema = schemas[0] as Record<string, unknown>;
    const faqSchema = schemas[2] as { mainEntity: unknown[] };
    const sitemapEntries = getNewsDetailSitemapEntries();

    assert.equal(metadata.alternates.canonical, "https://tecpey.ir/en/crypto-news/security-phishing-risk-tools");
    assert.equal(newsSchema["@type"], "NewsArticle");
    assert.equal(newsSchema.mainEntityOfPage, "https://tecpey.ir/en/crypto-news/security-phishing-risk-tools");
    assert.equal(faqSchema.mainEntity.length, 2);
    assert.ok(sitemapEntries.some((entry) => entry.path === "/en/crypto-news/security-phishing-risk-tools"));
  });

  it("builds canonical news hub metadata and schema from impact history", () => {
    const faHub = getNewsHubPageModel("fa");
    const enHub = getNewsHubPageModel("en");
    const faMetadata = getNewsHubMetadata(faHub);
    const enSchemas = buildNewsHubSchemas(enHub);
    const collection = enSchemas[0] as Record<string, unknown>;
    const itemList = enSchemas[1] as Record<string, unknown>;
    const itemListElements = itemList.itemListElement as Array<{ item: Record<string, unknown> }>;

    assert.equal(faHub.url, "https://tecpey.ir/crypto-news");
    assert.equal(enHub.url, "https://tecpey.ir/en/crypto-news");
    assert.equal(faMetadata.alternates.languages["en-US"], "https://tecpey.ir/en/crypto-news");
    assert.equal(collection["@type"], "CollectionPage");
    assert.equal(collection.url, "https://tecpey.ir/en/crypto-news");
    assert.equal(itemList["@type"], "ItemList");
    assert.equal(itemList.numberOfItems, enHub.items.length);
    assert.equal(itemListElements[0].item.url, "https://tecpey.ir/en/crypto-news/btc-etf-flows-tradingview-cmc");
  });

  it("maps and merges persisted news authority rows with seed fallback", () => {
    const persisted = mapNewsImpactHistoryRow({
      history_id: "en-btc-etf-flows-tradingview-cmc",
      locale: "en",
      slug: "btc-etf-flows-tradingview-cmc",
      news_url: "/en/crypto-news/btc-etf-flows-tradingview-cmc",
      title: "Persisted Bitcoin ETF flows update",
      summary: "A persisted authority row can override the seeded article while keeping the public slug stable.",
      source_name: "TecPey Persisted News",
      source_url: "https://tecpey.ir/en/crypto-news",
      published_at: new Date("2026-08-09T06:15:00.000Z"),
      recorded_at: new Date("2026-08-09T07:10:00.000Z"),
      priority: 96,
      impact_score: 9,
      tone: "neutral",
      reason_fa: "خبر ثبت‌شده در پایگاه داده روی seed هم‌نام اولویت دارد.",
      reason_en: "The persisted authority row takes priority over the same seeded slug.",
      related_tool_slugs: ["tradingview"],
      related_coin_symbols: ["btc"],
      related_lesson_href: "/en/academy/term-5",
    });
    const seeded: NewsImpactHistoryItem[] = [
      {
        ...persisted,
        title: "Seed Bitcoin ETF flows update",
        recordedAt: "2026-08-09T06:22:00.000Z",
        priority: 94,
      },
      {
        ...persisted,
        id: "en-ton-miniapp-activity",
        newsUrl: "/en/crypto-news/ton-miniapp-activity",
        title: "Seed TON mini-app activity",
        relatedCoinSymbols: ["TON"],
        priority: 78,
      },
    ];

    const merged = mergeNewsImpactHistoryItems([persisted], seeded);

    assert.equal(persisted.publishedAt, "2026-08-09T06:15:00.000Z");
    assert.deepEqual(persisted.relatedCoinSymbols, ["BTC"]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].title, "Persisted Bitcoin ETF flows update");
    assert.equal(merged[0].priority, 96);
    assert.equal(getNewsImpactDetailPath(merged[0]), "/en/crypto-news/btc-etf-flows-tradingview-cmc");
    assert.ok(merged.some((item) => item.title === "Seed TON mini-app activity"));
  });

  it("builds the visible landing radar from persisted authority evidence", () => {
    const persisted = mapNewsImpactHistoryRow({
      history_id: "en-btc-etf-flows-tradingview-cmc",
      locale: "en",
      slug: "btc-etf-flows-tradingview-cmc",
      news_url: "/en/crypto-news/btc-etf-flows-tradingview-cmc",
      title: "Persisted Bitcoin ETF flows update",
      summary: "A persisted authority row should power the visible landing radar.",
      source_name: "TecPey Persisted News",
      source_url: "https://tecpey.ir/en/crypto-news",
      published_at: new Date("2026-08-09T06:15:00.000Z"),
      recorded_at: new Date("2026-08-09T07:10:00.000Z"),
      priority: 98,
      impact_score: 9,
      tone: "bullish",
      reason_fa: "خبر ثبت‌شده باید وارد کارت visible شود.",
      reason_en: "The persisted authority row should power the visible card.",
      related_tool_slugs: ["tradingview"],
      related_coin_symbols: ["btc"],
      related_lesson_href: "/en/academy/term-5",
    });
    const seeded: NewsImpactHistoryItem[] = [
      {
        ...persisted,
        title: "Seed Bitcoin ETF flows update",
        priority: 94,
        recordedAt: "2026-08-09T06:22:00.000Z",
      },
    ];

    const radar = getLandingGrowthRadarFromNewsItems(
      "en",
      mergeNewsImpactHistoryItems([persisted], seeded),
      {
        sourceAuthority: "news-impact-history:partial-seed-merged",
        authorityUpdatedAt: persisted.recordedAt,
        authorityHighPriorityNewsCount: 1,
        now: "2026-08-09T07:11:00.000Z",
      },
    );

    assert.equal(radar.coins[0].symbol, "BTC");
    assert.equal(radar.coins[0].latestImpactTitle, "Persisted Bitcoin ETF flows update");
    assert.equal(radar.coins[0].newsDetailPath, "/en/crypto-news/btc-etf-flows-tradingview-cmc");
    assert.equal(radar.coins[0].impactRankScore, 0.98);
    assert.equal(radar.evidence.status, "degraded");
    assert.equal(radar.evidence.coinCount, 1);
    assert.equal(radar.evidence.toolCount, 5);
    assert.equal(radar.evidence.highPriorityNewsCount, 1);
    assert.equal(radar.evidence.authorityHighPriorityNewsCount, 1);
    assert.equal(radar.evidence.authorityFreshnessAgeMs, 60000);
    assert.equal(radar.evidence.updatedAt, "2026-08-09T07:10:00.000Z");
  });

  it("normalizes trusted news into entity-linked automation evidence", () => {
    const input: RawNewsInput = {
      locale: "en",
      title: "Bitcoin ETF inflows lift market-data and charting attention",
      summary:
        "ETF inflows can change liquidity and sentiment, so traders compare BTC data on TradingView and CoinMarketCap with risk management.",
      sourceName: "CoinDesk",
      sourceUrl: "https://www.coindesk.com/markets/",
      url: "https://www.coindesk.com/markets/bitcoin-etf-flow-example",
      publishedAt: "2026-08-09T07:00:00.000Z",
      fetchedAt: "2026-08-09T07:08:00.000Z",
    };

    const article = normalizeNewsInput(input);
    const decision = buildNewsAutomationDecision(input);

    assert.equal(decision.status, "publishable");
    assert.equal(decision.reasons.length, 0);
    assert.deepEqual(article.detectedCoins, ["BTC"]);
    assert.deepEqual(article.detectedTools, ["coinmarketcap", "tradingview"]);
    assert.equal(decision.historyItems.length, 1);
    assert.equal(decision.historyItems[0].recordedAt, "2026-08-09T07:08:00.000Z");
    assert.equal(decision.contentItem.seo?.schemaTypes.includes("NewsArticle"), true);
    assert.equal(decision.coinImpacts[0].symbol, "BTC");
    assert.ok(decision.coinImpacts[0].priorityScore > 0.8);
  });

  it("rejects automated news that contains trading signals or profit promises", () => {
    const decision = buildNewsAutomationDecision({
      locale: "fa",
      title: "سیگنال خرید بیت کوین همین الان",
      summary: "این فرصت طلایی تضمینی است و سود تضمینی دارد.",
      sourceName: "آکادمی تک‌پی",
      sourceUrl: "https://tecpey.ir/academy",
      url: "https://tecpey.ir/crypto-news/bad-signal",
      publishedAt: "2026-08-09T07:00:00.000Z",
      fetchedAt: "2026-08-09T07:02:00.000Z",
    });

    assert.equal(decision.status, "rejected");
    assert.ok(decision.reasons.includes("prohibited_financial_advice"));
    assert.ok(decision.reasons.includes("hype_or_profit_promise"));
    assert.equal(decision.historyItems.length, 0);
  });

  it("queues weak or unlinked news for review instead of publishing it", () => {
    const decision = buildNewsAutomationDecision({
      locale: "en",
      title: "A generic finance headline with no crypto entity",
      summary: "The article talks about broad markets without a supported coin, tool or Academy relation.",
      sourceName: "Unknown Blog",
      sourceUrl: "https://example.invalid/blog",
      url: "https://example.invalid/generic",
      publishedAt: "2026-08-09T07:00:00.000Z",
      fetchedAt: "2026-08-09T07:02:00.000Z",
    });

    assert.equal(decision.status, "needs_review");
    assert.ok(decision.reasons.includes("unapproved_source"));
    assert.ok(decision.reasons.includes("low_source_trust"));
    assert.ok(decision.reasons.includes("no_supported_entity"));
    assert.equal(decision.historyItems.length, 0);
  });

  it("deduplicates automation batches by idempotency key", () => {
    const input: RawNewsInput = {
      locale: "en",
      title: "Ethereum security news keeps account safety in focus",
      summary: "A phishing report reminds users to review official links, 2FA and Ethereum wallet permissions.",
      sourceName: "Decrypt",
      sourceUrl: "https://decrypt.co/feed",
      url: "https://decrypt.co/ethereum-security-example",
      publishedAt: "2026-08-09T07:00:00.000Z",
      fetchedAt: "2026-08-09T07:04:00.000Z",
    };

    const batch = buildNewsAutomationBatch([input, input]);

    assert.equal(batch.length, 1);
    assert.equal(batch[0].status, "publishable");
    assert.deepEqual(batch[0].article.detectedCoins, ["ETH"]);
  });

  it("materializes publishable automation output into canonical slugs, sitemap entries and top coins", () => {
    const inputs: RawNewsInput[] = [
      {
        locale: "en",
        title: "Bitcoin ETF approval raises BTC and Ethereum market-data checks",
        summary:
          "ETF approval news can affect BTC and ETH liquidity, so users compare TradingView charts and CoinMarketCap data with risk management.",
        sourceName: "CoinDesk",
        sourceUrl: "https://www.coindesk.com/markets/",
        url: "https://www.coindesk.com/markets/bitcoin-etf-approval-example",
        publishedAt: "2026-08-09T07:00:00.000Z",
        fetchedAt: "2026-08-09T07:05:00.000Z",
      },
      {
        locale: "en",
        title: "Generic crypto culture headline without supported entities",
        summary: "This is broad commentary with no supported coin, tool or Academy relationship.",
        sourceName: "Unknown Blog",
        sourceUrl: "https://example.invalid/feed",
        url: "https://example.invalid/news/generic",
        publishedAt: "2026-08-09T07:00:00.000Z",
        fetchedAt: "2026-08-09T07:05:00.000Z",
      },
    ];
    const decisions = buildNewsAutomationBatch(inputs);
    const snapshot = materializeNewsAutomationDecisions(decisions, {
      locale: "en",
      generatedAt: "2026-08-09T07:05:00.000Z",
    });

    assert.equal(snapshot.storageMode, "ephemeral_contract");
    assert.equal(snapshot.generatedAt, "2026-08-09T07:05:00.000Z");
    assert.equal(snapshot.publishable, 1);
    assert.equal(snapshot.needsReview, 1);
    assert.equal(snapshot.rejected, 0);
    assert.equal(snapshot.historyItems.length, 1);
    assert.deepEqual(snapshot.canonicalSlugs, [decisions[0].article.slug]);
    assert.equal(snapshot.sitemapEntries[0].path, `/en/crypto-news/${decisions[0].article.slug}`);
    assert.equal(snapshot.sitemapEntries[0].lastModified, "2026-08-09T07:05:00.000Z");
    assert.deepEqual(
      snapshot.topCoins.map((coin) => coin.symbol),
      ["BTC", "ETH"],
    );
    assert.equal(snapshot.topCoins[0].newsDetailPath, `/en/crypto-news/${decisions[0].article.slug}`);

    const publishableDecision = snapshot.decisions.find((decision) => decision.status === "publishable");
    const reviewDecision = snapshot.decisions.find((decision) => decision.status === "needs_review");
    assert.ok(publishableDecision);
    assert.ok(reviewDecision);

    const publishableIntel = publishableDecision.intelligence;
    assert.equal(publishableIntel.status, "publishable");
    assert.equal(publishableIntel.sourceCard.sourceName, "CoinDesk");
    assert.equal(
      publishableIntel.sourceCard.canonicalUrl,
      "https://www.coindesk.com/markets/bitcoin-etf-approval-example",
    );
    assert.equal(publishableIntel.sourceCard.originalLanguage, "en");
    assert.match(publishableIntel.sourceCard.persianSummary, /خلاصه فارسی تک‌پی/);
    assert.match(publishableIntel.sourceCard.persianSummary, /توصیه معاملاتی/);
    assert.ok(publishableIntel.graphEdges.some((edge) => edge.type === "mentions_coin" && edge.toId === "coin:BTC"));
    assert.ok(
      publishableIntel.graphEdges.some((edge) => edge.type === "mentions_tool" && edge.toId === "tool:TRADINGVIEW"),
    );
    assert.equal(publishableIntel.reviews.length, 6);
    assert.ok(publishableIntel.reviews.every((review) => review.score >= 0 && review.score <= 1));
    assert.deepEqual(
      publishableIntel.coinDiscoveries.map((coin) => [coin.symbol, coin.status, coin.exchangeEnabled]),
      [
        ["BTC", "educational_listed", false],
        ["ETH", "educational_listed", false],
      ],
    );
    assert.equal(snapshot.topCoins[0].discovery?.exchangeEnabled, false);
    assert.equal(snapshot.topCoins[0].discovery?.officialUrls[0], "https://bitcoin.org/");
    assert.equal(snapshot.topCoins[1].discovery?.exchangeEnabled, false);
    assert.equal(snapshot.topCoins[1].discovery?.officialUrls[0], "https://ethereum.org/");
    assert.equal(reviewDecision.intelligence.status, "rejected");
    assert.ok(reviewDecision.intelligence.reasons.includes("source_not_authorized"));
    assert.ok(reviewDecision.intelligence.reasons.includes("missing_entities"));
  });

  it("persists materialized news snapshots idempotently with conflict detection", async () => {
    const decisions = buildNewsAutomationBatch([
      {
        locale: "en",
        title: "Bitcoin ETF approval raises BTC and Ethereum market-data checks",
        summary:
          "ETF approval news can affect BTC and ETH liquidity, so users compare TradingView charts and CoinMarketCap data with risk management.",
        sourceName: "CoinDesk",
        sourceUrl: "https://www.coindesk.com/markets/",
        url: "https://www.coindesk.com/markets/bitcoin-etf-approval-example",
        publishedAt: "2026-08-09T07:00:00.000Z",
        fetchedAt: "2026-08-09T07:05:00.000Z",
      },
    ]);
    const snapshot = materializeNewsAutomationDecisions(decisions, {
      locale: "en",
      generatedAt: "2026-08-09T07:05:00.000Z",
    });
    const input: PersistMaterializedNewsSnapshotInput = {
      snapshotId: "00000000-0000-4000-8000-000000000058",
      idempotencyKey: "crypto-news:auto:2026-08-09T07:05:00Z:en",
      sourceMode: "test",
      snapshot,
    };
    const client = new FakeNewsMaterializationClient() as unknown as PoolClient & FakeNewsMaterializationClient;

    const first = await persistMaterializedNewsSnapshotTx(client, input);
    const replay = await persistMaterializedNewsSnapshotTx(client, input);

    assert.equal(first.replayed, false);
    assert.equal(first.insertedHistoryItems, 1);
    assert.equal(replay.replayed, true);
    assert.equal(replay.snapshotHash, first.snapshotHash);
    assert.equal(client.snapshotItems.length, 1);

    const storedSnapshot = client.snapshots.get(input.idempotencyKey);
    assert.ok(storedSnapshot);
    const storedDecisions = JSON.parse(storedSnapshot.decisions) as Array<{
      organicGrowth: unknown;
      intelligence: {
        status: string;
        sourceCard: { persianSummary: string };
        coinDiscoveries: Array<{ exchangeEnabled: boolean }>;
      };
    }>;
    assert.equal(storedDecisions[0].intelligence.status, "publishable");
    assert.equal(validateOrganicGrowthProfile(storedDecisions[0].organicGrowth), true);
    assert.match(storedDecisions[0].intelligence.sourceCard.persianSummary, /خلاصه فارسی تک‌پی/);
    assert.equal(storedDecisions[0].intelligence.coinDiscoveries[0].exchangeEnabled, false);

    await assert.rejects(
      () => persistMaterializedNewsSnapshotTx(client, {
        ...input,
        snapshot: {
          ...snapshot,
          rejected: snapshot.rejected + 1,
        },
      }),
      /news_materialization_idempotency_conflict/,
    );
  });

  it("requires organic growth evidence only for publishable materialized news decisions", async () => {
    const decisions = buildNewsAutomationBatch([
      {
        locale: "en",
        title: "Bitcoin ETF approval raises BTC and Ethereum market-data checks",
        summary:
          "ETF approval news can affect BTC and ETH liquidity, so users compare TradingView charts and CoinMarketCap data with risk management.",
        sourceName: "CoinDesk",
        sourceUrl: "https://www.coindesk.com/markets/",
        url: "https://www.coindesk.com/markets/bitcoin-etf-approval-example",
        publishedAt: "2026-08-09T07:00:00.000Z",
        fetchedAt: "2026-08-09T07:05:00.000Z",
      },
      {
        locale: "en",
        title: "Generic crypto culture headline without supported entities",
        summary: "This is broad commentary with no supported coin, tool or Academy relationship.",
        sourceName: "Unknown Blog",
        sourceUrl: "https://example.invalid/feed",
        url: "https://example.invalid/news/generic",
        publishedAt: "2026-08-09T07:00:00.000Z",
        fetchedAt: "2026-08-09T07:05:00.000Z",
      },
    ]);
    const snapshot = materializeNewsAutomationDecisions(decisions, {
      locale: "en",
      generatedAt: "2026-08-09T07:05:00.000Z",
    });
    const reviewDecision = snapshot.decisions.find((decision) => decision.status !== "publishable");
    assert.ok(reviewDecision);
    (reviewDecision as { organicGrowth?: unknown }).organicGrowth = {};

    const client = new FakeNewsMaterializationClient() as unknown as PoolClient & FakeNewsMaterializationClient;
    await assert.doesNotReject(() =>
      persistMaterializedNewsSnapshotTx(client, {
        snapshotId: "00000000-0000-4000-8000-000000000061",
        idempotencyKey: "crypto-news:auto:2026-08-09T07:05:00Z:en:review-only-organic-gap",
        sourceMode: "test",
        snapshot,
      }),
    );

    const publishableSnapshot = materializeNewsAutomationDecisions([decisions[0]], {
      locale: "en",
      generatedAt: "2026-08-09T07:05:00.000Z",
    });
    (publishableSnapshot.decisions[0] as { organicGrowth?: unknown }).organicGrowth = {};

    await assert.rejects(
      () =>
        persistMaterializedNewsSnapshotTx(client, {
          snapshotId: "00000000-0000-4000-8000-000000000062",
          idempotencyKey: "crypto-news:auto:2026-08-09T07:05:00Z:en:publishable-organic-gap",
          sourceMode: "test",
          snapshot: publishableSnapshot,
        }),
      /news_materialization_organic_growth_invalid/,
    );
  });

  it("runs the news materialization worker transaction without writing empty feeds", async () => {
    const fetchedAt = "2026-08-09T07:05:00.000Z";
    const client = new FakeNewsMaterializationClient() as unknown as PoolClient & FakeNewsMaterializationClient;

    assert.equal(
      buildNewsMaterializationIdempotencyKey({
        locale: "en",
        sourceMode: "live",
        fetchedAt,
      }),
      "crypto-news:materialize:live:en:2026-08-09T07:05:00Z",
    );

    const skipped = await runNewsMaterializationWorkerTx(client, {
      snapshotId: "00000000-0000-4000-8000-000000000059",
      locale: "en",
      fetchedAt,
      sourceMode: "live",
      rawInputs: [],
    });

    assert.equal(skipped.skipped, true);
    assert.equal(client.snapshots.size, 0);

    const persisted = await runNewsMaterializationWorkerTx(client, {
      snapshotId: "00000000-0000-4000-8000-000000000060",
      locale: "en",
      fetchedAt,
      sourceMode: "live",
      rawInputs: [
        {
          locale: "en",
          title: "Bitcoin ETF approval raises BTC and Ethereum market-data checks",
          summary:
            "ETF approval news can affect BTC and ETH liquidity, so users compare TradingView charts and CoinMarketCap data with risk management.",
          sourceName: "CoinDesk",
          sourceUrl: "https://www.coindesk.com/markets/",
          url: "https://www.coindesk.com/markets/bitcoin-etf-approval-example",
          publishedAt: "2026-08-09T07:00:00.000Z",
          fetchedAt,
        },
      ],
    });

    assert.equal(persisted.skipped, false);
    assert.equal(persisted.publishable, 1);
    assert.equal(persisted.persisted?.replayed, false);
    assert.equal(persisted.persisted?.insertedHistoryItems, 1);
    assert.equal(client.snapshots.size, 1);
  });

  it("builds operational run evidence and freshness reporting for scheduled news materialization", () => {
    const results = [
      {
        skipped: false,
        locale: "en" as const,
        sourceMode: "live" as const,
        fetchedAt: "2026-08-09T07:05:00.000Z",
        rawInputCount: 3,
        publishable: 1,
        needsReview: 1,
        rejected: 1,
        persisted: {
          replayed: false,
          snapshotId: "00000000-0000-4000-8000-000000000061",
          snapshotHash: "a".repeat(64),
          insertedHistoryItems: 1,
        },
      },
      {
        skipped: true,
        locale: "fa" as const,
        sourceMode: "live" as const,
        fetchedAt: "2026-08-09T07:05:00.000Z",
        rawInputCount: 0,
        publishable: 0,
        needsReview: 0,
        rejected: 0,
      },
    ];
    const failures = [{ locale: "fa" as const, reasonCode: "news_feed_empty" }];
    const run = buildNewsMaterializationRunEvidence({
      runId: "00000000-0000-4000-8000-000000000062",
      hostName: "scheduler-test",
      startedAt: "2026-08-09T07:05:00.000Z",
      completedAt: "2026-08-09T07:05:04.000Z",
      results,
      failures,
    });
    const freshness = buildNewsMaterializationFreshnessReport({
      completedAt: run.completedAt,
      results,
    });

    assert.equal(run.jobName, "news-materialization");
    assert.equal(run.schedulerUnit, "tecpey-news-materialization.service");
    assert.equal(run.resultStatus, "partial_failure");
    assert.equal(run.selectedCount, 3);
    assert.equal(run.finalizedCompletedCount, 1);
    assert.equal(run.finalizedNotCompletedCount, 2);
    assert.deepEqual(run.reasonCodes, ["news_feed_empty"]);
    assert.deepEqual(run.failureFingerprints, [
      fingerprintNewsMaterializationFailure(failures[0]),
    ]);
    assert.equal(freshness.latestSnapshotGeneratedAt, "2026-08-09T07:05:00.000Z");
    assert.equal(freshness.freshnessAgeMs, 4000);
    assert.equal(freshness.insertedHistoryItems, 1);
    assert.equal(freshness.skippedLocaleCount, 1);
    assert.equal(freshness.locales[0].snapshotId, "00000000-0000-4000-8000-000000000061");
  });
});
