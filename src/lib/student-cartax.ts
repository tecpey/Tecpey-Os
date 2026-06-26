import { randomUUID } from "crypto";

type Queryable = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

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

export async function ensureStudentCartaxTables(client: Queryable) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_students (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      google_id TEXT UNIQUE,
      apple_id TEXT UNIQUE,
      display_name TEXT,
      username TEXT UNIQUE,
      avatar TEXT,
      learning_goal TEXT,
      locale TEXT NOT NULL DEFAULT 'fa',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      public_student_id TEXT UNIQUE,
      streak_days INTEGER NOT NULL DEFAULT 0,
      last_active_day DATE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`ALTER TABLE academy_students ADD COLUMN IF NOT EXISTS public_student_id TEXT UNIQUE;`);
  await client.query(`ALTER TABLE academy_students ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;`);
  await client.query(`ALTER TABLE academy_students ADD COLUMN IF NOT EXISTS avatar TEXT;`);
  await client.query(`ALTER TABLE academy_students ADD COLUMN IF NOT EXISTS learning_goal TEXT;`);
  await client.query(`ALTER TABLE academy_students ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE academy_students ADD COLUMN IF NOT EXISTS last_active_day DATE;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_student_cartax (
      student_id UUID PRIMARY KEY REFERENCES academy_students(id) ON DELETE CASCADE,
      progress JSONB NOT NULL DEFAULT '{}'::jsonb,
      earned_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
      mentor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      simulator_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      total_xp INTEGER NOT NULL DEFAULT 0,
      completed_terms INTEGER NOT NULL DEFAULT 0,
      overall_progress INTEGER NOT NULL DEFAULT 0,
      identity_score INTEGER NOT NULL DEFAULT 0,
      retention_score INTEGER NOT NULL DEFAULT 0,
      community_score INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      ip TEXT,
      user_agent TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`ALTER TABLE academy_student_cartax ADD COLUMN IF NOT EXISTS identity_score INTEGER NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE academy_student_cartax ADD COLUMN IF NOT EXISTS retention_score INTEGER NOT NULL DEFAULT 0;`);
  await client.query(`ALTER TABLE academy_student_cartax ADD COLUMN IF NOT EXISTS community_score INTEGER NOT NULL DEFAULT 0;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_student_events (
      id BIGSERIAL PRIMARY KEY,
      student_id UUID REFERENCES academy_students(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_simulator_decisions (
      id BIGSERIAL PRIMARY KEY,
      student_id UUID REFERENCES academy_students(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'fa',
      choice_id TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      feedback TEXT,
      entry_reason TEXT,
      emotion_state TEXT,
      risk_plan TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, scenario_id)
    );
  `);
  await client.query(`ALTER TABLE academy_simulator_decisions ADD COLUMN IF NOT EXISTS entry_reason TEXT;`);
  await client.query(`ALTER TABLE academy_simulator_decisions ADD COLUMN IF NOT EXISTS emotion_state TEXT;`);
  await client.query(`ALTER TABLE academy_simulator_decisions ADD COLUMN IF NOT EXISTS risk_plan TEXT;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_term_progress (
      student_id UUID REFERENCES academy_students(id) ON DELETE CASCADE,
      term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 7),
      locale TEXT NOT NULL DEFAULT 'fa',
      score INTEGER NOT NULL DEFAULT 0,
      percent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'locked',
      passed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_id, term_number, locale)
    );
  `);
}

export async function upsertStudentCartax(client: Queryable, input: StudentCartaxInput, fallbackStudentId?: string) {
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
  const studentId = lookup.rows[0]?.id || id;
  const publicStudentId = makePublicStudentId(studentId);

  await client.query(
    `INSERT INTO academy_students (id, email, phone, google_id, apple_id, display_name, username, avatar, learning_goal, locale, public_student_id, streak_days, last_active_day)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, CURRENT_DATE)
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
       public_student_id = COALESCE(academy_students.public_student_id, EXCLUDED.public_student_id),
       streak_days = CASE
         WHEN academy_students.last_active_day = CURRENT_DATE THEN academy_students.streak_days
         WHEN academy_students.last_active_day = CURRENT_DATE - INTERVAL '1 day' THEN academy_students.streak_days + 1
         ELSE 1
       END,
       last_active_day = CURRENT_DATE,
       updated_at = NOW(),
       last_seen_at = NOW()`,
    [studentId, email, phone, googleId, appleId, displayName, username, avatar, learningGoal, locale, publicStudentId],
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
  const streakQuery = await client.query(`SELECT streak_days FROM academy_students WHERE id = $1::uuid LIMIT 1`, [studentId]);
  const streakDays = Math.max(1, Math.round(numeric(streakQuery.rows[0]?.streak_days, 1)));
  const totalXp = completedTerms * 1000 + avgPercent * 10 + decisionsCount * 80 + Math.min(streakDays, 30) * 25;
  const identityScore = Math.min(100, 25 + completedTerms * 8 + Math.min(decisionsCount, 10) * 3 + Math.min(streakDays, 10) * 2);
  const retentionScore = Math.min(100, streakDays * 10 + completedTerms * 7 + Math.min(decisionsCount, 8) * 4);
  const communityScore = Math.min(100, completedTerms * 10 + Math.min(decisionsCount, 10) * 3 + (completedTerms >= 7 ? 20 : 0));
  const progress = { completedTerms, overallProgress, avgPercent, decisionsCount, avgDecisionScore, streakDays, publicStudentId };
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
    [studentId, JSON.stringify({ totalXp, completedTerms, overallProgress, identityScore, retentionScore, communityScore, streakDays, publicStudentId, source: cleanText(input.source, 120) })],
  );

  return { studentId, publicStudentId, totalXp, completedTerms, overallProgress, identityScore, retentionScore, communityScore, streakDays, earnedBadges };
}
