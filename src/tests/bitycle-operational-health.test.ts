import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  clearBitycleRealtimeMarketForTests,
  parseBitycleRealtimeMarketMessage,
  recordBitycleRealtimePrice,
} from "../lib/runtime-bitycle-market";
import { getBitycleOperationalHealth } from "../lib/runtime-bitycle-health";

function epochSeconds(iso: string): number {
  return Date.parse(iso) / 1_000;
}

function recordProviderPoint(
  market: "BTCUSDT" | "ETHUSDT",
  issuedAt: string,
  price: number,
) {
  const point = parseBitycleRealtimeMarketMessage({
    type: "md",
    d: {
      f: "binance_spot",
      s: market,
      t: "1m",
      c: [epochSeconds(issuedAt) - 30, price, price, price, price, 1, epochSeconds(issuedAt)],
    },
  });
  assert.ok(point);
  assert.equal(recordBitycleRealtimePrice(point), true);
}

describe("Bitycle operational health", () => {
  beforeEach(() => clearBitycleRealtimeMarketForTests());

  it("reports disabled without treating an unconfigured optional provider as degraded", () => {
    assert.deepEqual(getBitycleOperationalHealth(Date.now(), false), {
      connected: false,
      source: null,
      lastMessageAt: null,
      lastProviderEventAt: null,
      reconnectCount: 0,
      disconnectCount: 0,
      status: "disabled",
      configured: false,
      authoritativeSnapshotReady: false,
    });
  });

  it("reports degraded when configured but no authoritative snapshot is ready", () => {
    const health = getBitycleOperationalHealth(Date.parse("2026-09-09T00:00:10.000Z"), true);
    assert.equal(health.status, "degraded");
    assert.equal(health.configured, true);
    assert.equal(health.authoritativeSnapshotReady, false);
  });

  it("does not call stale or partial market data healthy", () => {
    recordProviderPoint("BTCUSDT", "2026-09-09T00:00:05.000Z", 65_000);
    const partial = getBitycleOperationalHealth(Date.parse("2026-09-09T00:00:10.000Z"), true);
    assert.equal(partial.status, "degraded");
    assert.equal(partial.authoritativeSnapshotReady, false);

    recordProviderPoint("ETHUSDT", "2026-09-09T00:00:06.000Z", 3_500);
    const freshButTransportUnknown = getBitycleOperationalHealth(
      Date.parse("2026-09-09T00:00:10.000Z"),
      true,
    );
    assert.equal(freshButTransportUnknown.authoritativeSnapshotReady, true);
    assert.equal(freshButTransportUnknown.status, "degraded");
  });
});
