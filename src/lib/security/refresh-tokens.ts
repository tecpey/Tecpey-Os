// Refresh token rotation — Phase 35.
//
// Model:
//   - Access token  (tecpey_session cookie): 4 hours, JWT signed with TECPEY_SESSION_SECRET
//   - Refresh token (tecpey_refresh cookie): 30 days, JWT signed with TECPEY_REFRESH_SECRET
//
// Rotation: presenting a valid refresh token issues a new access + refresh pair.
//   The old refresh token is immediately revoked.
//
// Reuse detection: every token has a family_id. If a revoked token is presented,
//   the ENTIRE family is revoked (session hijacking protection).
//
// Backward compatibility: existing tecpey_session (30-day) tokens continue to work
//   through verifyUnifiedSession(). Only new logins receive the dual-token model.

import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { shouldUseSecureCookie } from "@/lib/platform-config";

// ── Cookie names ──────────────────────────────────────────────────────────────

export const REFRESH_COOKIE = "tecpey_refresh";
export const ACCESS_COOKIE_TTL_S = 4 * 60 * 60; // 4 hours
export const REFRESH_COOKIE_TTL_S = 30 * 24 * 60 * 60; // 30 days

// ── Keys ──────────────────────────────────────────────────────────────────────

function refreshSecret(): Uint8Array | null {
  const raw =
    process.env.TECPEY_REFRESH_SECRET ||
    process.env.TECPEY_SESSION_SECRET ||
    process.env.JWT_SECRET;
  if (raw && raw.length >= 24) return new TextEncoder().encode(`refresh:${raw}`);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("tecpey-local-refresh-token-dev-secret-please-set-env");
  }
  logger.error("[refresh-tokens] TECPEY_REFRESH_SECRET missing");
  return null;
}

// ── Payload ───────────────────────────────────────────────────────────────────

type RefreshPayload = {
  sub: string;       // userId
  jti: string;       // unique token ID — the DB primary key
  fid: string;       // family_id — links all rotations in a session chain
  v: 1;
};

// ── Issue ─────────────────────────────────────────────────────────────────────

export async function issueRefreshToken(opts: {
  userId: string;
  familyId: string;  // pass crypto.randomUUID() for a brand-new session
  parentId?: string; // jti of the token being rotated
  deviceInfo: string;
  ip: string;
}): Promise<string | null> {
  const secret = refreshSecret();
  if (!secret) return null;

  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_COOKIE_TTL_S * 1000);

  const token = await new SignJWT({ v: 1 as const, fid: opts.familyId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  // Persist to DB (durable record for multi-instance correctness)
  await withDb(async (db) => {
    await db.query(
      `INSERT INTO refresh_tokens (id, family_id, user_id, parent_id, device_info, ip, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [jti, opts.familyId, opts.userId, opts.parentId ?? null,
       opts.deviceInfo.slice(0, 500), opts.ip.slice(0, 80), expiresAt],
    );
    return true;
  }).catch((err) => {
    logger.warn("[refresh-tokens] DB persist failed", { err: String(err) });
    throw err; // fail closed — do not issue an unstored token
  });

  return token;
}

// ── Verify ────────────────────────────────────────────────────────────────────

type RefreshVerifyResult =
  | { ok: true; userId: string; jti: string; familyId: string }
  | { ok: false; reason: string; familyId?: string };

export async function verifyRefreshToken(token: string): Promise<RefreshVerifyResult> {
  const secret = refreshSecret();
  if (!secret) return { ok: false, reason: "server_misconfigured" };

  // 1. Verify signature + expiry
  let payload: RefreshPayload;
  try {
    const result = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const p = result.payload;
    if (
      typeof p.sub !== "string" ||
      typeof p.jti !== "string" ||
      typeof p.fid !== "string" ||
      (p.v as unknown) !== 1
    ) {
      return { ok: false, reason: "invalid_payload" };
    }
    payload = { sub: p.sub, jti: p.jti, fid: p.fid as string, v: 1 };
  } catch {
    return { ok: false, reason: "invalid_token" };
  }

  // 2. DB check — must exist, not revoked, not expired
  const r = await withDb(async (db) => {
    const result = await db.query<{
      id: string; family_id: string; user_id: string;
      is_revoked: boolean; expires_at: Date;
    }>(
      `SELECT id, family_id, user_id, is_revoked, expires_at
       FROM refresh_tokens WHERE id = $1`,
      [payload.jti],
    );

    if (result.rowCount === 0) {
      // Token not in DB — possible reuse of a rotated token
      return { notFound: true, familyId: payload.fid };
    }

    const row = result.rows[0];

    if (row.is_revoked) {
      return { revoked: true, familyId: row.family_id };
    }
    if (row.expires_at < new Date()) {
      return { expired: true, familyId: row.family_id };
    }

    return { ok: true, userId: row.user_id, jti: row.id, familyId: row.family_id };
  });

  if (!r.enabled) return { ok: false, reason: "db_unavailable" };

  const dbResult = r.value;

  if ("notFound" in dbResult && dbResult.notFound) {
    // Token was rotated (not found means it was consumed or from before DB was set up).
    return { ok: false, reason: "token_not_found", familyId: dbResult.familyId };
  }
  if ("revoked" in dbResult && dbResult.revoked) {
    // REUSE ATTACK: revoke entire family
    await revokeFamily(dbResult.familyId);
    return { ok: false, reason: "token_reused", familyId: dbResult.familyId };
  }
  if ("expired" in dbResult && dbResult.expired) {
    return { ok: false, reason: "token_expired", familyId: dbResult.familyId };
  }
  if (!("ok" in dbResult) || !dbResult.ok) {
    return { ok: false, reason: "db_error" };
  }

  return {
    ok: true,
    userId: dbResult.userId!,
    jti: dbResult.jti!,
    familyId: dbResult.familyId!,
  };
}

// ── Rotate ────────────────────────────────────────────────────────────────────

/**
 * Revoke a refresh token (consumed on successful rotation).
 * Does NOT revoke the family.
 */
export async function revokeRefreshToken(jti: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE id = $1`,
      [jti],
    );
    return true;
  }).catch((err) => {
    logger.warn("[refresh-tokens] revoke failed", { jti, err: String(err) });
  });
}

/** Revoke all tokens in a family (reuse attack response). */
export async function revokeFamily(familyId: string): Promise<void> {
  const r = await withDb(async (db) => {
    await db.query(
      `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW()
       WHERE family_id = $1 AND is_revoked = FALSE`,
      [familyId],
    );
    return true;
  });
  if (r.enabled) {
    logger.warn("[refresh-tokens] family revoked (reuse attack detected)", { familyId });
  }
}

// ── Revoke all for user ───────────────────────────────────────────────────────

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW()
       WHERE user_id = $1 AND is_revoked = FALSE`,
      [userId],
    );
    return true;
  }).catch((err) => {
    logger.warn("[refresh-tokens] revoke-all failed", { userId, err: String(err) });
  });
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export function setRefreshCookie(res: NextResponse, token: string): void {
  res.cookies.set(REFRESH_COOKIE, token, {
    path: "/api/auth/refresh",
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "strict",
    maxAge: REFRESH_COOKIE_TTL_S,
  });
}

export function clearRefreshCookie(res: NextResponse): void {
  res.cookies.set(REFRESH_COOKIE, "", {
    path: "/api/auth/refresh",
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "strict",
    maxAge: 0,
  });
}

export function getRefreshTokenFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(REFRESH_COOKIE)?.value;
}
