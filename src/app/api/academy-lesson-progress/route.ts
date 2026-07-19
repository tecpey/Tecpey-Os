import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { withTx } from "@/lib/db";
import { rateLimitUser } from "@/lib/rate-limit";
import { apiError, apiOk, checkBodySize } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { scheduleMentorProfileUpdate } from "@/lib/mentor-events";
import { refreshAcademyProgressProjection } from "@/lib/academy-progress-projection";
import {
  calculateTermLearningSummary,
  parseAcademyLocale,
  resolveOfficialLesson,
  type LessonProgressRecord,
  type TermLearningSummary,
} from "@/lib/academy-lesson-progress";
import {
  gradeAcademySectionCheckpoint,
  listAcademyTermCheckpoints,
} from "@/lib/academy-section-checkpoint";
import {
  awardAcademyReward,
  readLearningCommand,
  storeLearningCommand,
} from "@/lib/academy-authority";
import { getTrustedClientIp } from "@/lib/security/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECTION_COMPLETION_XP = 15;

type LessonRow = {
  locale: "fa" | "en";
  term_number: number;
  term_slug: string;
  section_key: string;
  section_heading: string;
  completed: boolean;
  answer: string | null;
  first_answer: string | null;
  completed_at: string | null;
  answered_at: string | null;
  updated_at: string;
  question_id: string | null;
  question_version: string | null;
  selected_option_id: string | null;
  last_answer_correct: boolean | null;
  best_score: number;
  attempt_count: number;
  passed_at: string | null;
  authority_status: string;
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

type AuthoritativeLessonRecord = LessonProgressRecord & {
  questionId: string | null;
  questionVersion: string | null;
  selectedOptionId: string | null;
  lastAnswerCorrect: boolean | null;
  bestScore: number;
  attemptCount: number;
  passedAt: string | null;
  authority: "server_checkpoint_v1";
};

function toLessonRecord(row: LessonRow): AuthoritativeLessonRecord {
  return {
    locale: row.locale,
    termNumber: Number(row.term_number),
    termSlug: row.term_slug,
    sectionKey: row.section_key,
    sectionHeading: row.section_heading,
    completed: Boolean(row.completed),
    answer: row.answer,
    firstAnswer: row.first_answer,
    answerAttempts: [],
    completedAt: row.completed_at,
    answeredAt: row.answered_at,
    updatedAt: row.updated_at,
    questionId: row.question_id,
    questionVersion: row.question_version,
    selectedOptionId: row.selected_option_id,
    lastAnswerCorrect: row.last_answer_correct,
    bestScore: Number(row.best_score),
    attemptCount: Number(row.attempt_count),
    passedAt: row.passed_at,
    authority: "server_checkpoint_v1",
  };
}

function toSummary(row: SummaryRow): TermLearningSummary {
  return {
    locale: row.locale,
    termNumber: Number(row.term_number),
    termSlug: row.term_slug,
    totalSections: Number(row.total_sections),
    completedSections: Number(row.completed_sections),
    answeredSections: Number(row.answered_sections),
    percent: Number(row.percent),
    xp: Number(row.xp),
    updatedAt: row.updated_at,
  };
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

function parseIdempotencyKey(req: NextRequest, body: Record<string, unknown>): string | null {
  const value = String(req.headers.get("Idempotency-Key") ?? body.idempotencyKey ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 160);
  return /^[A-Za-z0-9._:-]{16,160}$/.test(value) ? value : null;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () => {
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const limit = await rateLimitUser(req, {
      namespace: "academy-lesson-progress-read",
      limit: 120,
      windowMs: 60_000,
      userId: session.studentId,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    const locale = parseAcademyLocale(url.searchParams.get("locale"));
    const requestedTermSlug = String(url.searchParams.get("termSlug") ?? "").trim();
    if (!/^term-[1-7]$/.test(requestedTermSlug)) return apiError("invalid_term", 400);
    const checkpoints = listAcademyTermCheckpoints(locale, requestedTermSlug);
    if (checkpoints.length === 0) return apiError("term_not_found", 404);

    const result = await withTx(async (client) => {
      const recordsResult = await client.query<LessonRow>(
        `SELECT locale, term_number, term_slug, section_key, section_heading,
                completed, answer, first_answer, completed_at, answered_at,
                updated_at, question_id, question_version, selected_option_id,
                last_answer_correct, best_score, attempt_count, passed_at,
                authority_status
           FROM academy_lesson_progress
          WHERE student_id = $1::uuid
            AND locale = $2
            AND term_slug = $3
            AND authority_status = 'server_checkpoint_v1'
          ORDER BY section_key ASC`,
        [session.studentId, locale, requestedTermSlug],
      );
      const summariesResult = await client.query<SummaryRow>(
        `SELECT locale, term_number, term_slug, total_sections,
                completed_sections, answered_sections, percent, xp, updated_at
           FROM academy_term_learning_progress
          WHERE student_id = $1::uuid AND locale = $2 AND term_slug = $3
          LIMIT 1`,
        [session.studentId, locale, requestedTermSlug],
      );
      const projection = await refreshAcademyProgressProjection(
        client,
        session.studentId as string,
        locale,
      );
      const termNumber = Number(requestedTermSlug.slice("term-".length));
      const summary = summariesResult.rows[0]
        ? toSummary(summariesResult.rows[0])
        : calculateTermLearningSummary({
            locale,
            termNumber,
            termSlug: requestedTermSlug,
            totalSections: checkpoints.length,
            completedSections: 0,
            answeredSections: 0,
          });
      return {
        records: recordsResult.rows.map(toLessonRecord),
        summary,
        checkpoints,
        state: projection.state,
        revision: projection.revision,
        authority: "server_checkpoint_v1" as const,
      };
    });

    if (!result.enabled) return apiError("lesson_progress_service_not_configured", 503);
    return apiOk(result.value, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function PUT(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    if (!checkBodySize(req.headers.get("content-length"), 8_192)) {
      return apiError("payload_too_large", 413);
    }

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return apiError("complete_account_required", 401);
    const limit = await rateLimitUser(req, {
      namespace: "academy-lesson-progress-write",
      limit: 60,
      windowMs: 60_000,
      userId: session.studentId,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return apiError("invalid_json", 400);
    }

    const locale = parseAcademyLocale(body.locale);
    const termSlug = String(body.termSlug ?? "").trim();
    const sectionKey = String(body.sectionKey ?? "").trim();
    const questionVersion = String(body.questionVersion ?? "").trim().slice(0, 100);
    const selectedOptionId = String(body.selectedOptionId ?? "").trim().slice(0, 120);
    const idempotencyKey = parseIdempotencyKey(req, body);
    const definition = resolveOfficialLesson(locale, termSlug, sectionKey);
    if (!definition || !questionVersion || !selectedOptionId || !idempotencyKey) {
      return apiError("invalid_lesson_checkpoint", 400);
    }

    const grade = gradeAcademySectionCheckpoint({
      locale,
      termSlug,
      sectionKey,
      questionVersion,
      selectedOptionId,
    });
    if (grade.status === "not_found") return apiError("lesson_not_found", 404);
    if (grade.status === "version_conflict") {
      return apiError("question_version_conflict", 409, { checkpoint: grade.current });
    }

    const commandType = `section_checkpoint:${termSlug}:${sectionKey}`;
    const commandRequest = {
      locale,
      termSlug,
      sectionKey,
      questionId: grade.resolved.checkpoint.questionId,
      questionVersion,
      selectedOptionId,
    };

    const result = await withTx(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('academy_section_checkpoint'), hashtext($1))`,
        [`${session.studentId}:${locale}:${termSlug}:${sectionKey}`],
      );
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('academy_learning_idempotency'), hashtext($1))`,
        [`${session.studentId}:${idempotencyKey}`],
      );

      const command = await readLearningCommand<Record<string, unknown>>(
        client,
        session.studentId as string,
        commandType,
        commandRequest,
        idempotencyKey,
      );
      if (command.idempotencyConflict) return { idempotencyConflict: true as const };
      if (command.response) {
        const projection = await refreshAcademyProgressProjection(
          client,
          session.studentId as string,
          locale,
        );
        return {
          ...command.response,
          state: projection.state,
          revision: projection.revision,
          replayed: true,
        };
      }

      const allowed = await previousOfficialTermPassed(
        client,
        session.studentId as string,
        locale,
        definition.termNumber,
      );
      if (!allowed) return { blocked: true as const };

      const existingResult = await client.query<LessonRow>(
        `SELECT locale, term_number, term_slug, section_key, section_heading,
                completed, answer, first_answer, completed_at, answered_at,
                updated_at, question_id, question_version, selected_option_id,
                last_answer_correct, best_score, attempt_count, passed_at,
                authority_status
           FROM academy_lesson_progress
          WHERE student_id = $1::uuid
            AND locale = $2
            AND term_slug = $3
            AND section_key = $4
          FOR UPDATE`,
        [session.studentId, locale, termSlug, sectionKey],
      );
      const existing = existingResult.rows[0];
      const score = grade.correct ? 100 : 0;
      const completed = Boolean(existing?.completed) || grade.correct;

      await client.query(
        `INSERT INTO academy_section_attempts
          (student_id, locale, term_number, term_slug, section_key,
           question_id, question_version, selected_option_id, correct, score,
           request_hash, idempotency_key)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          session.studentId,
          locale,
          definition.termNumber,
          termSlug,
          sectionKey,
          grade.resolved.checkpoint.questionId,
          questionVersion,
          selectedOptionId,
          grade.correct,
          score,
          command.requestHash,
          idempotencyKey,
        ],
      );

      const savedResult = await client.query<LessonRow>(
        `INSERT INTO academy_lesson_progress (
           student_id, locale, term_number, term_slug, section_key, section_heading,
           completed, answer, first_answer, answer_attempts,
           completed_at, answered_at, question_id, question_version,
           selected_option_id, last_answer_correct, best_score, attempt_count,
           passed_at, authority_status, created_at, updated_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6,
           $7, $8, $8, '[]'::jsonb,
           CASE WHEN $7 THEN NOW() ELSE NULL END, NOW(), $9, $10,
           $8, $11, $12, 1,
           CASE WHEN $7 THEN NOW() ELSE NULL END, 'server_checkpoint_v1', NOW(), NOW()
         )
         ON CONFLICT (student_id, locale, term_slug, section_key) DO UPDATE SET
           section_heading = EXCLUDED.section_heading,
           completed = academy_lesson_progress.completed OR EXCLUDED.completed,
           answer = CASE
             WHEN academy_lesson_progress.completed THEN academy_lesson_progress.answer
             ELSE EXCLUDED.answer
           END,
           first_answer = COALESCE(academy_lesson_progress.first_answer, EXCLUDED.first_answer),
           completed_at = COALESCE(academy_lesson_progress.completed_at, EXCLUDED.completed_at),
           answered_at = NOW(),
           question_id = CASE
             WHEN academy_lesson_progress.completed THEN academy_lesson_progress.question_id
             ELSE EXCLUDED.question_id
           END,
           question_version = CASE
             WHEN academy_lesson_progress.completed THEN academy_lesson_progress.question_version
             ELSE EXCLUDED.question_version
           END,
           selected_option_id = CASE
             WHEN academy_lesson_progress.completed THEN academy_lesson_progress.selected_option_id
             ELSE EXCLUDED.selected_option_id
           END,
           last_answer_correct = COALESCE(academy_lesson_progress.last_answer_correct, FALSE)
             OR EXCLUDED.last_answer_correct,
           best_score = GREATEST(academy_lesson_progress.best_score, EXCLUDED.best_score),
           attempt_count = academy_lesson_progress.attempt_count + 1,
           passed_at = COALESCE(academy_lesson_progress.passed_at, EXCLUDED.passed_at),
           authority_status = 'server_checkpoint_v1',
           updated_at = NOW()
         RETURNING locale, term_number, term_slug, section_key, section_heading,
                   completed, answer, first_answer, completed_at, answered_at,
                   updated_at, question_id, question_version, selected_option_id,
                   last_answer_correct, best_score, attempt_count, passed_at,
                   authority_status`,
        [
          session.studentId,
          locale,
          definition.termNumber,
          termSlug,
          sectionKey,
          definition.sectionHeading,
          completed,
          selectedOptionId,
          grade.resolved.checkpoint.questionId,
          questionVersion,
          grade.correct,
          score,
        ],
      );

      let rewarded = false;
      if (grade.correct) {
        rewarded = await awardAcademyReward(client, {
          studentId: session.studentId as string,
          locale,
          rewardKey: `section:${termSlug}/${sectionKey}:complete`,
          rewardType: "lesson_complete",
          sourceType: "section_checkpoint",
          sourceId: `${termSlug}/${sectionKey}`,
          xp: SECTION_COMPLETION_XP,
          metadata: {
            questionId: grade.resolved.checkpoint.questionId,
            questionVersion,
            termNumber: definition.termNumber,
          },
        });
        await awardAcademyReward(client, {
          studentId: session.studentId as string,
          locale,
          rewardKey: "badge:first-lesson",
          rewardType: "badge",
          sourceType: "section_checkpoint",
          sourceId: `${termSlug}/${sectionKey}`,
          badgeCode: "first-lesson",
          metadata: { authority: "server_checkpoint_v1" },
        });
      }

      const countsResult = await client.query<{
        completed_sections: number;
        answered_sections: number;
      }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE authority_status = 'server_checkpoint_v1' AND completed = TRUE
           )::int AS completed_sections,
           COUNT(*) FILTER (
             WHERE authority_status = 'server_checkpoint_v1' AND attempt_count > 0
           )::int AS answered_sections
         FROM academy_lesson_progress
         WHERE student_id = $1::uuid AND locale = $2 AND term_slug = $3`,
        [session.studentId, locale, termSlug],
      );
      const counts = countsResult.rows[0] ?? { completed_sections: 0, answered_sections: 0 };
      const summary = calculateTermLearningSummary({
        locale,
        termNumber: definition.termNumber,
        termSlug,
        totalSections: definition.totalSections,
        completedSections: Number(counts.completed_sections),
        answeredSections: Number(counts.answered_sections),
        updatedAt: new Date().toISOString(),
      });
      const authoritativeXp = summary.completedSections * SECTION_COMPLETION_XP;

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
          authoritativeXp,
        ],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload, ip)
         VALUES ($1::uuid, 'section_checkpoint_submitted', $2::jsonb, $3)`,
        [
          session.studentId,
          JSON.stringify({
            locale,
            termNumber: definition.termNumber,
            termSlug,
            sectionKey,
            questionId: grade.resolved.checkpoint.questionId,
            questionVersion,
            correct: grade.correct,
            completed,
            rewarded,
            authority: "server_checkpoint_v1",
          }),
          getTrustedClientIp(req),
        ],
      );

      const projection = await refreshAcademyProgressProjection(
        client,
        session.studentId as string,
        locale,
      );
      const response = {
        correct: grade.correct,
        completed,
        rewarded,
        record: toLessonRecord(savedResult.rows[0]),
        summary: toSummary(savedSummaryResult.rows[0]),
        checkpoint: grade.resolved.checkpoint,
        state: projection.state,
        revision: projection.revision,
        authority: "server_checkpoint_v1",
      };
      await storeLearningCommand(client, {
        studentId: session.studentId as string,
        commandType,
        requestHash: command.requestHash,
        idempotencyKey,
        result: response,
      });
      return { ...response, replayed: false };
    });

    if (!result.enabled) return apiError("lesson_progress_service_not_configured", 503);
    if ("idempotencyConflict" in result.value && result.value.idempotencyConflict) {
      return apiError("idempotency_key_conflict", 409);
    }
    if ("blocked" in result.value && result.value.blocked) {
      return apiError("previous_term_required", 403);
    }
    const responseBody = result.value as Record<string, unknown>;
    if (responseBody.replayed !== true) {
      scheduleMentorProfileUpdate(session.studentId, "authoritative_section_checkpoint");
    }
    return apiOk(responseBody, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/academy-lesson-progress" }, async () =>
    apiError(
      "academy_lesson_progress_put_only",
      405,
      { authority: "server_checkpoint_v1" },
      { Allow: "GET, PUT", "Cache-Control": "no-store, max-age=0" },
    ),
  );
}
