import type { PoolClient } from "pg";
import type { RevokedSessionEvidence } from "./session-store";

/**
 * Revoke one exact access session for one exact principal inside the caller's
 * PostgreSQL transaction. Already-revoked owned sessions remain addressable so
 * a replay can repair Redis deny projection without disclosing another user's
 * session existence.
 */
export async function revokeExactSessionWithClient(
  client: PoolClient,
  sessionId: string,
  userId: string,
): Promise<RevokedSessionEvidence | null> {
  const updated = await client.query<{ expires_at: Date }>(
    `UPDATE user_sessions
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE id = $1
        AND user_id = $2
        AND is_revoked = FALSE
      RETURNING expires_at`,
    [sessionId, userId],
  );
  const newlyRevoked = updated.rows[0]?.expires_at;
  if (newlyRevoked) {
    return {
      jti: sessionId,
      expiresAt: Math.floor(newlyRevoked.getTime() / 1000),
    };
  }

  const existing = await client.query<{
    expires_at: Date;
    is_revoked: boolean;
  }>(
    `SELECT expires_at, is_revoked
       FROM user_sessions
      WHERE id = $1
        AND user_id = $2
      LIMIT 1`,
    [sessionId, userId],
  );
  const row = existing.rows[0];
  if (!row?.is_revoked) return null;
  return {
    jti: sessionId,
    expiresAt: Math.floor(row.expires_at.getTime() / 1000),
  };
}
