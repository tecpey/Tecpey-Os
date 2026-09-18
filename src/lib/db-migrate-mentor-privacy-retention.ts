import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0104_mentor_privacy_retention_authority.sql";

export const MENTOR_PRIVACY_RETENTION_SQL = `
ALTER TABLE mentor_ai_preferences
  ALTER COLUMN external_provider_enabled SET DEFAULT FALSE;

UPDATE mentor_ai_preferences
   SET external_provider_enabled = FALSE,
       consent_version = '2026-09-18.1',
       updated_at = NOW()
 WHERE external_provider_enabled = TRUE
   AND consented_at IS NULL;

CREATE INDEX IF NOT EXISTS mentor_memories_expiry_cleanup_idx
  ON mentor_memories (expires_at, id)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS mentor_conversations_retention_cleanup_idx
  ON mentor_conversations (created_at, id)
  WHERE retention_class = 'mentor_history_90d';
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runMentorPrivacyRetentionMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(MENTOR_PRIVACY_RETENTION_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-mentor-privacy-retention] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(MENTOR_PRIVACY_RETENTION_SQL);
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
