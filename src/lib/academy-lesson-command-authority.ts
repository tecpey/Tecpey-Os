import { createHash } from "crypto";
import { withDb, withTx } from "./db";
import {
  awardAcademyReward,
  readLearningCommand,
  storeLearningCommand,
} from "./academy-authority";
import {
  appendAttempt,
  calculateTermLearningSummary,
  resolveOfficialLesson,
  type AcademyLocale,
  type LessonProgressRecord,
  type TermLearningSummary,
} from "./academy-lesson-progress";
import {
  gradeAcademyLessonQuestion,
  publicAcademyLessonQuestion,
  type AcademyLessonQuestion,
} from "./academy-lesson-question-authority";
import { refreshAcademyProgressProjection } from "./academy-progress-projection";
import type { AcademyProgressState } from "./academy-progress";
import { logger } from "./logger";

export type AcademyLessonCommandAction = "content_complete" | "quick_check_answer";

export type AcademyLessonProgressRecord = LessonProgressRecord & {
  contentCompleted: boolean;
  questionId: string | null;
  questionVersion: number | null;
  selectedOptionId: string | null;
  questionPassed: boolean;
  correctAnswerAt: string | null;
  revision: number;
  authorityVersion: "legacy_ungraded" | "server_graded_v1";
};

export type AcademyLessonCommandResult = {
  record: AcademyLessonProgressRecord;
  summary: TermLearningSummary & { passedSections: number; revision: number };
  state: AcademyProgressState;
  projectionRevision: number;
  answer: null | {
    correct: boolean;
    questionId: string;
    questionVersion: number;
    selectedOptionId: string;
  };
  replayed: boolean;
};

export type AcademyLessonCommandInput = {
  studentId: string;
  locale: AcademyLocale;
  termSlug: string;
  sectionKey: string;
  action: AcademyLessonCommandAction;
  idempotencyKey: string;
  questionId?: string | null;
  questionVersion?: number | null;
  selectedOptionId?: string | null;
  metadata?: Record<string, unknown>;
};

type LessonRow = {
  locale: AcademyLocale;
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
  content_completed: boolean;
  question_id: string | null;
  question_version: number | null;
  selected_option_id: string | null;
  question_passed: boolean;
  correct_answer_at: string | null;
  revision: string;
  authority_version: "legacy_ungraded" | "server_graded_v1";
};

type SummaryRow = {
  locale: AcademyLocale;
  term_number: number;
  term_slug: string;
  total_sections: number;
  completed_sections: number;
  answered_sections: number;
  passed_sections: number;
  percent: number;
  xp: number;
  revision: string;
  updated_at: string;
};

class AcademyLessonCommandError extends Error {
  constructor(
    readonly reason: string,
    readonly code: number,
  ) {
    super(reason);
  }
}

function validIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9._:-]{16,128}$/.test(value);
}

function commandHashLock(input: AcademyLessonCommandInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.studentId,
        input.locale,
        input.termSlug,
        input.sectionKey,
      ]),
    )
    .digest("hex");
}

function toLessonRecord(row: LessonRow): AcademyLessonProgressRecord {
  return {
    locale: row.locale,
    termNumber: Number(row.term_number),
    termSlug: row.term_slug,
    sectionKey: row.section_key,
    sectionHeading: row.section_heading,
    completed: Boolean(row.completed),
    answer: row.answer,
    firstAnswer: row.first_answer,
    answerAttempts: Array.isArray(row.answer_attempts)
      ? row.answer_attempts.filter((value): value is string => typeof value === "string")
      : [],
    completedAt: row.completed_at,
    answeredAt: row.answered_at,
    updatedAt: row.updated_at,
    contentCompleted: Boolean(row.content_completed),
    questionId: row.question_id,
    questionVersion:
      row.question_version === null ? null : Number(row.question_version),
    selectedOptionId: row.selected_option_id,
    questionPassed: Boolean(row.question_passed),
    correctAnswerAt: row.correct_answer_at,
    revision: Number(row.revision),
    authorityVersion: row.authority_version,
  };
}

function toSummary(row: SummaryRow): TermLearningSummary & {
  passedSections: number;
  revision: number;
} {
  const summary = calculateTermLearningSummary({
    locale: row.locale,
    termNumber: Number(row.term_number),
    termSlug: row.term_slug,
    totalSections: Number(row.total_sections),
    completedSections: Number(row.completed_sections),
    answeredSections: Number(row.answered_sections),
    updatedAt: row.updated_at,
  });
  return {
    ...summary,
    passedSections: Number(row.passed_sections),
    percent: Number(row.percent),
    xp: Number(row.xp),
    revision: Number(row.revision),
  };
}

async function previousOfficialTermPassed(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  studentId: string,
  locale: AcademyLocale,
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

export async function executeAcademyLessonCommand(
  input: AcademyLessonCommandInput,
): Promise<
  | { ok: true; result: AcademyLessonCommandResult }
  | { ok: false; reason: string; code: number }
> {
  if (!validIdempotencyKey(input.idempotencyKey)) {
    return { ok: false, reason: "invalid_idempotency_key", code: 400 };
  }
  const definition = resolveOfficialLesson(
    input.locale,
    input.termSlug,
    input.sectionKey,
  );
  if (!definition) {
    return { ok: false, reason: "invalid_lesson_progress", code: 400 };
  }

  const question = publicAcademyLessonQuestion(
    input.locale,
    definition.termSlug,
    definition.sectionKey,
  );
  let graded:
    | {
        valid: true;
        correct: boolean;
        question: NonNullable<ReturnType<typeof gradeAcademyLessonQuestion>> extends infer _T
          ? never
          : never;
      }
    | null = null;
  if (input.action === "quick_check_answer") {
    const grade = gradeAcademyLessonQuestion({
      locale: input.locale,
      termSlug: definition.termSlug,
      sectionKey: definition.sectionKey,
      questionId: String(input.questionId ?? ""),
      questionVersion: Number(input.questionVersion ?? 0),
      selectedOptionId: String(input.selectedOptionId ?? ""),
    });
    if (!grade.valid) {
      return { ok: false, reason: "invalid_question_or_option", code: 400 };
    }
    graded = grade as typeof graded;
  }

  const request = {
    locale: input.locale,
    termSlug: definition.termSlug,
    sectionKey: definition.sectionKey,
    action: input.action,
    questionId: graded?.question.id ?? null,
    questionVersion: graded?.question.version ?? null,
    selectedOptionId: input.selectedOptionId ?? null,
  };

  try {
    const transaction = await withTx(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [commandHashLock(input)],
      );

      const existingCommand = await readLearningCommand<AcademyLessonCommandResult>(
        client,
        input.studentId,
        "lesson_progress_v1",
        request,
        input.idempotencyKey,
      );
      if (existingCommand.idempotencyConflict) {
        throw new AcademyLessonCommandError("idempotency_conflict", 409);
      }
      if (existingCommand.response) {
        return { ...existingCommand.response, replayed: true };
      }

      if (
        !(await previousOfficialTermPassed(
          client,
          input.studentId,
          input.locale,
          definition.termNumber,
        ))
      ) {
        throw new AcademyLessonCommandError("previous_term_required", 403);
      }

      const existingResult = await client.query<LessonRow>(
        `SELECT locale, term_number, term_slug, section_key, section_heading,
                completed, answer, first_answer, answer_attempts,
                completed_at, answered_at, updated_at,
                content_completed, question_id, question_version,
                selected_option_id, question_passed, correct_answer_at,
                revision::text, authority_version
           FROM academy_lesson_progress
          WHERE student_id = $1::uuid
            AND locale = $2
            AND term_slug = $3
            AND section_key = $4
          FOR UPDATE`,
        [
          input.studentId,
          input.locale,
          definition.termSlug,
          definition.sectionKey,
        ],
      );
      const existing = existingResult.rows[0];
      const selectedOptionId =
        input.action === "quick_check_answer"
          ? String(input.selectedOptionId)
          : existing?.selected_option_id ?? null;
      const attempts =
        input.action === "quick_check_answer" && selectedOptionId
          ? appendAttempt(existing?.answer_attempts, selectedOptionId)
          : Array.isArray(existing?.answer_attempts)
            ? existing.answer_attempts
            : [];
      const contentCompleted =
        input.action === "content_complete" || Boolean(existing?.content_completed);
      const questionPassed =
        Boolean(existing?.question_passed) || Boolean(graded?.correct);
      const completed = contentCompleted && questionPassed;

      await client.query(
        `INSERT INTO academy_lesson_attempt_evidence (
           student_id, locale, term_number, term_slug, section_key, action,
           question_id, question_version, selected_option_id, is_correct,
           request_hash, idempotency_key, metadata
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12, $13::jsonb
         )`,
        [
          input.studentId,
          input.locale,
          definition.termNumber,
          definition.termSlug,
          definition.sectionKey,
          input.action,
          graded?.question.id ?? null,
          graded?.question.version ?? null,
          selectedOptionId,
          graded?.correct ?? null,
          existingCommand.requestHash,
          input.idempotencyKey,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      const savedResult = await client.query<LessonRow>(
        `INSERT INTO academy_lesson_progress (
           student_id, locale, term_number, term_slug, section_key,
           section_heading, completed, answer, first_answer, answer_attempts,
           completed_at, answered_at, content_completed, question_id,
           question_version, selected_option_id, question_passed,
           correct_answer_at, revision, authority_version, created_at, updated_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5,
           $6, $7, $8, $9, $10::jsonb,
           CASE WHEN $11 THEN NOW() ELSE NULL END,
           CASE WHEN $8::text IS NOT NULL THEN NOW() ELSE NULL END,
           $11, $12, $13, $14, $15,
           CASE WHEN $15 THEN NOW() ELSE NULL END,
           1, 'server_graded_v1', NOW(), NOW()
         )
         ON CONFLICT (student_id, locale, term_slug, section_key) DO UPDATE SET
           section_heading = EXCLUDED.section_heading,
           content_completed = academy_lesson_progress.content_completed OR EXCLUDED.content_completed,
           question_id = COALESCE(EXCLUDED.question_id, academy_lesson_progress.question_id),
           question_version = COALESCE(EXCLUDED.question_version, academy_lesson_progress.question_version),
           selected_option_id = COALESCE(EXCLUDED.selected_option_id, academy_lesson_progress.selected_option_id),
           question_passed = academy_lesson_progress.question_passed OR EXCLUDED.question_passed,
           answer = COALESCE(EXCLUDED.answer, academy_lesson_progress.answer),
           first_answer = COALESCE(academy_lesson_progress.first_answer, EXCLUDED.first_answer),
           answer_attempts = EXCLUDED.answer_attempts,
           completed_at = COALESCE(academy_lesson_progress.completed_at, EXCLUDED.completed_at),
           answered_at = CASE
             WHEN EXCLUDED.answer IS NOT NULL THEN NOW()
             ELSE academy_lesson_progress.answered_at
           END,
           correct_answer_at = CASE
             WHEN academy_lesson_progress.question_passed THEN academy_lesson_progress.correct_answer_at
             WHEN EXCLUDED.question_passed THEN NOW()
             ELSE academy_lesson_progress.correct_answer_at
           END,
           revision = academy_lesson_progress.revision + 1,
           authority_version = 'server_graded_v1',
           updated_at = NOW()
         RETURNING locale, term_number, term_slug, section_key, section_heading,
                   completed, answer, first_answer, answer_attempts,
                   completed_at, answered_at, updated_at,
                   content_completed, question_id, question_version,
                   selected_option_id, question_passed, correct_answer_at,
                   revision::text, authority_version`,
        [
          input.studentId,
          input.locale,
          definition.termNumber,
          definition.termSlug,
          definition.sectionKey,
          definition.sectionHeading,
          completed,
          selectedOptionId,
          existing?.first_answer ?? selectedOptionId,
          JSON.stringify(attempts),
          contentCompleted,
          graded?.question.id ?? existing?.question_id ?? null,
          graded?.question.version ?? existing?.question_version ?? null,
          selectedOptionId,
          questionPassed,
        ],
      );

      const sourceId = `${definition.termSlug}/${definition.sectionKey}`;
      if (input.action === "content_complete") {
        await awardAcademyReward(client, {
          studentId: input.studentId,
          locale: input.locale,
          rewardKey: `lesson:${sourceId}:content`,
          rewardType: "lesson_content",
          sourceType: "official_lesson",
          sourceId,
          xp: 10,
          metadata: {
            termSlug: definition.termSlug,
            sectionKey: definition.sectionKey,
            authorityVersion: "server_graded_v1",
          },
        });
      }
      if (graded?.correct) {
        await awardAcademyReward(client, {
          studentId: input.studentId,
          locale: input.locale,
          rewardKey: `lesson:${sourceId}:quick-check`,
          rewardType: "lesson_quick_check",
          sourceType: "official_lesson",
          sourceId,
          xp: 5,
          metadata: {
            termSlug: definition.termSlug,
            sectionKey: definition.sectionKey,
            questionId: graded.question.id,
            questionVersion: graded.question.version,
            authorityVersion: "server_graded_v1",
          },
        });
        await awardAcademyReward(client, {
          studentId: input.studentId,
          locale: input.locale,
          rewardKey: "badge:first-lesson",
          rewardType: "badge",
          sourceType: "official_lesson",
          sourceId,
          badgeCode: "first-lesson",
          metadata: { authorityVersion: "server_graded_v1" },
        });
      }

      const countsResult = await client.query<{
        content_completed: number;
        answered_sections: number;
        passed_sections: number;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE content_completed)::int AS content_completed,
           COUNT(*) FILTER (WHERE selected_option_id IS NOT NULL)::int AS answered_sections,
           COUNT(*) FILTER (WHERE completed)::int AS passed_sections
         FROM academy_lesson_progress
         WHERE student_id = $1::uuid
           AND locale = $2
           AND term_slug = $3
           AND authority_version = 'server_graded_v1'`,
        [input.studentId, input.locale, definition.termSlug],
      );
      const counts = countsResult.rows[0] ?? {
        content_completed: 0,
        answered_sections: 0,
        passed_sections: 0,
      };
      const xpResult = await client.query<{ xp: number }>(
        `SELECT COALESCE(SUM(xp), 0)::int AS xp
           FROM academy_reward_ledger
          WHERE student_id = $1::uuid
            AND locale = $2
            AND source_type = 'official_lesson'
            AND source_id LIKE $3`,
        [input.studentId, input.locale, `${definition.termSlug}/%`],
      );
      const passedSections = Number(counts.passed_sections);
      const percent = Math.round(
        (passedSections / Math.max(1, definition.totalSections)) * 100,
      );

      const savedSummaryResult = await client.query<SummaryRow>(
        `INSERT INTO academy_term_learning_progress (
           student_id, locale, term_number, term_slug, total_sections,
           completed_sections, answered_sections, passed_sections,
           percent, xp, revision, authority_version, created_at, updated_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5,
           $6, $7, $8, $9, $10, 1, 'server_graded_v1', NOW(), NOW()
         )
         ON CONFLICT (student_id, locale, term_slug) DO UPDATE SET
           term_number = EXCLUDED.term_number,
           total_sections = EXCLUDED.total_sections,
           completed_sections = EXCLUDED.completed_sections,
           answered_sections = EXCLUDED.answered_sections,
           passed_sections = EXCLUDED.passed_sections,
           percent = EXCLUDED.percent,
           xp = EXCLUDED.xp,
           revision = academy_term_learning_progress.revision + 1,
           authority_version = 'server_graded_v1',
           updated_at = NOW()
         RETURNING locale, term_number, term_slug, total_sections,
                   completed_sections, answered_sections, passed_sections,
                   percent, xp, revision::text, updated_at`,
        [
          input.studentId,
          input.locale,
          definition.termNumber,
          definition.termSlug,
          definition.totalSections,
          Number(counts.content_completed),
          Number(counts.answered_sections),
          passedSections,
          percent,
          Number(xpResult.rows[0]?.xp ?? 0),
        ],
      );

      await client.query(
        `INSERT INTO academy_student_events (student_id, event_type, payload)
         VALUES ($1::uuid, 'lesson_progress_updated', $2::jsonb)`,
        [
          input.studentId,
          JSON.stringify({
            locale: input.locale,
            termNumber: definition.termNumber,
            termSlug: definition.termSlug,
            sectionKey: definition.sectionKey,
            action: input.action,
            questionId: graded?.question.id ?? null,
            questionVersion: graded?.question.version ?? null,
            selectedOptionId,
            correct: graded?.correct ?? null,
            completed,
            authorityVersion: "server_graded_v1",
          }),
        ],
      );

      const projection = await refreshAcademyProgressProjection(
        client,
        input.studentId,
        input.locale,
      );
      const result: AcademyLessonCommandResult = {
        record: toLessonRecord(savedResult.rows[0]),
        summary: toSummary(savedSummaryResult.rows[0]),
        state: projection.state,
        projectionRevision: projection.revision,
        answer:
          graded && question
            ? {
                correct: graded.correct,
                questionId: graded.question.id,
                questionVersion: graded.question.version,
                selectedOptionId: String(input.selectedOptionId),
              }
            : null,
        replayed: false,
      };
      await storeLearningCommand(client, {
        studentId: input.studentId,
        commandType: "lesson_progress_v1",
        requestHash: existingCommand.requestHash,
        idempotencyKey: input.idempotencyKey,
        result: result as unknown as Record<string, unknown>,
      });
      return result;
    });

    if (!transaction.enabled) {
      return { ok: false, reason: "academy_progress_storage_unavailable", code: 503 };
    }
    return { ok: true, result: transaction.value };
  } catch (error) {
    if (error instanceof AcademyLessonCommandError) {
      return { ok: false, reason: error.reason, code: error.code };
    }
    logger.error("[academy-progress] lesson command failed", {
      studentId: input.studentId,
      termSlug: input.termSlug,
      sectionKey: input.sectionKey,
      action: input.action,
      error: String(error),
    });
    return { ok: false, reason: "academy_progress_storage_unavailable", code: 503 };
  }
}

export async function readAcademyLessonProgress(input: {
  studentId: string;
  locale: AcademyLocale;
  termSlug?: string | null;
}): Promise<
  | {
      ok: true;
      records: AcademyLessonProgressRecord[];
      terms: Array<TermLearningSummary & { passedSections: number; revision: number }>;
      questions: Record<string, AcademyLessonQuestion>;
      state: AcademyProgressState | null;
      projectionRevision: number;
    }
  | { ok: false; reason: string }
> {
  const result = await withDb(async (client) => {
    const values: unknown[] = [input.studentId, input.locale];
    const termFilter = input.termSlug ? "AND term_slug = $3" : "";
    if (input.termSlug) values.push(input.termSlug);
    const [recordsResult, summariesResult, stateResult] = await Promise.all([
      client.query<LessonRow>(
        `SELECT locale, term_number, term_slug, section_key, section_heading,
                completed, answer, first_answer, answer_attempts,
                completed_at, answered_at, updated_at,
                content_completed, question_id, question_version,
                selected_option_id, question_passed, correct_answer_at,
                revision::text, authority_version
           FROM academy_lesson_progress
          WHERE student_id = $1::uuid AND locale = $2 ${termFilter}
          ORDER BY term_number ASC, section_key ASC`,
        values,
      ),
      client.query<SummaryRow>(
        `SELECT locale, term_number, term_slug, total_sections,
                completed_sections, answered_sections, passed_sections,
                percent, xp, revision::text, updated_at
           FROM academy_term_learning_progress
          WHERE student_id = $1::uuid
            AND locale = $2
            AND authority_version = 'server_graded_v1'
            ${termFilter}
          ORDER BY term_number ASC`,
        values,
      ),
      client.query<{ progress: AcademyProgressState; revision: string }>(
        `SELECT progress, revision::text
           FROM academy_state_documents
          WHERE student_id = $1::uuid
            AND locale = $2
            AND progress_authority = 'server_projection_v1'
          LIMIT 1`,
        [input.studentId, input.locale],
      ),
    ]);

    const questions: Record<string, AcademyLessonQuestion> = {};
    for (const record of recordsResult.rows) {
      const question = publicAcademyLessonQuestion(
        input.locale,
        record.term_slug,
        record.section_key,
      );
      if (question) questions[record.section_key] = question;
    }
    if (input.termSlug) {
      const definition = resolveOfficialLesson(input.locale, input.termSlug, "lesson-1");
      const total = definition?.totalSections ?? 0;
      for (let index = 0; index < total; index += 1) {
        const key = `lesson-${index + 1}`;
        const question = publicAcademyLessonQuestion(
          input.locale,
          input.termSlug,
          key,
        );
        if (question) questions[key] = question;
      }
    }

    return {
      records: recordsResult.rows.map(toLessonRecord),
      terms: summariesResult.rows.map(toSummary),
      questions,
      state: stateResult.rows[0]?.progress ?? null,
      projectionRevision: Number(stateResult.rows[0]?.revision ?? 0),
    };
  });
  if (!result.enabled) {
    return { ok: false, reason: "academy_progress_storage_unavailable" };
  }
  return { ok: true, ...result.value };
}
