import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0108_mentor_profile_freshness_observability.sql";

export const MENTOR_PROFILE_FRESHNESS_OBSERVABILITY_SQL = `
CREATE INDEX IF NOT EXISTS mentor_profile_update_outbox_freshness_window_idx
  ON mentor_profile_update_outbox (created_at DESC)
  INCLUDE (processed_at);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runMentorProfileFreshnessObservabilityMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(MENTOR_PROFILE_FRESHNESS_OBSERVABILITY_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-mentor-profile-freshness-observability] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(MENTOR_PROFILE_FRESHNESS_OBSERVABILITY_SQL);
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
