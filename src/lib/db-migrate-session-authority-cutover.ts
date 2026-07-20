import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0036_session_authority_cutover.sql";

export const SESSION_AUTHORITY_CUTOVER_SQL = `
-- Active rows created before refresh-family/device binding cannot be mapped
-- safely after the fact. Revoke them once at cutover and require re-login.
UPDATE user_sessions
   SET is_revoked = TRUE,
       revoked_at = COALESCE(revoked_at, NOW())
 WHERE is_revoked = FALSE
   AND (
     refresh_family_id IS NULL
     OR refresh_token_id IS NULL
     OR known_device_id IS NULL
   );

UPDATE refresh_tokens
   SET is_revoked = TRUE,
       revoked_at = COALESCE(revoked_at, NOW())
 WHERE is_revoked = FALSE
   AND known_device_id IS NULL;
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runSessionAuthorityCutoverMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(SESSION_AUTHORITY_CUTOVER_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-session-authority-cutover] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-session-authority-cutover] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(SESSION_AUTHORITY_CUTOVER_SQL);
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
