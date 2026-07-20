import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { logger } from "./logger";

const FILENAME = "0036_session_legacy_unbound_fallback.sql";

export const SESSION_LEGACY_UNBOUND_FALLBACK_SQL = `
CREATE OR REPLACE FUNCTION tecpey_revoke_legacy_unbound_session_refresh_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Sessions created before refresh-family binding cannot prove which refresh
  -- family belongs to the selected device. Revoking one such access session
  -- therefore revokes every refresh authority for that principal. This is a
  -- compatibility-only, security-first fallback; newly admitted sessions are
  -- always family-bound by Session Authority.
  IF OLD.is_revoked = FALSE
     AND NEW.is_revoked = TRUE
     AND NEW.refresh_family_id IS NULL THEN
    UPDATE refresh_tokens
       SET is_revoked = TRUE,
           revoked_at = COALESCE(revoked_at, NOW())
     WHERE user_id = NEW.user_id
       AND is_revoked = FALSE;

    UPDATE refresh_token_families
       SET status = 'revoked',
           revoked_at = COALESCE(revoked_at, NOW()),
           revoke_reason = COALESCE(
             revoke_reason,
             'legacy_unbound_session_revoked'
           )
     WHERE user_id = NEW.user_id
       AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_sessions_legacy_unbound_refresh_revoke
  ON user_sessions;
CREATE TRIGGER user_sessions_legacy_unbound_refresh_revoke
  AFTER UPDATE OF is_revoked ON user_sessions
  FOR EACH ROW
  WHEN (
    OLD.is_revoked = FALSE
    AND NEW.is_revoked = TRUE
    AND NEW.refresh_family_id IS NULL
  )
  EXECUTE FUNCTION tecpey_revoke_legacy_unbound_session_refresh_authority();
`;

function checksum(sql: string): string {
  return createHash("sha256")
    .update(sql.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

export async function runSessionLegacyFallbackMigrations(
  client: PoolClient,
): Promise<void> {
  const cs = checksum(SESSION_LEGACY_UNBOUND_FALLBACK_SQL);
  const applied = await client.query<{ checksum: string }>(
    "SELECT checksum FROM _migrations WHERE filename = $1 LIMIT 1",
    [FILENAME],
  );
  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== cs) {
      throw new Error(
        `[db-migrate-session-legacy-fallback] checksum mismatch for ${FILENAME}`,
      );
    }
    return;
  }

  logger.info("[db-migrate-session-legacy-fallback] applying migration", {
    filename: FILENAME,
  });
  await client.query("BEGIN");
  try {
    await client.query(SESSION_LEGACY_UNBOUND_FALLBACK_SQL);
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
