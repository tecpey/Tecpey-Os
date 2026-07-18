import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0012_academy_runtime_schema_repair.sql";

export const ACADEMY_RUNTIME_SCHEMA_REPAIR_SQL = `
-- Academy student/profile columns used by current API routes but absent from
-- the original inlined migration on a fresh database.
ALTER TABLE academy_students
  ADD COLUMN IF NOT EXISTS last_active_day DATE;

ALTER TABLE academy_student_cartax
  ADD COLUMN IF NOT EXISTS identity_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS community_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS ip TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Term progress contract used by /api/academy-term-progress.
ALTER TABLE academy_term_progress
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'fa',
  ADD COLUMN IF NOT EXISTS percent INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 0001 used UNIQUE(student_id, term_number), which prevents the same learner
-- from having independent FA and EN progress. The current API contract is
-- (student_id, term_number, locale), so remove the legacy uniqueness rule.
ALTER TABLE academy_term_progress
  DROP CONSTRAINT IF EXISTS academy_term_progress_student_id_term_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_academy_term_progress_student_term_locale
  ON academy_term_progress(student_id, term_number, locale);

-- Simulator API evolved from the early generic decision model to a scenario
-- model. Fresh DBs created by 0001 otherwise miss these fields and still require
-- decision_type, causing every current INSERT to fail.
ALTER TABLE academy_simulator_decisions
  ADD COLUMN IF NOT EXISTS scenario_id TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'fa',
  ADD COLUMN IF NOT EXISTS choice_id TEXT,
  ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feedback TEXT,
  ADD COLUMN IF NOT EXISTS entry_reason TEXT,
  ADD COLUMN IF NOT EXISTS emotion_state TEXT,
  ADD COLUMN IF NOT EXISTS risk_plan TEXT;

ALTER TABLE academy_simulator_decisions
  ALTER COLUMN decision_type DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_academy_simulator_student_scenario
  ON academy_simulator_decisions(student_id, scenario_id)
  WHERE scenario_id IS NOT NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

/**
 * Compatibility migration for schema that shipped before the inlined migration
 * registry matched the Academy API contract. Uses the same _migrations ledger so
 * every database receives the repair exactly once and drift remains observable.
 */
export async function runCompatibilityMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_RUNTIME_SCHEMA_REPAIR_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-compat] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-compat] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_RUNTIME_SCHEMA_REPAIR_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-compat] migration applied", { filename: FILENAME });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
