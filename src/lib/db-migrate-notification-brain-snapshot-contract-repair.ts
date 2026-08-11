import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0064_notification_brain_snapshot_contract_repair.sql";

// Defensive forward-only repair for the derived notification brain snapshot
// contract. 0063 owns the same shape; this step makes the guarantee resilient
// if an older ledger claims 0063 without the expanded columns.
export const NOTIFICATION_BRAIN_SNAPSHOT_CONTRACT_REPAIR_SQL = `
ALTER TABLE notification_brain_snapshots
  ADD COLUMN IF NOT EXISTS return_probability INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS churn_risk INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_channel TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS best_time_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_hook_type TEXT NOT NULL DEFAULT 'learning',
  ADD COLUMN IF NOT EXISTS next_action_url TEXT NOT NULL DEFAULT '/academy/profile',
  ADD COLUMN IF NOT EXISTS message_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS message_body TEXT NOT NULL DEFAULT '';
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runNotificationBrainSnapshotContractRepairMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(NOTIFICATION_BRAIN_SNAPSHOT_CONTRACT_REPAIR_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-notification-brain-snapshot-contract-repair] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-notification-brain-snapshot-contract-repair] applying migration", {
    filename: FILENAME,
    checksum: cs,
  });
  await client.query("BEGIN");
  try {
    await client.query(NOTIFICATION_BRAIN_SNAPSHOT_CONTRACT_REPAIR_SQL);
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
