import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { withDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  calculateTermLearningSummary,
  normalizeAttempts,
  parseAcademyLocale,
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

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "academy-lesson-progress-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
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
        legacyReadOnly: true,
      };
    });

    if (!result.enabled) return apiError("lesson_progress_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

/**
 * Historical section-reading rows remain available as a read-only migration
 * record. Self-declared reading completion can no longer award XP, completion,
 * unlocks, badges or projection changes.
 */
export async function PUT() {
  const response = apiError("academy_lesson_progress_read_only", 405);
  response.headers.set("Allow", "GET");
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
