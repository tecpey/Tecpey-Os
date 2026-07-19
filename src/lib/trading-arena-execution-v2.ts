import Decimal from "decimal.js";

export const ARENA_EXECUTION_VERSION = 2 as const;
export const ARENA_EXECUTION_FEE_RATE = "0.001";
export const ARENA_EXECUTION_MIN_TRADE = "10";
export const ARENA_EXECUTION_MAX_RISK_RATE = "0.20";
export const ARENA_EXECUTION_WARNING_RISK_RATE = "0.05";
export const ARENA_EXECUTION_MAX_OPEN_POSITIONS = 5;
export const ARENA_EXECUTION_MAX_PENDING_ORDERS = 20;
export const ARENA_EXECUTION_MAX_CLOSED_TRADES_IN_SNAPSHOT = 5_000;

export type ArenaExecutionAsset = "BTC" | "ETH";
export type ArenaExecutionClosureReason = "manual" | "stop-loss" | "take-profit";
export type ArenaExecutionMentorFlag =
  | "no-stop-loss"
  | "over-risk"
  | "impulse-entry"
  | "revenge-trade"
  | "fomo-entry"
  | "good-discipline"
  | "proper-sizing"
  | "target-hit";

export type ArenaPriceSnapshot = {
  prices: Record<ArenaExecutionAsset, string>;
  source: string;
  observedAt: string;
};

export type ArenaOpenPositionV2 = {
  id: string;
  asset: ArenaExecutionAsset;
  entryPrice: string;
  quantity: string;
  quoteCommitted: string;
  openingFee: string;
  stopLoss: string | null;
  takeProfit: string | null;
  openedAt: string;
  preTradePlan: string;
  emotionalState: string;
  mentorFlags: ArenaExecutionMentorFlag[];
};

export type ArenaPendingOrderV2 = {
  id: string;
  asset: ArenaExecutionAsset;
  limitPrice: string;
  quoteReserved: string;
  stopLoss: string | null;
  takeProfit: string | null;
  createdAt: string;
  preTradePlan: string;
  emotionalState: string;
};

export type ArenaClosedTradeV2 = {
  id: string;
  positionId: string;
  asset: ArenaExecutionAsset;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  quoteCommitted: string;
  totalFee: string;
  realizedPnl: string;
  realizedPnlRate: string;
  openedAt: string;
  closedAt: string;
  closureReason: ArenaExecutionClosureReason;
  mentorFlags: ArenaExecutionMentorFlag[];
};

export type ArenaExecutionStateV2 = {
  version: typeof ARENA_EXECUTION_VERSION;
  initialBalance: string;
  cashBalance: string;
  reservedBalance: string;
  equity: string;
  holdings: Record<ArenaExecutionAsset, string>;
  openPositions: ArenaOpenPositionV2[];
  pendingOrders: ArenaPendingOrderV2[];
  closedTrades: ArenaClosedTradeV2[];
  totalRealizedPnl: string;
  totalFeesPaid: string;
  lastTradeAt: string | null;
  lastLossAt: string | null;
  lastMarket: ArenaPriceSnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export type ArenaExecutionActionV2 =
  | {
      type: "market_buy";
      asset: ArenaExecutionAsset;
      quoteAmount: string;
      stopLoss?: string;
      takeProfit?: string;
      preTradePlan?: string;
      emotionalState?: string;
    }
  | {
      type: "limit_buy";
      asset: ArenaExecutionAsset;
      quoteAmount: string;
      limitPrice: string;
      stopLoss?: string;
      takeProfit?: string;
      preTradePlan?: string;
      emotionalState?: string;
    }
  | { type: "close_position"; positionId: string; reason?: "manual" }
  | { type: "cancel_order"; orderId: string }
  | { type: "refresh_market" };

export type ArenaExecutionContext = {
  now: string;
  operationId: string;
  market: ArenaPriceSnapshot;
  slippageBps?: string;
};

export type ArenaExecutionSuccess = {
  ok: true;
  state: ArenaExecutionStateV2;
  eventType: string;
  event: Record<string, unknown>;
};

export type ArenaExecutionResult =
  | ArenaExecutionSuccess
  | { ok: false; error: string };

const MONEY_DP = 10;
const QUANTITY_DP = 18;

function decimal(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

function fixed(value: Decimal.Value, places = MONEY_DP): string {
  return decimal(value).toDecimalPlaces(places, Decimal.ROUND_DOWN).toFixed(places);
}

function positive(value: string): Decimal | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const parsed = decimal(value);
  return parsed.isFinite() && parsed.gt(0) ? parsed : null;
}

function nonNegative(value: unknown, places = MONEY_DP): string | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const parsed = decimal(value);
  return parsed.isFinite() && parsed.gte(0) ? fixed(parsed, places) : null;
}

function iso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function validAsset(value: unknown): value is ArenaExecutionAsset {
  return value === "BTC" || value === "ETH";
}

function normalizePriceSnapshot(value: unknown): ArenaPriceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ArenaPriceSnapshot>;
  const BTC = nonNegative(raw.prices?.BTC);
  const ETH = nonNegative(raw.prices?.ETH);
  const observedAt = iso(raw.observedAt);
  if (!BTC || !ETH || decimal(BTC).lte(0) || decimal(ETH).lte(0) || !observedAt) return null;
  if (typeof raw.source !== "string" || raw.source.length < 1 || raw.source.length > 120) return null;
  return { prices: { BTC, ETH }, source: raw.source, observedAt };
}

function mentorFlags(input: {
  quoteAmount: Decimal;
  equityBefore: Decimal;
  stopLoss: string | null;
  preTradePlan: string;
  emotionalState: string;
  lastTradeAt: string | null;
  lastLossAt: string | null;
  now: string;
}): ArenaExecutionMentorFlag[] {
  const flags: ArenaExecutionMentorFlag[] = [];
  const riskRate = input.equityBefore.gt(0)
    ? input.quoteAmount.div(input.equityBefore)
    : decimal(1);
  const now = Date.parse(input.now);
  const lastTradeAt = input.lastTradeAt ? Date.parse(input.lastTradeAt) : NaN;
  const lastLossAt = input.lastLossAt ? Date.parse(input.lastLossAt) : NaN;
  const behavioralText = `${input.preTradePlan} ${input.emotionalState}`.toLowerCase();

  if (!input.stopLoss) flags.push("no-stop-loss");
  if (riskRate.gt(ARENA_EXECUTION_WARNING_RISK_RATE)) flags.push("over-risk");
  if (Number.isFinite(lastTradeAt) && now - lastTradeAt < 60_000) flags.push("impulse-entry");
  if (Number.isFinite(lastLossAt) && now - lastLossAt < 300_000) flags.push("revenge-trade");
  if (/fomo|fear of missing|فومو|از دست دادن فرصت/.test(behavioralText)) flags.push("fomo-entry");
  if (input.stopLoss) flags.push("good-discipline");
  if (riskRate.lte("0.02")) flags.push("proper-sizing");
  return [...new Set(flags)];
}

function slippageRate(context: ArenaExecutionContext): Decimal {
  const bps = positive(context.slippageBps ?? "5") ?? decimal(5);
  if (bps.gt(100)) return decimal("0.01");
  return bps.div(10_000);
}

function buyFillPrice(marketPrice: string, context: ArenaExecutionContext): Decimal {
  return decimal(marketPrice).mul(decimal(1).plus(slippageRate(context)));
}

function sellFillPrice(marketPrice: string, context: ArenaExecutionContext): Decimal {
  return decimal(marketPrice).mul(decimal(1).minus(slippageRate(context)));
}

function sum<T>(items: T[], mapper: (item: T) => Decimal): Decimal {
  return items.reduce((total, item) => total.plus(mapper(item)), decimal(0));
}

function computeReserved(orders: ArenaPendingOrderV2[]): Decimal {
  return sum(orders, (order) => decimal(order.quoteReserved));
}

function computeHoldings(positions: ArenaOpenPositionV2[]): Record<ArenaExecutionAsset, string> {
  return {
    BTC: fixed(sum(positions.filter((item) => item.asset === "BTC"), (item) => decimal(item.quantity)), QUANTITY_DP),
    ETH: fixed(sum(positions.filter((item) => item.asset === "ETH"), (item) => decimal(item.quantity)), QUANTITY_DP),
  };
}

export function computeArenaExecutionEquity(
  state: Pick<ArenaExecutionStateV2, "cashBalance" | "pendingOrders" | "openPositions">,
  market: ArenaPriceSnapshot,
): string {
  const exitFeeRate = decimal(ARENA_EXECUTION_FEE_RATE);
  const openValue = sum(state.openPositions, (position) =>
    decimal(position.quantity)
      .mul(market.prices[position.asset])
      .mul(decimal(1).minus(exitFeeRate)),
  );
  return fixed(decimal(state.cashBalance).plus(computeReserved(state.pendingOrders)).plus(openValue));
}

export function createArenaExecutionStateV2(
  initialBalance: string,
  now = new Date().toISOString(),
): ArenaExecutionStateV2 {
  const normalized = nonNegative(initialBalance);
  if (!normalized || decimal(normalized).lte(0)) throw new Error("arena_initial_balance_invalid");
  const timestamp = iso(now);
  if (!timestamp) throw new Error("arena_timestamp_invalid");

  return {
    version: ARENA_EXECUTION_VERSION,
    initialBalance: normalized,
    cashBalance: normalized,
    reservedBalance: fixed(0),
    equity: normalized,
    holdings: { BTC: fixed(0, QUANTITY_DP), ETH: fixed(0, QUANTITY_DP) },
    openPositions: [],
    pendingOrders: [],
    closedTrades: [],
    totalRealizedPnl: fixed(0),
    totalFeesPaid: fixed(0),
    lastTradeAt: null,
    lastLossAt: null,
    lastMarket: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeArenaExecutionStateV2(
  value: unknown,
  initialBalance: string,
): ArenaExecutionStateV2 {
  if (!value || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)) {
    return createArenaExecutionStateV2(initialBalance);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("arena_execution_state_invalid");
  }

  const raw = value as Partial<ArenaExecutionStateV2>;
  if (raw.version !== ARENA_EXECUTION_VERSION) throw new Error("arena_execution_state_version_unsupported");
  const normalizedInitial = nonNegative(raw.initialBalance);
  const cashBalance = nonNegative(raw.cashBalance);
  const totalRealizedPnl = typeof raw.totalRealizedPnl === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw.totalRealizedPnl)
    ? fixed(raw.totalRealizedPnl)
    : null;
  const totalFeesPaid = nonNegative(raw.totalFeesPaid);
  const createdAt = iso(raw.createdAt);
  const updatedAt = iso(raw.updatedAt);
  if (!normalizedInitial || !cashBalance || totalRealizedPnl === null || !totalFeesPaid || !createdAt || !updatedAt) {
    throw new Error("arena_execution_state_invalid");
  }

  const openPositions = Array.isArray(raw.openPositions)
    ? raw.openPositions.filter((item): item is ArenaOpenPositionV2 =>
        Boolean(item) &&
        typeof item.id === "string" && item.id.length <= 160 &&
        validAsset(item.asset) &&
        Boolean(positive(item.entryPrice)) &&
        Boolean(positive(item.quantity)) &&
        Boolean(positive(item.quoteCommitted)) &&
        Boolean(nonNegative(item.openingFee)) &&
        Boolean(iso(item.openedAt)) &&
        typeof item.preTradePlan === "string" && item.preTradePlan.length <= 1_500 &&
        typeof item.emotionalState === "string" && item.emotionalState.length <= 120 &&
        Array.isArray(item.mentorFlags),
      ).slice(0, 100)
    : [];

  const pendingOrders = Array.isArray(raw.pendingOrders)
    ? raw.pendingOrders.filter((item): item is ArenaPendingOrderV2 =>
        Boolean(item) &&
        typeof item.id === "string" && item.id.length <= 160 &&
        validAsset(item.asset) &&
        Boolean(positive(item.limitPrice)) &&
        Boolean(positive(item.quoteReserved)) &&
        Boolean(iso(item.createdAt)) &&
        typeof item.preTradePlan === "string" && item.preTradePlan.length <= 1_500 &&
        typeof item.emotionalState === "string" && item.emotionalState.length <= 120,
      ).slice(0, 200)
    : [];

  const closedTrades = Array.isArray(raw.closedTrades)
    ? raw.closedTrades.filter((item): item is ArenaClosedTradeV2 =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.positionId === "string" &&
        validAsset(item.asset) &&
        Boolean(positive(item.entryPrice)) &&
        Boolean(positive(item.exitPrice)) &&
        Boolean(positive(item.quantity)) &&
        Boolean(positive(item.quoteCommitted)) &&
        typeof item.realizedPnl === "string" &&
        Boolean(iso(item.openedAt)) && Boolean(iso(item.closedAt)),
      ).slice(0, ARENA_EXECUTION_MAX_CLOSED_TRADES_IN_SNAPSHOT)
    : [];

  const lastMarket = raw.lastMarket === null ? null : normalizePriceSnapshot(raw.lastMarket);
  if (raw.lastMarket !== null && !lastMarket) throw new Error("arena_execution_market_invalid");

  const state: ArenaExecutionStateV2 = {
    version: ARENA_EXECUTION_VERSION,
    initialBalance: normalizedInitial,
    cashBalance,
    reservedBalance: fixed(computeReserved(pendingOrders)),
    equity: fixed(raw.equity ?? cashBalance),
    holdings: computeHoldings(openPositions),
    openPositions,
    pendingOrders,
    closedTrades,
    totalRealizedPnl,
    totalFeesPaid,
    lastTradeAt: raw.lastTradeAt === null ? null : iso(raw.lastTradeAt),
    lastLossAt: raw.lastLossAt === null ? null : iso(raw.lastLossAt),
    lastMarket,
    createdAt,
    updatedAt,
  };
  if (lastMarket) state.equity = computeArenaExecutionEquity(state, lastMarket);
  return state;
}

function validateProtectivePrices(
  referencePrice: Decimal,
  stopLoss?: string,
  takeProfit?: string,
): { stopLoss: string | null; takeProfit: string | null } | null {
  const stop = stopLoss === undefined || stopLoss === "" ? null : positive(stopLoss);
  const take = takeProfit === undefined || takeProfit === "" ? null : positive(takeProfit);
  if ((stopLoss && !stop) || (takeProfit && !take)) return null;
  if (stop && stop.gte(referencePrice)) return null;
  if (take && take.lte(referencePrice)) return null;
  return {
    stopLoss: stop ? fixed(stop) : null,
    takeProfit: take ? fixed(take) : null,
  };
}

function createPosition(input: {
  state: ArenaExecutionStateV2;
  asset: ArenaExecutionAsset;
  quoteAmount: Decimal;
  fillPrice: Decimal;
  stopLoss?: string;
  takeProfit?: string;
  preTradePlan?: string;
  emotionalState?: string;
  context: ArenaExecutionContext;
  id: string;
}): ArenaOpenPositionV2 | null {
  const protection = validateProtectivePrices(input.fillPrice, input.stopLoss, input.takeProfit);
  if (!protection) return null;
  const openingFee = input.quoteAmount.mul(ARENA_EXECUTION_FEE_RATE);
  const netQuote = input.quoteAmount.minus(openingFee);
  if (netQuote.lte(0)) return null;
  const equityBefore = input.state.lastMarket
    ? decimal(computeArenaExecutionEquity(input.state, input.state.lastMarket))
    : decimal(input.state.equity);
  const plan = (input.preTradePlan ?? "").slice(0, 1_500);
  const emotion = (input.emotionalState ?? "not-recorded").slice(0, 120);

  return {
    id: input.id,
    asset: input.asset,
    entryPrice: fixed(input.fillPrice),
    quantity: fixed(netQuote.div(input.fillPrice), QUANTITY_DP),
    quoteCommitted: fixed(input.quoteAmount),
    openingFee: fixed(openingFee),
    stopLoss: protection.stopLoss,
    takeProfit: protection.takeProfit,
    openedAt: input.context.now,
    preTradePlan: plan,
    emotionalState: emotion,
    mentorFlags: mentorFlags({
      quoteAmount: input.quoteAmount,
      equityBefore,
      stopLoss: protection.stopLoss,
      preTradePlan: plan,
      emotionalState: emotion,
      lastTradeAt: input.state.lastTradeAt,
      lastLossAt: input.state.lastLossAt,
      now: input.context.now,
    }),
  };
}

function closeOnePosition(
  state: ArenaExecutionStateV2,
  position: ArenaOpenPositionV2,
  reason: ArenaExecutionClosureReason,
  context: ArenaExecutionContext,
  id: string,
): { state: ArenaExecutionStateV2; trade: ArenaClosedTradeV2 } {
  const exitPrice = sellFillPrice(context.market.prices[position.asset], context);
  const grossProceeds = decimal(position.quantity).mul(exitPrice);
  const closingFee = grossProceeds.mul(ARENA_EXECUTION_FEE_RATE);
  const netProceeds = grossProceeds.minus(closingFee);
  const pnl = netProceeds.minus(position.quoteCommitted);
  const pnlRate = decimal(position.quoteCommitted).gt(0)
    ? pnl.div(position.quoteCommitted)
    : decimal(0);
  const flags = [...position.mentorFlags];
  if (reason === "take-profit") flags.push("target-hit");

  const trade: ArenaClosedTradeV2 = {
    id,
    positionId: position.id,
    asset: position.asset,
    entryPrice: position.entryPrice,
    exitPrice: fixed(exitPrice),
    quantity: position.quantity,
    quoteCommitted: position.quoteCommitted,
    totalFee: fixed(decimal(position.openingFee).plus(closingFee)),
    realizedPnl: fixed(pnl),
    realizedPnlRate: pnlRate.toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed(8),
    openedAt: position.openedAt,
    closedAt: context.now,
    closureReason: reason,
    mentorFlags: [...new Set(flags)],
  };

  const nextPositions = state.openPositions.filter((item) => item.id !== position.id);
  const next: ArenaExecutionStateV2 = {
    ...state,
    cashBalance: fixed(decimal(state.cashBalance).plus(netProceeds)),
    openPositions: nextPositions,
    closedTrades: [trade, ...state.closedTrades].slice(0, ARENA_EXECUTION_MAX_CLOSED_TRADES_IN_SNAPSHOT),
    totalRealizedPnl: fixed(decimal(state.totalRealizedPnl).plus(pnl)),
    totalFeesPaid: fixed(decimal(state.totalFeesPaid).plus(closingFee)),
    lastLossAt: pnl.lt(0) ? context.now : state.lastLossAt,
    lastTradeAt: context.now,
    lastMarket: context.market,
    updatedAt: context.now,
    holdings: computeHoldings(nextPositions),
  };
  next.reservedBalance = fixed(computeReserved(next.pendingOrders));
  next.equity = computeArenaExecutionEquity(next, context.market);
  return { state: next, trade };
}

function processMarket(
  state: ArenaExecutionStateV2,
  context: ArenaExecutionContext,
): { state: ArenaExecutionStateV2; filledOrderIds: string[]; closedTradeIds: string[] } {
  let next = { ...state, lastMarket: context.market, updatedAt: context.now };
  const filledOrderIds: string[] = [];
  const closedTradeIds: string[] = [];

  for (const order of state.pendingOrders) {
    const marketPrice = decimal(context.market.prices[order.asset]);
    if (marketPrice.gt(order.limitPrice)) continue;
    if (next.openPositions.length >= ARENA_EXECUTION_MAX_OPEN_POSITIONS) break;

    const candidateFill = buyFillPrice(context.market.prices[order.asset], context);
    const fillPrice = Decimal.min(candidateFill, decimal(order.limitPrice));
    const position = createPosition({
      state: next,
      asset: order.asset,
      quoteAmount: decimal(order.quoteReserved),
      fillPrice,
      stopLoss: order.stopLoss ?? undefined,
      takeProfit: order.takeProfit ?? undefined,
      preTradePlan: order.preTradePlan,
      emotionalState: order.emotionalState,
      context,
      id: `${context.operationId}:position:${filledOrderIds.length + 1}`,
    });
    if (!position) continue;

    next = {
      ...next,
      pendingOrders: next.pendingOrders.filter((item) => item.id !== order.id),
      openPositions: [...next.openPositions, position],
      totalFeesPaid: fixed(decimal(next.totalFeesPaid).plus(position.openingFee)),
      lastTradeAt: context.now,
    };
    filledOrderIds.push(order.id);
  }

  for (const position of [...next.openPositions]) {
    const marketPrice = decimal(context.market.prices[position.asset]);
    const stopHit = position.stopLoss ? marketPrice.lte(position.stopLoss) : false;
    const targetHit = position.takeProfit ? marketPrice.gte(position.takeProfit) : false;
    if (!stopHit && !targetHit) continue;
    const closed = closeOnePosition(
      next,
      position,
      stopHit ? "stop-loss" : "take-profit",
      context,
      `${context.operationId}:trade:${closedTradeIds.length + 1}`,
    );
    next = closed.state;
    closedTradeIds.push(closed.trade.id);
  }

  next.reservedBalance = fixed(computeReserved(next.pendingOrders));
  next.holdings = computeHoldings(next.openPositions);
  next.equity = computeArenaExecutionEquity(next, context.market);
  return { state: next, filledOrderIds, closedTradeIds };
}

export function applyArenaExecutionActionV2(
  current: ArenaExecutionStateV2,
  action: ArenaExecutionActionV2,
  context: ArenaExecutionContext,
): ArenaExecutionResult {
  let state: ArenaExecutionStateV2;
  try {
    state = normalizeArenaExecutionStateV2(current, current.initialBalance);
  } catch {
    return { ok: false, error: "arena_execution_state_invalid" };
  }
  const market = normalizePriceSnapshot(context.market);
  const now = iso(context.now);
  if (!market || !now || !/^[A-Za-z0-9:_-]{8,200}$/.test(context.operationId)) {
    return { ok: false, error: "arena_execution_context_invalid" };
  }
  const safeContext: ArenaExecutionContext = { ...context, now, market };

  if (action.type === "refresh_market") {
    const processed = processMarket(state, safeContext);
    return {
      ok: true,
      state: processed.state,
      eventType: "arena.market_refreshed",
      event: {
        source: market.source,
        observedAt: market.observedAt,
        filledOrderIds: processed.filledOrderIds,
        closedTradeIds: processed.closedTradeIds,
      },
    };
  }

  if (action.type === "cancel_order") {
    const order = state.pendingOrders.find((item) => item.id === action.orderId);
    if (!order) return { ok: false, error: "arena_order_not_found" };
    const pendingOrders = state.pendingOrders.filter((item) => item.id !== order.id);
    const next: ArenaExecutionStateV2 = {
      ...state,
      cashBalance: fixed(decimal(state.cashBalance).plus(order.quoteReserved)),
      pendingOrders,
      reservedBalance: fixed(computeReserved(pendingOrders)),
      lastMarket: market,
      updatedAt: now,
    };
    next.equity = computeArenaExecutionEquity(next, market);
    return {
      ok: true,
      state: next,
      eventType: "arena.limit_order_cancelled",
      event: { orderId: order.id, quoteReleased: order.quoteReserved },
    };
  }

  if (action.type === "close_position") {
    const position = state.openPositions.find((item) => item.id === action.positionId);
    if (!position) return { ok: false, error: "arena_position_not_found" };
    const closed = closeOnePosition(
      state,
      position,
      "manual",
      safeContext,
      `${safeContext.operationId}:trade:1`,
    );
    return {
      ok: true,
      state: closed.state,
      eventType: "arena.position_closed",
      event: { trade: closed.trade },
    };
  }

  const quoteAmount = positive(action.quoteAmount);
  if (!quoteAmount || quoteAmount.lt(ARENA_EXECUTION_MIN_TRADE)) {
    return { ok: false, error: "arena_trade_below_minimum" };
  }
  if (quoteAmount.gt(state.cashBalance)) return { ok: false, error: "arena_insufficient_cash" };
  const currentEquity = decimal(computeArenaExecutionEquity(state, market));
  if (currentEquity.lte(0) || quoteAmount.div(currentEquity).gt(ARENA_EXECUTION_MAX_RISK_RATE)) {
    return { ok: false, error: "arena_risk_limit_exceeded" };
  }

  if (action.type === "limit_buy") {
    if (state.pendingOrders.length >= ARENA_EXECUTION_MAX_PENDING_ORDERS) {
      return { ok: false, error: "arena_pending_order_limit" };
    }
    const limitPrice = positive(action.limitPrice);
    if (!limitPrice) return { ok: false, error: "arena_limit_price_invalid" };
    const protection = validateProtectivePrices(limitPrice, action.stopLoss, action.takeProfit);
    if (!protection) return { ok: false, error: "arena_protective_price_invalid" };

    const order: ArenaPendingOrderV2 = {
      id: `${safeContext.operationId}:order:1`,
      asset: action.asset,
      limitPrice: fixed(limitPrice),
      quoteReserved: fixed(quoteAmount),
      stopLoss: protection.stopLoss,
      takeProfit: protection.takeProfit,
      createdAt: now,
      preTradePlan: (action.preTradePlan ?? "").slice(0, 1_500),
      emotionalState: (action.emotionalState ?? "not-recorded").slice(0, 120),
    };
    const pendingOrders = [...state.pendingOrders, order];
    let next: ArenaExecutionStateV2 = {
      ...state,
      cashBalance: fixed(decimal(state.cashBalance).minus(quoteAmount)),
      pendingOrders,
      reservedBalance: fixed(computeReserved(pendingOrders)),
      lastMarket: market,
      updatedAt: now,
    };
    const processed = processMarket(next, safeContext);
    next = processed.state;
    return {
      ok: true,
      state: next,
      eventType: processed.filledOrderIds.includes(order.id)
        ? "arena.limit_order_filled"
        : "arena.limit_order_placed",
      event: {
        order,
        filled: processed.filledOrderIds.includes(order.id),
        autoClosedTradeIds: processed.closedTradeIds,
      },
    };
  }

  if (state.openPositions.length >= ARENA_EXECUTION_MAX_OPEN_POSITIONS) {
    return { ok: false, error: "arena_open_position_limit" };
  }
  const fillPrice = buyFillPrice(market.prices[action.asset], safeContext);
  const position = createPosition({
    state,
    asset: action.asset,
    quoteAmount,
    fillPrice,
    stopLoss: action.stopLoss,
    takeProfit: action.takeProfit,
    preTradePlan: action.preTradePlan,
    emotionalState: action.emotionalState,
    context: safeContext,
    id: `${safeContext.operationId}:position:1`,
  });
  if (!position) return { ok: false, error: "arena_protective_price_invalid" };

  const openPositions = [...state.openPositions, position];
  const next: ArenaExecutionStateV2 = {
    ...state,
    cashBalance: fixed(decimal(state.cashBalance).minus(quoteAmount)),
    openPositions,
    holdings: computeHoldings(openPositions),
    totalFeesPaid: fixed(decimal(state.totalFeesPaid).plus(position.openingFee)),
    lastTradeAt: now,
    lastMarket: market,
    updatedAt: now,
  };
  next.reservedBalance = fixed(computeReserved(next.pendingOrders));
  next.equity = computeArenaExecutionEquity(next, market);
  return {
    ok: true,
    state: next,
    eventType: "arena.market_position_opened",
    event: { position },
  };
}
