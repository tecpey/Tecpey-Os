import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const FILENAME = "0110_operational_signal_episodes.sql";

export const OPERATIONAL_SIGNAL_EPISODES_SQL = `
ALTER TABLE platform_operational_signals
  ADD COLUMN IF NOT EXISTS episode_id UUID,
  ADD COLUMN IF NOT EXISTS episode_sequence INTEGER;

ALTER TABLE platform_operational_signals
  DROP CONSTRAINT IF EXISTS platform_operational_signal_lifecycle_check;
ALTER TABLE platform_operational_signals
  ADD CONSTRAINT platform_operational_signal_lifecycle_check
    CHECK (lifecycle IN ('firing', 'updated', 'resolved'));

ALTER TABLE platform_operational_signals
  DROP CONSTRAINT IF EXISTS platform_operational_signal_episode_check;
ALTER TABLE platform_operational_signals
  ADD CONSTRAINT platform_operational_signal_episode_check
    CHECK (
      (episode_id IS NULL AND episode_sequence IS NULL)
      OR (
        episode_id IS NOT NULL
        AND episode_sequence BETWEEN 1 AND 1000000
      )
    );

CREATE INDEX IF NOT EXISTS platform_operational_signals_episode_idx
  ON platform_operational_signals (episode_id, episode_sequence)
  WHERE episode_id IS NOT NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runOperationalSignalEpisodeMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(OPERATIONAL_SIGNAL_EPISODES_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-operational-signal-episodes] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(OPERATIONAL_SIGNAL_EPISODES_SQL);
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
