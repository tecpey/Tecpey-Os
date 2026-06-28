import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { getStudentSessionFromRequest } from "@/lib/academy-session";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/student-cartax";
import { createSmartNotification, maybeAwardAchievement, recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { apiOk, apiError } from "@/lib/api-validation";

type QuestionRow = {
  id: string;
  term_number: number;
  lesson_slug: string;
  topic: string;
  cognitive_skill: string;
  difficulty: number;
  question: string;
  options: Record<string, string>;
  correct_option?: string;
};

function publicQuestion(row: QuestionRow) {
  const safe = { ...row };
  delete safe.correct_option;
  return safe;
}

function fallbackQuestion(locale: string, termNumber: number, lessonSlug: string) {
  const isFa = locale !== "en";
  return {
    id: `fallback-${termNumber}-${lessonSlug}`,
    term_number: termNumber,
    lesson_slug: lessonSlug,
    topic: "risk-awareness",
    cognitive_skill: "decision-making",
    difficulty: Math.min(5, Math.max(1, termNumber)),
    question: isFa ? "اگر در یک تصمیم معاملاتی مطمئن نیستی، مسئولانه‌ترین رفتار چیست؟" : "If you are not confident in a trading decision, what is the most responsible action?",
    options: isFa
      ? { A: "افزایش حجم برای جبران", B: "صبر، بازبینی ریسک و ثبت دلیل تصمیم", C: "ورود فوری قبل از تغییر بازار", D: "نادیده گرفتن حد ضرر" }
      : { A: "Increase size to compensate", B: "Pause, review risk and document the reason", C: "Enter immediately before the market moves", D: "Ignore stop loss" },
  };
}

export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { namespace: "mentor-challenge-read", limit: 80, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);
  const session = await getStudentSessionFromRequest(req);
  const url = new URL(req.url);
  const locale = cleanText(url.searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
  const termNumber = Math.max(1, Math.min(7, Math.round(Number(url.searchParams.get("termNumber")) || 1)));
  const lessonSlug = cleanText(url.searchParams.get("lessonSlug") || `term-${termNumber}`, 100) || `term-${termNumber}`;
  const topic = cleanText(url.searchParams.get("topic") || "", 80);

  try {
    const result = await withDb(async (client) => {
      const profile = session?.studentId ? await client.query(`SELECT decision_score, confidence_score, weak_topics FROM learning_brain_profiles WHERE student_id = $1::uuid LIMIT 1`, [session.studentId]) : { rows: [] };
      const confidence = Number(profile.rows[0]?.confidence_score || 45);
      const difficulty = Math.max(1, Math.min(5, Math.round(termNumber >= 6 ? 4 : confidence > 80 ? termNumber + 1 : termNumber)));
      const used = session?.studentId
        ? await client.query(`SELECT question_id FROM mentor_challenge_attempts WHERE student_id = $1::uuid`, [session.studentId])
        : { rows: [] };
      const usedIds = used.rows.map((row) => row.question_id);
      const rows = await client.query(
        `SELECT id, term_number, lesson_slug, topic, cognitive_skill, difficulty, question, options
         FROM academy_question_bank
         WHERE locale = $1 AND term_number = $2 AND approved = TRUE
           AND ($3::text = '' OR topic = $3 OR lesson_slug = $4)
           AND difficulty BETWEEN GREATEST(1, $5::int - 1) AND LEAST(5, $5::int + 1)
           AND NOT (id = ANY($6::text[]))
         ORDER BY usage_count ASC, difficulty DESC, created_at ASC
         LIMIT 1`,
        [locale, termNumber, topic, lessonSlug, difficulty, usedIds],
      );
      const question = rows.rows[0] || null;
      if (question) await client.query(`UPDATE academy_question_bank SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`, [question.id]);
      return question ? publicQuestion(question) : fallbackQuestion(locale, termNumber, lessonSlug);
    });
    if (!result.enabled) return apiOk({ question: fallbackQuestion(locale, termNumber, lessonSlug) });
    return apiOk({ question: result.value });
  } catch {
    return apiOk({ question: fallbackQuestion(locale, termNumber, lessonSlug) });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, { namespace: "mentor-challenge-submit", limit: 80, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);
  const session = await getStudentSessionFromRequest(req);
  if (!session?.studentId) return apiError("complete_account_required", 401);
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return apiError("payload_too_large", 413);
    const body = JSON.parse(raw || "{}");
    const questionId = cleanText(body.questionId, 120);
    const selectedOption = cleanText(body.selectedOption, 5).toUpperCase();
    if (!questionId || !["A","B","C","D"].includes(selectedOption)) return apiError("invalid_answer", 400);
    const responseTimeMs = Math.max(0, Math.min(600_000, Math.round(Number(body.responseTimeMs) || 0)));
    const confidence = cleanText(body.confidence || "medium", 20);
    const result = await withDb(async (client) => {
      const question = await client.query(`SELECT id, term_number, lesson_slug, topic, difficulty, correct_option, explanation FROM academy_question_bank WHERE id = $1 AND approved = TRUE LIMIT 1`, [questionId]);
      const row = question.rows[0];
      if (!row) return { accepted: false, error: "question_not_found" };
      const count = await client.query(`SELECT COUNT(*)::int AS attempts FROM mentor_challenge_attempts WHERE student_id = $1::uuid AND question_id = $2`, [session.studentId, questionId]);
      const attemptNumber = Number(count.rows[0]?.attempts || 0) + 1;
      const first = await client.query(`SELECT selected_option FROM mentor_challenge_attempts WHERE student_id = $1::uuid AND question_id = $2 ORDER BY id ASC LIMIT 1`, [session.studentId, questionId]);
      const firstAnswer = first.rows[0]?.selected_option || selectedOption;
      const isCorrect = selectedOption === row.correct_option;
      await client.query(
        `INSERT INTO mentor_challenge_attempts
         (student_id, question_id, term_number, lesson_slug, locale, selected_option, is_correct, attempt_number, first_answer, response_time_ms, confidence)
         VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [session.studentId, questionId, row.term_number, row.lesson_slug, cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa", selectedOption, isCorrect, attemptNumber, firstAnswer, responseTimeMs, confidence],
      );
      if (isCorrect) await client.query(`UPDATE academy_question_bank SET success_count = success_count + 1 WHERE id = $1`, [questionId]);
      await recordLearningEvent(client, { studentId: session.studentId, eventType: "mentor_challenge_answered", payload: { questionId, selectedOption, isCorrect, attemptNumber, firstAnswer, responseTimeMs, topic: row.topic, difficulty: row.difficulty, ip: getClientIp(req) } });
      if (attemptNumber === 1) await maybeAwardAchievement(client, session.studentId, "first-quiz", { questionId });
      if (row.topic === "risk-management" && isCorrect) await maybeAwardAchievement(client, session.studentId, "risk-master", { questionId });
      await createSmartNotification(client, {
        studentId: session.studentId,
        type: isCorrect ? "achievement" : "mentor",
        title: isCorrect ? "چالش منتور ثبت شد" : "منتور یک تمرین بهتر پیشنهاد می‌کند",
        body: isCorrect ? "پاسخ تو در پروفایل یادگیری ثبت شد." : "پاسخ اشتباه هم ارزشمند است؛ منتور از همین رفتار برای تحلیل مسیر یادگیری استفاده می‌کند.",
        actionUrl: isCorrect ? "/academy/profile" : "/academy/mentor-coach",
        priority: isCorrect ? 2 : 3,
        metadata: { questionId, isCorrect, attemptNumber },
      });
      return { accepted: true, isCorrect, attemptNumber, firstAnswer, topic: row.topic, explanation: isCorrect ? row.explanation : null };
    });
    if (!result.enabled) return apiError("mentor_challenge_not_configured", 503);
    if (!result.value?.accepted) return apiError(result.value?.error || "not_accepted", 404);
    return apiOk({ result: result.value });
  } catch {
    return apiError("server_error", 500);
  }
}
