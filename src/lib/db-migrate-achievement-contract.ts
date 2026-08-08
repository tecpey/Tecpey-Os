import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0056_achievement_contract_columns.sql";

// Repair the Academy achievement contract after the original Phase 5 tables
// shipped with legacy id/xp_reward/achievement_id columns while the runtime
// code reads and writes code/xp/payload. This migration is additive only:
// legacy columns remain intact, and existing rows are backfilled into the
// current application contract when possible.
export const ACHIEVEMENT_CONTRACT_COLUMNS_SQL = `
ALTER TABLE achievement_catalog ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE achievement_catalog ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;

UPDATE achievement_catalog
   SET code = id
 WHERE code IS NULL
   AND id IS NOT NULL;

UPDATE achievement_catalog
   SET xp = xp_reward
 WHERE xp = 0
   AND xp_reward IS NOT NULL
   AND xp_reward <> 0;

ALTER TABLE achievement_catalog ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS achievement_catalog_code_unique_idx
  ON achievement_catalog(code);

ALTER TABLE student_achievements ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE student_achievements ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}';

UPDATE student_achievements
   SET code = achievement_id
 WHERE code IS NULL
   AND achievement_id IS NOT NULL;

ALTER TABLE student_achievements ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS student_achievements_student_code_unique_idx
  ON student_achievements(student_id, code);
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}

export async function runAchievementContractMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(ACHIEVEMENT_CONTRACT_COLUMNS_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-achievement-contract] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-achievement-contract] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(ACHIEVEMENT_CONTRACT_COLUMNS_SQL);
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
