import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGrowthTrendRadarSnapshot,
  classifyGrowthTrendSourceUrl,
  rankGrowthTrendSignals,
  type GrowthTrendSignal,
} from "../../lib/growth-trend-intelligence";

const NOW = "2026-09-01T02:00:00.000Z";
function signal(overrides: Partial<GrowthTrendSignal>): GrowthTrendSignal {
  return {
    id: crypto.randomUUID(), entityType: "coin", entityId: "btc", label: "Bitcoin", locale: "global",
    sourceFamily: "social", sourceName: "X", sourceUrl: "https://x.com/example/status/1", observedAt: "2026-09-01T01:30:00.000Z", window: "24h",
    magnitude: 0.96, velocity: 0.95, confidence: 0.82, authority: 0.72, manipulationRisk: 0.18, ...overrides,
  };
}

describe("TecPey trend intelligence", () => {
  it("classifies cited source families by host and rejects TecPey self-citations", () => {
    assert.equal(classifyGrowthTrendSourceUrl("https://x.com/bitcoin/status/1"), "social");
    assert.equal(classifyGrowthTrendSourceUrl("https://www.reddit.com/r/CryptoCurrency/comments/example"), "social");
    assert.equal(classifyGrowthTrendSourceUrl("https://www.coingecko.com/en/coins/bitcoin"), "market");
    assert.equal(classifyGrowthTrendSourceUrl("https://www.tradingview.com/markets/cryptocurrencies/"), "market");
    assert.equal(classifyGrowthTrendSourceUrl("https://www.coindesk.com/markets/example"), "news");
    assert.equal(classifyGrowthTrendSourceUrl("https://trends.google.com/trends/explore?q=bitcoin"), "search");
    assert.equal(classifyGrowthTrendSourceUrl("https://www.sec.gov/newsroom/example"), "official");
    assert.equal(classifyGrowthTrendSourceUrl("https://tecpey.ir/crypto-news"), null);
  });

  it("does not call one viral social source a breakout trend", () => {
    const ranked = rankGrowthTrendSignals([signal({})], { window: "24h", entityType: "coin", now: Date.parse(NOW) });
    assert.equal(ranked.length, 1);
    assert.notEqual(ranked[0].tier, "breakout");
    assert.equal(ranked[0].evidence.crossFamilyConfirmed, false);
  });

  it("does not inflate a trend with repeated observations from one source", () => {
    const repeated = Array.from({ length: 20 }, (_, index) => signal({
      id: `repeat-${index}`,
      sourceUrl: `https://x.com/example/status/${index + 1}`,
      observedAt: new Date(Date.parse(NOW) - index * 15 * 60_000).toISOString(),
      magnitude: 1,
      velocity: 1,
      confidence: .95,
      manipulationRisk: .05,
    }));
    const ranked = rankGrowthTrendSignals(repeated, { window: "24h", entityType: "coin", now: Date.parse(NOW) });
    assert.equal(ranked[0].evidence.sourceCount, 1);
    assert.equal(ranked[0].evidence.signalCount, 1);
    assert.notEqual(ranked[0].tier, "breakout");
  });

  it("promotes corroborated market + social + news evidence", () => {
    const rows = [
      signal({ sourceFamily: "social", sourceUrl: "https://x.com/example/status/1", magnitude: 1, velocity: 1, confidence: .95, manipulationRisk: .05 }),
      signal({ sourceFamily: "market", sourceName: "CoinGecko", sourceUrl: "https://www.coingecko.com/en/highlights/trending-crypto", magnitude: .98, velocity: .94, confidence: .95, authority: .92, manipulationRisk: .03 }),
      signal({ sourceFamily: "news", sourceName: "CoinDesk", sourceUrl: "https://www.coindesk.com/markets/example", magnitude: .92, velocity: .9, confidence: .94, authority: .94, manipulationRisk: .02 }),
      signal({ sourceFamily: "search", sourceName: "Search evidence", sourceUrl: "https://example.com/search-evidence", magnitude: .9, velocity: .92, confidence: .9, authority: .9, manipulationRisk: .02 }),
    ];
    const ranked = rankGrowthTrendSignals(rows, { window: "24h", entityType: "coin", now: Date.parse(NOW) });
    assert.equal(ranked[0].evidence.crossFamilyConfirmed, true);
    assert.ok(ranked[0].evidence.sourceCount >= 3);
    assert.ok(ranked[0].score >= 68);
  });


  it("requires social or search discovery coverage before reporting a healthy radar", () => {
    const marketAndNewsOnly = buildGrowthTrendRadarSnapshot({
      locale: "fa",
      generatedAt: NOW,
      signals: [
        signal({ sourceFamily: "market", sourceName: "CoinGecko", sourceUrl: "https://www.coingecko.com/en/coins/bitcoin", authority: .94 }),
        signal({ sourceFamily: "news", sourceName: "CoinDesk", sourceUrl: "https://www.coindesk.com/markets/example", authority: .9 }),
      ],
    });
    assert.equal(marketAndNewsOnly.status, "degraded");

    const fullCoverage = buildGrowthTrendRadarSnapshot({
      locale: "fa",
      generatedAt: NOW,
      signals: [
        signal({ sourceFamily: "market", sourceName: "CoinGecko", sourceUrl: "https://www.coingecko.com/en/coins/bitcoin", authority: .94 }),
        signal({ sourceFamily: "news", sourceName: "CoinDesk", sourceUrl: "https://www.coindesk.com/markets/example", authority: .9 }),
        signal({ sourceFamily: "social", sourceName: "X", sourceUrl: "https://x.com/example/status/1", authority: .78 }),
      ],
    });
    assert.equal(fullCoverage.status, "healthy");
  });

  it("builds independent 24h, 7d and 30d radar windows", () => {
    const snapshot = buildGrowthTrendRadarSnapshot({ locale: "fa", generatedAt: NOW, signals: [signal({})] });
    assert.deepEqual(Object.keys(snapshot.windows), ["24h", "7d", "30d"]);
    assert.equal(snapshot.evidence.socialCoverage, true);
  });
});
