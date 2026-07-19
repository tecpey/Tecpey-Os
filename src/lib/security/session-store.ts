// Server-side session registry — PostgreSQL durable authority with Redis deny cache.

import type { PoolClient } from "pg";
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

export type SessionRegistrationOptions = {
  jti: string;
  userId: string;
  deviceInfo: string;
  ip: string;
  expiresAt: Date;
};

export type RevokedSessionEvidence = {
  jti: string;
  expiresAt: number;
};

export type TransactionalBulkRevocation = {
  revokedCount: number;
  sessions: RevokedSessionEvidence[];
};

export type SessionRevocationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "session_not_found" | "database_unavailable" | "revocation_store_unavailable";
    };

export type SessionListResult =
  | { ok: true; sessions: UserSession[] }
  | { ok: false; reason: "database_unavailable" };

export type BulkSessionRevocationResult =
  | { ok: true; revokedCount: number }
  | {
      ok: false;
      reason: "database_unavailable" | "revocation_store_unavailable";
      revokedCount: number;
    };

/** Register a newly issued access token inside the caller's transaction. */
export async function registerSessionWithClient(
  db: PoolClient,
  opts: SessionRegistrationOptions,
): Promise<boolean> {
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
}

/** Register a newly issued access token. False means the token lacks durable evidence. */
export async function registerSession(
  opts: SessionRegistrationOptions,
): Promise<boolean> {
  try {
    const result = await withDb(async (db) =>
      registerSessionWithClient(db, opts),
    );
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

export async function listActiveSessionsStrict(
  userId: string,
): Promise<SessionListResult> {
  try {
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
    if (!result.enabled) {
      return { ok: false, reason: "database_unavailable" };
    }
    return { ok: true, sessions: result.value };
  } catch (err) {
    logger.warn("[session-store] list active sessions failed", {
      userId,
      err: String(err),
    });
    return { ok: false, reason: "database_unavailable" };
  }
}

/** Compatibility wrapper. Security-sensitive routes must use listActiveSessionsStrict. */
export async function listActiveSessions(userId: string): Promise<UserSession[]> {
  const result = await listActiveSessionsStrict(userId);
  return result.ok ? result.sessions : [];
}

/**
 * Revoke one exact session for one exact owner. PostgreSQL is updated first so
 * the durable fallback rejects the token even if Redis subsequently fails.
 * A retry for an already-revoked owned session repairs missing Redis deny
 * evidence instead of becoming permanently stuck behind session_not_found.
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
      const newlyRevoked = updated.rows[0]?.expires_at;
      if (newlyRevoked) {
        return { expiresAt: newlyRevoked, alreadyRevoked: false };
      }

      const existing = await db.query<{
        expires_at: Date;
        is_revoked: boolean;
      }>(
        `SELECT expires_at, is_revoked
           FROM user_sessions
          WHERE id = $1
            AND user_id = $2
          LIMIT 1`,
        [jti, userId],
      );
      const row = existing.rows[0];
      if (!row?.is_revoked) return null;
      return { expiresAt: row.expires_at, alreadyRevoked: true };
    });
    if (!result.enabled) return { ok: false, reason: "database_unavailable" };
    if (!result.value) return { ok: false, reason: "session_not_found" };
    expiresAt = result.value.expiresAt;
    if (result.value.alreadyRevoked) {
      logger.info("[session-store] repairing Redis deny evidence for revoked session", {
        jti,
        userId,
      });
    }
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

/**
 * Revoke every unexpired access session for a user inside the caller's
 * transaction. The evidence query includes already-revoked sessions so a later
 * Redis repair can restore any deny keys missed during an earlier outage.
 */
export async function revokeAllSessionsWithClient(
  db: PoolClient,
  userId: string,
  exceptJti?: string,
): Promise<TransactionalBulkRevocation> {
  const scope = exceptJti ? "AND id <> $2" : "";
  const values = exceptJti ? [userId, exceptJti] : [userId];
  const updated = await db.query(
    `UPDATE user_sessions
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND is_revoked = FALSE
        AND expires_at > NOW()
        ${scope}`,
    values,
  );
  const evidence = await db.query<{ id: string; expires_at: Date }>(
    `SELECT id, expires_at
       FROM user_sessions
      WHERE user_id = $1
        AND is_revoked = TRUE
        AND expires_at > NOW()
        ${scope}`,
    values,
  );
  return {
    revokedCount: updated.rowCount ?? 0,
    sessions: evidence.rows.map((row) => ({
      jti: row.id,
      expiresAt: Math.floor(row.expires_at.getTime() / 1000),
    })),
  };
}

/**
 * Revoke every unexpired access session for a user except an optional current
 * JTI. PostgreSQL is authoritative; Redis receives repairable deny evidence.
 */
export async function revokeAllSessionsStrict(
  userId: string,
  exceptJti?: string,
): Promise<BulkSessionRevocationResult> {
  try {
    const result = await withDb(async (db) =>
      revokeAllSessionsWithClient(db, userId, exceptJti),
    );

    if (!result.enabled) {
      return { ok: false, reason: "database_unavailable", revokedCount: 0 };
    }

    const redisOk = await revokeMultiple(result.value.sessions);
    if (!redisOk && result.value.sessions.length > 0) {
      logger.warn("[session-store] revoke-all durable update succeeded but Redis deny write failed", {
        userId,
        revokedCount: result.value.revokedCount,
        evidenceCount: result.value.sessions.length,
      });
      return {
        ok: false,
        reason: "revocation_store_unavailable",
        revokedCount: result.value.revokedCount,
      };
    }

    return { ok: true, revokedCount: result.value.revokedCount };
  } catch (err) {
    logger.warn("[session-store] revoke-all failed", {
      userId,
      err: String(err),
    });
    return { ok: false, reason: "database_unavailable", revokedCount: 0 };
  }
}

/** Compatibility wrapper. Security-sensitive routes must use revokeAllSessionsStrict. */
export async function revokeAllSessions(
  userId: string,
  exceptJti?: string,
): Promise<number> {
  const result = await revokeAllSessionsStrict(userId, exceptJti);
  return result.ok ? result.revokedCount : 0;
}
