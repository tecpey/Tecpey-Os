import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb, withTx } from "@/lib/db";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import {
  appendAttempt,
  calculateTermLearningSummary,
  normalizeAttempts,
  normalizeLessonAnswer,
  parseAcademyLocale,
  resolveOfficialLesson,
  type LessonProgressAction,
  type LessonProgressRecord,
  type TermLearningSummary,
} from "@/lib/academy-lesson-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LessonRow = {
  locale: "fa" | "en";
  term_number: number;
  term_slug: string;
  section_key: string;
  section_heading: string;
  completed: boolean;
  answer: string | null;
  first_answer: string | null;
  answer_attempts: unknown;
  completed_at: string | null;
  answered_at: string | null;
  updated_at: string;
};

type SummaryRow = {
  locale: "fa" | "en";
  term_number: number;
  term_slug: string;
  total_sections: number;
  completed_sections: number;
  answered_sections: number;
  percent: number;
  xp: number;
  updated_at: string;
};

function toLessonRecord(row: LessonRow): LessonProgressRecord {
  return {
    locale: row.locale,
    termNumber: Number(row.term_number),
    termSlug: row.term_slug,
    sectionKey: row.section_key,
    sectionHeading: row.section_heading,
    completed: Boolean(row.completed),
    answer: row.answer,
    firstAnswer: row.first_answer,
    answerAttempts: normalizeAttempts(row.answer_attempts),
    completedAt: row.completed_at,
    answeredAt: row.answered_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(row: SummaryRow): TermLearningSummary {
  return calculateTermLearningSummary({
    locale: row.locale,
    termNumber: Number(row.term_number),
    termSlug: row.term_slug,
    totalSections: Number(row.total_sections),
    completedSections: Number(row.completed_sections),
    answeredSections: Number(row.answered_sections),
    updatedAt: row.updated_at,
  });
}

async function previousOfficialTermPassed(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  studentId: string,
  locale: "fa" | "en",
  termNumber: number,
): Promise<boolean> {
  if (termNumber <= 1) return true;
  const result = await client.query(
    `SELECT 1
     FROM academy_term_progress
     WHERE student_id = $1::uuid
       AND locale = $2
       AND term_number = $3
       AND status = 'passed'
     LIMIT 1`,
    [studentId, locale, termNumber - 1],
  );
  return result.rows.length > 0;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "academy-lesson-progress-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.studentId) {
      return apiOk({ records: [], terms: [] }, 200, { "Cache-Control": "no-store, max-age=0" });
    }

    const url = new URL(req.url);
    const locale = parseAcademyLocale(url.searchParams.get("locale"));
    const requestedTermSlug = String(url.searchParams.get("termSlug") ?? "").trim();
    if (requestedTermSlug && !/^term-[1-7]$/.test(requestedTermSlug)) {
      return apiError("invalid_term", 400);
    }

    const result = await withDb(async (client) => {
      const values: unknown[] = [session.studentId, locale];
      const termFilter = requestedTermSlug ? "AND term_slug = $3" : "";
      if (requestedTermSlug) values.push(requestedTermSlug);

      const [recordsResult, summariesResult] = await Promise.all([
        client.query<LessonRow>(
          `SELECT locale, term_number, term_slug, section_key, section_heading,
                  completed, answer, first_answer, answer_attempts,
                  completed_at, answered_at, updated_at
           FROM academy_lesson_progress
           WHERE student_id = $1::uuid AND locale = $2 ${termFilter}
           ORDER BY term_number ASC, section_key ASC`,
          values,
        ),
        client.query<SummaryRow>(
          `SELECT locale, term_number, term_slug, total_sections,
                  completed_sections, answered_sections, percent, xp, updated_at
           FROM academy_term_learning_progress
           WHERE student_id = $1::uuid AND locale = $2 ${termFilter}
           ORDER BY term_number ASC`,
          values,
        ),
      ]);

      return {
        records: recordsResult.rows.map(toLessonRecord),
        terms: summariesResult.rows.map(toSummary),
      };
    });

    if (!result.enabled) return apiError("lesson_progress_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function PUT(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 16_384)) {
      return apiError("payload_too_large", 413);
    }

    const limit = await rateLimit(req, {
      namespace: "academy-lesson-progress-write",
      limit: 90,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const locale = parseAcademyLocale(body.locale);
    const termSlug = String(body.termSlug ?? "").trim();
    const sectionKey = String(body.sectionKey ?? "").trim();
    const action = body.action === "answer" || body.action === "complete"
      ? body.action as LessonProgressAction
      : null;
    const definition = resolveOfficialLesson(locale, termSlug, sectionKey);
    const answer = action === "answer" ? normalizeLessonAnswer(body.answer) : null;
    if (!definition || !action || (action === "answer" && !answer)) {
      return apiError("invalid_lesson_progress", 400);
    }

    const result = await withTx(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtext('academy_lesson_progress'),
           hashtext($1)
         )`,
        [`${session.studentId}:${locale}:${definition.termSlug}`],
      );

      const allowed = await previousOfficialTermPassed(
        client,
        session.studentId as string,
        locale,
        definition.termNumber,
      );
      if (!allowed) return { blocked: true as const };

      const existingResult = await client.query<LessonRow>(
        `SELECT locale, term_number, term_slug, section_key, section_heading,
                completed, answer, first_answer, answer_attempts,
                completed_at, answered_at, updated_at
         FROM academy_lesson_progress
         WHERE student_id = $1::uuid
           AND locale = $2
           AND term_slug = $3
           AND section_key = $4
         FOR UPDATE`,
        [session.studentId, locale, definition.termSlug, definition.sectionKey],
      );
      const existing = existingResult.rows[0];
      const attempts = action === "answer" && answer
        ? appendAttempt(existing?.answer_attempts, answer)
        : normalizeAttempts(existing?.answer_attempts);
      const completed = action === "complete" || action === "answer" || Boolean(existing?.completed);
      const finalAnswer = action === "answer" ? answer : existing?.answer ?? null;
      const firstAnswer = existing?.first_answer ?? (action === "answer" ? answer : null);

      const savedResult = await client.query<LessonRow>(
        `INSERT INTO academy_lesson_progress (
           student_id, locale, term_number, term_slug, section_key, section_heading,
           completed, answer, first_answer, answer_attempts,
           completed_at, answered_at, created_at, updated_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6,
           $7, $8, $9, $10::jsonb,
           CASE WHEN $7 THEN NOW() ELSE NULL END,
           CASE WHEN $8::text IS NOT NULL THEN NOW() ELSE NULL END,
           NOW(), NOW()
         )
         ON CONFLICT (student_id, locale, term_slug, section_key) DO UPDATE SET
           section_heading = EXCLUDED.section_heading,
           completed = academy_lesson_progress.completed OR EXCLUDED.completed,
           answer = COALESCE(EXCLUDED.answer, academy_lesson_progress.answer),
           first_answer = COALESCE(academy_lesson_progress.first_answer, EXCLUDED.first_answer),
           answer_attempts = EXCLUDED.answer_attempts,
           completed_at = COALESCE(academy_lesson_progress.completed_at, EXCLUDED.completed_at),
           answered_at = CASE
             WHEN EXCLUDED.answer IS NOT NULL THEN NOW()
             ELSE academy_lesson_progress.answered_at
           END,
           updated_at = NOW()
         RETURNING locale, term_number, term_slug, section_key, section_heading,
                   completed, answer, first_answer, answer_attempts,
                   completed_at, answered_at, updated_at`,
        [
          session.studentId,
          locale,
          definition.termNumber,
          definition.termSlug,
          definition.sectionKey,
          definition.sectionHeading,
          completed,
          finalAnswer,
          firstAnswer,
          JSON.stringify(attempts),
        ],
      );

      const countsResult = await client.query<{
        completed_sections: number;
        answered_sections: number;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE completed)::int AS completed_sections,
           COUNT(*) FILTER (WHERE answer IS NOT NULL)::int AS answered_sections
         FROM academy_lesson_progress
         WHERE student_id = $1::uuid AND locale = $2 AND term_slug = $3`,
        [session.studentId, locale, definition.termSlug],
      );
      const counts = countsResult.rows[0] ?? { completed_sections: 0, answered_sections: 0 };
      const summary = calculateTermLearningSummary({
        locale,
        termNumber: definition.termNumber,
        termSlug: definition.termSlug,
        totalSections: definition.totalSections,
        completedSections: Number(counts.completed_sections),
        answeredSections: Number(counts.answered_sections),
        updatedAt: new Date().toISOString(),
      });

      const savedSummaryResult = await client.query<SummaryRow>(
        `INSERT INTO academy_term_learning_progress (
           student_id, locale, term_number, term_slug, total_sections,
           completed_sections, answered_sections, percent, xp, created_at, updated_at
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (student_id, locale, term_slug) DO UPDATE SET
           term_number = EXCLUDED.term_number,
           total_sections = EXCLUDED.total_sections,
           completed_sections = EXCLUDED.completed_sections,
           answered_sections = EXCLUDED.answered_sections,
           percent = EXCLUDED.percent,
           xp = EXCLUDED.xp,
           updated_at = NOW()
         RETURNING locale, term_number, term_slug, total_sections,
                   completed_sections, answered_sections, percent, xp, updated_at`,
        [
          session.studentId,
          locale,
          summary.termNumber,
          summary.termSlug,
          summary.totalSections,
          summary.completedSections,
          summary.answeredSections,
          summary.percent,
          summary.xp,
        ],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'lesson_progress_updated', $2::jsonb)`,
        [session.studentId, JSON.stringify({
          locale,
          termNumber: definition.termNumber,
          termSlug: definition.termSlug,
          sectionKey: definition.sectionKey,
          action,
          answer,
          attemptCount: attempts.length,
          completed,
          ip: getClientIp(req),
        })],
      );

      return {
        blocked: false as const,
        record: toLessonRecord(savedResult.rows[0]),
        summary: toSummary(savedSummaryResult.rows[0]),
      };
    });

    if (!result.enabled) return apiError("lesson_progress_service_not_configured", 503);
    if (result.value.blocked) return apiError("previous_term_required", 403);

    scheduleMentorProfileUpdate(session.studentId, "lesson_progress_updated");
    return apiOk({
      record: result.value.record,
      summary: result.value.summary,
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
