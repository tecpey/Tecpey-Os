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

export const ACADEMY_LESSON_PROGRESS_SQL = `
CREATE TABLE IF NOT EXISTS academy_lesson_progress (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 7),
  term_slug TEXT NOT NULL,
  section_key TEXT NOT NULL,
  section_heading TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  answer TEXT,
  first_answer TEXT,
  answer_attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale, term_slug, section_key),
  CHECK (term_slug = ('term-' || term_number::text)),
  CHECK (char_length(section_key) BETWEEN 1 AND 220),
  CHECK (char_length(section_heading) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS academy_lesson_progress_student_term_idx
  ON academy_lesson_progress(student_id, locale, term_number, updated_at DESC);

CREATE TABLE IF NOT EXISTS academy_term_learning_progress (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 7),
  term_slug TEXT NOT NULL,
  total_sections SMALLINT NOT NULL CHECK (total_sections BETWEEN 1 AND 100),
  completed_sections SMALLINT NOT NULL DEFAULT 0 CHECK (completed_sections BETWEEN 0 AND 100),
  answered_sections SMALLINT NOT NULL DEFAULT 0 CHECK (answered_sections BETWEEN 0 AND 100),
  percent SMALLINT NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale, term_slug),
  CHECK (term_slug = ('term-' || term_number::text)),
  CHECK (completed_sections <= total_sections),
  CHECK (answered_sections <= total_sections)
);

CREATE INDEX IF NOT EXISTS academy_term_learning_progress_student_idx
  ON academy_term_learning_progress(student_id, locale, term_number);
`;

export const TRADING_ARENA_EXECUTION_SQL = `
ALTER TABLE academy_trading_arena_attempts
  ADD COLUMN IF NOT EXISTS execution_schema_version SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS execution_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS execution_updated_at TIMESTAMPTZ;

ALTER TABLE academy_trading_arena_attempts
  DROP CONSTRAINT IF EXISTS academy_trading_arena_attempts_execution_schema_check;
ALTER TABLE academy_trading_arena_attempts
  ADD CONSTRAINT academy_trading_arena_attempts_execution_schema_check
  CHECK (execution_schema_version = 2);

ALTER TABLE academy_trading_arena_attempts
  DROP CONSTRAINT IF EXISTS academy_trading_arena_attempts_execution_state_object_check;
ALTER TABLE academy_trading_arena_attempts
  ADD CONSTRAINT academy_trading_arena_attempts_execution_state_object_check
  CHECK (jsonb_typeof(execution_state) = 'object');

CREATE TABLE IF NOT EXISTS academy_trading_arena_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES academy_trading_arena_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('market_buy', 'limit_buy', 'close_position', 'cancel_order', 'refresh_market')),
  expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0),
  request_hash CHAR(64) NOT NULL,
  result_revision BIGINT NOT NULL CHECK (result_revision >= 1),
  result_event_type TEXT NOT NULL,
  result_response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, idempotency_key),
  CHECK (char_length(idempotency_key) BETWEEN 8 AND 120),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(result_response) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_trading_arena_commands_student_idx
  ON academy_trading_arena_commands(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS academy_trading_arena_execution_events (
  id BIGSERIAL PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES academy_trading_arena_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL CHECK (revision >= 1),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, revision),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_trading_arena_execution_events_student_idx
  ON academy_trading_arena_execution_events(student_id, created_at DESC);
`;

export const ACADEMY_REWARD_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS academy_progress_legacy_snapshots (
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  schema_version SMALLINT NOT NULL DEFAULT 2,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  reward_event_cursor BIGINT NOT NULL DEFAULT 0 CHECK (reward_event_cursor >= 0),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, locale),
  CHECK (jsonb_typeof(progress) = 'object')
);

CREATE TABLE IF NOT EXISTS academy_reward_events (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  reward_type TEXT NOT NULL CHECK (reward_type IN (
    'lesson_complete',
    'lesson_perfect_bonus',
    'term_pass',
    'lesson_section_complete',
    'lesson_answered',
    'badge'
  )),
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, locale, reward_type, source_type, source_key),
  CHECK (char_length(source_type) BETWEEN 1 AND 80),
  CHECK (char_length(source_key) BETWEEN 1 AND 220),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_reward_events_projection_idx
  ON academy_reward_events(student_id, locale, id);

CREATE TABLE IF NOT EXISTS academy_lesson_assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  lesson_id TEXT NOT NULL,
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 7),
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  correct_count SMALLINT NOT NULL CHECK (correct_count >= 0),
  question_count SMALLINT NOT NULL CHECK (question_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, locale, lesson_id, idempotency_key),
  CHECK (char_length(lesson_id) BETWEEN 1 AND 160),
  CHECK (char_length(idempotency_key) BETWEEN 8 AND 120),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(answers) = 'object'),
  CHECK (correct_count <= question_count)
);

CREATE INDEX IF NOT EXISTS academy_lesson_assessment_best_idx
  ON academy_lesson_assessment_attempts(student_id, locale, lesson_id, passed, score DESC, created_at ASC);
`;

const MIGRATIONS: Migration[] = [
  { filename: "0013_authoritative_academy_state.sql", sql: AUTHORITATIVE_ACADEMY_STATE_SQL },
  { filename: "0014_academy_learning_memory.sql", sql: ACADEMY_LEARNING_MEMORY_SQL },
  { filename: "0015_academy_reflection_memory.sql", sql: ACADEMY_REFLECTION_MEMORY_SQL },
  { filename: "0016_trading_arena_account.sql", sql: TRADING_ARENA_ACCOUNT_SQL },
  { filename: "0017_academy_lesson_progress.sql", sql: ACADEMY_LESSON_PROGRESS_SQL },
  { filename: "0020_trading_arena_execution.sql", sql: TRADING_ARENA_EXECUTION_SQL },
  { filename: "0021_academy_reward_authority.sql", sql: ACADEMY_REWARD_AUTHORITY_SQL },
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
