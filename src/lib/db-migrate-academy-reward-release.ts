import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0028_academy_reward_legacy_release.sql";

export const ACADEMY_REWARD_LEGACY_RELEASE_SQL = `
UPDATE academy_reward_ledger
   SET reward_key = 'legacy-revoked:' || id::text || ':' || reward_key
 WHERE reward_key = 'badge:first-lesson'
   AND revoked_at IS NOT NULL
   AND revocation_reason = 'legacy_client_mutable_section_state';

CREATE INDEX IF NOT EXISTS academy_reward_ledger_active_student_idx
  ON academy_reward_ledger(student_id, locale, awarded_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE academy_reward_ledger
  DROP CONSTRAINT IF EXISTS academy_reward_ledger_revocation_reason_check;
ALTER TABLE academy_reward_ledger
  ADD CONSTRAINT academy_reward_ledger_revocation_reason_check
  CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND char_length(revocation_reason) BETWEEN 3 AND 180)
  );
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runAcademyRewardLegacyReleaseMigrations(client: PoolClient): Promise<void> {
  const cs = checksum(ACADEMY_REWARD_LEGACY_RELEASE_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(`[db-migrate-academy-reward-release] checksum mismatch for ${FILENAME}`);
    }
    return;
  }

  logger.info("[db-migrate-academy-reward-release] applying migration", { filename: FILENAME });
  await client.query("BEGIN");
  try {
    await client.query(ACADEMY_REWARD_LEGACY_RELEASE_SQL);
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
