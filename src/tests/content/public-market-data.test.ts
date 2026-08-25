import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCoinGeckoMarkets } from "../../lib/public-market-data";

describe("public market data authority", () => {
  it("maps fresh provider data with explicit provenance", () => {
    const rows = normalizeCoinGeckoMarkets([{
      id: "bitcoin",
      symbol: "btc",
      name: "Bitcoin",
      image: "https://example.test/btc.png",
      current_price: 64_000,
      market_cap: 1_200_000,
      market_cap_rank: 1,
      total_volume: 55_000,
      price_change_percentage_24h: 2.5,
      last_updated: new Date().toISOString(),
    }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priceData?.symbol, "BTCUSDT");
    assert.equal(rows[0].marketDataSource, "CoinGecko");
  });

  it("fails closed for malformed, negative-price, or stale rows", () => {
    assert.deepEqual(normalizeCoinGeckoMarkets(null), []);
    assert.deepEqual(normalizeCoinGeckoMarkets([{ id: "bad", symbol: "bad", name: "Bad", current_price: -1, last_updated: new Date().toISOString() }]), []);
    assert.deepEqual(normalizeCoinGeckoMarkets([{ id: "old", symbol: "old", name: "Old", current_price: 1, last_updated: "2020-01-01T00:00:00.000Z" }]), []);
  });
});
