// Server-side session registry — PostgreSQL-backed.
//
// Every new login registers a session row keyed by jti.
// Logout marks the row as revoked and writes to the Redis jti store.
// Logout-all marks all non-expired rows for a user as revoked.

import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { revokeJti, revokeMultiple } from "./jti-store";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Register ──────────────────────────────────────────────────────────────────

export async function registerSession(opts: {
  jti: string;
  userId: string;
  deviceInfo: string;
  ip: string;
  expiresAt: Date;
}): Promise<void> {
  try {
    const r = await withDb(async (db) => {
      await db.query(
        `INSERT INTO user_sessions (id, user_id, device_info, ip, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [opts.jti, opts.userId, opts.deviceInfo.slice(0, 500), opts.ip.slice(0, 80), opts.expiresAt],
      );
      return true;
    });
    if (!r.enabled) logger.warn("[session-store] registerSession: db unavailable");
  } catch (err) {
    logger.warn("[session-store] registerSession failed", { jti: opts.jti, err: String(err) });
  }
}

// ── Touch (last_used_at) ──────────────────────────────────────────────────────

export async function touchSession(jti: string): Promise<void> {
  try {
    await withDb(async (db) => {
      await db.query(
        `UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1 AND is_revoked = FALSE`,
        [jti],
      );
      return true;
    });
  } catch { /* non-critical */ }
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listActiveSessions(userId: string): Promise<UserSession[]> {
  const r = await withDb(async (db) => {
    const result = await db.query<{
      id: string; user_id: string; device_info: string; ip: string;
      created_at: Date; last_used_at: Date; expires_at: Date;
      is_revoked: boolean; revoked_at: Date | null;
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
    return result.rows.map((r) => ({
      id: r.id, userId: r.user_id, deviceInfo: r.device_info, ip: r.ip,
      createdAt: r.created_at, lastUsedAt: r.last_used_at, expiresAt: r.expires_at,
      isRevoked: r.is_revoked, revokedAt: r.revoked_at,
    }));
  });
  return r.enabled ? r.value : [];
}

// ── Revoke one ────────────────────────────────────────────────────────────────

export async function revokeSession(jti: string, userId: string): Promise<boolean> {
  const r = await withDb(async (db) => {
    const result = await db.query<{ expires_at: Date }>(
      `UPDATE user_sessions
       SET is_revoked = TRUE, revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_revoked = FALSE
       RETURNING expires_at`,
      [jti, userId],
    );
    if ((result.rowCount ?? 0) === 0) return false;
    const expiresAt = Math.floor(result.rows[0].expires_at.getTime() / 1000);
    await revokeJti(jti, expiresAt);
    return true;
  });
  return r.enabled ? r.value : false;
}

// ── Revoke all ────────────────────────────────────────────────────────────────

export async function revokeAllSessions(userId: string, exceptJti?: string): Promise<number> {
  const r = await withDb(async (db) => {
    const result = await db.query<{ id: string; expires_at: Date }>(
      `UPDATE user_sessions
       SET is_revoked = TRUE, revoked_at = NOW()
       WHERE user_id = $1
         AND is_revoked = FALSE
         AND expires_at > NOW()
         ${exceptJti ? "AND id <> $2" : ""}
       RETURNING id, expires_at`,
      exceptJti ? [userId, exceptJti] : [userId],
    );
    const revoked = result.rows.map((row) => ({
      jti: row.id,
      expiresAt: Math.floor(row.expires_at.getTime() / 1000),
    }));
    await revokeMultiple(revoked);
    return revoked.length;
  });
  return r.enabled ? r.value : 0;
}
