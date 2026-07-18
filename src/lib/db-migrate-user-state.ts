import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0013_authoritative_academy_state.sql";

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

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runUserStateMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(AUTHORITATIVE_ACADEMY_STATE_SQL);
  const applied = await client.query<{ checksum: string }>(
    `SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1`,
    [FILENAME],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-user-state] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-user-state] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(AUTHORITATIVE_ACADEMY_STATE_SQL);
    await client.query(
      `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
      [FILENAME, cs],
    );
    await client.query("COMMIT");
    logger.info("[db-migrate-user-state] migration applied", { filename: FILENAME });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
