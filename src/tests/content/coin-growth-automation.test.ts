import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coinGrowthCandidates } from "@/data/coinGrowthCandidates";
import { coreCoinPages } from "@/data/coins";
import {
  materializeCoinGrowthSnapshot,
  readPublishedCoinGrowthPages,
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
    assert.equal(snapshot.hostPinVersion, 1);
    assert.equal(snapshot.stats.exchangeEnabled, 0);
    assert.ok(snapshot.stats.publishedContent >= 30);
    assert.ok(snapshot.coins.every((coin) => coin.automation.status === "published_content"));
    assert.ok(snapshot.coins.every((coin) => coin.automation.exchangeCapability === "manual_review_required"));
    assert.ok(snapshot.coins.every((coin) => coin.automation.officialWebsite.startsWith("https://")));
    assert.ok(snapshot.coins.every((coin) => (coin.automation.officialHost?.length ?? 0) > 0));
    assert.ok(snapshot.coins.every((coin) => coin.organicGrowth.policyVersion === "tecpey-organic-growth-policy-v1"));
    assert.ok(snapshot.coins.every((coin) => coin.organicGrowth.canonicalPath === `/coins/${coin.slug}`));
    assert.ok(snapshot.coins.every((coin) => coin.organicGrowth.entityTags.includes(`coin:${coin.symbol.toLowerCase()}`)));
    assert.ok(snapshot.coins.every((coin) => coin.organicGrowth.schemaTypes.includes("FAQPage")));
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

  it("rejects unsafe official website URLs before materialization", () => {
    const base = {
      ...coinGrowthCandidates[0],
      symbol: "SAFE",
      slug: "safe-link-example",
      name: "Safe Link Example",
      faName: "نمونه لینک امن",
    };

    for (const officialWebsite of [
      "http://trusted.example/insecure",
      "https://user:pass@trusted.example/path",
      "https://",
    ]) {
      const snapshot = materializeCoinGrowthSnapshot([{ ...base, officialWebsite }], {
        generatedAt: "2026-08-21T00:00:00.000Z",
        publishThreshold: 0,
      });

      assert.equal(snapshot.stats.publishedContent, 0, officialWebsite);
      assert.equal(snapshot.rejected[0]?.reason, "official_source_invalid", officialWebsite);
    }
  });

  it("pins the materialized official host and revalidates it when reading snapshots", () => {
    const base = {
      ...coinGrowthCandidates[0],
      symbol: "PIN",
      slug: "pinned-host-example",
      name: "Pinned Host Example",
      faName: "نمونه دامنه پین‌شده",
      officialWebsite: "https://trusted.example/project",
    };
    const snapshot = materializeCoinGrowthSnapshot([base], {
      generatedAt: "2026-08-21T00:00:00.000Z",
      publishThreshold: 0,
    });

    assert.equal(snapshot.stats.publishedContent, 1);
    assert.equal(snapshot.hostPinVersion, 1);
    assert.equal(snapshot.coins[0]?.automation.officialHost, "trusted.example");
    assert.equal(readPublishedCoinGrowthPages(snapshot).length, 1);

    const mutated = structuredClone(snapshot);
    mutated.coins[0]!.automation.officialWebsite = "https://trusted.example.evil.test/phish";
    assert.equal(readPublishedCoinGrowthPages(mutated).length, 0);

    mutated.coins[0]!.automation.officialWebsite = "https://research.trusted.example/path";
    assert.equal(readPublishedCoinGrowthPages(mutated).length, 1);

    mutated.coins[0]!.automation.officialWebsite = "https://trusted.example@evil.test/phish";
    assert.equal(readPublishedCoinGrowthPages(mutated).length, 0);
  });

  it("migrates the checked-in legacy shape through curated candidate host pins", () => {
    const snapshot = materializeCoinGrowthSnapshot(coinGrowthCandidates, {
      generatedAt: "2026-08-10T12:29:21.460Z",
      existingSymbols: coreCoinPages.map((coin) => coin.symbol),
      existingSlugs: coreCoinPages.map((coin) => coin.slug),
    });

    const legacySnapshot = structuredClone(snapshot) as unknown as {
      hostPinVersion?: number;
      coins: Array<{
        automation: {
          officialWebsite: string;
          officialHost?: string;
        };
      }>;
    };
    delete legacySnapshot.hostPinVersion;
    for (const coin of legacySnapshot.coins) delete coin.automation.officialHost;

    assert.equal(readPublishedCoinGrowthPages(legacySnapshot as never).length, snapshot.coins.length);

    legacySnapshot.coins[0]!.automation.officialWebsite = "https://evil.test/phish";
    assert.equal(readPublishedCoinGrowthPages(legacySnapshot as never).length, snapshot.coins.length - 1);
  });

  it("fails closed when a new host-pinned snapshot loses its pin metadata", () => {
    const snapshot = materializeCoinGrowthSnapshot(
      [{
        ...coinGrowthCandidates[0],
        symbol: "PIN2",
        slug: "pinned-host-required",
        name: "Pinned Host Required",
        faName: "پین دامنه الزامی",
        officialWebsite: "https://trusted.example/project",
      }],
      { generatedAt: "2026-08-21T00:00:00.000Z", publishThreshold: 0 },
    );

    delete snapshot.coins[0]!.automation.officialHost;

    assert.equal(snapshot.hostPinVersion, 1);
    assert.doesNotThrow(() => readPublishedCoinGrowthPages(snapshot));
    assert.equal(readPublishedCoinGrowthPages(snapshot).length, 0);
  });
});
