import { createHash } from "crypto";
import type { PoolClient } from "pg";
import {
  TERM1,
  type Lesson,
  type QuizQuestion,
} from "@/data/academy/term1Curriculum";
import {
  XP_TABLE,
  createDefaultAcademyProgressState,
  normalizeAcademyProgressState,
  type AcademyProgressState,
  type LessonCompletion,
} from "@/lib/academy-progress";

export type AcademyLocale = "fa" | "en";
export type LessonAssessmentAnswer = string | string[] | Record<string, string>;
export type LessonAssessmentAnswers = Record<string, LessonAssessmentAnswer>;

export type LessonAssessmentResult = {
  lesson: Lesson;
  correctCount: number;
  questionCount: number;
  score: number;
  passed: boolean;
  answers: LessonAssessmentAnswers;
};

export type RewardEventProjectionRow = {
  id: number;
  rewardType: string;
  amount: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type LessonAttemptProjectionRow = {
  lessonId: string;
  termNumber: number;
  score: number;
  createdAt: string;
};

export type TermProgressProjectionRow = {
  termNumber: number;
  status: string;
};

export type ProgressProjectionInput = {
  baseline: AcademyProgressState;
  rewardEvents: RewardEventProjectionRow[];
  lessonAttempts: LessonAttemptProjectionRow[];
  termProgress: TermProgressProjectionRow[];
};

export type ProgressProjectionResult = {
  state: AcademyProgressState;
  activityDates: string[];
};

type LegacySnapshot = {
  baseline: AcademyProgressState;
  rewardEventCursor: number;
  currentState: AcademyProgressState;
  currentRevision: number;
  currentUpdatedAt: string | null;
  documentExists: boolean;
};

type ProjectionWriteResult = {
  state: AcademyProgressState;
  revision: number;
  updatedAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LESSON_PASS_PERCENT = 80;

function toUtcDay(value: string | number | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dayDistance(previous: string, next: string): number {
  const previousMs = Date.parse(`${previous}T00:00:00.000Z`);
  const nextMs = Date.parse(`${next}T00:00:00.000Z`);
  if (!Number.isFinite(previousMs) || !Number.isFinite(nextMs)) return Number.NaN;
  return Math.round((nextMs - previousMs) / DAY_MS);
}

function normalizeTextAnswer(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function normalizeAnswer(question: QuizQuestion, value: unknown): LessonAssessmentAnswer {
  if (question.type === "multi" || question.type === "ordering") {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeTextAnswer).filter(Boolean).slice(0, 50);
  }

  if (question.type === "matching") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([key, answer]) => [normalizeTextAnswer(key), normalizeTextAnswer(answer)] as const)
      .filter(([key, answer]) => key.length > 0 && answer.length > 0);
    return Object.fromEntries(entries);
  }

  return normalizeTextAnswer(value);
}

function answerIsCorrect(question: QuizQuestion, answer: LessonAssessmentAnswer): boolean {
  if (question.type === "single" || question.type === "scenario") {
    return typeof answer === "string" && answer === question.correctAnswer;
  }

  if (question.type === "multi") {
    if (!Array.isArray(answer)) return false;
    const expected = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
    return answer.length === expected.length && answer.every((item) => expected.includes(item));
  }

  if (question.type === "ordering") {
    if (!Array.isArray(answer)) return false;
    const expected = question.correctOrder ?? [];
    return answer.length === expected.length && answer.every((item, index) => item === expected[index]);
  }

  if (question.type === "matching") {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
    return (question.pairs ?? []).every(([term, definition]) => answer[term] === definition);
  }

  if (question.type === "fillblank") {
    if (typeof answer !== "string") return false;
    const normalized = answer.toLocaleLowerCase().trim();
    const expected = String(question.correctAnswer)
      .split("|")
      .map((item) => item.toLocaleLowerCase().trim());
    return expected.includes(normalized);
  }

  return false;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function hashLessonAssessmentRequest(input: {
  locale: AcademyLocale;
  lessonId: string;
  answers: LessonAssessmentAnswers;
}): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

export function resolveV2Lesson(locale: AcademyLocale, lessonId: string): Lesson | null {
  if (locale !== "fa") return null;
  for (const moduleEntry of TERM1.modules) {
    const lesson = moduleEntry.lessons.find((item) => item.id === lessonId);
    if (lesson) return lesson;
  }
  return null;
}

export function gradeLessonAssessment(input: {
  locale: AcademyLocale;
  lessonId: string;
  answers: Record<string, unknown>;
}): LessonAssessmentResult | null {
  const lesson = resolveV2Lesson(input.locale, input.lessonId);
  if (!lesson || lesson.knowledgeChecks.length === 0) return null;

  const answers: LessonAssessmentAnswers = {};
  let correctCount = 0;
  for (const question of lesson.knowledgeChecks) {
    const normalized = normalizeAnswer(question, input.answers[question.id]);
    answers[question.id] = normalized;
    if (answerIsCorrect(question, normalized)) correctCount += 1;
  }

  const questionCount = lesson.knowledgeChecks.length;
  const score = Math.round((correctCount / questionCount) * 100);
  return {
    lesson,
    correctCount,
    questionCount,
    score,
    passed: score >= LESSON_PASS_PERCENT,
    answers,
  };
}

function deriveStreak(
  baseline: AcademyProgressState,
  rewardEvents: RewardEventProjectionRow[],
): { streak: number; lastStudyDate: string | null; activityDates: string[] } {
  const eventDates = rewardEvents
    .filter((event) => event.amount > 0)
    .map((event) => toUtcDay(event.createdAt))
    .filter((value): value is string => Boolean(value));
  const activityDates = [...new Set(eventDates)].sort();

  let streak = baseline.streak;
  let lastStudyDate = baseline.lastStudyDate;
  for (const date of activityDates) {
    if (lastStudyDate === date) continue;
    const distance = lastStudyDate ? dayDistance(lastStudyDate, date) : Number.NaN;
    streak = distance === 1 ? Math.max(1, streak) + 1 : 1;
    lastStudyDate = date;
  }
  return { streak, lastStudyDate, activityDates };
}

export function buildAcademyProgressProjection(input: ProgressProjectionInput): ProgressProjectionResult {
  const baseline = normalizeAcademyProgressState(input.baseline);
  const rewardXp = input.rewardEvents.reduce((sum, event) => sum + Math.max(0, Math.round(event.amount)), 0);
  const completedLessons: Record<string, LessonCompletion> = { ...baseline.completedLessons };
  const masteryScores = { ...baseline.masteryScores };
  const termStatus = { ...baseline.termStatus };
  const badges = new Set(baseline.earnedBadges);

  for (const attempt of input.lessonAttempts) {
    const completedAt = Date.parse(attempt.createdAt);
    const previous = completedLessons[attempt.lessonId];
    const score = Math.max(previous?.score ?? 0, Math.round(attempt.score));
    const authoritativeCompletedAt = Number.isFinite(completedAt) ? completedAt : Date.now();
    completedLessons[attempt.lessonId] = {
      lessonId: attempt.lessonId,
      completedAt: previous?.completedAt
        ? Math.min(previous.completedAt, authoritativeCompletedAt)
        : authoritativeCompletedAt,
      score,
      xpEarned: score === 100
        ? XP_TABLE.LESSON_COMPLETE + XP_TABLE.LESSON_PERFECT_BONUS
        : XP_TABLE.LESSON_COMPLETE,
    };
    masteryScores[attempt.lessonId] = Math.max(masteryScores[attempt.lessonId] ?? 0, score);
    if (termStatus[attempt.termNumber] !== "passed") termStatus[attempt.termNumber] = "in_progress";
  }

  for (const term of input.termProgress) {
    const number = Math.max(1, Math.min(7, Math.round(term.termNumber)));
    if (term.status === "passed") {
      termStatus[number] = "passed";
      if (number < 7) termStatus[number + 1] = termStatus[number + 1] ?? "unlocked";
    } else if (termStatus[number] !== "passed") {
      termStatus[number] = "in_progress";
    }
  }

  for (const event of input.rewardEvents) {
    const badgeCode = typeof event.payload.badgeCode === "string" ? event.payload.badgeCode.trim() : "";
    if (event.rewardType === "badge" && badgeCode) badges.add(badgeCode);
  }

  const streak = deriveStreak(baseline, input.rewardEvents);
  const state = normalizeAcademyProgressState({
    ...baseline,
    xp: baseline.xp + rewardXp,
    streak: streak.streak,
    lastStudyDate: streak.lastStudyDate,
    completedLessons,
    masteryScores,
    termStatus,
    earnedBadges: [...badges].sort(),
  });
  return { state, activityDates: streak.activityDates };
}

export async function ensureLegacyProgressSnapshot(
  client: PoolClient,
  studentId: string,
  locale: AcademyLocale,
): Promise<LegacySnapshot> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('academy_progress_projection'), hashtext($1))`,
    [`${studentId}:${locale}`],
  );

  const documentResult = await client.query<{
    progress: unknown;
    revision: string;
    updated_at: string;
  }>(
    `SELECT progress, revision::text, updated_at
     FROM academy_state_documents
     WHERE student_id = $1::uuid AND locale = $2
     FOR UPDATE`,
    [studentId, locale],
  );
  const document = documentResult.rows[0];
  const currentState = document
    ? normalizeAcademyProgressState(document.progress)
    : createDefaultAcademyProgressState();

  const existingSnapshot = await client.query<{
    progress: unknown;
    reward_event_cursor: string;
  }>(
    `SELECT progress, reward_event_cursor::text
     FROM academy_progress_legacy_snapshots
     WHERE student_id = $1::uuid AND locale = $2
     LIMIT 1`,
    [studentId, locale],
  );
  if (existingSnapshot.rows[0]) {
    return {
      baseline: normalizeAcademyProgressState(existingSnapshot.rows[0].progress),
      rewardEventCursor: Number(existingSnapshot.rows[0].reward_event_cursor),
      currentState,
      currentRevision: document ? Number(document.revision) : 0,
      currentUpdatedAt: document?.updated_at ?? null,
      documentExists: Boolean(document),
    };
  }

  const cursorResult = await client.query<{ cursor: string }>(
    `SELECT COALESCE(MAX(id), 0)::text AS cursor
     FROM academy_reward_events
     WHERE student_id = $1::uuid AND locale = $2`,
    [studentId, locale],
  );
  const rewardEventCursor = Number(cursorResult.rows[0]?.cursor ?? 0);
  await client.query(
    `INSERT INTO academy_progress_legacy_snapshots
       (student_id, locale, schema_version, progress, reward_event_cursor, captured_at)
     VALUES ($1::uuid, $2, 2, $3::jsonb, $4, NOW())
     ON CONFLICT (student_id, locale) DO NOTHING`,
    [studentId, locale, JSON.stringify(currentState), rewardEventCursor],
  );

  return {
    baseline: currentState,
    rewardEventCursor,
    currentState,
    currentRevision: document ? Number(document.revision) : 0,
    currentUpdatedAt: document?.updated_at ?? null,
    documentExists: Boolean(document),
  };
}

export async function issueAcademyReward(
  client: PoolClient,
  input: {
    studentId: string;
    locale: AcademyLocale;
    rewardType: "lesson_complete" | "lesson_perfect_bonus" | "term_pass" | "lesson_section_complete" | "lesson_answered" | "badge";
    sourceType: string;
    sourceKey: string;
    amount: number;
    payload?: Record<string, unknown>;
  },
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO academy_reward_events
       (student_id, locale, reward_type, source_type, source_key, amount, payload, created_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     ON CONFLICT (student_id, locale, reward_type, source_type, source_key) DO NOTHING
     RETURNING id::text`,
    [
      input.studentId,
      input.locale,
      input.rewardType,
      input.sourceType,
      input.sourceKey,
      Math.max(0, Math.round(input.amount)),
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return Boolean(result.rows[0]);
}

export async function rebuildAcademyProgressProjection(
  client: PoolClient,
  studentId: string,
  locale: AcademyLocale,
): Promise<ProjectionWriteResult> {
  const legacy = await ensureLegacyProgressSnapshot(client, studentId, locale);
  const rewardResult = await client.query<{
    id: string;
    reward_type: string;
    amount: number;
    payload: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT id::text, reward_type, amount, payload, created_at
     FROM academy_reward_events
     WHERE student_id = $1::uuid AND locale = $2 AND id > $3
     ORDER BY id ASC`,
    [studentId, locale, legacy.rewardEventCursor],
  );
  const attemptResult = await client.query<{
    lesson_id: string;
    term_number: number;
    score: number;
    created_at: string;
  }>(
    `SELECT DISTINCT ON (lesson_id)
       lesson_id, term_number, score, created_at
     FROM academy_lesson_assessment_attempts
     WHERE student_id = $1::uuid AND locale = $2 AND passed = TRUE
     ORDER BY lesson_id, score DESC, created_at ASC`,
    [studentId, locale],
  );
  const termResult = await client.query<{ term_number: number; status: string }>(
    `SELECT term_number, status
     FROM academy_term_progress
     WHERE student_id = $1::uuid AND locale = $2
     ORDER BY term_number ASC`,
    [studentId, locale],
  );

  const projected = buildAcademyProgressProjection({
    baseline: legacy.baseline,
    rewardEvents: rewardResult.rows.map((row) => ({
      id: Number(row.id),
      rewardType: row.reward_type,
      amount: Number(row.amount),
      payload: row.payload && typeof row.payload === "object" ? row.payload : {},
      createdAt: row.created_at,
    })),
    lessonAttempts: attemptResult.rows.map((row) => ({
      lessonId: row.lesson_id,
      termNumber: Number(row.term_number),
      score: Number(row.score),
      createdAt: row.created_at,
    })),
    termProgress: termResult.rows.map((row) => ({
      termNumber: Number(row.term_number),
      status: row.status,
    })),
  }).state;

  if (legacy.documentExists && stableJson(projected) === stableJson(legacy.currentState)) {
    return {
      state: projected,
      revision: legacy.currentRevision,
      updatedAt: legacy.currentUpdatedAt,
    };
  }

  const saved = await client.query<{ revision: string; updated_at: string }>(
    `INSERT INTO academy_state_documents
       (student_id, locale, schema_version, revision, progress, created_at, updated_at)
     VALUES ($1::uuid, $2, 2, 1, $3::jsonb, NOW(), NOW())
     ON CONFLICT (student_id, locale) DO UPDATE SET
       schema_version = 2,
       progress = EXCLUDED.progress,
       revision = academy_state_documents.revision + 1,
       updated_at = NOW()
     RETURNING revision::text, updated_at`,
    [studentId, locale, JSON.stringify(projected)],
  );

  return {
    state: projected,
    revision: Number(saved.rows[0]?.revision ?? 1),
    updatedAt: saved.rows[0]?.updated_at ?? new Date().toISOString(),
  };
}
