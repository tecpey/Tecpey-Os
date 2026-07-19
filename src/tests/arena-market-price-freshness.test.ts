import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ArenaMarketPriceError,
  assertFreshArenaMarketPriceSnapshot,
} from "@/lib/arena-market-price";
import type { ArenaPriceSnapshot } from "@/lib/trading-arena-execution-v2";

function snapshot(observedAt: string): ArenaPriceSnapshot {
  return {
    prices: {
      BTC: "65000.0000000000",
      ETH: "3500.0000000000",
    },
    source: "configured_https_feed",
    observedAt,
  };
}

describe("Arena market price freshness", () => {
  const now = Date.parse("2026-07-19T12:00:00.000Z");

  it("accepts a recent authoritative snapshot", () => {
    const value = snapshot("2026-07-19T11:59:55.000Z");
    assert.equal(assertFreshArenaMarketPriceSnapshot(value, now), value);
  });

  it("rejects a stale configured-feed snapshot", () => {
    assert.throws(
      () => assertFreshArenaMarketPriceSnapshot(
        snapshot("2026-07-19T11:59:44.999Z"),
        now,
      ),
      (error: unknown) => error instanceof ArenaMarketPriceError &&
        error.message === "arena_price_feed_stale",
    );
  });

  it("rejects an implausibly future-dated snapshot", () => {
    assert.throws(
      () => assertFreshArenaMarketPriceSnapshot(
        snapshot("2026-07-19T12:00:05.001Z"),
        now,
      ),
      (error: unknown) => error instanceof ArenaMarketPriceError &&
        error.message === "arena_price_feed_future_timestamp",
    );
  });
});
