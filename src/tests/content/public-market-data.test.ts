import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBitycleCurrencyInfo,
  normalizeCoinGeckoMarkets,
} from "../../lib/public-market-data";

describe("public market data authority", () => {
  it("maps fresh CoinGecko provider data with explicit provenance", () => {
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

  it("maps Bitycle currency intelligence and derives 24h change", () => {
    const observedAt = new Date().toISOString();
    const rows = normalizeBitycleCurrencyInfo({
      status: "success",
      data: [{
        currency: {
          name: "Bitcoin",
          symbol: "BTC",
          logo: "https://example.test/btc.png",
        },
        rank: 1,
        price: 64_000,
        open_24h: 62_000,
        market_cap: 1_200_000,
        max_supply: 21_000_000,
        total_supply: 19_900_000,
        available_supply: 19_800_000,
        dominance: 55.2,
        volume_24h: 55_000,
        price_quote: "USDT",
      }],
    }, observedAt);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "bitycle:btc");
    assert.equal(rows[0].priceData?.symbol, "BTCUSDT");
    assert.equal(rows[0].marketDataSource, "Bitycle");
    assert.equal(rows[0].marketDataUpdatedAt, observedAt);
    assert.ok(Number(rows[0].changePercent) > 3.2);
    assert.ok(Number(rows[0].changePercent) < 3.3);
  });

  it("fails closed for malformed, negative-price, or stale rows", () => {
    assert.deepEqual(normalizeCoinGeckoMarkets(null), []);
    assert.deepEqual(normalizeCoinGeckoMarkets([{ id: "bad", symbol: "bad", name: "Bad", current_price: -1, last_updated: new Date().toISOString() }]), []);
    assert.deepEqual(normalizeCoinGeckoMarkets([{ id: "old", symbol: "old", name: "Old", current_price: 1, last_updated: "2020-01-01T00:00:00.000Z" }]), []);

    assert.deepEqual(normalizeBitycleCurrencyInfo(null), []);
    assert.deepEqual(normalizeBitycleCurrencyInfo({ data: [{ currency: { name: "Bad", symbol: "BAD" }, price: -1 }] }), []);
    assert.deepEqual(normalizeBitycleCurrencyInfo({ data: [{ currency: { name: "Old", symbol: "OLD" }, price: 1 }] }, "2020-01-01T00:00:00.000Z"), []);
  });
});
