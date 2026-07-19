import Decimal from "decimal.js";
import type {
  ArenaClosedTradeV2,
  ArenaExecutionMentorFlag,
  ArenaExecutionStateV2,
  ArenaOpenPositionV2,
  ArenaPendingOrderV2,
  ArenaPriceSnapshot,
} from "./trading-arena-execution-v2";

const FEE_RATE = new Decimal("0.001");
const FLAGS = new Set<ArenaExecutionMentorFlag>([
  "no-stop-loss", "over-risk", "impulse-entry", "revenge-trade",
  "fomo-entry", "good-discipline", "proper-sizing", "target-hit",
]);

function invalid(code = "arena_execution_state_invalid"): never {
  throw new Error(code);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, empty = true): string {
  if (typeof value !== "string" || value.length > max || (!empty && value.length === 0)) invalid();
  return value;
}

function time(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) invalid();
  return new Date(value).toISOString();
}

function nullableTime(value: unknown): string | null {
  return value === null ? null : time(value);
}

function amount(value: unknown, positive = false, signed = false, maxDp = 18): string {
  if (typeof value !== "string" || value.length > 100) invalid();
  const pattern = signed ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/ : /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (!pattern.test(value)) invalid();
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || (positive ? !parsed.gt(0) : !signed && parsed.lt(0))) invalid();
  if (parsed.decimalPlaces() > maxDp) invalid();
  return value;
}

function optionalPrice(value: unknown): string | null {
  return value === null ? null : amount(value, true, false, 10);
}

function asset(value: unknown): "BTC" | "ETH" {
  if (value !== "BTC" && value !== "ETH") invalid();
  return value;
}

function mentorFlags(value: unknown): ArenaExecutionMentorFlag[] {
  if (!Array.isArray(value) || value.length > FLAGS.size) invalid();
  const result = value.map((item) => {
    if (typeof item !== "string" || !FLAGS.has(item as ArenaExecutionMentorFlag)) invalid();
    return item as ArenaExecutionMentorFlag;
  });
  if (new Set(result).size !== result.length) invalid();
  return result;
}

function position(value: unknown): ArenaOpenPositionV2 {
  const row = object(value);
  const entryPrice = amount(row.entryPrice, true, false, 10);
  const quoteCommitted = amount(row.quoteCommitted, true, false, 10);
  const openingFee = amount(row.openingFee, false, false, 10);
  const quantity = amount(row.quantity, true, false, 18);
  const stopLoss = optionalPrice(row.stopLoss);
  const takeProfit = optionalPrice(row.takeProfit);
  if (stopLoss && new Decimal(stopLoss).gte(entryPrice)) invalid();
  if (takeProfit && new Decimal(takeProfit).lte(entryPrice)) invalid();
  const expectedFee = new Decimal(quoteCommitted).mul(FEE_RATE).toDecimalPlaces(10, Decimal.ROUND_DOWN);
  const expectedQuantity = new Decimal(quoteCommitted).minus(openingFee).div(entryPrice)
    .toDecimalPlaces(18, Decimal.ROUND_DOWN);
  if (!new Decimal(openingFee).eq(expectedFee) || !new Decimal(quantity).eq(expectedQuantity)) invalid();
  return {
    id: text(row.id, 200, false), asset: asset(row.asset), entryPrice, quantity,
    quoteCommitted, openingFee, stopLoss, takeProfit, openedAt: time(row.openedAt),
    preTradePlan: text(row.preTradePlan, 1_500), emotionalState: text(row.emotionalState, 120),
    mentorFlags: mentorFlags(row.mentorFlags),
  };
}

function pendingOrder(value: unknown): ArenaPendingOrderV2 {
  const row = object(value);
  const limitPrice = amount(row.limitPrice, true, false, 10);
  const stopLoss = optionalPrice(row.stopLoss);
  const takeProfit = optionalPrice(row.takeProfit);
  if (stopLoss && new Decimal(stopLoss).gte(limitPrice)) invalid();
  if (takeProfit && new Decimal(takeProfit).lte(limitPrice)) invalid();
  return {
    id: text(row.id, 200, false), asset: asset(row.asset), limitPrice,
    quoteReserved: amount(row.quoteReserved, true, false, 10), stopLoss, takeProfit,
    createdAt: time(row.createdAt), preTradePlan: text(row.preTradePlan, 1_500),
    emotionalState: text(row.emotionalState, 120),
  };
}

function closedTrade(value: unknown): ArenaClosedTradeV2 {
  const row = object(value);
  const reason = row.closureReason;
  if (reason !== "manual" && reason !== "stop-loss" && reason !== "take-profit") invalid();
  const openedAt = time(row.openedAt);
  const closedAt = time(row.closedAt);
  if (Date.parse(closedAt) < Date.parse(openedAt)) invalid();
  return {
    id: text(row.id, 200, false), positionId: text(row.positionId, 200, false),
    asset: asset(row.asset), entryPrice: amount(row.entryPrice, true, false, 10),
    exitPrice: amount(row.exitPrice, true, false, 10),
    quantity: amount(row.quantity, true, false, 18),
    quoteCommitted: amount(row.quoteCommitted, true, false, 10),
    totalFee: amount(row.totalFee, false, false, 10),
    realizedPnl: amount(row.realizedPnl, false, true, 10),
    realizedPnlRate: amount(row.realizedPnlRate, false, true, 8),
    openedAt, closedAt, closureReason: reason,
    mentorFlags: mentorFlags(row.mentorFlags),
  };
}

function market(value: unknown): ArenaPriceSnapshot {
  const row = object(value);
  const prices = object(row.prices);
  return {
    prices: {
      BTC: amount(prices.BTC, true, false, 10),
      ETH: amount(prices.ETH, true, false, 10),
    },
    source: text(row.source, 120, false),
    observedAt: time(row.observedAt),
  };
}

function unique(values: string[]): void {
  if (new Set(values).size !== values.length) invalid();
}

export function validateArenaExecutionStateV2(value: unknown): ArenaExecutionStateV2 {
  const row = object(value);
  if (row.version !== 2) invalid("arena_execution_state_version_unsupported");
  if (!Array.isArray(row.openPositions) || row.openPositions.length > 5) invalid();
  if (!Array.isArray(row.pendingOrders) || row.pendingOrders.length > 20) invalid();
  if (!Array.isArray(row.closedTrades) || row.closedTrades.length > 5_000) invalid();

  const openPositions = row.openPositions.map(position);
  const pendingOrders = row.pendingOrders.map(pendingOrder);
  const closedTrades = row.closedTrades.map(closedTrade);
  unique(openPositions.map((item) => item.id));
  unique(pendingOrders.map((item) => item.id));
  unique(closedTrades.map((item) => item.id));
  unique(closedTrades.map((item) => item.positionId));

  const cashBalance = amount(row.cashBalance, false, false, 10);
  const reservedBalance = amount(row.reservedBalance, false, false, 10);
  const equity = amount(row.equity, false, false, 10);
  const holdingsRow = object(row.holdings);
  const holdings = {
    BTC: amount(holdingsRow.BTC, false, false, 18),
    ETH: amount(holdingsRow.ETH, false, false, 18),
  };
  const expectedReserved = pendingOrders.reduce(
    (sum, item) => sum.plus(item.quoteReserved), new Decimal(0),
  ).toDecimalPlaces(10, Decimal.ROUND_DOWN);
  if (!new Decimal(reservedBalance).eq(expectedReserved)) invalid();
  for (const selected of ["BTC", "ETH"] as const) {
    const expected = openPositions.filter((item) => item.asset === selected).reduce(
      (sum, item) => sum.plus(item.quantity), new Decimal(0),
    ).toDecimalPlaces(18, Decimal.ROUND_DOWN);
    if (!new Decimal(holdings[selected]).eq(expected)) invalid();
  }

  const lastMarket = row.lastMarket === null ? null : market(row.lastMarket);
  if (lastMarket) {
    const liquidation = openPositions.reduce((sum, item) => sum.plus(
      new Decimal(item.quantity).mul(lastMarket.prices[item.asset]).mul(new Decimal(1).minus(FEE_RATE)),
    ), new Decimal(0));
    const expectedEquity = new Decimal(cashBalance).plus(reservedBalance).plus(liquidation)
      .toDecimalPlaces(10, Decimal.ROUND_DOWN);
    if (!new Decimal(equity).eq(expectedEquity)) invalid();
  }

  const createdAt = time(row.createdAt);
  const updatedAt = time(row.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) invalid();
  return {
    version: 2,
    initialBalance: amount(row.initialBalance, true, false, 10),
    cashBalance, reservedBalance, equity, holdings, openPositions, pendingOrders, closedTrades,
    totalRealizedPnl: amount(row.totalRealizedPnl, false, true, 10),
    totalFeesPaid: amount(row.totalFeesPaid, false, false, 10),
    lastTradeAt: nullableTime(row.lastTradeAt), lastLossAt: nullableTime(row.lastLossAt),
    lastMarket, createdAt, updatedAt,
  };
}
