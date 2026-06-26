import type { PoolClient } from "pg";
import { ensureStudentCartaxTables } from "./student-cartax";
import { ensurePhase5Tables } from "./phase5-achievement-engine";
import { ensureCertificateTables } from "./academy-certificates";

export async function initSchema(client: PoolClient): Promise<void> {
  // Creates: academy_students, academy_student_cartax, academy_student_events,
  //          academy_simulator_decisions, academy_term_progress
  await ensureStudentCartaxTables(client);

  // Creates: learning_events, learning_brain_profiles, academy_question_bank,
  //          mentor_challenge_attempts, achievement_catalog, student_achievements,
  //          notification_center, device_tokens, admin_audit_log,
  //          certificate_share_events, notification_brain_snapshots
  await ensurePhase5Tables(client);

  // Creates: academy_certificates
  await ensureCertificateTables(client);

  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_auth_accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS academy_leads (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'fa',
      term_number INTEGER NOT NULL DEFAULT 1,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
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
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS academy_trading_arena_student_idx
    ON academy_trading_arena_trades(student_id, created_at DESC)
  `);

  // ── Mentor memory engine (Phase 4) ─────────────────────────────────────────

  await client.query(`
    CREATE TABLE IF NOT EXISTS mentor_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced')),
      risk_profile TEXT NOT NULL DEFAULT 'medium' CHECK (risk_profile IN ('low','medium','high')),
      primary_goal TEXT NOT NULL DEFAULT '',
      weak_areas TEXT[] NOT NULL DEFAULT '{}',
      strong_areas TEXT[] NOT NULL DEFAULT '{}',
      confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id)
    )
  `);
  // Phase 5 additions — safe to run on existing deployments.
  await client.query(`ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS discipline_score INTEGER NOT NULL DEFAULT 0`);
  await client.query(`ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS learning_style TEXT NOT NULL DEFAULT 'mixed'`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS mentor_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'fa',
      term_number INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS mentor_conversations_student_idx
    ON mentor_conversations(student_id, created_at DESC)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS mentor_memories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK (category IN ('academy','trading','psychology','risk','discipline','goals','career','mistakes')),
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 5 CHECK (importance IN (1,5,10,100)),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS mentor_memories_student_idx
    ON mentor_memories(student_id, importance DESC, created_at DESC)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS mentor_insights (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
      insight_type TEXT NOT NULL DEFAULT 'session_summary',
      content TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS mentor_insights_student_idx
    ON mentor_insights(student_id, generated_at DESC)
  `);
}
