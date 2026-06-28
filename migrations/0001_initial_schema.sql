-- Migration 0001 — Initial schema snapshot
-- Phase 20 | Date: 2026-06-28
--
-- This file documents the complete table set that db-schema.ts creates
-- via CREATE TABLE IF NOT EXISTS on first connection (schema-on-connect pattern).
--
-- PURPOSE: Reference snapshot only. Not executed by a runner yet.
-- Phase 22 will introduce the migration runner that tracks applied migrations
-- in a _migrations table and replaces the schema-on-connect pattern.
--
-- ALL future schema changes MUST be written as numbered migrations (0002, 0003, …)
-- and MUST NOT modify this file.

-- ── student-cartax tables (ensureStudentCartaxTables) ────────────────────────

CREATE TABLE IF NOT EXISTS academy_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale TEXT NOT NULL DEFAULT 'fa',
  email TEXT,
  phone TEXT,
  google_id TEXT,
  apple_id TEXT,
  display_name TEXT,
  username TEXT UNIQUE,
  avatar TEXT,
  learning_goal TEXT,
  source TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academy_student_cartax (
  student_id UUID PRIMARY KEY REFERENCES academy_students(id) ON DELETE CASCADE,
  progress JSONB NOT NULL DEFAULT '{}',
  total_xp INTEGER NOT NULL DEFAULT 0,
  completed_terms INTEGER NOT NULL DEFAULT 0,
  overall_progress INTEGER NOT NULL DEFAULT 0,
  earned_badges JSONB NOT NULL DEFAULT '[]',
  mentor_snapshot JSONB NOT NULL DEFAULT '{}',
  simulator_snapshot JSONB NOT NULL DEFAULT '{}',
  streak_days INTEGER NOT NULL DEFAULT 0,
  public_student_id TEXT UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academy_student_events (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS academy_student_events_student_idx
  ON academy_student_events(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS academy_simulator_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academy_term_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  term_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  score INTEGER NOT NULL DEFAULT 0,
  UNIQUE(student_id, term_number)
);

-- ── phase5 tables (ensurePhase5Tables) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS learning_events (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS learning_events_student_idx
  ON learning_events(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_brain_profiles (
  student_id UUID PRIMARY KEY REFERENCES academy_students(id) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academy_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_number INTEGER NOT NULL,
  lesson_index INTEGER NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mentor_challenge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  challenge_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievement_catalog (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  tier INTEGER NOT NULL DEFAULT 1,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT '🏆',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievement_catalog(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS notification_center (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES academy_students(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_center_student_idx
  ON notification_center(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'push',
  token TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fa',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, platform, token)
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id TEXT,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificate_share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id TEXT NOT NULL,
  student_id UUID REFERENCES academy_students(id) ON DELETE SET NULL,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_brain_snapshots (
  student_id UUID PRIMARY KEY REFERENCES academy_students(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── auth accounts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_auth_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── leads ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_leads (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fa',
  term_number INTEGER NOT NULL DEFAULT 1,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── trading arena ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_trading_arena_trades (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type TEXT NOT NULL CHECK (order_type IN ('market','limit','stop')),
  size_usdt NUMERIC NOT NULL DEFAULT 0,
  risk_percent NUMERIC NOT NULL DEFAULT 0,
  entry_reason TEXT NOT NULL,
  emotion TEXT NOT NULL,
  risk_plan TEXT NOT NULL,
  mentor_note TEXT NOT NULL,
  discipline_score INTEGER NOT NULL DEFAULT 0,
  risk_flag BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS academy_trading_arena_student_idx
  ON academy_trading_arena_trades(student_id, created_at DESC);

-- ── mentor tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mentor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced')),
  risk_profile TEXT NOT NULL DEFAULT 'medium' CHECK (risk_profile IN ('low','medium','high')),
  primary_goal TEXT NOT NULL DEFAULT '',
  weak_areas TEXT[] NOT NULL DEFAULT '{}',
  strong_areas TEXT[] NOT NULL DEFAULT '{}',
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  discipline_score INTEGER NOT NULL DEFAULT 0,
  learning_style TEXT NOT NULL DEFAULT 'mixed',
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id)
);

CREATE TABLE IF NOT EXISTS mentor_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fa',
  term_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mentor_conversations_student_idx
  ON mentor_conversations(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mentor_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('academy','trading','psychology','risk','discipline','goals','career','mistakes')),
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance IN (1,5,10,100)),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mentor_memories_student_idx
  ON mentor_memories(student_id, importance DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS mentor_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL DEFAULT 'session_summary',
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mentor_insights_student_idx
  ON mentor_insights(student_id, generated_at DESC);

-- ── certificates ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_certificates (
  id TEXT PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  term_number INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anchor_hash TEXT,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS academy_certificates_student_idx
  ON academy_certificates(student_id);

-- ── community career tables (Phase 9) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academy_public_profiles (
  student_id uuid PRIMARY KEY,
  visibility text NOT NULL DEFAULT 'public',
  mentor_endorsement text,
  career_track text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academy_professional_challenges (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  reward text NOT NULL,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_career_score int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academy_challenge_progress (
  challenge_id text NOT NULL REFERENCES academy_professional_challenges(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'available',
  progress int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(challenge_id, student_id)
);
