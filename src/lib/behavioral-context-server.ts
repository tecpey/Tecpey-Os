import { withDb } from "@/lib/db";
import {
  createEmptyBehavioralInputs,
  type BehavioralInputs,
  type BehavioralSnapshot,
} from "@/lib/behavioral-engine";
import { normalizeAcademyProgressState } from "@/lib/academy-progress";
import { normalizeReflectionMap } from "@/lib/academy-reflections";
import { normalizeDeck } from "@/lib/spaced-repetition";
import type { TradingDNASignals } from "@/lib/trading-dna";

type ArenaTradeRow = {
  risk_percent: string | number | null;
  risk_flag: boolean | null;
  entry_reason: string | null;
  emotion: string | null;
  risk_plan: string | null;
};

function rate(count: number, total: number): number {
  return total > 0 ? Number((count / total).toFixed(4)) : 0;
}

export function deriveTradingDNASignals(rows: ArenaTradeRow[]): TradingDNASignals {
  const totalTrades = rows.length;
  if (totalTrades === 0) return { ...createEmptyBehavioralInputs().trading };

  const stopLossPattern = /حد\s*ضرر|stop\s*loss|\bsl\b/i;
  const revengePattern = /انتقام|revenge|جبران\s*ضرر/i;
  const impulsePattern = /fomo|هیجان|عجله|impulse|بدون\s*برنامه|از\s*دست/i;

  const stopLossCount = rows.filter((row) => stopLossPattern.test(row.risk_plan ?? "")).length;
  const overRiskCount = rows.filter((row) => Boolean(row.risk_flag) || Number(row.risk_percent ?? 0) > 5).length;
  const revengeCount = rows.filter((row) => revengePattern.test(`${row.emotion ?? ""} ${row.entry_reason ?? ""}`)).length;
  const impulseCount = rows.filter((row) => impulsePattern.test(`${row.emotion ?? ""} ${row.entry_reason ?? ""}`)).length;
  const journalCount = rows.filter((row) =>
    (row.entry_reason ?? "").trim().length >= 20 && (row.risk_plan ?? "").trim().length >= 20,
  ).length;

  return {
    hasData: true,
    totalTrades,
    stopLossRate: rate(stopLossCount, totalTrades),
    overRiskRate: rate(overRiskCount, totalTrades),
    revengeTradeRate: rate(revengeCount, totalTrades),
    impulseRate: rate(impulseCount, totalTrades),
    journalCompletionRate: rate(journalCount, totalTrades),
    // The current Arena persistence schema does not yet record realized outcome,
    // scenario completion or target-hit fields. Keep these explicitly zero rather
    // than fabricating behavioral evidence.
    winRate: 0,
    targetHitRate: 0,
    scenariosCompleted: 0,
    scenariosPassed: 0,
    avgPnlPct: 0,
  };
}

export async function collectBehavioralInputs(
  studentId: string,
  locale: "fa" | "en",
): Promise<BehavioralInputs | null> {
  const result = await withDb(async (client) => {
    const [stateResult, tradesResult] = await Promise.all([
      client.query<{
        progress: unknown;
        flashcards: unknown;
        reflections: unknown;
      }>(
        `SELECT progress, flashcards, reflections
         FROM academy_state_documents
         WHERE student_id = $1::uuid AND locale = $2
         LIMIT 1`,
        [studentId, locale],
      ),
      client.query<ArenaTradeRow>(
        `SELECT risk_percent, risk_flag, entry_reason, emotion, risk_plan
         FROM academy_trading_arena_trades
         WHERE student_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 200`,
        [studentId],
      ),
    ]);

    const stateRow = stateResult.rows[0];
    const progress = normalizeAcademyProgressState(stateRow?.progress);
    const deck = normalizeDeck(stateRow?.flashcards);
    const reflections = normalizeReflectionMap(stateRow?.reflections);
    const lessons = Object.values(progress.completedLessons);
    const scores = lessons.map((lesson) => Number(lesson.score)).filter(Number.isFinite);
    const avgLessonScore = scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;
    const scoreVariance = scores.length >= 2
      ? Math.sqrt(scores.reduce((sum, score) => sum + Math.pow(score - avgLessonScore, 2), 0) / scores.length)
      : 0;

    const reviewedCards = deck.filter((card) => card.lastReviewedAt !== null);
    const flashcardAvgEF = reviewedCards.length > 0
      ? reviewedCards.reduce((sum, card) => sum + card.easeFactor, 0) / reviewedCards.length
      : 2.5;
    const flashcardAvgGrade = reviewedCards.length > 0
      ? reviewedCards.reduce((sum, card) => sum + Math.max(0, card.lastGrade), 0) / reviewedCards.length
      : 0;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activeDays = new Set(
      lessons
        .filter((lesson) => lesson.completedAt >= sevenDaysAgo)
        .map((lesson) => new Date(lesson.completedAt).toISOString().slice(0, 10)),
    );

    return {
      streak: progress.streak,
      xp: progress.xp,
      level: progress.level,
      lastStudyDate: progress.lastStudyDate,
      completedLessonCount: lessons.length,
      avgLessonScore,
      totalBadges: progress.earnedBadges.length,
      flashcardReviewed: reviewedCards.length,
      flashcardAvgEF,
      flashcardAvgGrade,
      reflectionCount: Object.values(reflections).filter((entry) => entry.text.trim().length > 20).length,
      modulePassCount: Object.values(progress.moduleScores).filter((score) => score >= 75).length,
      masteryAttempts: lessons.length,
      daysActiveLast7: activeDays.size,
      scoreVariance,
      trading: deriveTradingDNASignals(tradesResult.rows),
    } satisfies BehavioralInputs;
  });

  return result.enabled ? result.value : null;
}

export function buildBehavioralPrompt(snapshot: BehavioralSnapshot): string {
  const weakest = [...snapshot.dimensions]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((dimension) => `${dimension.dimension}:${dimension.score}`)
    .join(", ");
  const strongest = [...snapshot.dimensions]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((dimension) => `${dimension.dimension}:${dimension.score}`)
    .join(", ");

  return [
    `behavioral_overall=${snapshot.overallScore}`,
    `data_quality=${snapshot.dataQuality}`,
    `learning_style=${snapshot.preferredLearningStyle}`,
    `learning_velocity=${snapshot.learningVelocity}`,
    weakest ? `weakest_dimensions=${weakest}` : "",
    strongest ? `strongest_dimensions=${strongest}` : "",
  ].filter(Boolean).join("\n");
}
