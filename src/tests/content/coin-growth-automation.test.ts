import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coinGrowthCandidates } from "@/data/coinGrowthCandidates";
import { coreCoinPages } from "@/data/coins";
import {
  materializeCoinGrowthSnapshot,
  scoreCoinGrowthCandidate,
} from "@/lib/coin-growth-automation";

describe("coin growth automation", () => {
  it("materializes publishable coin pages without enabling exchange capabilities", () => {
    const snapshot = materializeCoinGrowthSnapshot(coinGrowthCandidates, {
      generatedAt: "2026-08-10T00:00:00.000Z",
      existingSymbols: coreCoinPages.map((coin) => coin.symbol),
      existingSlugs: coreCoinPages.map((coin) => coin.slug),
    });

    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.stats.exchangeEnabled, 0);
    assert.ok(snapshot.stats.publishedContent >= 30);
    assert.ok(snapshot.coins.every((coin) => coin.automation.status === "published_content"));
    assert.ok(snapshot.coins.every((coin) => coin.automation.exchangeCapability === "manual_review_required"));
    assert.ok(snapshot.coins.every((coin) => coin.automation.officialWebsite.startsWith("https://")));
  });

  it("scores core stablecoin and high-trend AI candidates above the publication threshold", () => {
    const usdc = coinGrowthCandidates.find((coin) => coin.symbol === "USDC");
    const tao = coinGrowthCandidates.find((coin) => coin.symbol === "TAO");
    assert.ok(usdc);
    assert.ok(tao);
    assert.ok(scoreCoinGrowthCandidate(usdc) >= 0.42);
    assert.ok(scoreCoinGrowthCandidate(tao) >= 0.42);
  });

  it("rejects duplicates against manually curated coin pages", () => {
    const duplicate = {
      ...coinGrowthCandidates[0],
      symbol: "BTC",
      slug: "bitcoin",
      name: "Bitcoin duplicate",
      faName: "بیت‌کوین تکراری",
    };
    const snapshot = materializeCoinGrowthSnapshot([duplicate], {
      generatedAt: "2026-08-10T00:00:00.000Z",
      existingSymbols: coreCoinPages.map((coin) => coin.symbol),
      existingSlugs: coreCoinPages.map((coin) => coin.slug),
    });

    assert.equal(snapshot.stats.publishedContent, 0);
    assert.equal(snapshot.rejected[0]?.reason, "already_curated");
  });
});
