// Server-side session registry — PostgreSQL durable authority with Redis deny cache.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { revokeJti, revokeMultiple } from "./jti-store";

export type UserSession = {
  id: string;
  userId: string;
  deviceInfo: string;
  ip: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  isRevoked: boolean;
  revokedAt: Date | null;
};

export type SessionRevocationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "session_not_found" | "database_unavailable" | "revocation_store_unavailable";
    };

/** Register a newly issued access token. False means the token lacks durable evidence. */
export async function registerSession(opts: {
  jti: string;
  userId: string;
  deviceInfo: string;
  ip: string;
  expiresAt: Date;
}): Promise<boolean> {
  try {
    const result = await withDb(async (db) => {
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO user_sessions (id, user_id, device_info, ip, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          opts.jti,
          opts.userId,
          opts.deviceInfo.slice(0, 500),
          opts.ip.slice(0, 80),
          opts.expiresAt,
        ],
      );
      return (inserted.rowCount ?? 0) === 1;
    });
    if (!result.enabled) {
      logger.warn("[session-store] registerSession: database unavailable", {
        jti: opts.jti,
      });
      return false;
    }
    if (!result.value) {
      logger.warn("[session-store] registerSession: duplicate JTI rejected", {
        jti: opts.jti,
        userId: opts.userId,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("[session-store] registerSession failed", {
      jti: opts.jti,
      err: String(err),
    });
    return false;
  }
}

export async function touchSession(jti: string): Promise<void> {
  try {
    await withDb(async (db) => {
      await db.query(
        `UPDATE user_sessions
            SET last_used_at = NOW()
          WHERE id = $1 AND is_revoked = FALSE`,
        [jti],
      );
      return true;
    });
  } catch {
    // Non-critical telemetry update.
  }
}

export async function listActiveSessions(userId: string): Promise<UserSession[]> {
  const result = await withDb(async (db) => {
    const rows = await db.query<{
      id: string;
      user_id: string;
      device_info: string;
      ip: string;
      created_at: Date;
      last_used_at: Date;
      expires_at: Date;
      is_revoked: boolean;
      revoked_at: Date | null;
    }>(
      `SELECT id, user_id, device_info, ip, created_at, last_used_at, expires_at,
              is_revoked, revoked_at
         FROM user_sessions
        WHERE user_id = $1
          AND is_revoked = FALSE
          AND expires_at > NOW()
        ORDER BY last_used_at DESC
        LIMIT 50`,
      [userId],
    );
    return rows.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      deviceInfo: row.device_info,
      ip: row.ip,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      isRevoked: row.is_revoked,
      revokedAt: row.revoked_at,
    }));
  });
  return result.enabled ? result.value : [];
}

/**
 * Revoke one exact session for one exact owner. PostgreSQL is updated first so
 * the durable fallback rejects the token even if Redis subsequently fails.
 * Callers receive an explicit unavailable result rather than false success.
 */
export async function revokeSessionStrict(
  jti: string,
  userId: string,
): Promise<SessionRevocationResult> {
  let expiresAt: Date;
  try {
    const result = await withDb(async (db) => {
      const updated = await db.query<{ expires_at: Date }>(
        `UPDATE user_sessions
            SET is_revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
          WHERE id = $1
            AND user_id = $2
            AND is_revoked = FALSE
          RETURNING expires_at`,
        [jti, userId],
      );
      return updated.rows[0]?.expires_at ?? null;
    });
    if (!result.enabled) return { ok: false, reason: "database_unavailable" };
    if (!result.value) return { ok: false, reason: "session_not_found" };
    expiresAt = result.value;
  } catch (err) {
    logger.warn("[session-store] durable revoke failed", {
      jti,
      userId,
      err: String(err),
    });
    return { ok: false, reason: "database_unavailable" };
  }

  const redisRevoked = await revokeJti(
    jti,
    Math.floor(expiresAt.getTime() / 1000),
  );
  if (!redisRevoked) {
    logger.warn("[session-store] durable session revoked but Redis deny write failed", {
      jti,
      userId,
    });
    return { ok: false, reason: "revocation_store_unavailable" };
  }

  return { ok: true };
}

/** Compatibility wrapper for existing callers that only need a boolean. */
export async function revokeSession(jti: string, userId: string): Promise<boolean> {
  return (await revokeSessionStrict(jti, userId)).ok;
}

export async function revokeAllSessions(
  userId: string,
  exceptJti?: string,
): Promise<number> {
  const result = await withDb(async (db) => {
    const updated = await db.query<{ id: string; expires_at: Date }>(
      `UPDATE user_sessions
          SET is_revoked = TRUE,
              revoked_at = COALESCE(revoked_at, NOW())
        WHERE user_id = $1
          AND is_revoked = FALSE
          AND expires_at > NOW()
          ${exceptJti ? "AND id <> $2" : ""}
        RETURNING id, expires_at`,
      exceptJti ? [userId, exceptJti] : [userId],
    );
    return updated.rows.map((row) => ({
      jti: row.id,
      expiresAt: Math.floor(row.expires_at.getTime() / 1000),
    }));
  });

  if (!result.enabled) return 0;
  const redisOk = await revokeMultiple(result.value);
  if (!redisOk && result.value.length > 0) {
    logger.warn("[session-store] revoke-all durable update succeeded but Redis deny write failed", {
      userId,
      count: result.value.length,
    });
  }
  return result.value.length;
}
