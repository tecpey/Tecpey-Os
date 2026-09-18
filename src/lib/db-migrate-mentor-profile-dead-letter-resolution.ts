import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0107_mentor_profile_dead_letter_resolution.sql";

export const MENTOR_PROFILE_DEAD_LETTER_RESOLUTION_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS mentor_profile_dead_letters_resolution_scope_key
  ON mentor_profile_update_dead_letters
    (id, tenant_id, workspace_id, outbox_id, student_fingerprint);

CREATE TABLE IF NOT EXISTS mentor_profile_dead_letter_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dead_letter_id UUID NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  outbox_id UUID NOT NULL,
  repair_run_id UUID NOT NULL,
  student_fingerprint CHAR(64) NOT NULL,
  resolution_type TEXT NOT NULL CHECK (
    resolution_type = 'recomputed_current_state'
  ),
  repair_started_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL,
  resolution_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mentor_profile_dead_letter_resolution_scope_fk
    FOREIGN KEY (
      dead_letter_id, tenant_id, workspace_id, outbox_id, student_fingerprint
    )
    REFERENCES mentor_profile_update_dead_letters(
      id, tenant_id, workspace_id, outbox_id, student_fingerprint
    )
    ON DELETE RESTRICT,
  CHECK (char_length(workspace_id) BETWEEN 1 AND 120),
  CHECK (student_fingerprint ~ '^[a-f0-9]{64}$'),
  CHECK (resolution_hash ~ '^[a-f0-9]{64}$'),
  CHECK (resolved_at >= repair_started_at)
);

CREATE INDEX IF NOT EXISTS mentor_profile_dead_letter_resolution_run_idx
  ON mentor_profile_dead_letter_resolutions (repair_run_id, resolved_at DESC);

CREATE OR REPLACE FUNCTION tecpey_block_mentor_profile_dead_letter_resolution_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mentor_profile_dead_letter_resolutions is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS mentor_profile_dead_letter_resolutions_no_update
  ON mentor_profile_dead_letter_resolutions;
CREATE TRIGGER mentor_profile_dead_letter_resolutions_no_update
  BEFORE UPDATE ON mentor_profile_dead_letter_resolutions
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_mentor_profile_dead_letter_resolution_mutation();

DROP TRIGGER IF EXISTS mentor_profile_dead_letter_resolutions_no_delete
  ON mentor_profile_dead_letter_resolutions;
CREATE TRIGGER mentor_profile_dead_letter_resolutions_no_delete
  BEFORE DELETE ON mentor_profile_dead_letter_resolutions
  FOR EACH ROW EXECUTE FUNCTION tecpey_block_mentor_profile_dead_letter_resolution_mutation();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runMentorProfileDeadLetterResolutionMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(MENTOR_PROFILE_DEAD_LETTER_RESOLUTION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-mentor-profile-dead-letter-resolution] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(MENTOR_PROFILE_DEAD_LETTER_RESOLUTION_SQL);
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
