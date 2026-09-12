import assert from "node:assert/strict";
import test from "node:test";
import { finiteMarketNumber, storyMarketRows, storyHeatmapRows, storySafeLink } from "@/lib/landing-story-data";
import type { CurrencyListResponse } from "@/types/market";
const now = Date.parse("2026-09-12T12:00:00Z");
const row = (symbol: string, extra = {}) => ({ symbol, priceData: { last: 12, changePercent: null }, marketDataUpdatedAt: new Date(now).toISOString(), ...extra });
const payload = (data: unknown[], provider = "CoinGecko") => ({ data, provenance: { provider } }) as CurrencyListResponse;
test("invalid numeric values stay missing, including empty, null and boolean", () => {
  for (const value of [null, undefined, "", " ", true, false, Infinity, NaN, "NaN"]) assert.equal(finiteMarketNumber(value), null);
  assert.equal(finiteMarketNumber("0"), 0);
});
test("freshness uses upstream row time, not successful fetch time", () => {
  const old = new Date(now - 180_000).toISOString();
  assert.equal(storyMarketRows(payload([row("BTC", { marketDataUpdatedAt: old })], "Bitycle"), now).length, 0);
  assert.equal(storyMarketRows(payload([row("BTC", { marketDataUpdatedAt: old })]), now).length, 1);
  for (const time of [undefined, "invalid", new Date(now + 60_000).toISOString(), new Date(now - 301_000).toISOString()]) assert.equal(storyMarketRows(payload([row("BTC", { marketDataUpdatedAt: time })]), now).length, 0);
});
test("normalization deduplicates pairs and preserves missing change", () => {
  const rows = storyMarketRows(payload([row("BTCUSDT"), row("BTC"), row("USDT"), row("ETH", { priceData: { last: -1 } })]), now);
  assert.deepEqual(rows.map(r => r.symbol), ["BTC", "USDT"]);
  assert.equal(rows[0].change, null);
});
test("heatmap excludes missing weights without inventing market cap", () => {
  const rows = storyMarketRows(payload([row("BTC", { marketCap: 100, volume: 1 }), row("ETH", { volume: 20 }), row("SOL", { marketCap: 5, volume: 10 })]), now);
  assert.deepEqual(storyHeatmapRows(rows, "marketCap", false).map(r => r.symbol), ["BTC", "SOL"]);
  assert.deepEqual(storyHeatmapRows(rows, "volume", true).map(r => r.symbol), ["ETH", "SOL"]);
  assert.deepEqual(rows.map(r => r.symbol), ["BTC", "ETH", "SOL"]);
});
test("external links reject executable protocols, credentials and network-path references", () => {
  for (const link of ["javascript:alert(1)", "//evil.test", "https://user:pass@site.test", "http://site.test", "/\\evil.test", "https://site.test/\n"]) assert.equal(storySafeLink(link), null);
  assert.equal(storySafeLink("/crypto-news/story"), "/crypto-news/story");
  assert.equal(storySafeLink("https://example.com/news"), "https://example.com/news");
});
