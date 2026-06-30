/**
 * Database migration runner — Phase 22.
 *
 * Replaces the schema-on-connect pattern in db.ts.
 * Migrations are inlined as string constants so they are bundled with the
 * application and do not require filesystem access at runtime (safe for
 * serverless / Vercel deployments).
 *
 * The migrations/*.sql files are human-readable documentation; this file
 * is the authoritative execution source.
 *
 * Idempotency: every migration uses CREATE TABLE IF NOT EXISTS / CREATE INDEX
 * IF NOT EXISTS, so running against an existing database is safe.
 *
 * Tracking: applied migrations are recorded in the _migrations table
 * (filename + sha256 checksum). If a committed migration's content changes,
 * the runner will error rather than silently re-apply.
 */

import { createHash } from "crypto";
import { emitAlert } from "./alerts";
import type { PoolClient } from "pg";
import { logger } from "./logger";

// ── Migration registry ────────────────────────────────────────────────────────

type Migration = {
  filename: string;
  sql: string;
};

const MIGRATIONS: Migration[] = [
  {
    filename: "0001_initial_schema.sql",
    sql: `
-- student-cartax tables

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

-- phase5 tables

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

-- auth accounts

CREATE TABLE IF NOT EXISTS academy_auth_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- leads

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

-- trading arena

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

-- mentor tables

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

-- certificates

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

-- community career tables (Phase 9)

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
`,
  },

  // ── 0002: Extended schema (Phase 24.6) ──────────────────────────────────────
  // Adds columns referenced by API routes that were absent from the initial
  // migration. Uses ADD COLUMN IF NOT EXISTS throughout so it is safe to run
  // against an already-extended production database.
  {
    filename: "0002_extended_schema.sql",
    sql: `
-- notification_center: operational columns required by /api/notifications
ALTER TABLE notification_center ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE notification_center ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notification_center ADD COLUMN IF NOT EXISTS channels TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE notification_center ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE notification_center ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- admin_audit_log: 'actor' used in INSERT; initial migration defined 'admin_id'.
-- Both columns kept to preserve any existing admin_id data.
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS actor TEXT;

-- academy_question_bank: enriched columns used by /api/mentor-challenge
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS lesson_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT '';
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS cognitive_skill TEXT NOT NULL DEFAULT 'recall';
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS correct_option TEXT NOT NULL DEFAULT '';
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE academy_question_bank ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS academy_question_bank_lesson_idx
  ON academy_question_bank(lesson_slug, topic, approved, difficulty);

-- mentor_challenge_attempts: question-level tracking columns
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS question_id UUID;
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS selected_option TEXT;
ALTER TABLE mentor_challenge_attempts ADD COLUMN IF NOT EXISTS is_correct BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS mentor_challenge_attempts_question_idx
  ON mentor_challenge_attempts(student_id, question_id);

-- academy_students: last_seen_at for activity-based queries in /api/command-center
ALTER TABLE academy_students ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- learning_brain_profiles: denormalized scalar fields for fast querying
-- Previously stored only inside the JSONB 'profile' column; now promoted to
-- first-class columns so queries don't need to navigate into JSONB.
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS decision_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS confidence_score INTEGER NOT NULL DEFAULT 45;
ALTER TABLE learning_brain_profiles ADD COLUMN IF NOT EXISTS weak_topics TEXT[] NOT NULL DEFAULT '{}';
`,
  },

  // ── 0003: Tenant and membership foundation (Phase 25) ───────────────────────
  {
    filename: "0003_tenant_membership.sql",
    sql: `
-- Tenant registry — top-level organizational units.
-- In single-tenant mode the default 'tecpey' row is seeded below.
CREATE TABLE IF NOT EXISTS platform_tenants (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  owner_id TEXT,
  products TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace — sub-unit inside a tenant.
CREATE TABLE IF NOT EXISTS platform_workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  products TEXT[] NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

-- Membership — links a user to a tenant and defines their roles within it.
CREATE TABLE IF NOT EXISTS platform_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES platform_tenants(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES platform_workspaces(id) ON DELETE SET NULL,
  roles TEXT[] NOT NULL DEFAULT '{}',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS platform_memberships_user_idx ON platform_memberships(user_id);
CREATE INDEX IF NOT EXISTS platform_memberships_tenant_idx ON platform_memberships(tenant_id);

-- Seed the default single-tenant record.
-- ON CONFLICT DO NOTHING ensures idempotency against existing rows.
INSERT INTO platform_tenants (id, slug, display_name, plan, products)
VALUES (
  'tecpey', 'tecpey', 'TecPey', 'enterprise',
  ARRAY['exchange','academy','social','mentor','knowledge']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products)
VALUES (
  'main', 'tecpey', 'main', 'Main',
  ARRAY['exchange','academy','social','mentor','knowledge']
) ON CONFLICT (id) DO NOTHING;
`,
  },

  // ── 0004: Trading Core Foundation (Phase 28) ─────────────────────────────────
  {
    filename: "0004_trading_core.sql",
    sql: `
-- assets: canonical list of tradable tokens and fiat representations.
CREATE TABLE IF NOT EXISTS assets (
  id            TEXT         PRIMARY KEY,
  symbol        TEXT         UNIQUE NOT NULL,
  name          TEXT         NOT NULL,
  precision     INT          NOT NULL DEFAULT 8,
  status        TEXT         NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','maintenance','suspended','delisted')),
  deposit_enabled  BOOLEAN   NOT NULL DEFAULT TRUE,
  withdraw_enabled BOOLEAN   NOT NULL DEFAULT TRUE,
  min_deposit   NUMERIC(30,10) NOT NULL DEFAULT 0,
  min_withdraw  NUMERIC(30,10) NOT NULL DEFAULT 0,
  withdraw_fee  NUMERIC(30,10) NOT NULL DEFAULT 0,
  display_order INT          NOT NULL DEFAULT 0,
  metadata      JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- markets: trading pairs derived from two assets.
CREATE TABLE IF NOT EXISTS markets (
  symbol             TEXT          PRIMARY KEY,
  base_asset         TEXT          NOT NULL,
  quote_asset        TEXT          NOT NULL,
  status             TEXT          NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','maintenance','closed','suspended')),
  tick_size          NUMERIC(30,10) NOT NULL,
  step_size          NUMERIC(30,10) NOT NULL,
  min_order_value    NUMERIC(30,10) NOT NULL,
  max_order_value    NUMERIC(30,10) NOT NULL DEFAULT 0,
  price_precision    INT            NOT NULL DEFAULT 2,
  quantity_precision INT            NOT NULL DEFAULT 6,
  maker_fee          NUMERIC(10,6)  NOT NULL DEFAULT 0.001,
  taker_fee          NUMERIC(10,6)  NOT NULL DEFAULT 0.001,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- wallet_ledger: append-only double-entry style ledger.
-- Balances are NEVER modified directly — every change must appear here.
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id      TEXT          NOT NULL,
  asset          TEXT          NOT NULL,
  type           TEXT          NOT NULL
                               CHECK (type IN ('deposit','withdraw','trade_debit','trade_credit','fee','adjustment','hold','release')),
  amount         NUMERIC(30,10) NOT NULL,
  balance_after  NUMERIC(30,10) NOT NULL,
  reference_id   TEXT,
  reference_type TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- orders: every order submitted to the exchange.
CREATE TABLE IF NOT EXISTS orders (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT          NOT NULL,
  market             TEXT          NOT NULL,
  side               TEXT          NOT NULL  CHECK (side IN ('buy','sell')),
  type               TEXT          NOT NULL  CHECK (type IN ('limit','market','ioc','fok','gtc','stop_limit')),
  status             TEXT          NOT NULL  DEFAULT 'NEW'
                                             CHECK (status IN ('NEW','PARTIALLY_FILLED','FILLED','CANCELLED','EXPIRED','REJECTED')),
  price              NUMERIC(30,10),
  stop_price         NUMERIC(30,10),
  quantity           NUMERIC(30,10) NOT NULL,
  filled_quantity    NUMERIC(30,10) NOT NULL DEFAULT 0,
  remaining_quantity NUMERIC(30,10) NOT NULL,
  avg_fill_price     NUMERIC(30,10),
  client_order_id    TEXT,
  time_in_force      TEXT          NOT NULL DEFAULT 'GTC',
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- trades: every executed match between a buyer and a seller.
CREATE TABLE IF NOT EXISTS trades (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  market          TEXT          NOT NULL,
  buyer_order_id  UUID          NOT NULL,
  seller_order_id UUID          NOT NULL,
  price           NUMERIC(30,10) NOT NULL,
  quantity        NUMERIC(30,10) NOT NULL,
  fee_buyer       NUMERIC(30,10) NOT NULL DEFAULT 0,
  fee_seller      NUMERIC(30,10) NOT NULL DEFAULT 0,
  maker_side      TEXT          NOT NULL  CHECK (maker_side IN ('buy','sell')),
  executed_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- order_events: immutable audit log for every state transition.
CREATE TABLE IF NOT EXISTS order_events (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID          NOT NULL,
  event_type  TEXT          NOT NULL,
  payload     JSONB         NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet  ON wallet_ledger(wallet_id, asset, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user           ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_market_status  ON orders(market, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_market         ON trades(market, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_order    ON order_events(order_id, created_at DESC);

-- Seed assets: USDT, BTC, ETH — idempotent.
INSERT INTO assets (id, symbol, name, precision, status, deposit_enabled, withdraw_enabled,
                    min_deposit, min_withdraw, withdraw_fee, display_order)
VALUES
  ('usdt', 'USDT', 'Tether USD',      6, 'active', TRUE, TRUE, '1',     '10',    '1',    1),
  ('btc',  'BTC',  'Bitcoin',         8, 'active', TRUE, TRUE, '0.0001','0.0005','0.0001',2),
  ('eth',  'ETH',  'Ethereum',        8, 'active', TRUE, TRUE, '0.01',  '0.02',  '0.005', 3)
ON CONFLICT (id) DO NOTHING;

-- Seed markets: BTCUSDT, ETHUSDT — idempotent.
INSERT INTO markets (symbol, base_asset, quote_asset, status,
                     tick_size, step_size, min_order_value, max_order_value,
                     price_precision, quantity_precision, maker_fee, taker_fee)
VALUES
  ('BTCUSDT', 'BTC', 'USDT', 'active', '0.01', '0.00001', '10', '500000', 2, 5, '0.001', '0.001'),
  ('ETHUSDT', 'ETH', 'USDT', 'active', '0.01', '0.0001',  '5',  '100000', 2, 4, '0.001', '0.001')
ON CONFLICT (symbol) DO NOTHING;
`,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

function computeChecksum(sql: string): string {
  const normalized = sql.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT NOT NULL
    )
  `);
}

async function getAppliedMigrations(client: PoolClient): Promise<Map<string, string>> {
  const result = await client.query<{ filename: string; checksum: string }>(
    `SELECT filename, checksum FROM _migrations ORDER BY filename`,
  );
  return new Map(result.rows.map((r) => [r.filename, r.checksum]));
}

export async function runMigrations(client: PoolClient): Promise<void> {
  await ensureMigrationsTable(client);
  const applied = await getAppliedMigrations(client);

  for (const migration of MIGRATIONS) {
    const cs = computeChecksum(migration.sql);

    if (applied.has(migration.filename)) {
      const storedChecksum = applied.get(migration.filename)!;
      if (storedChecksum !== cs) {
        logger.error("[db-migrate] checksum mismatch — migration was modified after being applied", {
          filename: migration.filename,
          stored: storedChecksum,
          computed: cs,
        });
        throw new Error(`[db-migrate] checksum mismatch for ${migration.filename}`);
      }
      continue; // already applied
    }

    logger.info("[db-migrate] applying migration", { filename: migration.filename });
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
        [migration.filename, cs],
      );
      await client.query("COMMIT");
      logger.info("[db-migrate] migration applied successfully", { filename: migration.filename });
    } catch (err) {
      await client.query("ROLLBACK");
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[db-migrate] migration failed, transaction rolled back", {
        filename: migration.filename,
        error: msg,
      });
      emitAlert("MIGRATION_FAILED", `Migration ${migration.filename} failed: ${msg}`, {
        filename: migration.filename,
        error: msg,
        environment: process.env.NODE_ENV,
      });
      throw err;
    }
  }
}
