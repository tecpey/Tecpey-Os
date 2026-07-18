import {
  addLimitOrder,
  cancelLimitOrder,
  closePosition,
  computeNetEquity,
  createFreshArenaState,
  executeMarketBuy,
  processPriceTick,
  type Asset,
  type ClosureReason,
  type TradingArenaState,
} from "@/lib/trading-arena";

export type ArenaExecutionAction =
  | {
      type: "market_buy";
      asset: Asset;
      usdtAmount: number;
      marketPrice: number;
      stopLoss?: number;
      takeProfit?: number;
      preTradePlan?: string;
      emotionalState?: string;
    }
  | {
      type: "limit_order";
      asset: Asset;
      usdtAmount: number;
      limitPrice: number;
      stopLoss?: number;
      takeProfit?: number;
      preTradePlan?: string;
      emotionalState?: string;
    }
  | {
      type: "close_position";
      positionId: string;
      exitPrice: number;
      reason: ClosureReason;
    }
  | {
      type: "cancel_order";
      orderId: string;
    }
  | {
      type: "price_tick";
      prices: Record<Asset, number>;
    }
  | {
      type: "scenario_result";
      scenarioId: string;
      status: "passed" | "failed";
    };

export type ArenaExecutionResult =
  | { ok: true; state: TradingArenaState; eventType: string }
  | { ok: false; error: string };

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validAsset(value: unknown): value is Asset {
  return value === "BTC" || value === "ETH";
}

export function createAuthoritativeArenaState(initialBalance = 100_000): TradingArenaState {
  const fresh = createFreshArenaState();
  return {
    ...fresh,
    balance: initialBalance,
    initialBalance,
    lastActiveAt: Date.now(),
  };
}

export function normalizeArenaExecutionState(
  value: unknown,
  initialBalance = 100_000,
): TradingArenaState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createAuthoritativeArenaState(initialBalance);
  }

  const raw = value as Partial<TradingArenaState>;
  const fallback = createAuthoritativeArenaState(initialBalance);
  const balance = Math.max(0, finiteNumber(raw.balance, initialBalance));
  const persistedInitial = Math.max(1, finiteNumber(raw.initialBalance, initialBalance));

  const openPositions = Array.isArray(raw.openPositions)
    ? raw.openPositions.filter((position) =>
        position &&
        typeof position === "object" &&
        typeof position.id === "string" &&
        validAsset(position.asset) &&
        finiteNumber(position.entryPrice) > 0 &&
        finiteNumber(position.size) > 0,
      ).slice(0, 50)
    : [];

  const closedTrades = Array.isArray(raw.closedTrades)
    ? raw.closedTrades.filter((trade) =>
        trade &&
        typeof trade === "object" &&
        typeof trade.id === "string" &&
        validAsset(trade.asset) &&
        finiteNumber(trade.entryPrice) > 0 &&
        finiteNumber(trade.exitPrice) > 0,
      ).slice(0, 2_000)
    : [];

  const pendingOrders = Array.isArray(raw.pendingOrders)
    ? raw.pendingOrders.filter((order) =>
        order &&
        typeof order === "object" &&
        typeof order.id === "string" &&
        validAsset(order.asset) &&
        finiteNumber(order.limitPrice) > 0 &&
        finiteNumber(order.usdtValue) > 0,
      ).slice(0, 100)
    : [];

  const scenarioProgress = raw.scenarioProgress && typeof raw.scenarioProgress === "object"
    ? Object.fromEntries(
        Object.entries(raw.scenarioProgress)
          .filter(([, status]) => status === "idle" || status === "in-progress" || status === "passed" || status === "failed")
          .slice(0, 500),
      )
    : {};

  const holdings = raw.holdings && typeof raw.holdings === "object"
    ? {
        BTC: Math.max(0, finiteNumber(raw.holdings.BTC)),
        ETH: Math.max(0, finiteNumber(raw.holdings.ETH)),
      }
    : fallback.holdings;

  return {
    version: 1,
    balance,
    initialBalance: persistedInitial,
    holdings,
    openPositions,
    closedTrades,
    pendingOrders,
    totalRealizedPnl: finiteNumber(raw.totalRealizedPnl),
    totalFeesPaid: Math.max(0, finiteNumber(raw.totalFeesPaid)),
    scenarioProgress,
    lastTradeAt: raw.lastTradeAt === null ? null : finiteNumber(raw.lastTradeAt) || null,
    lastLossAt: raw.lastLossAt === null ? null : finiteNumber(raw.lastLossAt) || null,
    createdAt: finiteNumber(raw.createdAt, Date.now()),
    lastActiveAt: finiteNumber(raw.lastActiveAt, Date.now()),
  };
}

export function applyArenaExecutionAction(
  current: TradingArenaState,
  action: ArenaExecutionAction,
): ArenaExecutionResult {
  const state = normalizeArenaExecutionState(current, current.initialBalance);

  if (action.type === "market_buy") {
    const result = executeMarketBuy(state, action.asset, action.usdtAmount, action.marketPrice, {
      stopLoss: action.stopLoss,
      takeProfit: action.takeProfit,
    });
    return result.ok
      ? { ok: true, state: { ...result.state, lastActiveAt: Date.now() }, eventType: "market_buy" }
      : result;
  }

  if (action.type === "limit_order") {
    const result = addLimitOrder(state, action.asset, action.usdtAmount, action.limitPrice, {
      stopLoss: action.stopLoss,
      takeProfit: action.takeProfit,
    });
    return result.ok
      ? { ok: true, state: { ...result.state, lastActiveAt: Date.now() }, eventType: "limit_order" }
      : result;
  }

  if (action.type === "close_position") {
    const result = closePosition(state, action.positionId, action.exitPrice, action.reason);
    return result
      ? { ok: true, state: { ...result.state, lastActiveAt: Date.now() }, eventType: "position_closed" }
      : { ok: false, error: "position_not_found" };
  }

  if (action.type === "cancel_order") {
    const next = cancelLimitOrder(state, action.orderId);
    return next === state
      ? { ok: false, error: "order_not_found" }
      : { ok: true, state: { ...next, lastActiveAt: Date.now() }, eventType: "limit_order_cancelled" };
  }

  if (action.type === "price_tick") {
    const next = processPriceTick(state, action.prices);
    return {
      ok: true,
      state: { ...next, lastActiveAt: Date.now() },
      eventType: "price_tick_processed",
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      scenarioProgress: {
        ...state.scenarioProgress,
        [action.scenarioId]: action.status,
      },
      lastActiveAt: Date.now(),
    },
    eventType: "scenario_result",
  };
}

export function executionEquity(
  state: TradingArenaState,
  prices?: Partial<Record<Asset, number>>,
): number {
  if (!prices?.BTC || !prices?.ETH) return state.balance;
  return Math.max(0, computeNetEquity(state, { BTC: prices.BTC, ETH: prices.ETH }));
}
