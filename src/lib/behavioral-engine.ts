/**
 * Behavioral Intelligence Engine.
 *
 * Pure scoring only: callers provide normalized inputs collected from trusted
 * server-side sources. This module performs no network, database, cookie, or
 * browser-storage access and is safe to use from APIs, tests and UI renderers.
 */

import {
  blendWithTrading,
  tradingRiskScore,
  tradingPatienceScore,
  tradingFOMOScore,
  tradingRevengeScore,
  tradingReflectionScore,
  tradingDecisionScore,
  type TradingDNASignals,
} from "@/lib/trading-dna";

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
  score: number;
  trend: DimensionTrend;
  explanation: string;
  evidenceItems: string[];
  actionSuggestion: string;
};

export type BehavioralSnapshot = {
  computedAt: number;
  overallScore: number;
  dimensions: BehavioralScore[];
  learningVelocity: number;
  preferredLearningStyle: "analytical" | "practical" | "mixed";
  strongestDimension: BehavioralDimension | null;
  weakestDimension: BehavioralDimension | null;
  dataQuality: "rich" | "moderate" | "sparse";
};

export type BehavioralInputs = {
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
  trading: TradingDNASignals;
};

export const EMPTY_TRADING_SIGNALS: TradingDNASignals = {
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

export function createEmptyBehavioralInputs(): BehavioralInputs {
  return {
    streak: 0,
    xp: 0,
    level: 1,
    lastStudyDate: null,
    completedLessonCount: 0,
    avgLessonScore: 0,
    totalBadges: 0,
    flashcardReviewed: 0,
    flashcardAvgEF: 2.5,
    flashcardAvgGrade: 0,
    reflectionCount: 0,
    modulePassCount: 0,
    masteryAttempts: 0,
    daysActiveLast7: 0,
    scoreVariance: 0,
    trading: { ...EMPTY_TRADING_SIGNALS },
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function interpolate(value: number, low: number, high: number): number {
  if (high <= low) return 0;
  return clamp(((value - low) / (high - low)) * 100);
}

function scoreDiscipline(input: BehavioralInputs): BehavioralScore {
  const streakScore = interpolate(input.streak, 0, 14);
  const flashScore = input.flashcardReviewed > 0 ? interpolate(input.flashcardReviewed, 0, 10) : 0;
  const lessonScore = interpolate(input.completedLessonCount, 0, 3);
  const learningScore = clamp(streakScore * 0.4 + flashScore * 0.3 + lessonScore * 0.3);
  const score = blendWithTrading(learningScore, tradingRiskScore(input.trading), input.trading.totalTrades);
  const evidence: string[] = [];
  if (input.streak > 0) evidence.push(`${input.streak} روز پیاپی مطالعه`);
  if (input.flashcardReviewed > 0) evidence.push(`${input.flashcardReviewed} کارت مرور شده`);
  if (input.completedLessonCount > 0) evidence.push(`${input.completedLessonCount} درس تکمیل شده`);
  return {
    dimension: "discipline",
    score,
    trend: input.streak >= 3 ? "up" : input.streak === 0 ? "down" : "stable",
    explanation: score >= 70 ? "سطح انضباط یادگیری بالاست." : score >= 40 ? "انضباط در حال شکل‌گیری است." : "برای تقویت انضباط، روزانه حداقل یک درس یا فلش‌کارت مرور کنید.",
    evidenceItems: evidence.length ? evidence : ["هنوز داده کافی ثبت نشده"],
    actionSuggestion: "هر روز حداقل ۵ دقیقه مطالعه کنید تا streak ادامه پیدا کند.",
  };
}

function scorePatience(input: BehavioralInputs): BehavioralScore {
  const variancePenalty = interpolate(input.scoreVariance, 0, 40);
  const flashDepth = input.flashcardReviewed > 0 ? interpolate(input.flashcardAvgGrade, 2, 4.5) : 50;
  const learningScore = clamp(100 - variancePenalty * 0.5 + flashDepth * 0.5);
  const score = blendWithTrading(learningScore, tradingPatienceScore(input.trading), input.trading.totalTrades);
  return {
    dimension: "patience",
    score,
    trend: input.scoreVariance < 10 ? "up" : input.scoreVariance > 25 ? "down" : "stable",
    explanation: score >= 70 ? "نشانه‌های صبر در یادگیری دیده می‌شود." : "تفاوت زیاد بین نمره‌های درس‌ها نشان‌دهنده شتاب‌زدگی احتمالی است.",
    evidenceItems: input.scoreVariance > 0 ? [`واریانس نمرات: ${input.scoreVariance.toFixed(0)}`] : ["داده کافی نیست"],
    actionSuggestion: "قبل از آزمون، فلش‌کارت‌ها را مرور کنید. عجله‌ای نیست.",
  };
}

function scoreRiskManagement(input: BehavioralInputs): BehavioralScore {
  const masteryRespect = input.completedLessonCount > 0 ? interpolate(input.avgLessonScore, 60, 100) : 50;
  const moduleScore = interpolate(input.modulePassCount, 0, 2) * 0.3;
  const learningScore = clamp(masteryRespect * 0.7 + moduleScore);
  const score = blendWithTrading(learningScore, tradingRiskScore(input.trading), input.trading.totalTrades);
  return {
    dimension: "risk_management",
    score,
    trend: input.avgLessonScore >= 80 ? "up" : input.avgLessonScore < 60 ? "down" : "stable",
    explanation: score >= 70 ? "رعایت آستانه‌های تسلط نشان‌دهنده احتیاط مناسب است." : "به دروازه‌های تسلط توجه بیشتری داشته باشید.",
    evidenceItems: input.completedLessonCount > 0 ? [`میانگین نمره: ${input.avgLessonScore.toFixed(0)}٪`] : ["هنوز درسی تکمیل نشده"],
    actionSuggestion: "قبل از عبور از هر درس، از ۸۰٪ نمره مطمئن شوید.",
  };
}

function scoreConsistency(input: BehavioralInputs): BehavioralScore {
  const score = clamp(interpolate(input.streak, 0, 7) * 0.5 + interpolate(input.daysActiveLast7, 0, 7) * 0.5);
  return {
    dimension: "consistency",
    score,
    trend: input.daysActiveLast7 >= 5 ? "up" : input.daysActiveLast7 <= 1 ? "down" : "stable",
    explanation: score >= 70 ? "پیوستگی یادگیری عالی است." : "سعی کنید هر هفته حداقل ۴ روز مطالعه کنید.",
    evidenceItems: [`${input.daysActiveLast7} روز فعال در هفته گذشته`, `streak فعلی: ${input.streak} روز`],
    actionSuggestion: "یک زمان ثابت روزانه برای مطالعه انتخاب کنید.",
  };
}

function scoreReflection(input: BehavioralInputs): BehavioralScore {
  const expectedReflections = Math.max(1, input.completedLessonCount);
  const reflectionRate = Math.min(1, input.reflectionCount / expectedReflections);
  const learningScore = clamp(reflectionRate * 100);
  const score = blendWithTrading(learningScore, tradingReflectionScore(input.trading), input.trading.totalTrades);
  return {
    dimension: "reflection",
    score,
    trend: input.reflectionCount > 0 ? "up" : "stable",
    explanation: score >= 70 ? "بازتاب یادگیری عادت خوبی شده." : score > 0 ? "به بازتاب یادگیری ادامه دهید." : "بازتاب یادگیری را در پایان هر درس تمرین کنید.",
    evidenceItems: [`${input.reflectionCount} از ${input.completedLessonCount} درس با بازتاب ثبت شده`],
    actionSuggestion: "بعد از هر درس، حداقل یک پاراگراف بازتاب بنویسید.",
  };
}

function scoreConfidence(input: BehavioralInputs): BehavioralScore {
  const score = clamp(interpolate(input.avgLessonScore, 50, 100) * 0.6 + interpolate(input.xp, 0, 1500) * 0.4);
  return {
    dimension: "confidence",
    score,
    trend: input.avgLessonScore >= 80 ? "up" : input.avgLessonScore < 65 ? "down" : "stable",
    explanation: score >= 70 ? "سطح اطمینان به دانش خوب است." : "اطمینان با تکرار و مرور رشد می‌کند.",
    evidenceItems: [`میانگین نمره: ${input.avgLessonScore.toFixed(0)}٪`, `XP کل: ${input.xp}`],
    actionSuggestion: "بر روی درس‌هایی که نمره پایین دارید تمرکز کنید.",
  };
}

function scoreFomoRisk(input: BehavioralInputs): BehavioralScore {
  const reflectionDeficit = input.completedLessonCount > 0
    ? Math.max(0, input.completedLessonCount - input.reflectionCount) / input.completedLessonCount
    : 0;
  const varianceRisk = input.scoreVariance > 20 ? 0.4 : 0;
  const fomoLearning = clamp((reflectionDeficit * 0.6 + varianceRisk) * 100);
  const score = blendWithTrading(100 - fomoLearning, tradingFOMOScore(input.trading), input.trading.totalTrades);
  return {
    dimension: "fomo_risk",
    score,
    trend: reflectionDeficit > 0.5 ? "down" : "up",
    explanation: fomoLearning < 30 ? "ریسک FOMO پایین است — یادگیری آگاهانه دارید." : "درس‌ها را بدون بازتاب رد کردن نشانه‌ای از شتاب است.",
    evidenceItems: [`${input.reflectionCount} از ${input.completedLessonCount} درس با بازتاب`],
    actionSuggestion: "قبل از رفتن به درس بعدی، با خودتان بپرسید: آیا واقعاً فهمیدم؟",
  };
}

function scoreRevengeRisk(input: BehavioralInputs): BehavioralScore {
  const retryRisk = input.avgLessonScore < 70 && input.completedLessonCount >= 2 ? 50 : 0;
  const score = blendWithTrading(clamp(100 - retryRisk), tradingRevengeScore(input.trading), input.trading.totalTrades);
  return {
    dimension: "revenge_risk",
    score,
    trend: retryRisk > 0 ? "down" : "stable",
    explanation: score >= 70 ? "الگوی یادگیری متعادل مشاهده می‌شود." : "اگر در آزمون شکست خوردید، قبل از تلاش مجدد مطالب را مرور کنید.",
    evidenceItems: [`نمره میانگین: ${input.avgLessonScore.toFixed(0)}٪`],
    actionSuggestion: "بعد از هر شکست، ابتدا فلش‌کارت‌ها را مرور کنید.",
  };
}

function scorePreparation(input: BehavioralInputs): BehavioralScore {
  const flashUsage = input.flashcardReviewed > 0 ? interpolate(input.flashcardReviewed, 0, 6) : 0;
  const reviewQuality = interpolate(input.flashcardAvgEF, 1.3, 3.0) * 0.4;
  const score = clamp(flashUsage * 0.6 + reviewQuality);
  return {
    dimension: "preparation",
    score,
    trend: input.flashcardReviewed >= 4 ? "up" : input.flashcardReviewed === 0 ? "down" : "stable",
    explanation: score >= 70 ? "فلش‌کارت‌ها قبل از آزمون مرور می‌شوند." : "مرور فلش‌کارت قبل از آزمون آمادگی را بالا می‌برد.",
    evidenceItems: [input.flashcardReviewed > 0 ? `${input.flashcardReviewed} فلش‌کارت مرور شده` : "فلش‌کارتی مرور نشده"],
    actionSuggestion: "هر روز صبح ۵ دقیقه فلش‌کارت مرور کنید.",
  };
}

function scoreKnowledgeDepth(input: BehavioralInputs): BehavioralScore {
  const score = clamp(interpolate(input.avgLessonScore, 60, 100) * 0.6 + interpolate(input.flashcardAvgEF, 1.3, 3.0) * 0.4);
  return {
    dimension: "knowledge_depth",
    score,
    trend: input.avgLessonScore >= 85 && input.flashcardAvgEF >= 2.5 ? "up" : "stable",
    explanation: score >= 70 ? "عمق دانش در حال رشد است." : "مرور مکرر فلش‌کارت‌ها عمق دانش را افزایش می‌دهد.",
    evidenceItems: [`میانگین نمره درس‌ها: ${input.avgLessonScore.toFixed(0)}٪`, input.flashcardReviewed > 0 ? `میانگین Ease Factor: ${input.flashcardAvgEF.toFixed(2)}` : "بدون داده فلش‌کارت"],
    actionSuggestion: "درس‌هایی که نمره زیر ۸۰٪ دارند را دوباره مرور کنید.",
  };
}

function scoreDecisionQuality(input: BehavioralInputs): BehavioralScore {
  const firstPassRate = input.avgLessonScore >= 80 ? 80 : input.avgLessonScore;
  const learningScore = clamp(firstPassRate * 0.7 + (input.streak >= 3 ? 10 : 0));
  const score = blendWithTrading(learningScore, tradingDecisionScore(input.trading), input.trading.totalTrades);
  return {
    dimension: "decision_quality",
    score,
    trend: input.avgLessonScore >= 80 ? "up" : "stable",
    explanation: score >= 70 ? "کیفیت تصمیم‌گیری در یادگیری بالاست." : "قبل از پاسخ دادن به آزمون، هر گزینه را کامل بخوانید.",
    evidenceItems: [`نرخ قبولی در درس‌ها: ${input.avgLessonScore.toFixed(0)}٪`],
    actionSuggestion: "در آزمون‌ها، قبل از انتخاب گزینه، توضیح آن را تجسم کنید.",
  };
}

function scoreExecutionQuality(input: BehavioralInputs): BehavioralScore {
  const completionRate = input.completedLessonCount > 0 ? Math.min(100, input.completedLessonCount * 33) : 0;
  const score = clamp(completionRate * 0.8 + Math.min(20, input.totalBadges * 10));
  return {
    dimension: "execution_quality",
    score,
    trend: input.completedLessonCount >= 2 ? "up" : "stable",
    explanation: score >= 70 ? "اجرا و تکمیل یادگیری خوب است." : "هر درس را تا پایان کامل کنید — از خواندن تا آزمون.",
    evidenceItems: [`${input.completedLessonCount} درس تکمیل شده`, `${input.totalBadges} نشان کسب شده`],
    actionSuggestion: "هر درس را در یک جلسه از ابتدا تا انتها بروید.",
  };
}

export function computeBehavioralSnapshot(input: BehavioralInputs): BehavioralSnapshot {
  const dimensions: BehavioralScore[] = [
    scoreDiscipline(input),
    scorePatience(input),
    scoreRiskManagement(input),
    scoreConsistency(input),
    scoreReflection(input),
    scoreConfidence(input),
    scoreFomoRisk(input),
    scoreRevengeRisk(input),
    scorePreparation(input),
    scoreKnowledgeDepth(input),
    scoreDecisionQuality(input),
    scoreExecutionQuality(input),
  ];

  const overallScore = clamp(dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length);
  const sorted = [...dimensions].sort((a, b) => b.score - a.score);
  const strongest = sorted[0]?.score >= 50 ? sorted[0].dimension : null;
  const weakest = sorted[sorted.length - 1]?.score < 70 ? sorted[sorted.length - 1].dimension : null;
  const learningVelocity = input.daysActiveLast7 > 0
    ? Number((input.completedLessonCount / Math.max(1, input.daysActiveLast7 / 7)).toFixed(1))
    : 0;
  const preferredLearningStyle: BehavioralSnapshot["preferredLearningStyle"] =
    input.flashcardReviewed >= input.completedLessonCount * 2 ? "analytical"
      : input.completedLessonCount >= 3 && input.reflectionCount < input.completedLessonCount * 0.3 ? "practical"
        : "mixed";
  const dataQuality: BehavioralSnapshot["dataQuality"] =
    input.completedLessonCount >= 3 && input.flashcardReviewed >= 3 ? "rich"
      : input.completedLessonCount >= 1 ? "moderate"
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

export function getDimensionScore(snapshot: BehavioralSnapshot, dimension: BehavioralDimension): BehavioralScore | undefined {
  return snapshot.dimensions.find((item) => item.dimension === dimension);
}

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
