import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearBitycleRealtimeMarketForTests,
  getBitycleRealtimeHealth,
  getFreshBitycleArenaSnapshot,
  parseBitycleRealtimeMarketMessage,
  recordBitycleRealtimePrice,
  shouldRecycleBitycleRealtimeConnection,
} from "../lib/runtime-bitycle-market";

function epochSeconds(iso: string): number {
  return Date.parse(iso) / 1_000;
}

function mdPoint(
  market: "BTCUSDT" | "ETHUSDT",
  source: string,
  price: number,
  issuedAt: string,
) {
  return parseBitycleRealtimeMarketMessage({
    type: "md",
    d: {
      f: source,
      s: market,
      t: "1m",
      c: [epochSeconds(issuedAt) - 30, price, price, price, price, 1, epochSeconds(issuedAt)],
    },
  });
}

function mpPoint(
  market: "BTCUSDT" | "ETHUSDT",
  source: string,
  price: number,
  receivedAt: string,
) {
  return parseBitycleRealtimeMarketMessage({
    type: "mp",
    d: { f: source, p: price, s: market },
  }, receivedAt);
}

describe("Bitycle realtime market authority", () => {
  beforeEach(() => clearBitycleRealtimeMarketForTests());

  it("uses provider-issued MD timestamps for authoritative realtime prices", () => {
    const point = parseBitycleRealtimeMarketMessage({
      type: "md",
      d: {
        f: "binance_spot",
        s: "BTCUSDT",
        t: "1m",
        c: [
          epochSeconds("2026-09-09T00:00:00.000Z"),
          102_800,
          102_900,
          102_700,
          "102872.612345678912",
          19.79,
          epochSeconds("2026-09-09T00:00:05.000Z"),
        ],
      },
    });

    assert.deepEqual(point, {
      market: "BTCUSDT",
      source: "binance_spot",
      price: "102872.6123456789",
      observedAt: "2026-09-09T00:00:05.000Z",
      timestampAuthority: "provider",
    });
  });

  it("parses MP only as receipt-time data and never promotes it to an Arena snapshot", () => {
    const btc = mpPoint("BTCUSDT", "binance_spot", 65_000, "2026-09-09T00:00:05.000Z");
    const eth = mpPoint("ETHUSDT", "binance_spot", 3_500, "2026-09-09T00:00:06.000Z");
    assert.ok(btc);
    assert.ok(eth);
    assert.equal(btc.timestampAuthority, "receipt");
    assert.equal(eth.timestampAuthority, "receipt");
    recordBitycleRealtimePrice(btc);
    recordBitycleRealtimePrice(eth);

    assert.equal(getFreshBitycleArenaSnapshot(Date.parse("2026-09-09T00:00:10.000Z")), null);
  });

  it("prevents receipt-time MP traffic from downgrading provider authority", () => {
    const btcMd = mdPoint("BTCUSDT", "binance_spot", 65_100, "2026-09-09T00:00:05.000Z");
    const ethMd = mdPoint("ETHUSDT", "binance_spot", 3_500, "2026-09-09T00:00:05.000Z");
    const laterReceipt = mpPoint("BTCUSDT", "binance_spot", 1, "2026-09-09T00:00:09.000Z");
    assert.ok(btcMd);
    assert.ok(ethMd);
    assert.ok(laterReceipt);

    assert.equal(recordBitycleRealtimePrice(btcMd), true);
    assert.equal(recordBitycleRealtimePrice(ethMd), true);
    assert.equal(recordBitycleRealtimePrice(laterReceipt), false);
    assert.deepEqual(
      getFreshBitycleArenaSnapshot(Date.parse("2026-09-09T00:00:10.000Z"))?.prices,
      { BTC: "65100.0000000000", ETH: "3500.0000000000" },
    );
  });

  it("allows provider authority to replace receipt-only state even with an earlier event timestamp", () => {
    const receipt = mpPoint("BTCUSDT", "binance_spot", 1, "2026-09-09T00:00:09.000Z");
    const provider = mdPoint("BTCUSDT", "binance_spot", 65_100, "2026-09-09T00:00:05.000Z");
    const eth = mdPoint("ETHUSDT", "binance_spot", 3_500, "2026-09-09T00:00:05.000Z");
    assert.ok(receipt);
    assert.ok(provider);
    assert.ok(eth);

    assert.equal(recordBitycleRealtimePrice(receipt), true);
    assert.equal(recordBitycleRealtimePrice(provider), true);
    assert.equal(recordBitycleRealtimePrice(eth), true);
    assert.deepEqual(
      getFreshBitycleArenaSnapshot(Date.parse("2026-09-09T00:00:10.000Z"))?.prices,
      { BTC: "65100.0000000000", ETH: "3500.0000000000" },
    );
  });

  it("builds an Arena snapshot only when both provider timestamps are fresh and share one source", () => {
    const now = Date.parse("2026-09-09T00:00:10.000Z");
    const btc = mdPoint("BTCUSDT", "binance_spot", 65_000, "2026-09-09T00:00:05.000Z");
    const eth = mdPoint("ETHUSDT", "binance_spot", 3_500, "2026-09-09T00:00:06.000Z");
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
    const btc = mdPoint("BTCUSDT", "binance_spot", 65_000, "2026-09-09T00:00:05.000Z");
    const eth = mdPoint("ETHUSDT", "bybit_spot", 3_500, "2026-09-09T00:00:05.000Z");
    assert.ok(btc);
    assert.ok(eth);
    recordBitycleRealtimePrice(btc);
    recordBitycleRealtimePrice(eth);

    assert.equal(getFreshBitycleArenaSnapshot(Date.parse("2026-09-09T00:00:10.000Z")), null);
  });

  it("rejects out-of-order provider events instead of rolling the execution price backwards", () => {
    const freshBtc = mdPoint("BTCUSDT", "binance_spot", 65_100, "2026-09-09T00:00:06.000Z");
    const oldBtc = mdPoint("BTCUSDT", "binance_spot", 64_000, "2026-09-09T00:00:05.000Z");
    const eth = mdPoint("ETHUSDT", "binance_spot", 3_500, "2026-09-09T00:00:06.000Z");
    assert.ok(freshBtc);
    assert.ok(oldBtc);
    assert.ok(eth);

    assert.equal(recordBitycleRealtimePrice(freshBtc), true);
    assert.equal(recordBitycleRealtimePrice(oldBtc), false);
    assert.equal(recordBitycleRealtimePrice(eth), true);
    assert.deepEqual(
      getFreshBitycleArenaSnapshot(Date.parse("2026-09-09T00:00:10.000Z"))?.prices,
      { BTC: "65100.0000000000", ETH: "3500.0000000000" },
    );
  });

  it("recycles a connected socket that lacks authoritative market progress after grace", () => {
    const openedAtMs = Date.parse("2026-09-09T00:00:00.000Z");
    assert.equal(shouldRecycleBitycleRealtimeConnection({
      now: Date.parse("2026-09-09T00:00:10.000Z"),
      openedAtMs,
      lastMessageAt: "2026-09-09T00:00:09.000Z",
      authoritativeSnapshotReady: false,
    }), false);

    assert.equal(shouldRecycleBitycleRealtimeConnection({
      now: Date.parse("2026-09-09T00:00:25.000Z"),
      openedAtMs,
      lastMessageAt: "2026-09-09T00:00:24.000Z",
      authoritativeSnapshotReady: false,
    }), true);

    assert.equal(shouldRecycleBitycleRealtimeConnection({
      now: Date.parse("2026-09-09T00:00:25.000Z"),
      openedAtMs,
      lastMessageAt: "2026-09-09T00:00:24.000Z",
      authoritativeSnapshotReady: true,
    }), false);

    assert.equal(shouldRecycleBitycleRealtimeConnection({
      now: Date.parse("2026-09-09T00:00:25.000Z"),
      openedAtMs,
      lastMessageAt: "2026-09-09T00:00:01.000Z",
      authoritativeSnapshotReady: true,
    }), true);
  });

  it("rejects malformed, unsupported-market and wrong-timeframe MD frames", () => {
    const issuedAt = epochSeconds("2026-09-09T00:00:05.000Z");
    assert.equal(parseBitycleRealtimeMarketMessage({ type: "md", d: {} }), null);
    assert.equal(parseBitycleRealtimeMarketMessage({
      type: "md",
      d: { f: "bad source", s: "BTCUSDT", t: "1m", c: [0, 1, 1, 1, 1, 1, issuedAt] },
    }), null);
    assert.equal(parseBitycleRealtimeMarketMessage({
      type: "md",
      d: { f: "binance_spot", s: "DOGEUSDT", t: "1m", c: [0, 1, 1, 1, 1, 1, issuedAt] },
    }), null);
    assert.equal(parseBitycleRealtimeMarketMessage({
      type: "md",
      d: { f: "binance_spot", s: "BTCUSDT", t: "5m", c: [0, 1, 1, 1, 65_000, 1, issuedAt] },
    }), null);
    assert.equal(parseBitycleRealtimeMarketMessage({
      type: "md",
      d: { f: "binance_spot", s: "BTCUSDT", c: [0, 1, 1, 1, 65_000, 1, issuedAt] },
    }), null);
  });

  it("keeps health state secret-free", () => {
    assert.deepEqual(getBitycleRealtimeHealth(), {
      connected: false,
      source: null,
      lastMessageAt: null,
      lastProviderEventAt: null,
      reconnectCount: 0,
      disconnectCount: 0,
    });
  });
});
