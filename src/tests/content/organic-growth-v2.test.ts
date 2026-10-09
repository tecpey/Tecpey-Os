import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOrganicGrowthProfile, validateOrganicGrowthProfile } from "../../lib/organic-growth-automation";
import { extractNewsTaxonomy } from "../../lib/news-taxonomy";

function strongProfile() {
  return buildOrganicGrowthProfile({
    entityType: "news",
    locale: "fa",
    canonicalPath: "/crypto-news/bitcoin-etf-liquidity",
    title: "جریان ETF بیت‌کوین و اثر آن بر نقدشوندگی بازار | تک‌پی",
    metaDescription: "گزارش منبع‌دار تک‌پی درباره جریان ETF بیت‌کوین، اثر احتمالی آن بر نقدشوندگی، کوین‌های مرتبط، ریسک‌های مهم و مسیر آموزشی برای بررسی خبر.",
    schemaTypes: ["NewsArticle", "WebPage", "BreadcrumbList"],
    keywords: ["بیت کوین", "ETF بیت کوین", "نقدشوندگی", "اخبار رمزارز", "BTC", "مدیریت ریسک"],
    entityTags: ["content:news", "coin:btc", "topic:etf", "topic:liquidity", "tone:neutral"],
    internalLinks: ["/crypto-news", "/coins/bitcoin", "/markets", "/academy/term-5", "/trading-tools"],
    answerSummary: "این خبر درباره جریان سرمایه ETF بیت‌کوین است؛ برای کاربر مهم است چون می‌تواند روی نقدشوندگی و توجه نهادی اثر بگذارد و باید کنار داده بازار و مدیریت ریسک بررسی شود.",
    llmSummary: "TecPey records a sourced Bitcoin ETF flow report and separates the publisher fact from TecPey educational context. BTC and liquidity are the key entities; this page is not a trading signal and links to risk education and market data.",
    citationSummary: "گزارش اصلی به CoinDesk نسبت داده می‌شود. تک‌پی زمان انتشار، منبع، موجودیت BTC، موضوع ETF و پیوندهای آموزشی را جداگانه ثبت می‌کند تا ادعاها قابل ردیابی باشند.",
    searchIntents: ["خبر ETF بیت کوین امروز", "اثر ETF بر بیت کوین", "نقدشوندگی بیت کوین"],
    questionIntents: ["چه اتفاقی افتاده است؟", "چرا برای بیت کوین مهم است؟", "چه ریسکی باید بررسی شود؟"],
    keyFacts: ["Source: CoinDesk", "Coin: BTC", "Topic: ETF", "Educational context only"],
    sourceAttributions: [
      { name: "CoinDesk", url: "https://www.coindesk.com/example", role: "primary" },
      { name: "TecPey", url: "https://tecpey.ir/crypto-news/bitcoin-etf-liquidity", role: "tecpey" },
    ],
    contentValue: "تک‌پی تیتر را صرفاً بازنویسی نمی‌کند؛ خبر را به موجودیت‌ها، ابزارها، ریسک، داده بازار و مسیر آموزشی متصل می‌کند تا کاربر بتواند آن را بررسی و راستی‌آزمایی کند.",
    safetyDisclaimer: "این محتوا توصیه مالی یا سیگنال معامله نیست.",
    freshnessTag: "fresh",
  });
}

describe("SEO/GEO/AEO organic growth authority v2", () => {
  it("requires all three readiness dimensions before publication", () => {
    const profile = strongProfile();
    assert.equal(validateOrganicGrowthProfile(profile), true);
    assert.ok(profile.readiness.seoScore >= 70);
    assert.ok(profile.readiness.aeoScore >= 70);
    assert.ok(profile.readiness.geoScore >= 70);
    assert.equal(profile.readiness.blockers.length, 0);
  });

  it("fails closed without source attribution and answer intent", () => {
    const profile = { ...strongProfile(), sourceAttributions: [], questionIntents: [], readiness: { ...strongProfile().readiness, ready: true, blockers: [] } };
    assert.equal(validateOrganicGrowthProfile(profile), false);
  });

  it("extracts a broad entity/topic taxonomy instead of a small hard-coded keyword set", () => {
    const taxonomy = extractNewsTaxonomy("BlackRock ETF flows lift Bitcoin liquidity while Ethereum Layer 2 and DeFi activity rises; TradingView and CoinGecko searches also increase.");
    assert.ok(taxonomy.coinSymbols.includes("BTC"));
    assert.ok(taxonomy.coinSymbols.includes("ETH"));
    assert.ok(taxonomy.topicTags.includes("etf"));
    assert.ok(taxonomy.topicTags.includes("liquidity"));
    assert.ok(taxonomy.topicTags.includes("defi"));
    assert.ok(taxonomy.toolSlugs.includes("tradingview"));
    assert.ok(taxonomy.toolSlugs.includes("coingecko"));
    assert.ok(taxonomy.searchIntents.length >= 3);
    assert.deepEqual(taxonomy.coinSymbols, ["BTC", "ETH"]);
    assert.ok(!taxonomy.coinSymbols.includes("DAI"), "generic DeFi language must not manufacture a DAI entity");
    assert.ok(!taxonomy.toolSlugs.includes("dextools"), "generic tool narratives must not manufacture a specific tool entity");
  });
});
