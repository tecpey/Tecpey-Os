import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import {
  applyArenaExecutionActionV2,
  computeArenaExecutionEquity,
  computeArenaPortfolioStopRisk,
  computeArenaPortfolioRiskTelemetry,
  computeArenaDrawdownRate,
  computeArenaMentorRiskSignals,
  createArenaExecutionStateV2,
  normalizeArenaExecutionStateV2,
  type ArenaExecutionContext,
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

  it("separates allocation from stop-defined capital risk", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const accepted = applyArenaExecutionActionV2(initial, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "10000",
      stopLoss: "60000",
    }, context("operation-stop-risk-ok"));
    assert.equal(accepted.ok, true);

    const rejected = applyArenaExecutionActionV2(initial, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "20000",
      stopLoss: "50000",
    }, context("operation-stop-risk-too-high"));
    assert.deepEqual(rejected, { ok: false, error: "arena_stop_risk_limit_exceeded" });
  });

  it("applies the same stop-defined risk authority to pending limit orders", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const rejected = applyArenaExecutionActionV2(initial, {
      type: "limit_buy",
      asset: "BTC",
      quoteAmount: "20000",
      limitPrice: "60000",
      stopLoss: "50000",
    }, context("operation-limit-stop-risk"));
    assert.deepEqual(rejected, { ok: false, error: "arena_stop_risk_limit_exceeded" });
  });

  it("caps aggregate planned stop risk across simultaneous positions", () => {
    let state = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    for (let index = 0; index < 3; index += 1) {
      const opened = success(applyArenaExecutionActionV2(state, {
        type: "market_buy",
        asset: "BTC",
        quoteAmount: "10000",
        stopLoss: "52150",
      }, { ...context(`operation-portfolio-risk-${index}`), slippageBps: "0" }));
      state = opened.state;
    }
    assert.ok(new Decimal(computeArenaPortfolioStopRisk(state)).gt("5900"));
    assert.ok(new Decimal(computeArenaPortfolioStopRisk(state)).lte("6000"));
    const rejected = applyArenaExecutionActionV2(state, {
      type: "market_buy",
      asset: "ETH",
      quoteAmount: "10000",
      stopLoss: "2820",
    }, { ...context("operation-portfolio-risk-reject"), slippageBps: "0" });
    assert.deepEqual(rejected, { ok: false, error: "arena_portfolio_stop_risk_limit_exceeded" });
  });

  it("includes pending-order stop risk in the aggregate portfolio budget", () => {
    let state = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    for (let index = 0; index < 3; index += 1) {
      const placed = success(applyArenaExecutionActionV2(state, {
        type: "limit_buy",
        asset: "BTC",
        quoteAmount: "10000",
        limitPrice: "64000",
        stopLoss: "51520",
      }, context(`operation-pending-risk-${index}`)));
      state = placed.state;
    }
    const rejected = applyArenaExecutionActionV2(state, {
      type: "limit_buy",
      asset: "ETH",
      quoteAmount: "10000",
      limitPrice: "3400",
      stopLoss: "2750",
    }, context("operation-pending-risk-reject"));
    assert.deepEqual(rejected, { ok: false, error: "arena_portfolio_stop_risk_limit_exceeded" });
  });

  it("never reports no-stop exposure as zero defined portfolio risk", () => {
    let state = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    state = success(applyArenaExecutionActionV2(state, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "5000",
    }, context("operation-unprotected-position"))).state;
    state = success(applyArenaExecutionActionV2(state, {
      type: "limit_buy",
      asset: "ETH",
      quoteAmount: "3000",
      limitPrice: "3400",
    }, context("operation-unprotected-order"))).state;

    const telemetry = computeArenaPortfolioRiskTelemetry(state);
    assert.equal(telemetry.definedStopRisk, "0.0000000000");
    assert.equal(telemetry.unboundedExposure, "8000.0000000000");
    assert.equal(telemetry.unprotectedPositions, 1);
    assert.equal(telemetry.unprotectedPendingOrders, 1);
    assert.equal(telemetry.fullyStopDefined, false);
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

  it("updates daily net PnL on a profitable close without increasing gross loss", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const opened = success(applyArenaExecutionActionV2(initial, {
      type: "market_buy", asset: "ETH", quoteAmount: "10000", stopLoss: "3200",
    }, context("operation-daily-profit-open")));
    const positionId = opened.state.openPositions[0]?.id ?? "";
    const higherMarket: ArenaPriceSnapshot = {
      ...MARKET, prices: { ...MARKET.prices, ETH: "3850.0000000000" }, observedAt: "2026-07-19T00:05:00.000Z",
    };
    const closed = success(applyArenaExecutionActionV2(opened.state, {
      type: "close_position", positionId, reason: "manual",
    }, { ...context("operation-daily-profit-close", higherMarket), now: "2026-07-19T00:05:00.000Z" }));
    assert.ok(new Decimal(closed.state.dailyLoss.realizedPnl).gt(0));
    assert.equal(closed.state.dailyLoss.realizedLoss, "0.0000000000");
    assert.equal(closed.state.dailyLoss.complete, true);
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

  it("updates daily net PnL and gross loss together on a losing close", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const opened = success(applyArenaExecutionActionV2(initial, {
      type: "market_buy", asset: "BTC", quoteAmount: "5000", stopLoss: "60000",
    }, context("operation-daily-loss-open")));
    const lowerMarket: ArenaPriceSnapshot = {
      ...MARKET, prices: { ...MARKET.prices, BTC: "59000.0000000000" }, observedAt: "2026-07-19T00:10:00.000Z",
    };
    const refreshed = success(applyArenaExecutionActionV2(opened.state, {
      type: "refresh_market",
    }, { ...context("operation-daily-loss-close", lowerMarket), now: "2026-07-19T00:10:00.000Z" }));
    assert.ok(new Decimal(refreshed.state.dailyLoss.realizedPnl).lt(0));
    assert.ok(new Decimal(refreshed.state.dailyLoss.realizedLoss).gt(0));
    assert.equal(new Decimal(refreshed.state.dailyLoss.realizedLoss).eq(new Decimal(refreshed.state.dailyLoss.realizedPnl).abs()), true);
  });

  it("tracks peak equity and opens a drawdown circuit without trapping risk-reducing actions", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const stressed = {
      ...initial,
      cashBalance: "89000.0000000000",
      equity: "89000.0000000000",
      peakEquity: "100000.0000000000",
    };
    assert.equal(computeArenaDrawdownRate(stressed), "0.11000000");

    const blocked = applyArenaExecutionActionV2(stressed, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "1000",
    }, context("operation-drawdown-block"));
    assert.deepEqual(blocked, { ok: false, error: "arena_drawdown_circuit_open" });

    const refreshed = success(applyArenaExecutionActionV2(stressed, {
      type: "refresh_market",
    }, context("operation-drawdown-refresh")));
    assert.equal(refreshed.eventType, "arena.market_refreshed");
  });

  it("keeps incomplete daily accounting informational and never fabricates a net-loss signal", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const legacy = normalizeArenaExecutionStateV2({
      ...initial,
      dailyLoss: { day: "2026-07-19", realizedLoss: "2500.0000000000", complete: true },
    }, "100000");
    const signals = computeArenaMentorRiskSignals(legacy);
    assert.equal(signals.some((signal) => signal.code === "daily-accounting-incomplete"), true);
    assert.equal(signals.some((signal) => signal.code === "daily-net-loss"), false);
  });

  it("derives daily net-loss evidence only from a complete signed ledger", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const observed = {
      ...initial,
      dailyLoss: { day: "2026-07-19", realizedLoss: "2500.0000000000", realizedPnl: "-1250.0000000000", complete: true },
    };
    const signal = computeArenaMentorRiskSignals(observed).find((item) => item.code === "daily-net-loss");
    assert.equal(signal?.severity, "warning");
    assert.deepEqual(signal?.evidence, {
      day: "2026-07-19",
      realizedPnl: "-1250.0000000000",
      grossRealizedLoss: "2500.0000000000",
    });
  });

  it("escalates drawdown evidence to critical only at the governed circuit boundary", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const warning = computeArenaMentorRiskSignals({ ...initial, equity: "95000.0000000000", peakEquity: "100000.0000000000" })
      .find((signal) => signal.code === "drawdown-pressure");
    const critical = computeArenaMentorRiskSignals({ ...initial, equity: "90000.0000000000", peakEquity: "100000.0000000000" })
      .find((signal) => signal.code === "drawdown-pressure");
    assert.equal(warning?.severity, "warning");
    assert.equal(critical?.severity, "critical");
  });

  it("surfaces unprotected exposure without converting it into an invented hard gate", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const opened = success(applyArenaExecutionActionV2(initial, {
      type: "market_buy", asset: "BTC", quoteAmount: "1000",
    }, context("operation-mentor-unprotected")));
    const signal = computeArenaMentorRiskSignals(opened.state).find((item) => item.code === "unprotected-exposure");
    assert.equal(signal?.severity, "warning");
    assert.equal(signal?.evidence.unprotectedPositions, 1);
    assert.ok(new Decimal(String(signal?.evidence.unboundedExposure ?? 0)).gt(0));
  });

  it("persists daily realized loss as telemetry without inventing an ungoverned hard gate", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const observed = {
      ...initial,
      dailyLoss: { day: "2026-07-19", realizedLoss: "3000.0000000000", realizedPnl: "-3000.0000000000", complete: true },
      closedTrades: [],
    };
    const accepted = applyArenaExecutionActionV2(observed, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "1000",
      stopLoss: "60000",
    }, context("operation-daily-loss-telemetry"));
    assert.equal(accepted.ok, true);
  });

  it("tracks signed daily realized PnL independently from gross realized loss", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    assert.equal(initial.dailyLoss.realizedPnl, "0.0000000000");
    assert.equal(initial.dailyLoss.realizedLoss, "0.0000000000");
    assert.equal(initial.dailyLoss.complete, true);
  });

  it("preserves incomplete provenance when a legacy same-day state records a new close", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const legacy = normalizeArenaExecutionStateV2({
      ...initial,
      dailyLoss: undefined,
      updatedAt: "2026-07-19T00:01:00.000Z",
    }, "100000");
    const opened = success(applyArenaExecutionActionV2(legacy, {
      type: "market_buy", asset: "ETH", quoteAmount: "10000", stopLoss: "3200",
    }, { ...context("operation-legacy-open"), now: "2026-07-19T00:02:00.000Z" }));
    const positionId = opened.state.openPositions[0]?.id ?? "";
    const higherMarket: ArenaPriceSnapshot = {
      ...MARKET, prices: { ...MARKET.prices, ETH: "3850.0000000000" }, observedAt: "2026-07-19T00:05:00.000Z",
    };
    const closed = success(applyArenaExecutionActionV2(opened.state, {
      type: "close_position", positionId, reason: "manual",
    }, { ...context("operation-legacy-close", higherMarket), now: "2026-07-19T00:05:00.000Z" }));
    assert.equal(closed.state.dailyLoss.complete, false);
    assert.ok(new Decimal(closed.state.dailyLoss.realizedPnl).gt(0));
  });

  it("starts a complete zero daily ledger after an incomplete legacy state crosses the UTC boundary", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T23:59:00.000Z");
    const legacy = normalizeArenaExecutionStateV2({
      ...initial,
      dailyLoss: undefined,
      updatedAt: "2026-07-19T23:59:00.000Z",
    }, "100000");
    const nextDayMarket: ArenaPriceSnapshot = { ...MARKET, observedAt: "2026-07-20T00:00:01.000Z" };
    const refreshed = success(applyArenaExecutionActionV2(legacy, { type: "refresh_market" }, {
      ...context("operation-legacy-rollover", nextDayMarket), now: "2026-07-20T00:00:01.000Z",
    }));
    assert.deepEqual(refreshed.state.dailyLoss, {
      day: "2026-07-20",
      realizedLoss: "0.0000000000",
      realizedPnl: "0.0000000000",
      complete: true,
    });
  });

  it("does not invent a complete zero-loss authority for a legacy same-day snapshot", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const legacy = normalizeArenaExecutionStateV2({
      ...initial,
      dailyLoss: undefined,
      updatedAt: "2026-07-19T12:00:00.000Z",
    }, "100000");
    assert.deepEqual(legacy.dailyLoss, {
      day: "2026-07-19",
      realizedLoss: "0.0000000000",
      realizedPnl: "0.0000000000",
      complete: false,
    });
    const accepted = applyArenaExecutionActionV2(legacy, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "1000",
      stopLoss: "60000",
    }, context("operation-legacy-incomplete-daily-loss"));
    assert.equal(accepted.ok, true);
  });

  it("rolls the UTC daily-loss authority at the deterministic day boundary", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T23:59:59.000Z");
    const previousDayLimited = {
      ...initial,
      dailyLoss: { day: "2026-07-19", realizedLoss: "3000.0000000000", realizedPnl: "-3000.0000000000", complete: true },
    };
    const nextDay = {
      ...context("operation-next-day"),
      now: "2026-07-20T00:00:01.000Z",
      market: { ...MARKET, observedAt: "2026-07-20T00:00:00.000Z" },
    };
    const accepted = applyArenaExecutionActionV2(previousDayLimited, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "1000",
      stopLoss: "60000",
    }, nextDay);
    assert.equal(accepted.ok, true);
  });

  it("never lowers peak equity after a later market drawdown", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    const opened = success(applyArenaExecutionActionV2(initial, {
      type: "market_buy",
      asset: "BTC",
      quoteAmount: "10000",
      stopLoss: "60000",
    }, context("operation-peak-open")));
    assert.equal(opened.state.peakEquity, "100000.0000000000");
    assert.ok(new Decimal(opened.state.equity).lt(opened.state.peakEquity));
    assert.ok(new Decimal(computeArenaDrawdownRate(opened.state)).gt(0));
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
