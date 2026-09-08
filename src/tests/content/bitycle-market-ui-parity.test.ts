import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Bitycle market UI locale parity", () => {
  it("mounts one shared Iran intelligence surface in both Persian and English Markets", async () => {
    const [faMarkets, enMarkets, intelligence] = await Promise.all([
      readFile(new URL("../../app/markets/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/en/markets/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/markets/IranMarketIntelligence.tsx", import.meta.url), "utf8"),
    ]);

    for (const source of [faMarkets, enMarkets]) {
      assert.match(source, /IranMarketIntelligence/);
      assert.match(source, /<IranMarketIntelligence\s*\/>/);
    }

    assert.match(intelligence, /fa:\s*\{/);
    assert.match(intelligence, /en:\s*\{/);
    assert.match(intelligence, /source_markets_frame\.updated_at/);
    assert.doesNotMatch(enMarkets, /[\u0600-\u06ff]/u);
  });
});
