import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ArenaMarketBarsError,
  parseArenaBarAsset,
  parseArenaBarResolution,
  parseBinanceKlines,
} from "@/lib/arena-market-bars";

describe("Arena governed OHLC bars", () => {
  it("accepts only launch-authority assets and explicit chart resolutions", () => {
    assert.equal(parseArenaBarAsset("btc"), "BTC");
    assert.equal(parseArenaBarAsset("ETH"), "ETH");
    assert.equal(parseArenaBarAsset("SOL"), null);
    assert.equal(parseArenaBarResolution("1"), "1");
    assert.equal(parseArenaBarResolution("240"), "240");
    assert.equal(parseArenaBarResolution("1d"), "1D");
    assert.equal(parseArenaBarResolution("2"), null);
  });

  it("normalizes ordered Binance klines into complete OHLCV bars", () => {
    assert.deepEqual(parseBinanceKlines([
      [1_700_000_000_000, "100", "110", "90", "105", "12.5"],
      [1_700_000_060_000, "105", "115", "101", "111", "8"],
    ]), [
      { time: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 12.5 },
      { time: 1_700_000_060_000, open: 105, high: 115, low: 101, close: 111, volume: 8 },
    ]);
  });

  it("rejects malformed, impossible or out-of-order bars fail closed", () => {
    assert.throws(() => parseBinanceKlines([[1, "100", "90", "95", "105", "1"]]), ArenaMarketBarsError);
    assert.throws(() => parseBinanceKlines([
      [2, "100", "110", "90", "105", "1"],
      [1, "100", "110", "90", "105", "1"],
    ]), ArenaMarketBarsError);
    assert.throws(() => parseBinanceKlines([[1, "100", "110", "90", "NaN", "1"]]), ArenaMarketBarsError);
  });
});
