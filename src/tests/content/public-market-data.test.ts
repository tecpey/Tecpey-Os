import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyBitycleMarketFrameAuthority,
  normalizeBitycleCurrencyInfo,
  normalizeBitycleMarketFrames,
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

  it("requires a fresh upstream Bitycle market frame before price data becomes authoritative", () => {
    const now = Date.now();
    const observedAt = new Date(now).toISOString();
    const updatedAt = new Date(now - 20_000).toISOString();
    const rows = normalizeBitycleCurrencyInfo({
      data: [{
        currency: { name: "Bitcoin", symbol: "BTC" },
        price: 64_000,
        open_24h: 62_000,
        price_quote: "USDT",
      }],
    }, observedAt);
    const frames = normalizeBitycleMarketFrames({
      data: [{
        source: "binance_spot",
        market: "BTCUSDT",
        frame: "24h",
        open: 63_000,
        high: 65_500,
        low: 62_500,
        price: 65_000,
        volume: 1234,
        updated_at: updatedAt,
      }],
    }, now, "binance_spot");

    const authoritative = applyBitycleMarketFrameAuthority(rows, frames);
    assert.equal(authoritative.length, 1);
    assert.equal(authoritative[0].price, 65_000);
    assert.equal(authoritative[0].marketDataUpdatedAt, updatedAt);
    assert.equal(authoritative[0].priceData?.open, 63_000);
    assert.equal(authoritative[0].priceData?.high24h, 65_500);
    assert.equal(authoritative[0].priceData?.low24h, 62_500);
    assert.ok(Number(authoritative[0].changePercent) > 3.17);
    assert.ok(Number(authoritative[0].changePercent) < 3.18);
  });

  it("binds Bitycle frame authority to the exact requested source", () => {
    const now = Date.now();
    const updatedAt = new Date(now - 5_000).toISOString();
    const frames = normalizeBitycleMarketFrames({
      data: [
        {
          source: "bybit_spot",
          market: "BTCUSDT",
          frame: "24h",
          price: 64_000,
          updated_at: updatedAt,
        },
        {
          source: "binance_spot",
          market: "ETHUSDT",
          frame: "24h",
          price: 3_500,
          updated_at: updatedAt,
        },
      ],
    }, now, "binance_spot");

    assert.equal(frames.has("BTCUSDT"), false);
    assert.equal(frames.get("ETHUSDT")?.source, "binance_spot");
    assert.equal(normalizeBitycleMarketFrames({ data: [] }, now, "").size, 0);
  });

  it("rejects stale, future, malformed and missing Bitycle frame authority", () => {
    const now = Date.now();
    const rows = normalizeBitycleCurrencyInfo({
      data: [{
        currency: { name: "Bitcoin", symbol: "BTC" },
        price: 64_000,
        price_quote: "USDT",
      }],
    }, new Date(now).toISOString());

    const stale = normalizeBitycleMarketFrames({
      data: [{
        source: "binance_spot",
        market: "BTCUSDT",
        frame: "24h",
        price: 65_000,
        updated_at: new Date(now - 180_000).toISOString(),
      }],
    }, now, "binance_spot");
    const future = normalizeBitycleMarketFrames({
      data: [{
        source: "binance_spot",
        market: "BTCUSDT",
        frame: "24h",
        price: 65_000,
        updated_at: new Date(now + 60_000).toISOString(),
      }],
    }, now, "binance_spot");

    assert.equal(stale.size, 0);
    assert.equal(future.size, 0);
    assert.equal(normalizeBitycleMarketFrames({ data: [{ market: "BTCUSDT", price: -1 }] }, now).size, 0);
    assert.deepEqual(applyBitycleMarketFrameAuthority(rows, new Map()), []);
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
