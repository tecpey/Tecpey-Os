import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearBitycleRealtimeMarketForTests,
  getFreshBitycleArenaSnapshot,
  parseBitycleRealtimeMarketMessage,
  recordBitycleRealtimePrice,
} from "../lib/bitycle-market-realtime";

describe("Bitycle realtime market authority", () => {
  beforeEach(() => clearBitycleRealtimeMarketForTests());

  it("parses only supported MP envelopes and normalizes decimal prices", () => {
    const point = parseBitycleRealtimeMarketMessage({
      type: "mp",
      d: { f: "binance_spot", p: 102872.612345678912, s: "BTCUSDT" },
    }, "2026-09-09T00:00:00.000Z");

    assert.deepEqual(point, {
      market: "BTCUSDT",
      source: "binance_spot",
      price: "102872.6123456789",
      observedAt: "2026-09-09T00:00:00.000Z",
    });

    assert.equal(parseBitycleRealtimeMarketMessage({ type: "md", d: {} }), null);
    assert.equal(parseBitycleRealtimeMarketMessage({ type: "mp", d: { f: "bad source", p: 1, s: "BTCUSDT" } }), null);
    assert.equal(parseBitycleRealtimeMarketMessage({ type: "mp", d: { f: "binance_spot", p: -1, s: "BTCUSDT" } }), null);
    assert.equal(parseBitycleRealtimeMarketMessage({ type: "mp", d: { f: "binance_spot", p: 1, s: "DOGEUSDT" } }), null);
  });

  it("builds an Arena snapshot only when both assets are fresh and share one source", () => {
    const now = Date.parse("2026-09-09T00:00:10.000Z");
    const btc = parseBitycleRealtimeMarketMessage({
      type: "mp",
      d: { f: "binance_spot", p: 65000, s: "BTCUSDT" },
    }, "2026-09-09T00:00:05.000Z");
    const eth = parseBitycleRealtimeMarketMessage({
      type: "mp",
      d: { f: "binance_spot", p: 3500, s: "ETHUSDT" },
    }, "2026-09-09T00:00:06.000Z");
    assert.ok(btc);
    assert.ok(eth);
    recordBitycleRealtimePrice(btc);
    recordBitycleRealtimePrice(eth);

    assert.deepEqual(getFreshBitycleArenaSnapshot(now), {
      prices: { BTC: "65000.0000000000", ETH: "3500.0000000000" },
      source: "bitycle_ws:binance_spot",
      observedAt: "2026-09-09T00:00:05.000Z",
    });
    assert.equal(getFreshBitycleArenaSnapshot(Date.parse("2026-09-09T00:00:21.000Z")), null);
  });

  it("rejects mixed upstream sources to avoid a synthetic cross-source execution snapshot", () => {
    const btc = parseBitycleRealtimeMarketMessage({
      type: "mp",
      d: { f: "binance_spot", p: 65000, s: "BTCUSDT" },
    }, "2026-09-09T00:00:05.000Z");
    const eth = parseBitycleRealtimeMarketMessage({
      type: "mp",
      d: { f: "bybit_spot", p: 3500, s: "ETHUSDT" },
    }, "2026-09-09T00:00:05.000Z");
    assert.ok(btc);
    assert.ok(eth);
    recordBitycleRealtimePrice(btc);
    recordBitycleRealtimePrice(eth);

    assert.equal(getFreshBitycleArenaSnapshot(Date.parse("2026-09-09T00:00:10.000Z")), null);
  });
});
