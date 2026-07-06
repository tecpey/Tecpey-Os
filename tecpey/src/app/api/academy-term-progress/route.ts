import { verifyCsrfOrigin } from "@/lib/csrf";
import { NextRequest } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
// TODO(cookie-migration): remove getStudentSessionFromRequest once canonical session
//   replaces all per-cookie reads in academy routes.
import { cleanText } from "@/lib/student-cartax";
import { maybeAwardAchievement, recordLearningEvent } from "@/lib/learning-os";
import { withDb } from "@/lib/db";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

type Queryable = { query: (query: string, values?: unknown[]) => Promise<{ rows: any[] }> };
type LocalTermRow = {
  student_id: string;
  term_number: number;
  locale: string;
  score: number;
  percent: number;
  status: string;
  passed_at?: string | null;
  updated_at: string;
};
type LocalTermStore = Record<string, LocalTermRow[]>;

function localProgressPath() {
  return path.join(process.cwd(), "storage", "academy-term-progress.local.json");
}
function canUseLocalProgress() {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.TECPEY_ENABLE_LOCAL_ACADEMY_STORAGE === "true";
}
async function readLocalProgress(): Promise<LocalTermStore> {
  if (!canUseLocalProgress()) return {};
  try {
    return JSON.parse(await readFile(localProgressPath(), "utf8")) as LocalTermStore;
  } catch {
    return {};
  }
}
async function writeLocalProgress(store: LocalTermStore) {
  if (!canUseLocalProgress()) return;
  await mkdir(path.dirname(localProgressPath()), { recursive: true });
  await writeFile(localProgressPath(), JSON.stringify(store, null, 2), "utf8");
}

function getTerm(locale: string, termNumber: number) {
  const list = locale === "en" ? academyPathTermsEn : academyPathTerms;
  return list.find((term) => term.number === termNumber);
}

function normalizeAnswers(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, string>;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, answer]) => [key, cleanText(answer, 500)]));
}

function normalizeAttemptLog(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, string[]>;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, attempts]) => [
    key,
    Array.isArray(attempts) ? attempts.map((item) => cleanText(item, 500)).slice(0, 20) : [],
  ]));
}

async function hasPreviousTermPassed(client: Queryable, studentId: string, termNumber: number, locale: string) {
  if (termNumber <= 1) return true;
  const row = await client.query(
    `SELECT 1 FROM academy_term_progress WHERE student_id = $1::uuid AND term_number = $2 AND locale = $3 AND status = 'passed' LIMIT 1`,
    [studentId, termNumber - 1, locale],
  );
  return Boolean(row.rows[0]);
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-term-progress" }, async () => {
  const limit = await rateLimit(req, { namespace: "academy-term-progress-read", limit: 120, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);
  const session = await getCanonicalSession(req);
  if (!session.studentId) return apiOk({ terms: [] });
  const studentId = session.studentId;
  const locale = cleanText(new URL(req.url).searchParams.get("locale") || "fa", 10) === "en" ? "en" : "fa";
  try {
    const result = await withDb(async (client) => {
      const rows = await client.query(
        `SELECT term_number, locale, score, percent, status, passed_at, updated_at
         FROM academy_term_progress
         WHERE student_id = $1::uuid AND locale = $2
         ORDER BY term_number ASC`,
        [studentId, locale],
      );
      return rows.rows;
    });
    if (result.enabled) return apiOk({ terms: result.value || [] });
    const store = await readLocalProgress();
    return apiOk({ terms: (store[studentId] || []).filter((row) => row.locale === locale).sort((a,b) => a.term_number - b.term_number) });
  } catch {
    if (canUseLocalProgress()) {
      const store = await readLocalProgress();
      return apiOk({ terms: (store[studentId] || []).filter((row) => row.locale === locale).sort((a,b) => a.term_number - b.term_number) });
    }
    return apiError("server_error", 500);
  }
  }); // end withObservability
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-term-progress" }, async () => {
  if (!verifyCsrfOrigin(req))
    return apiError("forbidden", 403);
  const limit = await rateLimit(req, { namespace: "academy-term-progress-submit", limit: 30, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);
  const session = await getCanonicalSession(req);
  if (!session.studentId) return apiError("complete_account_required", 401);
  const studentId = session.studentId;

  try {
    const raw = await req.text();
    if (raw.length > 20_000) return apiError("payload_too_large", 413);
    const body = JSON.parse(raw || "{}");
    const termNumber = Math.max(1, Math.min(7, Math.round(Number(body.termNumber) || 1)));
    const locale = cleanText(body.locale || "fa", 10) === "en" ? "en" : "fa";
    const term = getTerm(locale, termNumber);
    if (!term) return apiError("term_not_found", 404);
    const submitted = normalizeAnswers(body.answers);
    const attemptLog = normalizeAttemptLog(body.attemptLog);
    const total = term.questions.length;
    const evaluation = term.questions.reduce((acc, item, index) => {
      const key = String(index);
      const attempts = attemptLog[key]?.length ? attemptLog[key] : submitted[key] ? [submitted[key]] : [];
      const finalAnswer = submitted[key];
      const finalCorrect = finalAnswer === item.answer;
      const firstCorrect = attempts[0] === item.answer;
      const attemptCount = Math.max(1, attempts.length || 1);
      const weighted = finalCorrect ? Math.max(40, 100 - (attemptCount - 1) * 20) : 0;
      return {
        rawCorrect: acc.rawCorrect + (finalCorrect ? 1 : 0),
        firstTryCorrect: acc.firstTryCorrect + (firstCorrect ? 1 : 0),
        weightedTotal: acc.weightedTotal + weighted,
        wrongAttempts: acc.wrongAttempts + attempts.filter((answer) => answer !== item.answer).length,
      };
    }, { rawCorrect: 0, firstTryCorrect: 0, weightedTotal: 0, wrongAttempts: 0 });
    const score = evaluation.rawCorrect;
    const percent = total ? Math.round(evaluation.weightedTotal / total) : 0;
    const allFinalCorrect = total > 0 && score === total;
    const passed = allFinalCorrect && percent >= Number(process.env.ACADEMY_TERM_PASS_PERCENT || 80);

    const result = await withDb(async (client) => {
      const previousPassed = await hasPreviousTermPassed(client, studentId, termNumber, locale);
      if (!previousPassed) return { blocked: true, score, percent, passed: false, termNumber };
      await client.query(
        `INSERT INTO academy_term_progress (student_id, term_number, locale, score, percent, status, passed_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, CASE WHEN $6 = 'passed' THEN NOW() ELSE NULL END)
         ON CONFLICT (student_id, term_number, locale) DO UPDATE SET
           score = GREATEST(academy_term_progress.score, EXCLUDED.score),
           percent = GREATEST(academy_term_progress.percent, EXCLUDED.percent),
           status = CASE WHEN academy_term_progress.status = 'passed' OR EXCLUDED.status = 'passed' THEN 'passed' ELSE 'attempted' END,
           passed_at = COALESCE(academy_term_progress.passed_at, EXCLUDED.passed_at),
           updated_at = NOW()`,
        [studentId, termNumber, locale, score, percent, passed ? "passed" : "attempted"],
      );
      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'term_quiz_submitted', $2::jsonb)`,
        [studentId, JSON.stringify({ termNumber, locale, score, percent, passed, attemptLog, firstTryCorrect: evaluation.firstTryCorrect, wrongAttempts: evaluation.wrongAttempts, ip: getClientIp(req) })],
      );
      await recordLearningEvent(client, {
        studentId: studentId,
        eventType: "quiz_attempt_recorded",
        payload: { termNumber, locale, score, percent, passed, attemptLog, firstTryCorrect: evaluation.firstTryCorrect, wrongAttempts: evaluation.wrongAttempts, ip: getClientIp(req) },
      });
      await maybeAwardAchievement(client, studentId, "first-quiz", { termNumber });
      if (passed) await maybeAwardAchievement(client, studentId, termNumber >= 7 ? "first-certificate" : "first-lesson", { termNumber });
      return { blocked: false, score, percent, passed, termNumber };
    });

    if (!result.enabled) {
      if (!canUseLocalProgress()) return apiError("progress_service_not_configured", 503);
      const store = await readLocalProgress();
      const rows = store[studentId] || [];
      const previousPassed = termNumber <= 1 || rows.some((row) => row.locale === locale && row.term_number === termNumber - 1 && row.status === "passed");
      if (!previousPassed) return apiError("previous_term_required", 403, { score, percent, passed: false, termNumber });
      const now = new Date().toISOString();
      const existingIndex = rows.findIndex((row) => row.locale === locale && row.term_number === termNumber);
      const previous = existingIndex >= 0 ? rows[existingIndex] : null;
      const nextStatus = previous?.status === "passed" || passed ? "passed" : "attempted";
      const row: LocalTermRow = {
        student_id: studentId,
        term_number: termNumber,
        locale,
        score: Math.max(previous?.score || 0, score),
        percent: Math.max(previous?.percent || 0, percent),
        status: nextStatus,
        passed_at: previous?.passed_at || (nextStatus === "passed" ? now : null),
        updated_at: now,
      };
      if (existingIndex >= 0) rows[existingIndex] = row;
      else rows.push(row);
      store[studentId] = rows;
      await writeLocalProgress(store);
      scheduleMentorProfileUpdate(studentId, "academy_progress_updated");
      return apiOk({ score: row.score, percent: row.percent, passed: row.status === "passed", termNumber });
    }
    if (result.value?.blocked) return apiError("previous_term_required", 403, result.value ?? undefined);
    scheduleMentorProfileUpdate(studentId, "quiz_submitted");
    return apiOk({ ...result.value });
  } catch {
    return apiError("server_error", 500);
  }
  }); // end withObservability
}
