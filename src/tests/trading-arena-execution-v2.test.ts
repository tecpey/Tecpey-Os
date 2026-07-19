import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import {
  applyArenaExecutionActionV2,
  computeArenaExecutionEquity,
  createArenaExecutionStateV2,
  normalizeArenaExecutionStateV2,
  type ArenaExecutionContext,
  type ArenaExecutionStateV2,
  type ArenaPriceSnapshot,
} from "@/lib/trading-arena-execution-v2";
import { parseArenaMarketPricePayload } from "@/lib/arena-market-price";

const MARKET: ArenaPriceSnapshot = {
  prices: { BTC: "65000.0000000000", ETH: "3500.0000000000" },
  source: "test_feed",
  observedAt: "2026-07-19T00:00:00.000Z",
};

function context(operationId: string, market = MARKET): ArenaExecutionContext {
  return {
    operationId,
    now: "2026-07-19T00:00:01.000Z",
    market,
    slippageBps: "5",
  };
}

function success(result: ReturnType<typeof applyArenaExecutionActionV2>) {
  if (!result.ok) throw new Error(result.error);
  assert.equal(result.ok, true);
  return result;
}

describe("authoritative Arena execution aggregate", () => {
  it("starts with exact 100,000 capital and no browser-derived state", () => {
    const state = createArenaExecutionStateV2("100000.0000000000", "2026-07-19T00:00:00.000Z");

    assert.equal(state.version, 2);
    assert.equal(state.initialBalance, "100000.0000000000");
    assert.equal(state.cashBalance, "100000.0000000000");
    assert.equal(state.reservedBalance, "0.0000000000");
    assert.equal(state.openPositions.length, 0);
    assert.equal(state.pendingOrders.length, 0);
  });

  it("opens a market position with deterministic server slippage and Decimal fees", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const result = success(applyArenaExecutionActionV2(initial, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "10000",
      stopLoss: "60000",
      takeProfit: "70000",
      preTradePlan: "Structured entry with invalidation and target.",
      emotionalState: "calm",
    }, context("operation-market-buy")));

    assert.equal(result.eventType, "arena.market_position_opened");
    assert.equal(result.state.cashBalance, "90000.0000000000");
    assert.equal(result.state.totalFeesPaid, "10.0000000000");
    assert.equal(result.state.openPositions.length, 1);
    assert.equal(result.state.openPositions[0]?.entryPrice, "65032.5000000000");
    assert.ok(new Decimal(result.state.openPositions[0]?.quantity ?? 0).gt(0));
    assert.ok(new Decimal(result.state.equity).lt(100000));
    assert.ok(result.state.openPositions[0]?.mentorFlags.includes("good-discipline"));
  });

  it("rejects a position above the server 20 percent allocation limit", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const result = applyArenaExecutionActionV2(initial, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "20000.0000000001",
    }, context("operation-over-risk"));

    assert.deepEqual(result, { ok: false, error: "arena_risk_limit_exceeded" });
  });

  it("reserves limit-order cash and restores it exactly on cancellation", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const placed = success(applyArenaExecutionActionV2(initial, {
      type: "limit_buy",
      asset: "BTC",
      quoteAmount: "5000",
      limitPrice: "60000",
      stopLoss: "55000",
      takeProfit: "70000",
    }, context("operation-limit-place")));

    assert.equal(placed.eventType, "arena.limit_order_placed");
    assert.equal(placed.state.cashBalance, "95000.0000000000");
    assert.equal(placed.state.reservedBalance, "5000.0000000000");
    assert.equal(placed.state.pendingOrders.length, 1);

    const orderId = placed.state.pendingOrders[0]?.id ?? "";
    const cancelled = success(applyArenaExecutionActionV2(placed.state, {
      type: "cancel_order",
      orderId,
    }, context("operation-limit-cancel")));

    assert.equal(cancelled.state.cashBalance, "100000.0000000000");
    assert.equal(cancelled.state.reservedBalance, "0.0000000000");
    assert.equal(cancelled.state.pendingOrders.length, 0);
  });

  it("fills a pending limit order only after the server price reaches the limit", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const placed = success(applyArenaExecutionActionV2(initial, {
      type: "limit_buy",
      asset: "BTC",
      quoteAmount: "5000",
      limitPrice: "60000",
      stopLoss: "55000",
      takeProfit: "70000",
    }, context("operation-limit-place-2")));

    const lowerMarket: ArenaPriceSnapshot = {
      ...MARKET,
      prices: { ...MARKET.prices, BTC: "59900.0000000000" },
      observedAt: "2026-07-19T00:00:05.000Z",
    };
    const refreshed = success(applyArenaExecutionActionV2(placed.state, {
      type: "refresh_market",
    }, {
      ...context("operation-limit-fill", lowerMarket),
      now: "2026-07-19T00:00:05.000Z",
    }));

    assert.equal(refreshed.state.pendingOrders.length, 0);
    assert.equal(refreshed.state.openPositions.length, 1);
    assert.equal(refreshed.state.reservedBalance, "0.0000000000");
    assert.equal(refreshed.state.cashBalance, "95000.0000000000");
  });

  it("closes a position using the server price and records realized PnL", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const opened = success(applyArenaExecutionActionV2(initial, {
      type: "market_buy",
      asset: "ETH",
      quoteAmount: "10000",
      stopLoss: "3200",
      takeProfit: "4000",
    }, context("operation-open-eth")));
    const positionId = opened.state.openPositions[0]?.id ?? "";
    const higherMarket: ArenaPriceSnapshot = {
      ...MARKET,
      prices: { ...MARKET.prices, ETH: "3850.0000000000" },
      observedAt: "2026-07-19T00:05:00.000Z",
    };
    const closed = success(applyArenaExecutionActionV2(opened.state, {
      type: "close_position",
      positionId,
      reason: "manual",
    }, {
      ...context("operation-close-eth", higherMarket),
      now: "2026-07-19T00:05:00.000Z",
    }));

    assert.equal(closed.state.openPositions.length, 0);
    assert.equal(closed.state.closedTrades.length, 1);
    assert.ok(new Decimal(closed.state.closedTrades[0]?.realizedPnl ?? 0).gt(0));
    assert.ok(new Decimal(closed.state.cashBalance).gt(100000));
  });

  it("automatically executes stop-loss from a server market refresh", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const opened = success(applyArenaExecutionActionV2(initial, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "5000",
      stopLoss: "60000",
      takeProfit: "70000",
    }, context("operation-open-stop")));
    const lowerMarket: ArenaPriceSnapshot = {
      ...MARKET,
      prices: { ...MARKET.prices, BTC: "59000.0000000000" },
      observedAt: "2026-07-19T00:10:00.000Z",
    };
    const refreshed = success(applyArenaExecutionActionV2(opened.state, {
      type: "refresh_market",
    }, {
      ...context("operation-stop-hit", lowerMarket),
      now: "2026-07-19T00:10:00.000Z",
    }));

    assert.equal(refreshed.state.openPositions.length, 0);
    assert.equal(refreshed.state.closedTrades[0]?.closureReason, "stop-loss");
    assert.ok(new Decimal(refreshed.state.totalRealizedPnl).lt(0));
    assert.equal(refreshed.state.lastLossAt, "2026-07-19T00:10:00.000Z");
  });

  it("rejects legacy or malformed execution snapshots instead of silently resetting them", () => {
    assert.throws(
      () => normalizeArenaExecutionStateV2({ version: 1, balance: 10000 }, "100000"),
      /arena_execution_state_version_unsupported/,
    );
    assert.throws(
      () => normalizeArenaExecutionStateV2("browser-state", "100000"),
      /arena_execution_state_invalid/,
    );
  });

  it("computes equity from cash, reserved orders and net liquidation value", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const opened = success(applyArenaExecutionActionV2(initial, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "10000",
    }, context("operation-equity")));

    assert.equal(computeArenaExecutionEquity(opened.state, MARKET), opened.state.equity);
  });
});

describe("Arena price feed parser", () => {
  it("parses Binance and canonical configured-feed shapes as Decimal strings", () => {
    const binance = parseArenaMarketPricePayload([
      { symbol: "BTCUSDT", price: "65000.123456789012" },
      { symbol: "ETHUSDT", price: "3500.50" },
    ], "binance-test", "2026-07-19T00:00:00.000Z");
    assert.deepEqual(binance.prices, {
      BTC: "65000.1234567890",
      ETH: "3500.5000000000",
    });

    const configured = parseArenaMarketPricePayload({
      prices: { BTC: "64000", ETH: "3400" },
      observedAt: "2026-07-19T00:01:00.000Z",
    }, "configured-test");
    assert.equal(configured.observedAt, "2026-07-19T00:01:00.000Z");
  });

  it("rejects missing, zero and malformed prices", () => {
    assert.throws(() => parseArenaMarketPricePayload([{ symbol: "BTCUSDT", price: "65000" }]));
    assert.throws(() => parseArenaMarketPricePayload([
      { symbol: "BTCUSDT", price: "0" },
      { symbol: "ETHUSDT", price: "3500" },
    ]));
  });
});
