import { randomUUID } from "crypto";
import {
  assertRequiredDatabaseTables,
  type SchemaQueryable,
} from "@/lib/database-schema-contract";

export type StudentCartaxInput = {
  locale?: string;
  email?: string;
  phone?: string;
  googleId?: string;
  appleId?: string;
  displayName?: string;
  username?: string;
  avatar?: string;
  learningGoal?: string;
  progress?: unknown;
  totalXp?: number;
  completedTerms?: number;
  overallProgress?: number;
  earnedBadges?: unknown;
  mentorSnapshot?: unknown;
  simulatorSnapshot?: unknown;
  source?: string;
  ip?: string;
  userAgent?: string;
};

export function cleanText(value: unknown, max = 240) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

function makePublicStudentId(id: string) {
  const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `TP-STD-${compact}`;
}

export function numeric(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function assertStudentCartaxSchema(client: SchemaQueryable) {
  await assertRequiredDatabaseTables(client, [
    "academy_students",
    "academy_student_cartax",
    "academy_student_events",
    "academy_simulator_decisions",
    "academy_term_progress",
  ], "student_cartax");
}

export async function findStudentCartaxProfile(
  client: SchemaQueryable,
  identity: { studentId?: string | null; email?: string | null },
) {
  const values: unknown[] = [];
  const filters: string[] = [];
  if (identity.studentId) {
    values.push(identity.studentId);
    filters.push(`s.id = $${values.length}::uuid`);
  }
  if (identity.email) {
    values.push(identity.email);
    filters.push(`s.email = $${values.length}`);
  }
  if (!filters.length) return null;

  const query = await client.query(
    `SELECT s.id, c.public_student_id, s.email, s.phone, s.display_name, s.username, s.avatar, s.learning_goal, s.locale, c.streak_days, s.last_active_day,
            c.progress, c.earned_badges, c.mentor_snapshot, c.simulator_snapshot,
            c.total_xp, c.completed_terms, c.overall_progress, c.identity_score, c.retention_score, c.community_score, c.updated_at
       FROM academy_students s
       LEFT JOIN academy_student_cartax c ON c.student_id = s.id
      WHERE ${filters.join(" OR ")}
      LIMIT 1`,
    values,
  );
  return query.rows[0] || null;
}

export async function upsertStudentCartax(client: SchemaQueryable, input: StudentCartaxInput, fallbackStudentId?: string) {
  const id = fallbackStudentId || randomUUID();
  const email = cleanText(input.email, 180) || null;
  const phone = cleanText(input.phone, 60) || null;
  const googleId = cleanText(input.googleId, 180) || null;
  const appleId = cleanText(input.appleId, 180) || null;
  const displayName = cleanText(input.displayName, 160) || null;
  const usernameRaw = cleanText(input.username, 80).toLowerCase();
  const username = usernameRaw ? usernameRaw.replace(/[^a-z0-9_.-]/g, "").slice(0, 32) || null : null;
  const avatar = cleanText(input.avatar, 40) || null;
  const learningGoal = cleanText(input.learningGoal, 120) || null;
  const locale = cleanText(input.locale || "fa", 10) || "fa";

  const lookup = await client.query(
    `SELECT id FROM academy_students
     WHERE ($1::text IS NOT NULL AND email = $1)
        OR ($2::text IS NOT NULL AND phone = $2)
        OR ($3::text IS NOT NULL AND google_id = $3)
        OR ($4::text IS NOT NULL AND apple_id = $4)
        OR ($6::text IS NOT NULL AND username = $6)
        OR id = $5::uuid
     LIMIT 1`,
    [email, phone, googleId, appleId, id, username],
  );
  const studentId = String(lookup.rows[0]?.id ?? id);
  const publicStudentId = makePublicStudentId(studentId);

  await client.query(
    `INSERT INTO academy_students (id, email, phone, google_id, apple_id, display_name, username, avatar, learning_goal, locale)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, academy_students.email),
       phone = COALESCE(EXCLUDED.phone, academy_students.phone),
       google_id = COALESCE(EXCLUDED.google_id, academy_students.google_id),
       apple_id = COALESCE(EXCLUDED.apple_id, academy_students.apple_id),
       display_name = COALESCE(EXCLUDED.display_name, academy_students.display_name),
       username = COALESCE(EXCLUDED.username, academy_students.username),
       avatar = COALESCE(EXCLUDED.avatar, academy_students.avatar),
       learning_goal = COALESCE(EXCLUDED.learning_goal, academy_students.learning_goal),
       locale = EXCLUDED.locale,
       updated_at = NOW(),
       last_seen_at = NOW()`,
    [studentId, email, phone, googleId, appleId, displayName, username, avatar, learningGoal, locale],
  );

  // public_student_id and streak_days are cartax-owned fields in the canonical
  // 0001 schema. Keep the daily streak update idempotent so retries on the same
  // UTC database day cannot inflate it.
  const cartaxIdentity = await client.query(
    `INSERT INTO academy_student_cartax (student_id, public_student_id, streak_days)
     VALUES ($1::uuid, $2, 1)
     ON CONFLICT (student_id) DO UPDATE SET
       public_student_id = COALESCE(academy_student_cartax.public_student_id, EXCLUDED.public_student_id),
       streak_days = CASE
         WHEN (SELECT last_active_day FROM academy_students WHERE id = $1::uuid) = CURRENT_DATE
           THEN GREATEST(academy_student_cartax.streak_days, 1)
         WHEN (SELECT last_active_day FROM academy_students WHERE id = $1::uuid) = CURRENT_DATE - 1
           THEN GREATEST(academy_student_cartax.streak_days, 0) + 1
         ELSE 1
       END,
       updated_at = NOW()
     RETURNING public_student_id, streak_days`,
    [studentId, publicStudentId],
  );
  const effectivePublicStudentId = String(
    cartaxIdentity.rows[0]?.public_student_id ?? publicStudentId,
  );
  const streakDays = Math.max(
    1,
    Math.round(numeric(cartaxIdentity.rows[0]?.streak_days, 1)),
  );

  await client.query(
    `UPDATE academy_students
        SET last_active_day = CURRENT_DATE,
            last_seen_at = NOW(),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [studentId],
  );

  // Trust boundary: user-supplied progress/XP/badges are never authoritative.
  // Public ranking, certificates, Hall of Fame and professional eligibility must be derived
  // from server-side events and verified term progress only.
  const verifiedStats = await client.query(
    `SELECT
       COALESCE(COUNT(*) FILTER (WHERE status = 'passed'), 0)::int AS completed_terms,
       COALESCE(MAX(percent), 0)::int AS best_percent,
       COALESCE(ROUND(AVG(percent) FILTER (WHERE status = 'passed')), 0)::int AS avg_percent
     FROM academy_term_progress
     WHERE student_id = $1::uuid`,
    [studentId],
  );
  const completedTerms = Math.max(0, Math.min(7, Math.round(numeric(verifiedStats.rows[0]?.completed_terms))));
  const overallProgress = Math.max(0, Math.min(100, Math.round((completedTerms / 7) * 100)));
  const avgPercent = Math.max(0, Math.min(100, Math.round(numeric(verifiedStats.rows[0]?.avg_percent))));
  const simulatorStats = await client.query(
    `SELECT COALESCE(COUNT(*), 0)::int AS decisions_count,
            COALESCE(ROUND(AVG(score)), 0)::int AS avg_decision_score
     FROM academy_simulator_decisions
     WHERE student_id = $1::uuid`,
    [studentId],
  );
  const decisionsCount = Math.max(0, Math.round(numeric(simulatorStats.rows[0]?.decisions_count)));
  const avgDecisionScore = Math.max(0, Math.min(100, Math.round(numeric(simulatorStats.rows[0]?.avg_decision_score))));
  const totalXp = completedTerms * 1000 + avgPercent * 10 + decisionsCount * 80 + Math.min(streakDays, 30) * 25;
  const identityScore = Math.min(100, 25 + completedTerms * 8 + Math.min(decisionsCount, 10) * 3 + Math.min(streakDays, 10) * 2);
  const retentionScore = Math.min(100, streakDays * 10 + completedTerms * 7 + Math.min(decisionsCount, 8) * 4);
  const communityScore = Math.min(100, completedTerms * 10 + Math.min(decisionsCount, 10) * 3 + (completedTerms >= 7 ? 20 : 0));
  const progress = { completedTerms, overallProgress, avgPercent, decisionsCount, avgDecisionScore, streakDays, publicStudentId: effectivePublicStudentId };
  const earnedBadges = [
    "account-ready",
    ...(streakDays >= 3 ? ["three-day-streak"] : []),
    ...(decisionsCount >= 1 ? ["first-simulator-decision"] : []),
    ...(decisionsCount >= 10 ? ["practice-journalist"] : []),
    ...(completedTerms > 0 ? ["verified-learner"] : []),
    ...(completedTerms >= 7 ? ["academy-graduate"] : []),
  ];
  const mentorSnapshot = { source: "server-learning-record", nextAction: completedTerms >= 7 ? "advanced-program" : `term-${completedTerms + 1}` };
  const simulatorSnapshot = { source: "server-learning-record", unlocked: completedTerms >= 5 };

  await client.query(
    `INSERT INTO academy_student_cartax
      (student_id, progress, earned_badges, mentor_snapshot, simulator_snapshot, total_xp, completed_terms, overall_progress, identity_score, retention_score, community_score, source, ip, user_agent)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (student_id) DO UPDATE SET
       progress = EXCLUDED.progress,
       earned_badges = EXCLUDED.earned_badges,
       mentor_snapshot = EXCLUDED.mentor_snapshot,
       simulator_snapshot = EXCLUDED.simulator_snapshot,
       total_xp = EXCLUDED.total_xp,
       completed_terms = EXCLUDED.completed_terms,
       overall_progress = EXCLUDED.overall_progress,
       identity_score = EXCLUDED.identity_score,
       retention_score = EXCLUDED.retention_score,
       community_score = EXCLUDED.community_score,
       source = EXCLUDED.source,
       ip = EXCLUDED.ip,
       user_agent = EXCLUDED.user_agent,
       updated_at = NOW()`,
    [
      studentId,
      JSON.stringify(progress),
      JSON.stringify(earnedBadges),
      JSON.stringify(mentorSnapshot),
      JSON.stringify(simulatorSnapshot),
      totalXp,
      completedTerms,
      overallProgress,
      identityScore,
      retentionScore,
      communityScore,
      cleanText(input.source, 120),
      cleanText(input.ip, 80),
      cleanText(input.userAgent, 220),
    ],
  );

  await client.query(
    `INSERT INTO academy_student_events (student_id, event_type, payload)
     VALUES ($1, 'cartax_sync', $2::jsonb)`,
    [studentId, JSON.stringify({ totalXp, completedTerms, overallProgress, identityScore, retentionScore, communityScore, streakDays, publicStudentId: effectivePublicStudentId, source: cleanText(input.source, 120) })],
  );

  return { studentId, publicStudentId: effectivePublicStudentId, totalXp, completedTerms, overallProgress, identityScore, retentionScore, communityScore, streakDays, earnedBadges };
}
