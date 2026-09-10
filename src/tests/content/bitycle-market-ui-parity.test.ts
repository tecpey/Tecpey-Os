import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Bitycle market UI locale parity", () => {
  it("mounts shared Iran intelligence and provenance surfaces in both locales", async () => {
    const [faMarkets, enMarkets, intelligence, provenance] = await Promise.all([
      readFile(new URL("../../app/markets/MarketsPageClient.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/en/markets/MarketsPageClient.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/markets/IranMarketIntelligence.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/markets/MarketDataProvenance.tsx", import.meta.url), "utf8"),
    ]);

    for (const source of [faMarkets, enMarkets]) {
      assert.match(source, /IranMarketIntelligence/);
      assert.match(source, /<IranMarketIntelligence\s*\/>/);
      assert.match(source, /MarketDataProvenance/);
      assert.match(source, /provenance=\{effectiveResult\?\.provenance\}/);
    }

    assert.match(faMarkets, /locale="fa"/);
    assert.match(enMarkets, /locale="en"/);
    assert.match(intelligence, /fa:\s*\{/);
    assert.match(intelligence, /en:\s*\{/);
    assert.match(intelligence, /timestampAuthority:\s*string/);
    assert.match(intelligence, /data\.provenance\.upstreamUpdatedAt/);
    assert.match(provenance, /PROVIDER_LINKS/);
    assert.match(provenance, /fallback === true/);
    assert.doesNotMatch(enMarkets, /[\u0600-\u06ff]/u);
  });
});
