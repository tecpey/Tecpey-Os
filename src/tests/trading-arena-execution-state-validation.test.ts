import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyArenaExecutionActionV2,
  createArenaExecutionStateV2,
  type ArenaExecutionStateV2,
  type ArenaPriceSnapshot,
} from "@/lib/trading-arena-execution-v2";
import { validateArenaExecutionStateV2 } from "@/lib/trading-arena-execution-state-validation";

const MARKET: ArenaPriceSnapshot = {
  prices: { BTC: "65000.0000000000", ETH: "3500.0000000000" },
  source: "test_feed",
  observedAt: "2026-07-19T00:00:00.000Z",
};

function openedState(): ArenaExecutionStateV2 {
  const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
  const result = applyArenaExecutionActionV2(initial, {
    type: "market_buy",
    asset: "BTC",
    quoteAmount: "10000",
    stopLoss: "60000",
    takeProfit: "70000",
    preTradePlan: "A bounded test plan with invalidation.",
    emotionalState: "calm",
  }, {
    operationId: "state-validation-open",
    now: "2026-07-19T00:00:01.000Z",
    market: MARKET,
    slippageBps: "5",
  });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function closedState(): ArenaExecutionStateV2 {
  const opened = openedState();
  const positionId = opened.openPositions[0]?.id;
  if (!positionId) throw new Error("test_position_missing");
  const result = applyArenaExecutionActionV2(opened, {
    type: "close_position",
    positionId,
    reason: "manual",
  }, {
    operationId: "state-validation-close",
    now: "2026-07-19T00:05:00.000Z",
    market: {
      ...MARKET,
      prices: { ...MARKET.prices, BTC: "67000.0000000000" },
      observedAt: "2026-07-19T00:05:00.000Z",
    },
    slippageBps: "5",
  });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Arena persisted-state validation", () => {
  it("accepts states created by the authoritative aggregate", () => {
    const initial = createArenaExecutionStateV2("100000", "2026-07-19T00:00:00.000Z");
    assert.deepEqual(validateArenaExecutionStateV2(initial), initial);
    const opened = openedState();
    assert.deepEqual(validateArenaExecutionStateV2(opened), opened);
    const closed = closedState();
    assert.deepEqual(validateArenaExecutionStateV2(closed), closed);
  });

  it("rejects a malformed position instead of silently dropping it", () => {
    const corrupted = copy(openedState()) as unknown as Record<string, unknown>;
    const positions = corrupted.openPositions as Array<Record<string, unknown>>;
    positions[0].quantity = "not-a-decimal";
    assert.throws(() => validateArenaExecutionStateV2(corrupted), /arena_execution_state_invalid/);
  });

  it("rejects holdings that do not equal open-position quantities", () => {
    const corrupted = copy(openedState());
    corrupted.holdings.BTC = "999.000000000000000000";
    assert.throws(() => validateArenaExecutionStateV2(corrupted), /arena_execution_state_invalid/);
  });

  it("rejects a forged opening fee", () => {
    const corrupted = copy(openedState());
    const position = corrupted.openPositions[0];
    if (!position) throw new Error("test_position_missing");
    position.openingFee = "0.0000000000";
    assert.throws(() => validateArenaExecutionStateV2(corrupted), /arena_execution_state_invalid/);
  });

  it("rejects an equity value inconsistent with liquidation value", () => {
    const corrupted = copy(openedState());
    corrupted.equity = "100000.0000000000";
    assert.throws(() => validateArenaExecutionStateV2(corrupted), /arena_execution_state_invalid/);
  });

  it("rejects forged realized PnL and trade fees", () => {
    const corruptedPnl = copy(closedState());
    const trade = corruptedPnl.closedTrades[0];
    if (!trade) throw new Error("test_trade_missing");
    trade.realizedPnl = "999999.0000000000";
    assert.throws(() => validateArenaExecutionStateV2(corruptedPnl), /arena_execution_state_invalid/);

    const corruptedFee = copy(closedState());
    const secondTrade = corruptedFee.closedTrades[0];
    if (!secondTrade) throw new Error("test_trade_missing");
    secondTrade.totalFee = "0.0000000000";
    assert.throws(() => validateArenaExecutionStateV2(corruptedFee), /arena_execution_state_invalid/);
  });
});
