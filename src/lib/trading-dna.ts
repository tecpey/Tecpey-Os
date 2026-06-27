/**
 * Trading DNA — Extracts behavioral signals from TradingArenaState.
 * Feeds into behavioral-engine.ts to update discipline, patience, etc.
 */

import { loadArenaState, computeArenaStats, type ArenaStats } from "@/lib/trading-arena";
import { getJournalCompletionRate } from "@/lib/trading-journal";

export interface TradingDNASignals {
  hasData: boolean;
  totalTrades: number;
  stopLossRate: number;      // 0–1
  overRiskRate: number;      // 0–1
  revengeTradeRate: number;  // 0–1
  impulseRate: number;       // 0–1
  journalCompletionRate: number; // 0–1
  winRate: number;           // 0–1
  targetHitRate: number;     // 0–1
  scenariosCompleted: number;
  scenariosPassed: number;
  avgPnlPct: number;
}

export function collectTradingDNASignals(): TradingDNASignals {
  if (typeof window === "undefined") {
    return {
      hasData: false, totalTrades: 0, stopLossRate: 0, overRiskRate: 0,
      revengeTradeRate: 0, impulseRate: 0, journalCompletionRate: 0,
      winRate: 0, targetHitRate: 0, scenariosCompleted: 0, scenariosPassed: 0,
      avgPnlPct: 0,
    };
  }

  const state = loadArenaState();
  const stats: ArenaStats = computeArenaStats(state);
  const journalCompletion = getJournalCompletionRate();

  return {
    hasData: stats.totalTrades > 0,
    totalTrades: stats.totalTrades,
    stopLossRate: stats.stopLossRate,
    overRiskRate: stats.overRiskRate,
    revengeTradeRate: stats.revengeTradeRate,
    impulseRate: stats.impulseRate,
    journalCompletionRate: journalCompletion,
    winRate: stats.winRate,
    targetHitRate: stats.targetHitRate,
    scenariosCompleted: stats.scenariosCompleted,
    scenariosPassed: stats.scenariosPassed,
    avgPnlPct: stats.avgPnlPct,
  };
}

/**
 * Blend a learning score with a trading score.
 * When trading data is sparse (<3 trades) it contributes only 20%.
 * At 10+ trades it contributes 40%.
 */
export function blendWithTrading(
  learningScore: number,
  tradingScore: number,
  totalTrades: number,
): number {
  if (totalTrades === 0) return learningScore;
  const tradingWeight = Math.min(0.40, totalTrades * 0.04);
  const learningWeight = 1 - tradingWeight;
  return Math.round(learningScore * learningWeight + tradingScore * tradingWeight);
}

/** Convert a rate (0–1) to a 0–100 score. */
export function rateToScore(rate: number): number {
  return Math.round(rate * 100);
}

/** Compute a mentor risk discipline score purely from trading signals. */
export function tradingRiskScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  const slScore = rateToScore(signals.stopLossRate);
  const overRiskPenalty = rateToScore(1 - signals.overRiskRate);
  return Math.round(slScore * 0.6 + overRiskPenalty * 0.4);
}

/** Compute trading patience score. */
export function tradingPatienceScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  const impulseControl = rateToScore(1 - signals.impulseRate);
  const scenarioBonus = Math.min(20, signals.scenariosPassed * 5);
  return Math.min(100, impulseControl + scenarioBonus);
}

/** Compute trading FOMO control score (higher = less FOMO). */
export function tradingFOMOScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  return rateToScore(1 - signals.impulseRate);
}

/** Compute trading revenge-risk control score. */
export function tradingRevengeScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  return rateToScore(1 - signals.revengeTradeRate);
}

/** Compute trading reflection score from journal completion. */
export function tradingReflectionScore(signals: TradingDNASignals): number {
  return rateToScore(signals.journalCompletionRate);
}

/** Compute trading decision quality score. */
export function tradingDecisionScore(signals: TradingDNASignals): number {
  if (!signals.hasData) return 50;
  const winBonus = rateToScore(signals.winRate) * 0.4;
  const slBonus = rateToScore(signals.stopLossRate) * 0.4;
  const scenarioBonus = Math.min(20, signals.scenariosPassed * 4);
  return Math.min(100, Math.round(winBonus + slBonus + scenarioBonus));
}
