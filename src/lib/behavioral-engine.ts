/**
 * Behavioral Intelligence Engine — Client-side only.
 *
 * Computes 12 behavioral dimension scores from localStorage data
 * (Phase 15: academy-progress.ts + spaced-repetition.ts + reflection entries).
 * Pure computation — no network calls, no DB, no server component.
 */

import { loadProgress } from "@/lib/academy-progress";
import { loadDeck } from "@/lib/spaced-repetition";
import {
  collectTradingDNASignals,
  blendWithTrading,
  tradingRiskScore,
  tradingPatienceScore,
  tradingFOMOScore,
  tradingRevengeScore,
  tradingReflectionScore,
  tradingDecisionScore,
  type TradingDNASignals,
} from "@/lib/trading-dna";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BehavioralDimension =
  | "discipline"
  | "patience"
  | "risk_management"
  | "consistency"
  | "reflection"
  | "confidence"
  | "fomo_risk"
  | "revenge_risk"
  | "preparation"
  | "knowledge_depth"
  | "decision_quality"
  | "execution_quality";

export type DimensionTrend = "up" | "down" | "stable" | "new";

export type BehavioralScore = {
  dimension: BehavioralDimension;
  score: number;         // 0–100
  trend: DimensionTrend;
  explanation: string;   // Persian, human-readable
  evidenceItems: string[];
  actionSuggestion: string;
};

export type BehavioralSnapshot = {
  computedAt: number;
  overallScore: number;
  dimensions: BehavioralScore[];
  learningVelocity: number;      // lessons completed per week (approximate)
  preferredLearningStyle: "analytical" | "practical" | "mixed";
  strongestDimension: BehavioralDimension | null;
  weakestDimension: BehavioralDimension | null;
  dataQuality: "rich" | "moderate" | "sparse";
};

type RawInputs = {
  streak: number;
  xp: number;
  level: number;
  lastStudyDate: string | null;
  completedLessonCount: number;
  avgLessonScore: number;
  totalBadges: number;
  flashcardReviewed: number;
  flashcardAvgEF: number;
  flashcardAvgGrade: number;
  reflectionCount: number;
  modulePassCount: number;
  masteryAttempts: number;
  daysActiveLast7: number;
  scoreVariance: number;
  trading: TradingDNASignals;    // Phase 17: trading arena signals (zero-safe)
};

// ─── Data collection ──────────────────────────────────────────────────────────

const EMPTY_TRADING: TradingDNASignals = {
  hasData: false, totalTrades: 0, stopLossRate: 0, overRiskRate: 0,
  revengeTradeRate: 0, impulseRate: 0, journalCompletionRate: 0,
  winRate: 0, targetHitRate: 0, scenariosCompleted: 0, scenariosPassed: 0,
  avgPnlPct: 0,
};

function collectInputs(): RawInputs {
  if (typeof window === "undefined") {
    return {
      streak: 0, xp: 0, level: 1, lastStudyDate: null, completedLessonCount: 0,
      avgLessonScore: 0, totalBadges: 0, flashcardReviewed: 0, flashcardAvgEF: 2.5,
      flashcardAvgGrade: 0, reflectionCount: 0, modulePassCount: 0, masteryAttempts: 0,
      daysActiveLast7: 0, scoreVariance: 0, trading: EMPTY_TRADING,
    };
  }

  const progress = loadProgress();
  const deck = loadDeck();

  // Lesson scores
  const lessons = Object.values(progress.completedLessons);
  const completedLessonCount = lessons.length;
  const avgLessonScore = lessons.length > 0
    ? lessons.reduce((s, l) => s + l.score, 0) / lessons.length
    : 0;
  const scoreVariance = lessons.length >= 2
    ? Math.sqrt(lessons.reduce((s, l) => s + Math.pow(l.score - avgLessonScore, 2), 0) / lessons.length)
    : 0;

  // Module passes
  const modulePassCount = Object.values(progress.moduleScores).filter((s) => s >= 75).length;

  // Flashcard stats
  const reviewedCards = deck.filter((c) => c.lastReviewedAt !== null);
  const flashcardReviewed = reviewedCards.length;
  const flashcardAvgEF = reviewedCards.length > 0
    ? reviewedCards.reduce((s, c) => s + c.easeFactor, 0) / reviewedCards.length
    : 2.5;
  const flashcardAvgGrade = reviewedCards.length > 0
    ? reviewedCards.reduce((s, c) => s + Math.max(0, c.lastGrade), 0) / reviewedCards.length
    : 0;

  // Reflection count (scan localStorage for reflection keys)
  let reflectionCount = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("tecpey-reflection-")) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as { text?: string };
          if (parsed.text && parsed.text.trim().length > 20) reflectionCount++;
        }
      }
    }
  } catch {
    // localStorage access failure
  }

  // Estimate days active in last 7 days from lesson completedAt timestamps
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeDays = new Set(
    lessons
      .filter((l) => l.completedAt >= sevenDaysAgo)
      .map((l) => new Date(l.completedAt).toISOString().slice(0, 10)),
  );
  const daysActiveLast7 = activeDays.size;

  const trading = collectTradingDNASignals();

  return {
    streak: progress.streak,
    xp: progress.xp,
    level: progress.level,
    lastStudyDate: progress.lastStudyDate,
    completedLessonCount,
    avgLessonScore,
    totalBadges: progress.earnedBadges.length,
    flashcardReviewed,
    flashcardAvgEF,
    flashcardAvgGrade,
    reflectionCount,
    modulePassCount,
    masteryAttempts: completedLessonCount,
    daysActiveLast7,
    scoreVariance,
    trading,
  };
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }
function interp(value: number, low: number, high: number): number {
  if (high <= low) return 0;
  return clamp(((value - low) / (high - low)) * 100);
}

// ─── Dimension scorers ────────────────────────────────────────────────────────

function scoreDisipline(inp: RawInputs): BehavioralScore {
  const streakScore = interp(inp.streak, 0, 14);
  const flashScore = inp.flashcardReviewed > 0 ? interp(inp.flashcardReviewed, 0, 10) : 0;
  const lessonScore = interp(inp.completedLessonCount, 0, 3);
  const learningScore = clamp(streakScore * 0.4 + flashScore * 0.3 + lessonScore * 0.3);
  const tradingScore = tradingRiskScore(inp.trading); // stop-loss discipline
  const score = blendWithTrading(learningScore, tradingScore, inp.trading.totalTrades);
  const evidence: string[] = [];
  if (inp.streak > 0) evidence.push(`${inp.streak} روز پیاپی مطالعه`);
  if (inp.flashcardReviewed > 0) evidence.push(`${inp.flashcardReviewed} کارت مرور شده`);
  if (inp.completedLessonCount > 0) evidence.push(`${inp.completedLessonCount} درس تکمیل شده`);
  return {
    dimension: "discipline",
    score,
    trend: inp.streak >= 3 ? "up" : inp.streak === 0 ? "down" : "stable",
    explanation: score >= 70 ? "سطح انضباط یادگیری بالاست." : score >= 40 ? "انضباط در حال شکل‌گیری است." : "برای تقویت انضباط، روزانه حداقل یک درس یا فلش‌کارت مرور کنید.",
    evidenceItems: evidence.length ? evidence : ["هنوز داده کافی ثبت نشده"],
    actionSuggestion: "هر روز حداقل ۵ دقیقه مطالعه کنید تا streak ادامه پیدا کند.",
  };
}

function scorePatience(inp: RawInputs): BehavioralScore {
  const variancePenalty = interp(inp.scoreVariance, 0, 40);
  const flashDepth = inp.flashcardReviewed > 0 ? interp(inp.flashcardAvgGrade, 2, 4.5) : 50;
  const learningScore = clamp(100 - variancePenalty * 0.5 + flashDepth * 0.5);
  const score = blendWithTrading(learningScore, tradingPatienceScore(inp.trading), inp.trading.totalTrades);
  return {
    dimension: "patience",
    score,
    trend: inp.scoreVariance < 10 ? "up" : inp.scoreVariance > 25 ? "down" : "stable",
    explanation: score >= 70 ? "نشانه‌های صبر در یادگیری دیده می‌شود." : "تفاوت زیاد بین نمره‌های درس‌ها نشان‌دهنده شتاب‌زدگی احتمالی است.",
    evidenceItems: inp.scoreVariance > 0 ? [`واریانس نمرات: ${inp.scoreVariance.toFixed(0)}`] : ["داده کافی نیست"],
    actionSuggestion: "قبل از آزمون، فلش‌کارت‌ها را مرور کنید. عجله‌ای نیست.",
  };
}

function scoreRiskManagement(inp: RawInputs): BehavioralScore {
  const masteryRespect = inp.completedLessonCount > 0 ? interp(inp.avgLessonScore, 60, 100) : 50;
  const moduleScore = interp(inp.modulePassCount, 0, 2) * 0.3;
  const learningScore = clamp(masteryRespect * 0.7 + moduleScore);
  const score = blendWithTrading(learningScore, tradingRiskScore(inp.trading), inp.trading.totalTrades);
  return {
    dimension: "risk_management",
    score,
    trend: inp.avgLessonScore >= 80 ? "up" : inp.avgLessonScore < 60 ? "down" : "stable",
    explanation: score >= 70 ? "رعایت آستانه‌های تسلط نشان‌دهنده احتیاط مناسب است." : "به دروازه‌های تسلط توجه بیشتری داشته باشید.",
    evidenceItems: inp.completedLessonCount > 0 ? [`میانگین نمره: ${inp.avgLessonScore.toFixed(0)}٪`] : ["هنوز درسی تکمیل نشده"],
    actionSuggestion: "قبل از عبور از هر درس، از ۸۰٪ نمره مطمئن شوید.",
  };
}

function scoreConsistency(inp: RawInputs): BehavioralScore {
  const streakScore = interp(inp.streak, 0, 7) * 0.5;
  const daysScore = interp(inp.daysActiveLast7, 0, 7) * 0.5;
  const score = clamp(streakScore + daysScore);
  return {
    dimension: "consistency",
    score,
    trend: inp.daysActiveLast7 >= 5 ? "up" : inp.daysActiveLast7 <= 1 ? "down" : "stable",
    explanation: score >= 70 ? "پیوستگی یادگیری عالی است." : "سعی کنید هر هفته حداقل ۴ روز مطالعه کنید.",
    evidenceItems: [
      `${inp.daysActiveLast7} روز فعال در هفته گذشته`,
      `streak فعلی: ${inp.streak} روز`,
    ],
    actionSuggestion: "یک زمان ثابت روزانه برای مطالعه انتخاب کنید.",
  };
}

function scoreReflection(inp: RawInputs): BehavioralScore {
  const expectedReflections = Math.max(1, inp.completedLessonCount);
  const reflectionRate = Math.min(1, inp.reflectionCount / expectedReflections);
  const learningScore = clamp(reflectionRate * 100);
  const score = blendWithTrading(learningScore, tradingReflectionScore(inp.trading), inp.trading.totalTrades);
  return {
    dimension: "reflection",
    score,
    trend: inp.reflectionCount > 0 ? "up" : "stable",
    explanation: score >= 70 ? "بازتاب یادگیری عادت خوبی شده." : score > 0 ? "به بازتاب یادگیری ادامه دهید." : "بازتاب یادگیری را در پایان هر درس تمرین کنید.",
    evidenceItems: [`${inp.reflectionCount} از ${inp.completedLessonCount} درس با بازتاب ثبت شده`],
    actionSuggestion: "بعد از هر درس، حداقل یک پاراگراف بازتاب بنویسید.",
  };
}

function scoreConfidence(inp: RawInputs): BehavioralScore {
  const lessonScore = interp(inp.avgLessonScore, 50, 100) * 0.6;
  const progressScore = interp(inp.xp, 0, 1500) * 0.4;
  const score = clamp(lessonScore + progressScore);
  return {
    dimension: "confidence",
    score,
    trend: inp.avgLessonScore >= 80 ? "up" : inp.avgLessonScore < 65 ? "down" : "stable",
    explanation: score >= 70 ? "سطح اطمینان به دانش خوب است." : "اطمینان با تکرار و مرور رشد می‌کند.",
    evidenceItems: [
      `میانگین نمره: ${inp.avgLessonScore.toFixed(0)}٪`,
      `XP کل: ${inp.xp}`,
    ],
    actionSuggestion: "بر روی درس‌هایی که نمره پایین دارید تمرکز کنید.",
  };
}

function scoreFomoRisk(inp: RawInputs): BehavioralScore {
  const reflectionDeficit = inp.completedLessonCount > 0
    ? Math.max(0, inp.completedLessonCount - inp.reflectionCount) / inp.completedLessonCount
    : 0;
  const varianceRisk = inp.scoreVariance > 20 ? 0.4 : 0;
  const fomoLearning = clamp((reflectionDeficit * 0.6 + varianceRisk) * 100);
  const learningScore = 100 - fomoLearning;
  const score = blendWithTrading(learningScore, tradingFOMOScore(inp.trading), inp.trading.totalTrades);
  return {
    dimension: "fomo_risk",
    score,   // 100 = no FOMO risk
    trend: reflectionDeficit > 0.5 ? "down" : "up",
    explanation: fomoLearning < 30 ? "ریسک FOMO پایین است — یادگیری آگاهانه دارید." : "درس‌ها را بدون بازتاب رد کردن نشانه‌ای از شتاب است.",
    evidenceItems: [
      `${inp.reflectionCount} از ${inp.completedLessonCount} درس با بازتاب`,
    ],
    actionSuggestion: "قبل از رفتن به درس بعدی، با خودتان بپرسید: آیا واقعاً فهمیدم؟",
  };
}

function scoreRevengeRisk(inp: RawInputs): BehavioralScore {
  const retryRisk = inp.avgLessonScore < 70 && inp.completedLessonCount >= 2 ? 50 : 0;
  const learningScore = clamp(100 - retryRisk);
  const score = blendWithTrading(learningScore, tradingRevengeScore(inp.trading), inp.trading.totalTrades);
  return {
    dimension: "revenge_risk",
    score,
    trend: retryRisk > 0 ? "down" : "stable",
    explanation: score >= 70 ? "الگوی یادگیری متعادل مشاهده می‌شود." : "اگر در آزمون شکست خوردید، قبل از تلاش مجدد مطالب را مرور کنید.",
    evidenceItems: [`نمره میانگین: ${inp.avgLessonScore.toFixed(0)}٪`],
    actionSuggestion: "بعد از هر شکست، ابتدا فلش‌کارت‌ها را مرور کنید.",
  };
}

function scorePreparation(inp: RawInputs): BehavioralScore {
  const flashUsage = inp.flashcardReviewed > 0 ? interp(inp.flashcardReviewed, 0, 6) : 0;
  const reviewQuality = interp(inp.flashcardAvgEF, 1.3, 3.0) * 0.4;
  const score = clamp(flashUsage * 0.6 + reviewQuality);
  return {
    dimension: "preparation",
    score,
    trend: inp.flashcardReviewed >= 4 ? "up" : inp.flashcardReviewed === 0 ? "down" : "stable",
    explanation: score >= 70 ? "فلش‌کارت‌ها قبل از آزمون مرور می‌شوند." : "مرور فلش‌کارت قبل از آزمون آمادگی را بالا می‌برد.",
    evidenceItems: [
      inp.flashcardReviewed > 0 ? `${inp.flashcardReviewed} فلش‌کارت مرور شده` : "فلش‌کارتی مرور نشده",
    ],
    actionSuggestion: "هر روز صبح ۵ دقیقه فلش‌کارت مرور کنید.",
  };
}

function scoreKnowledgeDepth(inp: RawInputs): BehavioralScore {
  const scoreComp = interp(inp.avgLessonScore, 60, 100) * 0.6;
  const efComp = interp(inp.flashcardAvgEF, 1.3, 3.0) * 0.4;
  const score = clamp(scoreComp + efComp);
  return {
    dimension: "knowledge_depth",
    score,
    trend: inp.avgLessonScore >= 85 && inp.flashcardAvgEF >= 2.5 ? "up" : "stable",
    explanation: score >= 70 ? "عمق دانش در حال رشد است." : "مرور مکرر فلش‌کارت‌ها عمق دانش را افزایش می‌دهد.",
    evidenceItems: [
      `میانگین نمره درس‌ها: ${inp.avgLessonScore.toFixed(0)}٪`,
      inp.flashcardReviewed > 0 ? `میانگین Ease Factor: ${inp.flashcardAvgEF.toFixed(2)}` : "بدون داده فلش‌کارت",
    ],
    actionSuggestion: "درس‌هایی که نمره زیر ۸۰٪ دارند را دوباره مرور کنید.",
  };
}

function scoreDecisionQuality(inp: RawInputs): BehavioralScore {
  const firstPassRate = inp.avgLessonScore >= 80 ? 80 : inp.avgLessonScore;
  const improvementSign = inp.streak >= 3 ? 10 : 0;
  const learningScore = clamp(firstPassRate * 0.7 + improvementSign);
  const score = blendWithTrading(learningScore, tradingDecisionScore(inp.trading), inp.trading.totalTrades);
  return {
    dimension: "decision_quality",
    score,
    trend: inp.avgLessonScore >= 80 ? "up" : "stable",
    explanation: score >= 70 ? "کیفیت تصمیم‌گیری در یادگیری بالاست." : "قبل از پاسخ دادن به آزمون، هر گزینه را کامل بخوانید.",
    evidenceItems: [`نرخ قبولی در درس‌ها: ${inp.avgLessonScore.toFixed(0)}٪`],
    actionSuggestion: "در آزمون‌ها، قبل از انتخاب گزینه، توضیح آن را تجسم کنید.",
  };
}

function scoreExecutionQuality(inp: RawInputs): BehavioralScore {
  const completionRate = inp.completedLessonCount > 0 ? Math.min(100, inp.completedLessonCount * 33) : 0;
  const badgeBonus = Math.min(20, inp.totalBadges * 10);
  const score = clamp(completionRate * 0.8 + badgeBonus);
  return {
    dimension: "execution_quality",
    score,
    trend: inp.completedLessonCount >= 2 ? "up" : "stable",
    explanation: score >= 70 ? "اجرا و تکمیل یادگیری خوب است." : "هر درس را تا پایان کامل کنید — از خواندن تا آزمون.",
    evidenceItems: [
      `${inp.completedLessonCount} درس تکمیل شده`,
      `${inp.totalBadges} نشان کسب شده`,
    ],
    actionSuggestion: "هر درس را در یک جلسه از ابتدا تا انتها بروید.",
  };
}

// ─── Main compute function ────────────────────────────────────────────────────

export function computeBehavioralSnapshot(): BehavioralSnapshot {
  const inp = collectInputs();

  const dimensions: BehavioralScore[] = [
    scoreDisipline(inp),
    scorePatience(inp),
    scoreRiskManagement(inp),
    scoreConsistency(inp),
    scoreReflection(inp),
    scoreConfidence(inp),
    scoreFomoRisk(inp),
    scoreRevengeRisk(inp),
    scorePreparation(inp),
    scoreKnowledgeDepth(inp),
    scoreDecisionQuality(inp),
    scoreExecutionQuality(inp),
  ];

  const overallScore = clamp(
    dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length,
  );

  const sorted = [...dimensions].sort((a, b) => b.score - a.score);
  const strongest = sorted[0]?.score >= 50 ? sorted[0].dimension : null;
  const weakest = sorted[sorted.length - 1]?.score < 70 ? sorted[sorted.length - 1].dimension : null;

  // Learning velocity: lessons per week estimate
  const learningVelocity = inp.daysActiveLast7 > 0
    ? Number((inp.completedLessonCount / Math.max(1, inp.daysActiveLast7 / 7)).toFixed(1))
    : 0;

  const preferredLearningStyle: BehavioralSnapshot["preferredLearningStyle"] =
    inp.flashcardReviewed >= inp.completedLessonCount * 2 ? "analytical"
    : inp.completedLessonCount >= 3 && inp.reflectionCount < inp.completedLessonCount * 0.3 ? "practical"
    : "mixed";

  const dataQuality: BehavioralSnapshot["dataQuality"] =
    inp.completedLessonCount >= 3 && inp.flashcardReviewed >= 3 ? "rich"
    : inp.completedLessonCount >= 1 ? "moderate"
    : "sparse";

  return {
    computedAt: Date.now(),
    overallScore,
    dimensions,
    learningVelocity,
    preferredLearningStyle,
    strongestDimension: strongest,
    weakestDimension: weakest,
    dataQuality,
  };
}

/** Get a single dimension score from a snapshot. */
export function getDimensionScore(snapshot: BehavioralSnapshot, dimension: BehavioralDimension): BehavioralScore | undefined {
  return snapshot.dimensions.find((d) => d.dimension === dimension);
}

/** Persian display label for each dimension. */
export const DIMENSION_LABELS: Record<BehavioralDimension, string> = {
  discipline: "انضباط",
  patience: "صبر",
  risk_management: "مدیریت ریسک",
  consistency: "ثبات",
  reflection: "بازتاب",
  confidence: "اطمینان",
  fomo_risk: "کنترل FOMO",
  revenge_risk: "کنترل معامله انتقامی",
  preparation: "آمادگی",
  knowledge_depth: "عمق دانش",
  decision_quality: "کیفیت تصمیم",
  execution_quality: "کیفیت اجرا",
};

/** Short description for each dimension. */
export const DIMENSION_DESCRIPTIONS: Record<BehavioralDimension, string> = {
  discipline: "پیوستگی مطالعه و رعایت برنامه روزانه",
  patience: "عدم شتاب‌زدگی در یادگیری",
  risk_management: "رعایت آستانه‌های تسلط قبل از پیشروی",
  consistency: "تداوم فعالیت روزانه و هفتگی",
  reflection: "بازنگری و ثبت بازتاب یادگیری",
  confidence: "سطح اطمینان به دانش کسب‌شده",
  fomo_risk: "مقاومت در برابر شتاب‌زدگی و هیجان‌زدگی",
  revenge_risk: "عدم تلاش مجدد عجولانه بعد از شکست",
  preparation: "آمادگی قبل از آزمون با فلش‌کارت",
  knowledge_depth: "عمق و ماندگاری دانش کسب‌شده",
  decision_quality: "کیفیت انتخاب در آزمون‌ها",
  execution_quality: "تکمیل کامل هر درس از ابتدا تا انتها",
};

/** Load snapshot from localStorage cache or compute fresh. */
const SNAPSHOT_CACHE_KEY = "tecpey-behavioral-snapshot";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function loadOrComputeSnapshot(): BehavioralSnapshot {
  if (typeof window === "undefined") return computeBehavioralSnapshot();
  try {
    const raw = localStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as BehavioralSnapshot;
      if (Date.now() - cached.computedAt < CACHE_TTL_MS) return cached;
    }
  } catch {
    // ignore
  }
  const fresh = computeBehavioralSnapshot();
  try { localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(fresh)); } catch { /* quota */ }
  return fresh;
}
