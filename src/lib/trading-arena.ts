/**
 * Trading Arena V2 — Paper trading engine.
 * Runs entirely client-side via localStorage. No real money, no real orders.
 */

export const ARENA_STORAGE_KEY = "tecpey-trading-arena";
export const INITIAL_BALANCE = 10_000; // USDT
export const FEE_RATE = 0.001;          // 0.1% per side
export const MAX_OPEN_POSITIONS = 5;
export const MIN_TRADE_USDT = 10;
export const WARNING_RISK_PCT = 0.05;   // warn above 5%
export const MAX_RISK_PCT = 0.20;       // hard reject above 20%

export type Asset = "BTC" | "ETH";
export type ClosureReason = "manual" | "take-profit" | "stop-loss";

export type MentorFlag =
  | "no-stop-loss"
  | "over-risk"
  | "impulse-entry"
  | "revenge-trade"
  | "fomo-entry"
  | "good-discipline"
  | "target-hit"
  | "proper-sizing";

export interface OpenPosition {
  id: string;
  asset: Asset;
  entryPrice: number;
  size: number;         // in asset units
  usdtValue: number;    // USDT committed at open
  fee: number;          // opening fee
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: number;
  scenarioId: string | null;
  journalEntryId: string | null;
  mentorFlags: MentorFlag[];
}

export interface ClosedTrade {
  id: string;
  positionId: string;
  asset: Asset;
  entryPrice: number;
  exitPrice: number;
  size: number;
  usdtValue: number;
  totalFee: number;
  pnl: number;          // realized PnL after fees
  pnlPct: number;
  openedAt: number;
  closedAt: number;
  closureReason: ClosureReason;
  hadStopLoss: boolean;
  hadTakeProfit: boolean;
  riskPct: number;      // usdtValue / balance at open
  mentorFlags: MentorFlag[];
  journalEntryId: string | null;
  scenarioId: string | null;
}

export interface PendingOrder {
  id: string;
  asset: Asset;
  limitPrice: number;
  size: number;
  usdtValue: number;
  stopLoss: number | null;
  takeProfit: number | null;
  createdAt: number;
}

export interface TradingArenaState {
  version: 1;
  balance: number;
  initialBalance: number;
  holdings: Record<Asset, number>;
  openPositions: OpenPosition[];
  closedTrades: ClosedTrade[];
  pendingOrders: PendingOrder[];
  totalRealizedPnl: number;
  totalFeesPaid: number;
  scenarioProgress: Partial<Record<string, "idle" | "in-progress" | "passed" | "failed">>;
  lastTradeAt: number | null;
  lastLossAt: number | null;
  createdAt: number;
  lastActiveAt: number;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function applySlippage(price: number): number {
  // ±0–0.05% market slippage
  const slip = (Math.random() * 0.0005);
  return price * (1 + slip);
}

// ─── State management ─────────────────────────────────────────────────────────

export function createFreshArenaState(): TradingArenaState {
  return {
    version: 1,
    balance: INITIAL_BALANCE,
    initialBalance: INITIAL_BALANCE,
    holdings: { BTC: 0, ETH: 0 },
    openPositions: [],
    closedTrades: [],
    pendingOrders: [],
    totalRealizedPnl: 0,
    totalFeesPaid: 0,
    scenarioProgress: {},
    lastTradeAt: null,
    lastLossAt: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

export function loadArenaState(): TradingArenaState {
  if (typeof window === "undefined") return createFreshArenaState();
  try {
    const raw = localStorage.getItem(ARENA_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TradingArenaState;
  } catch { /* ignore */ }
  return createFreshArenaState();
}

export function saveArenaState(state: TradingArenaState): void {
  if (typeof window === "undefined") return;
  try {
    state.lastActiveAt = Date.now();
    localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota */ }
}

export function resetArenaState(): TradingArenaState {
  const fresh = createFreshArenaState();
  saveArenaState(fresh);
  return fresh;
}

// ─── Position analysis ────────────────────────────────────────────────────────

function determineMentorFlags(
  usdtValue: number,
  balance: number,
  stopLoss: number | null,
  lastTradeAt: number | null,
  lastLossAt: number | null,
): MentorFlag[] {
  const flags: MentorFlag[] = [];
  const riskPct = usdtValue / balance;
  const now = Date.now();

  if (!stopLoss) flags.push("no-stop-loss");
  if (riskPct > WARNING_RISK_PCT) flags.push("over-risk");
  if (lastTradeAt && now - lastTradeAt < 60_000) flags.push("impulse-entry");
  if (lastLossAt && now - lastLossAt < 300_000) flags.push("revenge-trade");
  if (stopLoss) flags.push("good-discipline");
  if (riskPct <= 0.02) flags.push("proper-sizing");

  return flags;
}

// ─── Trade execution ──────────────────────────────────────────────────────────

export type BuyResult =
  | { ok: true; state: TradingArenaState; position: OpenPosition }
  | { ok: false; error: string };

export function executeMarketBuy(
  state: TradingArenaState,
  asset: Asset,
  usdtAmount: number,
  marketPrice: number,
  opts: { stopLoss?: number; takeProfit?: number; scenarioId?: string; journalEntryId?: string },
): BuyResult {
  if (usdtAmount < MIN_TRADE_USDT) return { ok: false, error: `حداقل مبلغ معامله ${MIN_TRADE_USDT} USDT است.` };
  if (state.openPositions.length >= MAX_OPEN_POSITIONS) return { ok: false, error: "حداکثر ۵ موقعیت باز مجاز است." };
  const riskPct = usdtAmount / state.balance;
  if (riskPct > MAX_RISK_PCT) return { ok: false, error: "ریسک بیش از ۲۰٪ موجودی مجاز نیست." };
  if (usdtAmount > state.balance) return { ok: false, error: "موجودی کافی نیست." };

  const fillPrice = applySlippage(marketPrice);
  const fee = usdtAmount * FEE_RATE;
  const netUsdt = usdtAmount - fee;
  const size = netUsdt / fillPrice;

  const flags = determineMentorFlags(
    usdtAmount,
    state.balance,
    opts.stopLoss ?? null,
    state.lastTradeAt,
    state.lastLossAt,
  );

  const position: OpenPosition = {
    id: uid(),
    asset,
    entryPrice: fillPrice,
    size,
    usdtValue: usdtAmount,
    fee,
    stopLoss: opts.stopLoss ?? null,
    takeProfit: opts.takeProfit ?? null,
    openedAt: Date.now(),
    scenarioId: opts.scenarioId ?? null,
    journalEntryId: opts.journalEntryId ?? null,
    mentorFlags: flags,
  };

  const newState: TradingArenaState = {
    ...state,
    balance: state.balance - usdtAmount,
    holdings: { ...state.holdings, [asset]: state.holdings[asset] + size },
    openPositions: [...state.openPositions, position],
    totalFeesPaid: state.totalFeesPaid + fee,
    lastTradeAt: Date.now(),
  };
  saveArenaState(newState);
  return { ok: true, state: newState, position };
}

export type CloseResult = { state: TradingArenaState; trade: ClosedTrade };

export function closePosition(
  state: TradingArenaState,
  positionId: string,
  exitPrice: number,
  reason: ClosureReason,
  journalEntryId?: string,
): CloseResult | null {
  const pos = state.openPositions.find((p) => p.id === positionId);
  if (!pos) return null;

  const fee = pos.size * exitPrice * FEE_RATE;
  const grossPnl = (exitPrice - pos.entryPrice) * pos.size;
  const pnl = grossPnl - fee;
  const pnlPct = (pnl / pos.usdtValue) * 100;
  const returnUsdt = pos.usdtValue + pnl;

  const flags = [...pos.mentorFlags];
  if (reason === "take-profit") flags.push("target-hit");

  const trade: ClosedTrade = {
    id: uid(),
    positionId: pos.id,
    asset: pos.asset,
    entryPrice: pos.entryPrice,
    exitPrice,
    size: pos.size,
    usdtValue: pos.usdtValue,
    totalFee: pos.fee + fee,
    pnl,
    pnlPct,
    openedAt: pos.openedAt,
    closedAt: Date.now(),
    closureReason: reason,
    hadStopLoss: pos.stopLoss !== null,
    hadTakeProfit: pos.takeProfit !== null,
    riskPct: pos.usdtValue / (state.balance + pos.usdtValue),
    mentorFlags: flags,
    journalEntryId: journalEntryId ?? pos.journalEntryId,
    scenarioId: pos.scenarioId,
  };

  const newState: TradingArenaState = {
    ...state,
    balance: state.balance + Math.max(0, returnUsdt),
    holdings: { ...state.holdings, [pos.asset]: Math.max(0, state.holdings[pos.asset] - pos.size) },
    openPositions: state.openPositions.filter((p) => p.id !== positionId),
    closedTrades: [trade, ...state.closedTrades],
    totalRealizedPnl: state.totalRealizedPnl + pnl,
    totalFeesPaid: state.totalFeesPaid + fee,
    lastLossAt: pnl < 0 ? Date.now() : state.lastLossAt,
  };
  saveArenaState(newState);
  return { state: newState, trade };
}

export function addLimitOrder(
  state: TradingArenaState,
  asset: Asset,
  usdtAmount: number,
  limitPrice: number,
  opts: { stopLoss?: number; takeProfit?: number },
): { ok: true; state: TradingArenaState } | { ok: false; error: string } {
  if (usdtAmount < MIN_TRADE_USDT) return { ok: false, error: `حداقل مبلغ ${MIN_TRADE_USDT} USDT` };
  if (usdtAmount > state.balance) return { ok: false, error: "موجودی کافی نیست." };

  const fee = usdtAmount * FEE_RATE;
  const size = (usdtAmount - fee) / limitPrice;
  const order: PendingOrder = {
    id: uid(),
    asset,
    limitPrice,
    size,
    usdtValue: usdtAmount,
    stopLoss: opts.stopLoss ?? null,
    takeProfit: opts.takeProfit ?? null,
    createdAt: Date.now(),
  };
  const newState: TradingArenaState = {
    ...state,
    balance: state.balance - usdtAmount,
    pendingOrders: [...state.pendingOrders, order],
  };
  saveArenaState(newState);
  return { ok: true, state: newState };
}

export function cancelLimitOrder(
  state: TradingArenaState,
  orderId: string,
): TradingArenaState {
  const order = state.pendingOrders.find((o) => o.id === orderId);
  if (!order) return state;
  const newState: TradingArenaState = {
    ...state,
    balance: state.balance + order.usdtValue,
    pendingOrders: state.pendingOrders.filter((o) => o.id !== orderId),
  };
  saveArenaState(newState);
  return newState;
}

// ─── Price tick processing ────────────────────────────────────────────────────

export function processPriceTick(
  state: TradingArenaState,
  prices: Record<Asset, number>,
): TradingArenaState {
  let s = { ...state };

  // Fill limit orders
  for (const order of [...s.pendingOrders]) {
    const price = prices[order.asset];
    if (price <= order.limitPrice) {
      const flags = determineMentorFlags(order.usdtValue, s.balance + order.usdtValue, order.stopLoss, s.lastTradeAt, s.lastLossAt);
      const pos: OpenPosition = {
        id: uid(),
        asset: order.asset,
        entryPrice: order.limitPrice,
        size: order.size,
        usdtValue: order.usdtValue,
        fee: order.usdtValue * FEE_RATE,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        openedAt: Date.now(),
        scenarioId: null,
        journalEntryId: null,
        mentorFlags: flags,
      };
      s = {
        ...s,
        pendingOrders: s.pendingOrders.filter((o) => o.id !== order.id),
        openPositions: [...s.openPositions, pos],
        totalFeesPaid: s.totalFeesPaid + pos.fee,
        lastTradeAt: Date.now(),
      };
    }
  }

  // Check SL/TP on open positions
  for (const pos of [...s.openPositions]) {
    const price = prices[pos.asset];
    if (pos.stopLoss !== null && price <= pos.stopLoss) {
      const result = closePosition(s, pos.id, pos.stopLoss, "stop-loss");
      if (result) s = result.state;
    } else if (pos.takeProfit !== null && price >= pos.takeProfit) {
      const result = closePosition(s, pos.id, pos.takeProfit, "take-profit");
      if (result) s = result.state;
    }
  }

  return s;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export function computeUnrealizedPnl(position: OpenPosition, currentPrice: number): number {
  return (currentPrice - position.entryPrice) * position.size;
}

export interface ArenaStats {
  totalTrades: number;
  winRate: number;
  avgPnlPct: number;
  stopLossRate: number;      // 0–1: proportion of trades with SL
  overRiskRate: number;      // 0–1: proportion with >5% risk
  revengeTradeRate: number;
  impulseRate: number;
  targetHitRate: number;
  totalPnl: number;
  scenariosCompleted: number;
  scenariosPassed: number;
}

export function computeArenaStats(state: TradingArenaState): ArenaStats {
  const trades = state.closedTrades;
  const n = trades.length;
  if (n === 0) {
    return {
      totalTrades: 0, winRate: 0, avgPnlPct: 0, stopLossRate: 0,
      overRiskRate: 0, revengeTradeRate: 0, impulseRate: 0,
      targetHitRate: 0, totalPnl: 0, scenariosCompleted: 0, scenariosPassed: 0,
    };
  }
  const wins = trades.filter((t) => t.pnl > 0).length;
  const avgPnlPct = trades.reduce((s, t) => s + t.pnlPct, 0) / n;
  const stopLossRate = trades.filter((t) => t.hadStopLoss).length / n;
  const overRiskRate = trades.filter((t) => t.mentorFlags.includes("over-risk")).length / n;
  const revengeRate = trades.filter((t) => t.mentorFlags.includes("revenge-trade")).length / n;
  const impulseRate = trades.filter((t) => t.mentorFlags.includes("impulse-entry")).length / n;
  const targetHitRate = trades.filter((t) => t.closureReason === "take-profit").length / n;

  const scenarios = Object.values(state.scenarioProgress);
  const scenariosCompleted = scenarios.filter((s) => s === "passed" || s === "failed").length;
  const scenariosPassed = scenarios.filter((s) => s === "passed").length;

  return {
    totalTrades: n, winRate: wins / n, avgPnlPct, stopLossRate,
    overRiskRate, revengeTradeRate: revengeRate, impulseRate,
    targetHitRate, totalPnl: state.totalRealizedPnl,
    scenariosCompleted, scenariosPassed,
  };
}

export function computeNetEquity(
  state: TradingArenaState,
  prices: Record<Asset, number>,
): number {
  const unrealized = state.openPositions.reduce(
    (s, pos) => s + computeUnrealizedPnl(pos, prices[pos.asset]),
    0,
  );
  return state.balance + unrealized;
}
