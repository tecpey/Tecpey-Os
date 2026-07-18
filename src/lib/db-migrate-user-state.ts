import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

type Migration = { filename: string; sql: string };

export const AUTHORITATIVE_ACADEMY_STATE_SQL = `
CREATE TABLE IF NOT EXISTS academy_state_documents (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  revision BIGINT NOT NULL DEFAULT 1,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale)
);

CREATE INDEX IF NOT EXISTS academy_state_documents_updated_idx
  ON academy_state_documents(updated_at DESC);
`;

export const ACADEMY_LEARNING_MEMORY_SQL = `
ALTER TABLE academy_state_documents
  ADD COLUMN IF NOT EXISTS flashcards JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS flashcard_revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reflections JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS memory_updated_at TIMESTAMPTZ;
`;

export const ACADEMY_REFLECTION_MEMORY_SQL = `
ALTER TABLE academy_state_documents
  ADD COLUMN IF NOT EXISTS reflection_revision BIGINT NOT NULL DEFAULT 0;
`;

export const TRADING_ARENA_ACCOUNT_SQL = `
CREATE TABLE IF NOT EXISTS academy_trading_arena_accounts (
  student_id UUID PRIMARY KEY REFERENCES academy_students(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'locked', 'completed')),
  initial_balance NUMERIC(30,10) NOT NULL DEFAULT 100000.0000000000
    CHECK (initial_balance > 0),
  available_balance NUMERIC(30,10) NOT NULL DEFAULT 100000.0000000000
    CHECK (available_balance >= 0),
  attempts_total SMALLINT NOT NULL DEFAULT 3
    CHECK (attempts_total = 3),
  attempts_used SMALLINT NOT NULL DEFAULT 0
    CHECK (attempts_used >= 0 AND attempts_used <= attempts_total),
  current_attempt SMALLINT NOT NULL DEFAULT 1
    CHECK (current_attempt >= 1 AND current_attempt <= attempts_total),
  revision BIGINT NOT NULL DEFAULT 1,
  cycle_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cycle_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, cycle_id)
);

CREATE TABLE IF NOT EXISTS academy_trading_arena_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  cycle_id UUID NOT NULL,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  status TEXT NOT NULL CHECK (status IN ('active', 'available', 'failed', 'passed')),
  starting_balance NUMERIC(30,10) NOT NULL DEFAULT 100000.0000000000
    CHECK (starting_balance > 0),
  cash_balance NUMERIC(30,10) NOT NULL DEFAULT 100000.0000000000
    CHECK (cash_balance >= 0),
  equity NUMERIC(30,10) NOT NULL DEFAULT 100000.0000000000
    CHECK (equity >= 0),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, cycle_id, attempt_number),
  FOREIGN KEY (student_id, cycle_id)
    REFERENCES academy_trading_arena_accounts(student_id, cycle_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS academy_trading_arena_one_active_attempt_idx
  ON academy_trading_arena_attempts(student_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS academy_trading_arena_attempts_cycle_idx
  ON academy_trading_arena_attempts(student_id, cycle_id, attempt_number);
`;

export const TRADING_ARENA_EXECUTION_STATE_SQL = `
ALTER TABLE academy_trading_arena_attempts
  ADD COLUMN IF NOT EXISTS execution_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS execution_updated_at TIMESTAMPTZ;

ALTER TABLE academy_trading_arena_attempts
  DROP CONSTRAINT IF EXISTS academy_trading_arena_execution_state_object;

ALTER TABLE academy_trading_arena_attempts
  ADD CONSTRAINT academy_trading_arena_execution_state_object
  CHECK (jsonb_typeof(execution_state) = 'object');
`;

const MIGRATIONS: Migration[] = [
  { filename: "0013_authoritative_academy_state.sql", sql: AUTHORITATIVE_ACADEMY_STATE_SQL },
  { filename: "0014_academy_learning_memory.sql", sql: ACADEMY_LEARNING_MEMORY_SQL },
  { filename: "0015_academy_reflection_memory.sql", sql: ACADEMY_REFLECTION_MEMORY_SQL },
  { filename: "0016_trading_arena_account.sql", sql: TRADING_ARENA_ACCOUNT_SQL },
  { filename: "0017_trading_arena_execution_state.sql", sql: TRADING_ARENA_EXECUTION_STATE_SQL },
];

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runUserStateMigrations(client: PoolClient): Promise<void> {
  for (const migration of MIGRATIONS) {
    const cs = checksum(migration.sql);
    const applied = await client.query<{ checksum: string }>(
      `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
      [migration.filename],
    );

    if (applied.rows[0]) {
      if (applied.rows[0].checksum !== cs) {
        throw new Error(`[db-migrate-user-state] checksum mismatch for ${migration.filename}`);
      }
      continue;
    }

    logger.info("[db-migrate-user-state] applying migration", { filename: migration.filename });
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
        [migration.filename, cs],
      );
      await client.query("COMMIT");
      logger.info("[db-migrate-user-state] migration applied", { filename: migration.filename });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}
