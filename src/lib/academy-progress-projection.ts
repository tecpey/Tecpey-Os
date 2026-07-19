import { createHash } from "crypto";
import type { PoolClient } from "pg";
import type { AcademyProgressState, LessonCompletion } from "@/lib/academy-progress";

export type RewardEvidence = {
  reward_key: string;
  source_id: string;
  xp: number;
  badge_code: string | null;
  awarded_at: string;
};

export type LessonAssessmentEvidence = {
  lesson_id: string;
  term_number: number;
  best_score: number;
  passed_at: string | null;
  updated_at: string;
};

export type SectionEvidence = {
  term_number: number;
  term_slug: string;
  section_key: string;
  completed: boolean;
  answer: string | null;
  completed_at: string | null;
  answered_at: string | null;
  updated_at: string;
};

export type TermSummaryEvidence = {
  term_number: number;
  xp: number;
  updated_at: string;
};

export type TermProgressEvidence = {
  term_number: number;
  status: string;
  score: number;
  percent: number;
  passed_at: string | null;
  updated_at: string;
};

export type AcademyProjectionEvidence = {
  rewards: RewardEvidence[];
  lessonAssessments: LessonAssessmentEvidence[];
  sections: SectionEvidence[];
  termSummaries: TermSummaryEvidence[];
  terms: TermProgressEvidence[];
};

const LEVEL_THRESHOLDS = [0, 200, 700, 1500, 2700, 4500, 7000, 10500, 15000, 21000, 29000, 39000];

export function computeAcademyLevel(xp: number): number {
  let level = 1;
  for (let index = 1; index < LEVEL_THRESHOLDS.length; index += 1) {
    if (xp >= LEVEL_THRESHOLDS[index]) level = index + 1;
    else break;
  }
  return Math.min(level, 12);
}

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function computeCurrentStreak(days: string[], now = new Date()): number {
  const unique = [...new Set(days.filter(Boolean))].sort().reverse();
  if (unique.length === 0) return 0;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const latest = new Date(`${unique[0]}T00:00:00.000Z`);
  const ageDays = Math.round((today.getTime() - latest.getTime()) / 86_400_000);
  if (ageDays > 1 || ageDays < 0) return 0;

  let streak = 0;
  let cursor = latest;
  const set = new Set(unique);
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

export function buildAcademyProgressProjection(evidence: AcademyProjectionEvidence): AcademyProgressState {
  const rewardsByKey = new Map<string, RewardEvidence>();
  for (const reward of evidence.rewards) rewardsByKey.set(reward.reward_key, reward);
  const rewards = [...rewardsByKey.values()];
  const rewardXp = rewards.reduce((total, reward) => total + Math.max(0, Math.round(Number(reward.xp) || 0)), 0);
  const sectionXp = evidence.termSummaries.reduce((total, summary) => total + Math.max(0, Math.round(Number(summary.xp) || 0)), 0);
  const xp = rewardXp + sectionXp;

  const completedLessons: Record<string, LessonCompletion> = {};
  const masteryScores: Record<string, number> = {};

  for (const assessment of evidence.lessonAssessments) {
    if (!assessment.passed_at) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(assessment.best_score) || 0)));
    completedLessons[assessment.lesson_id] = {
      lessonId: assessment.lesson_id,
      completedAt: new Date(assessment.passed_at).getTime(),
      score,
      xpEarned: rewards
        .filter((reward) => reward.source_id === assessment.lesson_id)
        .reduce((total, reward) => total + Math.max(0, Math.round(Number(reward.xp) || 0)), 0),
    };
    masteryScores[assessment.lesson_id] = score;
  }

  for (const section of evidence.sections) {
    if (!section.completed) continue;
    const lessonId = `${section.term_slug}/${section.section_key}`;
    const completedAt = section.completed_at ?? section.answered_at ?? section.updated_at;
    completedLessons[lessonId] = {
      lessonId,
      completedAt: new Date(completedAt).getTime(),
      score: section.answer ? 100 : 80,
      xpEarned: section.answer ? 15 : 10,
    };
  }

  const termStatus: Record<number, "unlocked" | "in_progress" | "passed"> = { 1: "unlocked" };
  for (const summary of evidence.termSummaries) {
    if (summary.term_number >= 1 && summary.term_number <= 7) termStatus[summary.term_number] = "in_progress";
  }
  for (const assessment of evidence.lessonAssessments) {
    if (assessment.term_number >= 1 && assessment.term_number <= 7 && termStatus[assessment.term_number] !== "passed") {
      termStatus[assessment.term_number] = "in_progress";
    }
  }
  const moduleScores: Record<string, number> = {};
  for (const term of evidence.terms) {
    const termNumber = Math.max(1, Math.min(7, Math.round(Number(term.term_number) || 1)));
    moduleScores[`term-${termNumber}`] = Math.max(0, Math.min(100, Math.round(Number(term.percent) || 0)));
    if (term.status === "passed") {
      termStatus[termNumber] = "passed";
      if (termNumber < 7 && !termStatus[termNumber + 1]) termStatus[termNumber + 1] = "unlocked";
    } else if (termStatus[termNumber] !== "passed") {
      termStatus[termNumber] = "in_progress";
    }
  }

  const activityDays = [
    ...rewards.map((reward) => isoDay(reward.awarded_at)),
    ...evidence.lessonAssessments.map((item) => isoDay(item.passed_at ?? item.updated_at)),
    ...evidence.sections.map((item) => isoDay(item.completed_at ?? item.answered_at ?? item.updated_at)),
    ...evidence.terms.map((item) => isoDay(item.passed_at ?? item.updated_at)),
  ].filter((item): item is string => Boolean(item));

  return {
    version: 2,
    xp,
    level: computeAcademyLevel(xp),
    streak: computeCurrentStreak(activityDays),
    lastStudyDate: activityDays.sort().at(-1) ?? null,
    completedLessons,
    moduleScores,
    termStatus,
    earnedBadges: [...new Set(rewards.map((reward) => reward.badge_code).filter((item): item is string => Boolean(item)))],
    masteryScores,
  };
}

function projectionHash(state: AcademyProgressState): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function nonEmptyLegacyProgress(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

export async function refreshAcademyProgressProjection(
  client: PoolClient,
  studentId: string,
  locale: "fa" | "en",
): Promise<{ state: AcademyProgressState; revision: number; updatedAt: string; legacySnapshotCaptured: boolean }> {
  const currentResult = await client.query<{
    progress: unknown;
    revision: string;
    progress_authority: string;
    projection_hash: string | null;
    updated_at: string;
  }>(
    `SELECT progress, revision::text, progress_authority, projection_hash, updated_at
     FROM academy_state_documents
     WHERE student_id = $1::uuid AND locale = $2
     FOR UPDATE`,
    [studentId, locale],
  );
  const current = currentResult.rows[0];
  let legacySnapshotCaptured = false;

  if (current && current.progress_authority !== "server_projection_v1" && nonEmptyLegacyProgress(current.progress)) {
    const snapshotHash = createHash("sha256").update(JSON.stringify(current.progress)).digest("hex");
    const inserted = await client.query(
      `INSERT INTO academy_progress_legacy_snapshots
         (student_id, locale, snapshot, snapshot_hash, reconciliation_status, reconciliation_report)
       VALUES ($1::uuid, $2, $3::jsonb, $4, 'quarantined', $5::jsonb)
       ON CONFLICT (student_id, locale) DO NOTHING
       RETURNING student_id`,
      [
        studentId,
        locale,
        JSON.stringify(current.progress),
        snapshotHash,
        JSON.stringify({ reason: "legacy_client_mutable_state", preservedAt: new Date().toISOString() }),
      ],
    );
    legacySnapshotCaptured = Boolean(inserted.rows[0]);
  }

  const [rewardsResult, assessmentsResult, sectionsResult, summariesResult, termsResult] = await Promise.all([
    client.query<RewardEvidence>(
      `SELECT reward_key, source_id, xp, badge_code, awarded_at
       FROM academy_reward_ledger
       WHERE student_id = $1::uuid AND locale = $2
       ORDER BY awarded_at ASC`,
      [studentId, locale],
    ),
    client.query<LessonAssessmentEvidence>(
      `SELECT lesson_id, term_number, best_score, passed_at, updated_at
       FROM academy_lesson_assessments
       WHERE student_id = $1::uuid AND locale = $2
       ORDER BY updated_at ASC`,
      [studentId, locale],
    ),
    client.query<SectionEvidence>(
      `SELECT term_number, term_slug, section_key, completed, answer, completed_at, answered_at, updated_at
       FROM academy_lesson_progress
       WHERE student_id = $1::uuid AND locale = $2
       ORDER BY updated_at ASC`,
      [studentId, locale],
    ),
    client.query<TermSummaryEvidence>(
      `SELECT term_number, xp, updated_at
       FROM academy_term_learning_progress
       WHERE student_id = $1::uuid AND locale = $2
       ORDER BY term_number ASC`,
      [studentId, locale],
    ),
    client.query<TermProgressEvidence>(
      `SELECT term_number, status, score, percent, passed_at, updated_at
       FROM academy_term_progress
       WHERE student_id = $1::uuid AND locale = $2
       ORDER BY term_number ASC`,
      [studentId, locale],
    ),
  ]);

  const state = buildAcademyProgressProjection({
    rewards: rewardsResult.rows,
    lessonAssessments: assessmentsResult.rows,
    sections: sectionsResult.rows,
    termSummaries: summariesResult.rows,
    terms: termsResult.rows,
  });
  const hash = projectionHash(state);

  if (current?.progress_authority === "server_projection_v1" && current.projection_hash === hash) {
    return {
      state,
      revision: Number(current.revision),
      updatedAt: current.updated_at,
      legacySnapshotCaptured,
    };
  }

  const saved = await client.query<{ revision: string; updated_at: string }>(
    `INSERT INTO academy_state_documents
       (student_id, locale, schema_version, revision, progress, progress_authority, projection_hash, projection_updated_at, created_at, updated_at)
     VALUES ($1::uuid, $2, 2, 1, $3::jsonb, 'server_projection_v1', $4, NOW(), NOW(), NOW())
     ON CONFLICT (student_id, locale) DO UPDATE SET
       schema_version = 2,
       revision = academy_state_documents.revision + 1,
       progress = EXCLUDED.progress,
       progress_authority = EXCLUDED.progress_authority,
       projection_hash = EXCLUDED.projection_hash,
       projection_updated_at = NOW(),
       updated_at = NOW()
     RETURNING revision::text, updated_at`,
    [studentId, locale, JSON.stringify(state), hash],
  );

  await client.query(
    `INSERT INTO academy_student_cartax
       (student_id, progress, total_xp, completed_terms, overall_progress, earned_badges, streak_days, updated_at)
     VALUES ($1::uuid, $2::jsonb, $3, $4, $5, $6::jsonb, $7, NOW())
     ON CONFLICT (student_id) DO UPDATE SET
       progress = EXCLUDED.progress,
       total_xp = EXCLUDED.total_xp,
       completed_terms = EXCLUDED.completed_terms,
       overall_progress = EXCLUDED.overall_progress,
       earned_badges = EXCLUDED.earned_badges,
       streak_days = EXCLUDED.streak_days,
       updated_at = NOW()`,
    [
      studentId,
      JSON.stringify(state),
      state.xp,
      Object.values(state.termStatus).filter((status) => status === "passed").length,
      Math.round((Object.values(state.termStatus).filter((status) => status === "passed").length / 7) * 100),
      JSON.stringify(state.earnedBadges),
      state.streak,
    ],
  );

  return {
    state,
    revision: Number(saved.rows[0]?.revision ?? 1),
    updatedAt: saved.rows[0]?.updated_at ?? new Date().toISOString(),
    legacySnapshotCaptured,
  };
}
