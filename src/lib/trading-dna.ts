/**
 * Trading DNA scoring primitives.
 *
 * This module is intentionally pure. It never reads browser storage or Arena
 * state. Callers must supply normalized signals derived from verified server
 * evidence. Browser collectors from the legacy Arena are not supported.
 */

export interface TradingDNASignals {
  hasData: boolean;
  totalTrades: number;
  stopLossRate: number;
  overRiskRate: number;
  revengeTradeRate: number;
  impulseRate: number;
  journalCompletionRate: number;
  winRate: number;
  targetHitRate: number;
  scenariosCompleted: number;
  scenariosPassed: number;
  avgPnlPct: number;
}

export const EMPTY_TRADING_DNA_SIGNALS: TradingDNASignals = {
  hasData: false,
  totalTrades: 0,
  stopLossRate: 0,
  overRiskRate: 0,
  revengeTradeRate: 0,
  impulseRate: 0,
  journalCompletionRate: 0,
  winRate: 0,
  targetHitRate: 0,
  scenariosCompleted: 0,
  scenariosPassed: 0,
  avgPnlPct: 0,
};

/**
 * Browser collection is deliberately disabled. Official callers must build
 * signals from PostgreSQL-backed Arena/reflection evidence and pass them into
 * the pure scoring functions below.
 */
export function collectTradingDNASignals(): TradingDNASignals {
  return { ...EMPTY_TRADING_DNA_SIGNALS };
}

/**
 * Blend a learning score with a verified trading score. Sparse trading data
 * contributes less than a mature server-derived history.
 */
export function blendWithTrading(
  learningScore: number,
  tradingScore: number,
  totalTrades: number,
): number {
  if (totalTrades === 0) return learningScore;
  const tradingWeight = Math.min(0.4, totalTrades * 0.04);
  const learningWeight = 1 - tradingWeight;
  return Math.round(learningScore * learningWeight + tradingScore * tradingWeight);
}

export function rateToScore(rate: number): number {
  return Math.round(Math.max(0, Math.min(1, rate)) * 100);
}

export function tradingRiskScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  const stopLossScore = rateToScore(signals.stopLossRate);
  const overRiskPenalty = rateToScore(1 - signals.overRiskRate);
  return Math.round(stopLossScore * 0.6 + overRiskPenalty * 0.4);
}

export function tradingPatienceScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  const impulseControl = rateToScore(1 - signals.impulseRate);
  const scenarioBonus = Math.min(20, signals.scenariosPassed * 5);
  return Math.min(100, impulseControl + scenarioBonus);
}

export function tradingFOMOScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  return rateToScore(1 - signals.impulseRate);
}

export function tradingRevengeScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  return rateToScore(1 - signals.revengeTradeRate);
}

export function tradingReflectionScore(signals: TradingDNASignals): number {
  return rateToScore(signals.journalCompletionRate);
}

export function tradingDecisionScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  const winBonus = rateToScore(signals.winRate) * 0.4;
  const stopLossBonus = rateToScore(signals.stopLossRate) * 0.4;
  const scenarioBonus = Math.min(20, signals.scenariosPassed * 4);
  return Math.min(100, Math.round(winBonus + stopLossBonus + scenarioBonus));
}
