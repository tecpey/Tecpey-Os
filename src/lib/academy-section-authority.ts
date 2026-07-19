import type { PoolClient } from "pg";
import {
  calculateTermLearningSummary,
  resolveOfficialLesson,
  type AcademyLocale,
  type LessonProgressRecord,
  type TermLearningSummary,
} from "./academy-lesson-progress";
import {
  gradeAcademySectionCheckpoint,
  listAcademyTermCheckpoints,
  type AcademySectionCheckpoint,
} from "./academy-section-checkpoint";
import {
  awardAcademyReward,
  readLearningCommand,
  storeLearningCommand,
} from "./academy-authority";
import { refreshAcademyProgressProjection } from "./academy-progress-projection";

const SECTION_COMPLETION_XP = 15;

type LessonRow = {
  locale: AcademyLocale;
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
  locale: AcademyLocale;
  term_number: number;
  term_slug: string;
  total_sections: number;
  completed_sections: number;
  answered_sections: number;
  percent: number;
  xp: number;
  updated_at: string;
};

export type AuthoritativeLessonRecord = LessonProgressRecord & {
  questionId: string | null;
  questionVersion: string | null;
  selectedOptionId: string | null;
  lastAnswerCorrect: boolean | null;
  bestScore: number;
  attemptCount: number;
  passedAt: string | null;
  authority: "server_checkpoint_v1";
};

export type AcademyTermSectionProjection = {
  records: AuthoritativeLessonRecord[];
  summary: TermLearningSummary;
  checkpoints: Array<{ sectionKey: string; checkpoint: AcademySectionCheckpoint }>;
  state: Awaited<ReturnType<typeof refreshAcademyProgressProjection>>["state"];
  revision: number;
  authority: "server_checkpoint_v1";
};

export type AcademySectionSubmissionResponse = {
  correct: boolean;
  completed: boolean;
  rewarded: boolean;
  record: AuthoritativeLessonRecord;
  summary: TermLearningSummary;
  checkpoint: AcademySectionCheckpoint;
  state: Awaited<ReturnType<typeof refreshAcademyProgressProjection>>["state"];
  revision: number;
  authority: "server_checkpoint_v1";
  replayed: boolean;
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
  client: PoolClient,
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

export async function readAcademyTermSectionProjection(
  client: PoolClient,
  input: { studentId: string; locale: AcademyLocale; termSlug: string },
): Promise<AcademyTermSectionProjection | null> {
  const checkpoints = listAcademyTermCheckpoints(input.locale, input.termSlug);
  if (checkpoints.length === 0) return null;

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
    [input.studentId, input.locale, input.termSlug],
  );
  const summariesResult = await client.query<SummaryRow>(
    `SELECT locale, term_number, term_slug, total_sections,
            completed_sections, answered_sections, percent, xp, updated_at
       FROM academy_term_learning_progress
      WHERE student_id = $1::uuid AND locale = $2 AND term_slug = $3
      LIMIT 1`,
    [input.studentId, input.locale, input.termSlug],
  );
  const projection = await refreshAcademyProgressProjection(
    client,
    input.studentId,
    input.locale,
  );
  const termNumber = Number(input.termSlug.slice("term-".length));
  const summary = summariesResult.rows[0]
    ? toSummary(summariesResult.rows[0])
    : calculateTermLearningSummary({
        locale: input.locale,
        termNumber,
        termSlug: input.termSlug,
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
    authority: "server_checkpoint_v1",
  };
}

export async function submitAcademySectionCheckpoint(
  client: PoolClient,
  input: {
    studentId: string;
    locale: AcademyLocale;
    termSlug: string;
    sectionKey: string;
    questionVersion: string;
    selectedOptionId: string;
    idempotencyKey: string;
    networkIp?: string | null;
  },
): Promise<
  | { status: "committed"; response: AcademySectionSubmissionResponse }
  | { status: "idempotency_conflict" }
  | { status: "previous_term_required" }
  | { status: "lesson_not_found" }
  | { status: "question_version_conflict"; checkpoint: AcademySectionCheckpoint }
> {
  const definition = resolveOfficialLesson(input.locale, input.termSlug, input.sectionKey);
  if (!definition) return { status: "lesson_not_found" };
  const grade = gradeAcademySectionCheckpoint({
    locale: input.locale,
    termSlug: input.termSlug,
    sectionKey: input.sectionKey,
    questionVersion: input.questionVersion,
    selectedOptionId: input.selectedOptionId,
  });
  if (grade.status === "not_found") return { status: "lesson_not_found" };
  if (grade.status === "version_conflict") {
    return { status: "question_version_conflict", checkpoint: grade.current };
  }

  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('academy_section_checkpoint'), hashtext($1))`,
    [`${input.studentId}:${input.locale}:${input.termSlug}:${input.sectionKey}`],
  );
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('academy_learning_idempotency'), hashtext($1))`,
    [`${input.studentId}:${input.idempotencyKey}`],
  );

  const commandType = `section_checkpoint:${input.termSlug}:${input.sectionKey}`;
  const commandRequest = {
    locale: input.locale,
    termSlug: input.termSlug,
    sectionKey: input.sectionKey,
    questionId: grade.resolved.checkpoint.questionId,
    questionVersion: input.questionVersion,
    selectedOptionId: input.selectedOptionId,
  };
  const command = await readLearningCommand<AcademySectionSubmissionResponse>(
    client,
    input.studentId,
    commandType,
    commandRequest,
    input.idempotencyKey,
  );
  if (command.idempotencyConflict) return { status: "idempotency_conflict" };
  if (command.response) {
    const projection = await refreshAcademyProgressProjection(
      client,
      input.studentId,
      input.locale,
    );
    return {
      status: "committed",
      response: {
        ...command.response,
        state: projection.state,
        revision: projection.revision,
        replayed: true,
      },
    };
  }

  if (!(await previousOfficialTermPassed(
    client,
    input.studentId,
    input.locale,
    definition.termNumber,
  ))) {
    return { status: "previous_term_required" };
  }

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
    [input.studentId, input.locale, input.termSlug, input.sectionKey],
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
      input.studentId,
      input.locale,
      definition.termNumber,
      input.termSlug,
      input.sectionKey,
      grade.resolved.checkpoint.questionId,
      input.questionVersion,
      input.selectedOptionId,
      grade.correct,
      score,
      command.requestHash,
      input.idempotencyKey,
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
      input.studentId,
      input.locale,
      definition.termNumber,
      input.termSlug,
      input.sectionKey,
      definition.sectionHeading,
      completed,
      input.selectedOptionId,
      grade.resolved.checkpoint.questionId,
      input.questionVersion,
      grade.correct,
      score,
    ],
  );

  let rewarded = false;
  if (grade.correct) {
    rewarded = await awardAcademyReward(client, {
      studentId: input.studentId,
      locale: input.locale,
      rewardKey: `section:${input.termSlug}/${input.sectionKey}:complete`,
      rewardType: "lesson_complete",
      sourceType: "section_checkpoint",
      sourceId: `${input.termSlug}/${input.sectionKey}`,
      xp: SECTION_COMPLETION_XP,
      metadata: {
        questionId: grade.resolved.checkpoint.questionId,
        questionVersion: input.questionVersion,
        termNumber: definition.termNumber,
      },
    });
    await awardAcademyReward(client, {
      studentId: input.studentId,
      locale: input.locale,
      rewardKey: "badge:first-lesson",
      rewardType: "badge",
      sourceType: "section_checkpoint",
      sourceId: `${input.termSlug}/${input.sectionKey}`,
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
    [input.studentId, input.locale, input.termSlug],
  );
  const counts = countsResult.rows[0] ?? { completed_sections: 0, answered_sections: 0 };
  const summary = calculateTermLearningSummary({
    locale: input.locale,
    termNumber: definition.termNumber,
    termSlug: input.termSlug,
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
      input.studentId,
      input.locale,
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
      input.studentId,
      JSON.stringify({
        locale: input.locale,
        termNumber: definition.termNumber,
        termSlug: input.termSlug,
        sectionKey: input.sectionKey,
        questionId: grade.resolved.checkpoint.questionId,
        questionVersion: input.questionVersion,
        correct: grade.correct,
        completed,
        rewarded,
        authority: "server_checkpoint_v1",
      }),
      input.networkIp ?? null,
    ],
  );

  const projection = await refreshAcademyProgressProjection(
    client,
    input.studentId,
    input.locale,
  );
  const response: AcademySectionSubmissionResponse = {
    correct: grade.correct,
    completed,
    rewarded,
    record: toLessonRecord(savedResult.rows[0]),
    summary: toSummary(savedSummaryResult.rows[0]),
    checkpoint: grade.resolved.checkpoint,
    state: projection.state,
    revision: projection.revision,
    authority: "server_checkpoint_v1",
    replayed: false,
  };
  await storeLearningCommand(client, {
    studentId: input.studentId,
    commandType,
    requestHash: command.requestHash,
    idempotencyKey: input.idempotencyKey,
    result: response,
  });
  return { status: "committed", response };
}
