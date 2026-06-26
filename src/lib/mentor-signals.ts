// Mentor signal collection and profile computation — server-only, no cookies.
// Reads live DB data and derives a MentorProfileUpdate from real user behavior.

import { withDb } from "@/lib/db";
import { cleanText } from "@/lib/student-cartax";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AcademySignals = {
  completedTerms: number;
  avgPassedPercent: number;     // average quiz score across passed terms
  failedTermNumbers: number[];  // term numbers attempted but not yet passed
  weakTopics: string[];         // topics with low success rate from challenge_attempts
  challengeAccuracy: number;    // 0-100 across all mentor_challenge_attempts
  totalChallengeAttempts: number;
};

export type TradingSignals = {
  tradeCount: number;
  avgRisk: number;              // average risk_percent
  avgDiscipline: number;        // average discipline_score (0-100)
  riskFlagRate: number;         // proportion of trades where risk_flag = true (0.0-1.0)
  emotionFlags: string[];       // distinct negative emotion tags observed
  journalQuality: number;       // 0-100 based on entry_reason + risk_plan avg length
  repeatedMistakes: string[];   // pattern tags: "over_risk" | "no_plan" | "emotional_entry"
};

export type ConversationSignals = {
  primaryGoal: string;
  psychologyFlags: string[];    // "fomo" | "fear" | "greed" | "revenge"
  careerIntent: boolean;
  repeatedThemes: string[];     // most common question topics
  messageCount: number;
  avgUserMessageLength: number;
};

export type MentorProfileUpdate = {
  level: "beginner" | "intermediate" | "advanced";
  riskProfile: "low" | "medium" | "high";
  primaryGoal: string;
  weakAreas: string[];
  strongAreas: string[];
  confidenceScore: number;      // 0-100
  disciplineScore: number;      // 0-100
  learningStyle: "practical" | "analytical" | "mixed";
};

// ── Signal collectors ─────────────────────────────────────────────────────────

/** Read and summarize academy quiz + challenge attempt data. */
export async function collectAcademySignals(studentId: string): Promise<AcademySignals> {
  const empty: AcademySignals = {
    completedTerms: 0,
    avgPassedPercent: 0,
    failedTermNumbers: [],
    weakTopics: [],
    challengeAccuracy: 0,
    totalChallengeAttempts: 0,
  };

  const result = await withDb(async (client) => {
    const [termRes, challengeRes] = await Promise.all([
      client.query(
        `SELECT term_number, status, percent
         FROM academy_term_progress WHERE student_id = $1::uuid
         ORDER BY term_number ASC`,
        [studentId],
      ),
      client.query(
        `SELECT question_id, lesson_slug, is_correct, attempt_number
         FROM mentor_challenge_attempts WHERE student_id = $1::uuid
         ORDER BY created_at DESC LIMIT 200`,
        [studentId],
      ),
    ]);

    const terms = termRes.rows;
    const passed = terms.filter((r) => r.status === "passed");
    const attempted = terms.filter((r) => r.status === "attempted");

    const completedTerms = passed.length;
    const avgPassedPercent =
      passed.length > 0
        ? Math.round(passed.reduce((s, r) => s + Number(r.percent || 0), 0) / passed.length)
        : 0;
    const failedTermNumbers = attempted.map((r) => Number(r.term_number));

    // Group challenge attempts by lesson_slug and count accuracy.
    const byLesson: Record<string, { correct: number; total: number }> = {};
    for (const r of challengeRes.rows) {
      const slug = String(r.lesson_slug || "unknown");
      if (!byLesson[slug]) byLesson[slug] = { correct: 0, total: 0 };
      byLesson[slug].total++;
      if (r.is_correct) byLesson[slug].correct++;
    }

    const weakTopics = Object.entries(byLesson)
      .filter(([, v]) => v.total >= 2 && v.correct / v.total < 0.5)
      .map(([slug]) => slug)
      .slice(0, 6);

    const totalAttempts = challengeRes.rows.length;
    const totalCorrect = challengeRes.rows.filter((r) => r.is_correct).length;
    const challengeAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

    return { completedTerms, avgPassedPercent, failedTermNumbers, weakTopics, challengeAccuracy, totalChallengeAttempts: totalAttempts };
  });

  return result.enabled ? (result.value ?? empty) : empty;
}

/** Read and summarize trading arena activity. */
export async function collectTradingSignals(studentId: string): Promise<TradingSignals> {
  const empty: TradingSignals = {
    tradeCount: 0,
    avgRisk: 0,
    avgDiscipline: 0,
    riskFlagRate: 0,
    emotionFlags: [],
    journalQuality: 0,
    repeatedMistakes: [],
  };

  const result = await withDb(async (client) => {
    const res = await client.query(
      `SELECT risk_percent, discipline_score, risk_flag, emotion, entry_reason, risk_plan
       FROM academy_trading_arena_trades
       WHERE student_id = $1::uuid ORDER BY created_at DESC LIMIT 50`,
      [studentId],
    );

    const trades = res.rows;
    if (!trades.length) return empty;

    const count = trades.length;
    const avgRisk = Number((trades.reduce((s, r) => s + Number(r.risk_percent || 0), 0) / count).toFixed(2));
    const avgDiscipline = Math.round(trades.reduce((s, r) => s + Number(r.discipline_score || 0), 0) / count);
    const flagged = trades.filter((r) => r.risk_flag).length;
    const riskFlagRate = Number((flagged / count).toFixed(2));

    // Detect negative emotion patterns.
    const emotionText = trades.map((r) => String(r.emotion || "").toLowerCase()).join(" ");
    const emotionFlags: string[] = [];
    if (/انتقام|revenge/.test(emotionText)) emotionFlags.push("revenge");
    if (/ترس|fear|scared/.test(emotionText)) emotionFlags.push("fear");
    if (/طمع|greed|هیجان|excited/.test(emotionText)) emotionFlags.push("greed");
    if (/fomo|نریزم|از دست/.test(emotionText)) emotionFlags.push("fomo");

    // Journal quality: average chars of entry_reason + risk_plan.
    const avgJournalChars =
      trades.reduce((s, r) => s + String(r.entry_reason || "").length + String(r.risk_plan || "").length, 0) / count;
    // 0 chars → 0, 200+ chars → 100.
    const journalQuality = Math.min(100, Math.round((avgJournalChars / 200) * 100));

    const repeatedMistakes: string[] = [];
    if (avgRisk > 5) repeatedMistakes.push("over_risk");
    if (journalQuality < 30) repeatedMistakes.push("no_plan");
    if (emotionFlags.includes("revenge") || emotionFlags.includes("greed")) repeatedMistakes.push("emotional_entry");
    if (riskFlagRate > 0.4) repeatedMistakes.push("discipline_breach");

    return { tradeCount: count, avgRisk, avgDiscipline, riskFlagRate, emotionFlags, journalQuality, repeatedMistakes };
  });

  return result.enabled ? (result.value ?? empty) : empty;
}

/** Scan stored mentor conversations for goal, psychology, and style signals. */
export async function collectConversationSignals(studentId: string): Promise<ConversationSignals> {
  const empty: ConversationSignals = {
    primaryGoal: "",
    psychologyFlags: [],
    careerIntent: false,
    repeatedThemes: [],
    messageCount: 0,
    avgUserMessageLength: 0,
  };

  const result = await withDb(async (client) => {
    const res = await client.query(
      `SELECT role, content FROM mentor_conversations
       WHERE student_id = $1::uuid AND role = 'user'
       ORDER BY created_at DESC LIMIT 60`,
      [studentId],
    );

    const messages = res.rows;
    if (!messages.length) return empty;

    const fullText = messages.map((r) => String(r.content || "").toLowerCase()).join(" ");
    const messageCount = messages.length;
    const avgUserMessageLength = Math.round(
      messages.reduce((s, r) => s + String(r.content || "").length, 0) / messageCount,
    );

    // ── Psychology flags ──────────────────────────────────────────────────────
    const psychologyFlags: string[] = [];
    if (/fomo|نریزم دست|از دست دادم|جا موندم/.test(fullText)) psychologyFlags.push("fomo");
    if (/ترسیدم|نگرانم|scared|fear|ترس دارم/.test(fullText)) psychologyFlags.push("fear");
    if (/طمع|greed|خیلی سود|سود زیاد/.test(fullText)) psychologyFlags.push("greed");
    if (/انتقامی|revenge|جبران کنم|ضررم را|معامله انتقامی/.test(fullText)) psychologyFlags.push("revenge");

    // ── Career intent ─────────────────────────────────────────────────────────
    const careerIntent = /trader|معامله‌گر|معامله گر|شغل|حرفه.ای شدن|career|full.?time/.test(fullText);

    // ── Primary goal (first matching keyword wins) ────────────────────────────
    let primaryGoal = "";
    if (/امن معامله|ورود امن|محافظت از سرمایه|safe trading/.test(fullText)) primaryGoal = "safe_spot_trading";
    else if (/passive income|درآمد غیرفعال|کسب درآمد/.test(fullText)) primaryGoal = "passive_income";
    else if (/فیوچرز|futures|لوریج|leverage/.test(fullText)) primaryGoal = "futures_trading";
    else if (/آکادمی|یادگیری|آموزش|ترم/.test(fullText)) primaryGoal = "academy_completion";
    else if (careerIntent) primaryGoal = "professional_trading";

    // ── Repeated themes (count word-level topic hits) ─────────────────────────
    const themeMap: Record<string, RegExp> = {
      risk_management: /ریسک|risk|حد ضرر|stop loss|position size/,
      technical_analysis: /rsi|macd|کندل|حمایت|مقاومت|نمودار|trend/,
      security: /seed|phrase|کیف پول|wallet|فیشینگ|phishing|امنیت/,
      psychology: /ترس|طمع|fomo|هیجان|روانشناسی|psychology/,
      fundamentals: /fdv|market cap|توکنومیکس|tokenomics|whitepaper/,
    };
    const repeatedThemes = Object.entries(themeMap)
      .filter(([, re]) => re.test(fullText))
      .map(([theme]) => theme);

    return { primaryGoal, psychologyFlags, careerIntent, repeatedThemes, messageCount, avgUserMessageLength };
  });

  return result.enabled ? (result.value ?? empty) : empty;
}

// ── Profile computation ───────────────────────────────────────────────────────

/** Derive a MentorProfileUpdate from all collected signals. Pure function — no DB writes. */
export function computeMentorProfileUpdate(
  academy: AcademySignals,
  trading: TradingSignals,
  conversation: ConversationSignals,
): MentorProfileUpdate {
  // ── Level ─────────────────────────────────────────────────────────────────
  let level: "beginner" | "intermediate" | "advanced";
  if (academy.completedTerms >= 5 && academy.avgPassedPercent >= 70) {
    level = "advanced";
  } else if (academy.completedTerms >= 2 || academy.avgPassedPercent >= 65) {
    level = "intermediate";
  } else {
    level = "beginner";
  }

  // ── Risk profile ──────────────────────────────────────────────────────────
  let riskProfile: "low" | "medium" | "high";
  if (trading.tradeCount === 0) {
    riskProfile = "medium"; // no data — use neutral default
  } else if (trading.avgRisk > 5 || trading.riskFlagRate > 0.35) {
    riskProfile = "high";
  } else if (trading.avgRisk < 2 && trading.riskFlagRate < 0.1) {
    riskProfile = "low";
  } else {
    riskProfile = "medium";
  }

  // ── Confidence score: 40% academy + 40% trading discipline + 20% completion bonus ──
  const academyComponent = Math.round(academy.avgPassedPercent * 0.4);
  const tradingComponent =
    trading.tradeCount > 0 ? Math.round(trading.avgDiscipline * 0.4) : 16; // neutral default
  const completionBonus = Math.min(20, academy.completedTerms * 4);
  const confidenceScore = clamp(academyComponent + tradingComponent + completionBonus);

  // ── Discipline score: from trading if available, else from challenge accuracy ──
  const disciplineScore =
    trading.tradeCount >= 3
      ? clamp(trading.avgDiscipline)
      : clamp(academy.challengeAccuracy);

  // ── Learning style: analytical when many challenge attempts, practical when many trades ──
  let learningStyle: "practical" | "analytical" | "mixed";
  if (academy.totalChallengeAttempts >= 10 && trading.tradeCount < 5) {
    learningStyle = "analytical";
  } else if (trading.tradeCount >= 5 && academy.totalChallengeAttempts < 5) {
    learningStyle = "practical";
  } else {
    learningStyle = "mixed";
  }

  // ── Weak areas ────────────────────────────────────────────────────────────
  const weakAreas: string[] = [];
  if (academy.avgPassedPercent < 70 && academy.completedTerms > 0) weakAreas.push("quiz_review");
  if (academy.failedTermNumbers.length > 0)
    academy.failedTermNumbers.slice(0, 3).forEach((n) => weakAreas.push(`term_${n}_retry`));
  for (const topic of academy.weakTopics.slice(0, 3)) weakAreas.push(`topic_${topic}`);
  if (trading.avgRisk > 5) weakAreas.push("risk_control");
  if (trading.riskFlagRate > 0.3) weakAreas.push("risk_discipline");
  if (conversation.psychologyFlags.includes("fomo")) weakAreas.push("fomo_management");
  if (conversation.psychologyFlags.includes("revenge")) weakAreas.push("revenge_trading");
  if (trading.journalQuality < 40 && trading.tradeCount >= 3) weakAreas.push("journal_quality");
  if (trading.repeatedMistakes.includes("emotional_entry")) weakAreas.push("emotional_control");

  // ── Strong areas ──────────────────────────────────────────────────────────
  const strongAreas: string[] = [];
  if (academy.completedTerms >= 3) strongAreas.push("learning_consistency");
  if (trading.avgDiscipline >= 75 && trading.tradeCount >= 3) strongAreas.push("trade_discipline");
  if (trading.journalQuality >= 65 && trading.tradeCount >= 3) strongAreas.push("journal_quality");
  if (trading.riskFlagRate < 0.1 && trading.tradeCount >= 5) strongAreas.push("clean_risk_record");
  if (academy.challengeAccuracy >= 75 && academy.totalChallengeAttempts >= 5) strongAreas.push("quiz_mastery");
  if (trading.tradeCount >= 10) strongAreas.push("practice_commitment");

  // ── Primary goal ──────────────────────────────────────────────────────────
  const primaryGoal = cleanText(
    conversation.primaryGoal || (conversation.careerIntent ? "professional_trading" : "safe_spot_trading"),
    120,
  );

  return { level, riskProfile, primaryGoal, weakAreas, strongAreas, confidenceScore, disciplineScore, learningStyle };
}

// ── Profile writer ────────────────────────────────────────────────────────────

/**
 * Collect all signals, compute the profile update, write it to mentor_profiles,
 * and return the computed update.  Returns null if the DB pool is not configured.
 *
 * TODO(i18n-mentor): insight label strings are currently tag-format English
 *   (e.g. "risk_control", "quiz_review").  A future phase should translate these
 *   to locale-aware display strings for the student-facing UI.
 */
export async function applyMentorProfileUpdate(
  studentId: string,
): Promise<MentorProfileUpdate | null> {
  // Collect all signals in parallel.
  const [academy, trading, conversation] = await Promise.all([
    collectAcademySignals(studentId),
    collectTradingSignals(studentId),
    collectConversationSignals(studentId),
  ]);

  const update = computeMentorProfileUpdate(academy, trading, conversation);

  const result = await withDb(async (client) => {
    await client.query(
      `INSERT INTO mentor_profiles (student_id, level, risk_profile, primary_goal,
         weak_areas, strong_areas, confidence_score, discipline_score, learning_style,
         last_active_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (student_id) DO UPDATE SET
         level = EXCLUDED.level,
         risk_profile = EXCLUDED.risk_profile,
         primary_goal = EXCLUDED.primary_goal,
         weak_areas = EXCLUDED.weak_areas,
         strong_areas = EXCLUDED.strong_areas,
         confidence_score = EXCLUDED.confidence_score,
         discipline_score = EXCLUDED.discipline_score,
         learning_style = EXCLUDED.learning_style,
         last_active_at = NOW(),
         updated_at = NOW()`,
      [
        studentId,
        update.level,
        update.riskProfile,
        update.primaryGoal,
        update.weakAreas,
        update.strongAreas,
        update.confidenceScore,
        update.disciplineScore,
        update.learningStyle,
      ],
    );
    return update;
  });

  return result.enabled ? result.value : null;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
