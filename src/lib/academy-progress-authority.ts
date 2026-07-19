import type { PoolClient } from "pg";
import type { AcademyProgressState, LessonCompletion } from "@/lib/academy-progress";
import { createDefaultAcademyProgressState, normalizeAcademyProgressState } from "@/lib/academy-progress";

export type AcademyRewardCode = "lesson_complete" | "lesson_perfect_bonus";

const REWARD_XP: Record<AcademyRewardCode, number> = {
  lesson_complete: 30,
  lesson_perfect_bonus: 50,
};

export async function issueAcademyReward(
  client: PoolClient,
  input: {
    studentId: string;
    locale: "fa" | "en";
    rewardCode: AcademyRewardCode;
    sourceType: "lesson_assessment";
    sourceRef: string;
    payload?: Record<string, unknown>;
  },
): Promise<boolean> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO academy_reward_events
       (student_id, locale, reward_code, source_type, source_ref, xp, payload)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (student_id, locale, reward_code, source_type, source_ref) DO NOTHING
     RETURNING id::text`,
    [
      input.studentId,
      input.locale,
      input.rewardCode,
      input.sourceType,
      input.sourceRef,
      REWARD_XP[input.rewardCode],
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return Boolean(inserted.rows[0]);
}

function calculateStreak(dates: string[]): { streak: number; lastStudyDate: string | null } {
  const unique = [...new Set(dates.map((value) => value.slice(0, 10)))].sort().reverse();
  if (unique.length === 0) return { streak: 0, lastStudyDate: null };
  let streak = 1;
  const cursor = new Date(`${unique[0]}T00:00:00.000Z`);
  for (let index = 1; index < unique.length; index += 1) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (unique[index] !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
  }
  return { streak, lastStudyDate: unique[0] };
}

export async function rebuildAcademyProgressProjection(
  client: PoolClient,
  studentId: string,
  locale: "fa" | "en",
): Promise<{ state: AcademyProgressState; revision: number; updatedAt: string }> {
  const current = await client.query<{
    progress: unknown;
    revision: string;
    schema_version: number;
    updated_at: string;
  }>(
    `SELECT progress, revision::text, schema_version, updated_at
     FROM academy_state_documents
     WHERE student_id = $1::uuid AND locale = $2
     FOR UPDATE`,
    [studentId, locale],
  );

  if (current.rows[0]) {
    await client.query(
      `INSERT INTO academy_progress_legacy_snapshots (student_id, locale, legacy_revision, legacy_progress)
       VALUES ($1::uuid, $2, $3, $4::jsonb)
       ON CONFLICT (student_id, locale) DO NOTHING`,
      [
        studentId,
        locale,
        Number(current.rows[0].revision),
        JSON.stringify(normalizeAcademyProgressState(current.rows[0].progress)),
      ],
    );
  }

  const [assessments, terms, termLearning, rewards, badges] = await Promise.all([
    client.query<{ lesson_id: string; term_number: number; best_score: number; passed_at: string }>(
      `SELECT lesson_id, term_number, best_score, passed_at
       FROM academy_lesson_assessments
       WHERE student_id = $1::uuid AND locale = $2 AND passed_at IS NOT NULL`,
      [studentId, locale],
    ),
    client.query<{ term_number: number; status: string }>(
      `SELECT term_number, status
       FROM academy_term_progress
       WHERE student_id = $1::uuid AND locale = $2`,
      [studentId, locale],
    ),
    client.query<{ xp: number }>(
      `SELECT xp
       FROM academy_term_learning_progress
       WHERE student_id = $1::uuid AND locale = $2`,
      [studentId, locale],
    ),
    client.query<{ xp: number; created_at: string }>(
      `SELECT xp, created_at
       FROM academy_reward_events
       WHERE student_id = $1::uuid AND locale = $2
       ORDER BY created_at ASC`,
      [studentId, locale],
    ),
    client.query<{ code: string }>(
      `SELECT code FROM student_achievements WHERE student_id = $1::uuid ORDER BY earned_at ASC`,
      [studentId],
    ),
  ]);

  const completedLessons: Record<string, LessonCompletion> = {};
  for (const row of assessments.rows) {
    completedLessons[row.lesson_id] = {
      lessonId: row.lesson_id,
      completedAt: new Date(row.passed_at).getTime(),
      score: Number(row.best_score),
      xpEarned: Number(row.best_score) === 100 ? 80 : 30,
    };
  }

  const state = createDefaultAcademyProgressState();
  state.completedLessons = completedLessons;
  state.earnedBadges = badges.rows.map((row) => row.code);
  const verifiedLessonXp = rewards.rows.reduce((total, row) => total + Number(row.xp), 0);
  const verifiedSectionXp = termLearning.rows.reduce((total, row) => total + Number(row.xp), 0);
  const verifiedTermXp = terms.rows.filter((row) => row.status === "passed").length * 500;
  state.xp = verifiedLessonXp + verifiedSectionXp + verifiedTermXp;
  const streak = calculateStreak(rewards.rows.map((row) => row.created_at));
  state.streak = streak.streak;
  state.lastStudyDate = streak.lastStudyDate;

  for (const row of assessments.rows) {
    const termNumber = Number(row.term_number);
    if (state.termStatus[termNumber] !== "passed") state.termStatus[termNumber] = "in_progress";
  }
  for (const row of terms.rows) {
    const termNumber = Number(row.term_number);
    state.termStatus[termNumber] = row.status === "passed" ? "passed" : "in_progress";
    if (row.status === "passed" && termNumber < 7) {
      state.termStatus[termNumber + 1] = state.termStatus[termNumber + 1] ?? "unlocked";
    }
  }

  const normalized = normalizeAcademyProgressState(state);
  const currentRow = current.rows[0];
  if (
    currentRow &&
    Number(currentRow.schema_version) === 3 &&
    JSON.stringify(normalizeAcademyProgressState(currentRow.progress)) === JSON.stringify(normalized)
  ) {
    return { state: normalized, revision: Number(currentRow.revision), updatedAt: currentRow.updated_at };
  }

  const saved = await client.query<{ revision: string; updated_at: string }>(
    `INSERT INTO academy_state_documents
       (student_id, locale, schema_version, revision, progress, created_at, updated_at)
     VALUES ($1::uuid, $2, 3, 1, $3::jsonb, NOW(), NOW())
     ON CONFLICT (student_id, locale) DO UPDATE SET
       schema_version = 3,
       progress = EXCLUDED.progress,
       revision = academy_state_documents.revision + 1,
       updated_at = NOW()
     RETURNING revision::text, updated_at`,
    [studentId, locale, JSON.stringify(normalized)],
  );

  return {
    state: normalized,
    revision: Number(saved.rows[0]?.revision ?? 1),
    updatedAt: saved.rows[0]?.updated_at ?? new Date().toISOString(),
  };
}
