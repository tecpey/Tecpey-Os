import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0029_academy_section_command_authority.sql";

export const ACADEMY_SECTION_COMMAND_AUTHORITY_SQL = `
CREATE TABLE IF NOT EXISTS academy_section_commands (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES academy_students(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fa', 'en')),
  command_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  result_response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, idempotency_key),
  CHECK (char_length(command_type) BETWEEN 8 AND 300),
  CHECK (char_length(idempotency_key) BETWEEN 16 AND 120),
  CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(result_response) = 'object')
);

CREATE INDEX IF NOT EXISTS academy_section_commands_request_idx
  ON academy_section_commands(student_id, command_type, request_hash, created_at ASC);

CREATE OR REPLACE FUNCTION tecpey_block_academy_section_command_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'academy_section_commands is immutable idempotency evidence'
    USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS academy_section_commands_no_update ON academy_section_commands;
CREATE TRIGGER academy_section_commands_no_update
  BEFORE UPDATE ON academy_section_commands
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_academy_section_command_mutation();
DROP TRIGGER IF EXISTS academy_section_commands_no_delete ON academy_section_commands;
CREATE TRIGGER academy_section_commands_no_delete
  BEFORE DELETE ON academy_section_commands
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_academy_section_command_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAcademySectionCommandMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_SECTION_COMMAND_AUTHORITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-section-commands] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-academy-section-commands] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_SECTION_COMMAND_AUTHORITY_SQL);
    await client.query(
      "INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)",
      [FILENAME, cs],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
