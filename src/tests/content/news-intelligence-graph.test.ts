import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessNewsDuplicate,
  buildNewsIntelligenceDossier,
  buildNewsIntelligenceFingerprint,
  rankDailyCoinDiscoveries,
  type NewsIntelligenceCandidate,
} from "../../lib/news-intelligence-graph";

function baseCandidate(overrides: Partial<NewsIntelligenceCandidate> = {}): NewsIntelligenceCandidate {
  return {
    locale: "fa",
    originalLanguage: "en",
    title: "Bitcoin ETF inflows rise as institutional demand returns",
    originalSummary:
      "Bitcoin ETF inflows rose again as institutional demand returned, but analysts warned that liquidity and risk management remain important.",
    persianSummary:
      "ورود سرمایه به ETFهای بیت کوین دوباره توجه کاربران را به تقاضای نهادی جلب کرده است. این خبر باید در کنار قیمت، حجم معاملات، نقدشوندگی و سناریوی مدیریت ریسک بررسی شود و هیچ توصیه خرید یا فروش از آن برداشت نشود.",
    sourceName: "CoinDesk",
    sourceUrl: "https://www.coindesk.com/markets/2026/08/12/bitcoin-etf-inflows-rise/",
    canonicalUrl: "https://www.coindesk.com/markets/2026/08/12/bitcoin-etf-inflows-rise/",
    publishedAt: "2026-08-12T08:20:00.000Z",
    fetchedAt: "2026-08-12T08:24:00.000Z",
    thumbnail: {
      url: "https://www.coindesk.com/resizer/example-btc-etf.jpg",
      alt: "Bitcoin ETF market board",
      rights: "official_attribution",
    },
    entities: [
      {
        type: "coin",
        id: "BTC",
        label: "Bitcoin",
        confidence: 0.92,
        officialUrl: "https://bitcoin.org/",
      },
      {
        type: "project",
        id: "spot-btc-etf",
        label: "Spot Bitcoin ETF",
        confidence: 0.82,
      },
    ],
    tags: ["bitcoin", "etf", "institutional-demand"],
    socialLayer: {
      source: "x",
      url: "https://x.com/example/status/1",
      observedAt: "2026-08-12T08:25:00.000Z",
      verifiedAccount: true,
      engagementScore: 0.72,
      sentiment: "neutral",
    },
    relatedLessonHref: "/academy/term-5",
    ...overrides,
  };
}

describe("News Intelligence Graph authority", () => {
  it("builds a publishable source card, graph edges, C-level approvals and safe coin discovery", () => {
    const dossier = buildNewsIntelligenceDossier(baseCandidate());

    assert.equal(dossier.status, "publishable");
    assert.deepEqual(dossier.reasons, []);
    assert.equal(dossier.source.domain, "coindesk.com");
    assert.equal(dossier.sourceCard.attributionRequired, true);
    assert.match(dossier.sourceCard.persianSummary, /بیت کوین/);
    assert.equal(dossier.sourceCard.thumbnailRights, "official_attribution");
    assert.ok(dossier.reviews.every((review) => review.signedOff));
    assert.ok(dossier.graphEdges.some((edge) => edge.type === "mentions_coin" && edge.toId === "coin:BTC"));
    assert.ok(dossier.graphEdges.some((edge) => edge.type === "tagged_as" && edge.toId === "tag:bitcoin"));
    assert.equal(dossier.timeBuckets.day, "2026-08-12");
    assert.deepEqual(dossier.coinDiscoveries, [
      {
        symbol: "BTC",
        label: "Bitcoin",
        status: "trending",
        sourceCount: 1,
        newsCount: 1,
        audienceScore: 0.872,
        riskReviewRequired: false,
        exchangeEnabled: false,
        officialUrls: ["https://bitcoin.org/"],
      },
    ]);
  });

  it("rejects exact duplicate news before publication", () => {
    const candidate = baseCandidate();
    const dossier = buildNewsIntelligenceDossier(candidate, {
      existingItems: [
        {
          id: "existing-btc-etf-flow",
          title: candidate.title,
          canonicalUrl: candidate.canonicalUrl,
          publishedAt: candidate.publishedAt,
          fingerprint: "existing-fingerprint",
          relatedEntityIds: ["coin:BTC"],
          tags: ["bitcoin", "etf"],
        },
      ],
    });

    assert.equal(dossier.status, "rejected");
    assert.equal(dossier.duplicate.status, "duplicate");
    assert.equal(dossier.duplicate.reason, "canonical_url");
    assert.ok(dossier.reasons.includes("duplicate_news"));
  });

  it("routes near-duplicate story chains to human review and links the chain", () => {
    const candidate = baseCandidate({
      title: "Bitcoin ETF inflows rise while institutional demand returns",
      canonicalUrl: "https://www.coindesk.com/markets/2026/08/12/bitcoin-etf-inflows-rise-second-source/",
      sourceUrl: "https://www.coindesk.com/markets/2026/08/12/bitcoin-etf-inflows-rise-second-source/",
    });
    const duplicate = assessNewsDuplicate(candidate, [
      {
        id: "existing-btc-chain-node",
        title: "Bitcoin ETF inflows rise as institutional demand returns",
        canonicalUrl: "https://www.coindesk.com/markets/2026/08/12/bitcoin-etf-inflows-rise/",
        publishedAt: "2026-08-12T07:50:00.000Z",
        fingerprint: buildNewsIntelligenceFingerprint(baseCandidate()),
        relatedEntityIds: ["coin:BTC"],
        tags: ["bitcoin", "etf"],
      },
    ]);

    assert.equal(duplicate.status, "near_duplicate");

    const dossier = buildNewsIntelligenceDossier(candidate, {
      existingItems: [
        {
          id: "existing-btc-chain-node",
          title: "Bitcoin ETF inflows rise as institutional demand returns",
          canonicalUrl: "https://www.coindesk.com/markets/2026/08/12/bitcoin-etf-inflows-rise/",
          publishedAt: "2026-08-12T07:50:00.000Z",
          fingerprint: "different-fingerprint",
          relatedEntityIds: ["coin:BTC"],
          tags: ["bitcoin", "etf"],
        },
      ],
    });

    assert.equal(dossier.status, "human_review");
    assert.ok(dossier.reasons.includes("near_duplicate_news"));
    assert.ok(dossier.graphEdges.some((edge) => edge.type === "same_story_chain" && edge.toId === "existing-btc-chain-node"));
  });

  it("rejects trading signals, profit hype and blocked thumbnails", () => {
    const dossier = buildNewsIntelligenceDossier(
      baseCandidate({
        title: "Buy Bitcoin now for guaranteed profit",
        originalSummary: "Buy Bitcoin now. This is a guaranteed profit opportunity and cannot lose.",
        persianSummary:
          "این متن عمدا برای تست رد شدن ساخته شده است، چون به کاربر وعده سود تضمینی و دستور خرید فوری می دهد و نباید در تک پی به عنوان محتوای آموزشی یا خبری منتشر شود.",
        thumbnail: {
          url: "https://example.com/blocked.jpg",
          alt: "blocked image",
          rights: "blocked",
        },
      }),
    );

    assert.equal(dossier.status, "rejected");
    assert.ok(dossier.reasons.includes("financial_advice_or_signal"));
    assert.ok(dossier.reasons.includes("hype_or_profit_promise"));
    assert.ok(dossier.reasons.includes("thumbnail_rights_blocked"));
    assert.equal(dossier.reviews.find((review) => review.role === "chief_risk_compliance_ai")?.signedOff, false);
  });

  it("ranks daily coin discoveries without enabling exchange capability", () => {
    const btcPrimary = buildNewsIntelligenceDossier(baseCandidate());
    const btcSecondary = buildNewsIntelligenceDossier(
      baseCandidate({
        title: "Bitcoin ETF demand remains visible across market data desks",
        sourceName: "Benzinga",
        sourceUrl: "https://www.benzinga.com/markets/cryptocurrency/26/08/bitcoin-etf-demand",
        canonicalUrl: "https://www.benzinga.com/markets/cryptocurrency/26/08/bitcoin-etf-demand",
        thumbnail: {
          url: "https://cdn.benzinga.com/btc-etf.jpg",
          alt: "Bitcoin market data",
          rights: "licensed",
        },
        socialLayer: {
          source: "x",
          observedAt: "2026-08-12T09:01:00.000Z",
          verifiedAccount: true,
          engagementScore: 0.8,
          sentiment: "neutral",
        },
      }),
    );
    const ton = buildNewsIntelligenceDossier(
      baseCandidate({
        title: "TON mini-app activity climbs after new Telegram ecosystem update",
        sourceUrl: "https://www.theblock.co/post/123456/ton-mini-app-activity",
        canonicalUrl: "https://www.theblock.co/post/123456/ton-mini-app-activity",
        sourceName: "The Block",
        entities: [
          {
            type: "coin",
            id: "TON",
            label: "Toncoin",
            confidence: 0.81,
            officialUrl: "https://ton.org/",
          },
        ],
        tags: ["ton", "telegram", "ecosystem"],
        socialLayer: {
          source: "telegram",
          observedAt: "2026-08-12T09:10:00.000Z",
          verifiedAccount: true,
          engagementScore: 0.58,
          sentiment: "positive",
        },
      }),
    );

    const ranked = rankDailyCoinDiscoveries([ton, btcSecondary, btcPrimary]);

    assert.equal(ranked[0].symbol, "BTC");
    assert.equal(ranked[0].sourceCount, 2);
    assert.equal(ranked[0].newsCount, 2);
    assert.equal(ranked[0].exchangeEnabled, false);
    assert.deepEqual(ranked.map((coin) => coin.symbol), ["BTC", "TON"]);
  });
});
