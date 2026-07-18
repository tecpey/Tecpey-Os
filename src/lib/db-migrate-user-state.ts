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

const MIGRATIONS: Migration[] = [
  { filename: "0013_authoritative_academy_state.sql", sql: AUTHORITATIVE_ACADEMY_STATE_SQL },
  { filename: "0014_academy_learning_memory.sql", sql: ACADEMY_LEARNING_MEMORY_SQL },
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
