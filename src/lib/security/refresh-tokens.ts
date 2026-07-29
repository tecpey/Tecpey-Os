// Refresh token primitives. Session issuance and rotation authority lives in
// session-authority.ts; this module owns signing, signature verification and
// compatibility wrappers only.

import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  sessionMaxAgeSeconds,
  shouldUseSecureCookie,
} from "@/lib/platform-config";

export const REFRESH_COOKIE = "tecpey_refresh";
export const ACCESS_COOKIE_TTL_S = sessionMaxAgeSeconds();
export const REFRESH_COOKIE_TTL_S = 30 * 24 * 60 * 60;

function refreshSecret(): Uint8Array | null {
  const raw = process.env.TECPEY_REFRESH_SECRET;
  if (raw && raw.length >= 24) {
    return new TextEncoder().encode(`refresh:${raw}`);
  }
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("tecpey-local-refresh-token-dev-secret-please-set-env");
  }
  logger.error("[refresh-tokens] TECPEY_REFRESH_SECRET missing or too short");
  return null;
}

type RefreshPayload = {
  sub: string;
  jti: string;
  fid: string;
  v: 1;
};

export type RefreshTokenIssueOptions = {
  userId: string;
  familyId: string;
  parentId?: string;
  deviceInfo: string;
  ip: string;
};

export type PreparedRefreshToken = {
  token: string;
  jti: string;
  familyId: string;
  userId: string;
  parentId: string | null;
  deviceInfo: string;
  ip: string;
  expiresAt: Date;
};

export type RefreshTokenSignatureResult =
  | { ok: true; userId: string; jti: string; familyId: string }
  | { ok: false; reason: "server_misconfigured" | "invalid_token" | "invalid_payload" };

/**
 * Sign a refresh token without publishing it as valid. The token becomes valid
 * only after the caller commits its durable row.
 */
export async function prepareRefreshToken(
  opts: RefreshTokenIssueOptions,
): Promise<PreparedRefreshToken | null> {
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

  return {
    token,
    jti,
    familyId: opts.familyId,
    userId: opts.userId,
    parentId: opts.parentId ?? null,
    deviceInfo: opts.deviceInfo.slice(0, 500),
    ip: opts.ip.slice(0, 80),
    expiresAt,
  };
}

/** Verify cryptographic refresh claims without consulting durable state. */
export async function verifyRefreshTokenSignature(
  token: string,
): Promise<RefreshTokenSignatureResult> {
  const secret = refreshSecret();
  if (!secret) return { ok: false, reason: "server_misconfigured" };

  let payload: RefreshPayload;
  try {
    const result = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const parsed = result.payload;
    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.jti !== "string" ||
      typeof parsed.fid !== "string" ||
      (parsed.v as unknown) !== 1
    ) {
      return { ok: false, reason: "invalid_payload" };
    }
    payload = {
      sub: parsed.sub,
      jti: parsed.jti,
      fid: parsed.fid,
      v: 1,
    };
  } catch {
    return { ok: false, reason: "invalid_token" };
  }

  return {
    ok: true,
    userId: payload.sub,
    jti: payload.jti,
    familyId: payload.fid,
  };
}

/** Persist one previously signed refresh token inside the caller's transaction. */
export async function persistPreparedRefreshTokenWithClient(
  db: PoolClient,
  prepared: PreparedRefreshToken,
  binding: { knownDeviceId?: string | null } = {},
): Promise<boolean> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO refresh_tokens
      (id, family_id, user_id, parent_id, device_info, ip, expires_at, known_device_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      prepared.jti,
      prepared.familyId,
      prepared.userId,
      prepared.parentId,
      prepared.deviceInfo,
      prepared.ip,
      prepared.expiresAt,
      binding.knownDeviceId ?? null,
    ],
  );
  return (inserted.rowCount ?? 0) === 1;
}

/**
 * Compatibility issuance wrapper. Production authentication routes must use
 * session-authority.ts so refresh and access admission commit atomically.
 */
export async function issueRefreshToken(
  opts: RefreshTokenIssueOptions,
): Promise<string | null> {
  const prepared = await prepareRefreshToken(opts);
  if (!prepared) return null;

  try {
    const result = await withDb(async (db) =>
      persistPreparedRefreshTokenWithClient(db, prepared),
    );
    if (!result.enabled || !result.value) {
      logger.error("[refresh-tokens] refused to issue unstored refresh token", {
        jti: prepared.jti,
        userId: opts.userId,
      });
      return null;
    }
  } catch (err) {
    logger.warn("[refresh-tokens] DB persist failed", {
      jti: prepared.jti,
      err: String(err),
    });
    return null;
  }

  return prepared.token;
}

type RefreshVerifyResult =
  | { ok: true; userId: string; jti: string; familyId: string }
  | { ok: false; reason: string; familyId?: string };

/** Compatibility durable verification wrapper. Rotation uses Session Authority. */
export async function verifyRefreshToken(token: string): Promise<RefreshVerifyResult> {
  const claims = await verifyRefreshTokenSignature(token);
  if (!claims.ok) return claims;

  const result = await withDb(async (db) => {
    const rows = await db.query<{
      id: string;
      family_id: string;
      user_id: string;
      is_revoked: boolean;
      expires_at: Date;
    }>(
      `SELECT id, family_id, user_id, is_revoked, expires_at
         FROM refresh_tokens
        WHERE id = $1`,
      [claims.jti],
    );

    if (rows.rowCount === 0) {
      return { notFound: true as const, familyId: claims.familyId };
    }

    const row = rows.rows[0];
    if (row.is_revoked) {
      return { revoked: true as const, familyId: row.family_id };
    }
    if (row.expires_at.getTime() <= Date.now()) {
      return { expired: true as const, familyId: row.family_id };
    }
    if (row.user_id !== claims.userId || row.family_id !== claims.familyId) {
      return { mismatch: true as const, familyId: row.family_id };
    }

    return {
      ok: true as const,
      userId: row.user_id,
      jti: row.id,
      familyId: row.family_id,
    };
  });

  if (!result.enabled) return { ok: false, reason: "db_unavailable" };
  const dbResult = result.value;

  if ("notFound" in dbResult) {
    return { ok: false, reason: "token_not_found", familyId: dbResult.familyId };
  }
  if ("revoked" in dbResult) {
    await revokeFamily(dbResult.familyId);
    return { ok: false, reason: "token_reused", familyId: dbResult.familyId };
  }
  if ("expired" in dbResult) {
    return { ok: false, reason: "token_expired", familyId: dbResult.familyId };
  }
  if ("mismatch" in dbResult) {
    await revokeFamily(dbResult.familyId);
    return { ok: false, reason: "token_binding_mismatch", familyId: dbResult.familyId };
  }

  return {
    ok: true,
    userId: dbResult.userId,
    jti: dbResult.jti,
    familyId: dbResult.familyId,
  };
}

export async function revokeRefreshToken(jti: string): Promise<boolean> {
  try {
    const result = await withDb(async (db) => {
      const updated = await db.query(
        `UPDATE refresh_tokens
            SET is_revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
          WHERE id = $1
            AND is_revoked = FALSE
          RETURNING id`,
        [jti],
      );
      return (updated.rowCount ?? 0) > 0;
    });
    return result.enabled && result.value;
  } catch (err) {
    logger.warn("[refresh-tokens] revoke failed", { jti, err: String(err) });
    return false;
  }
}

export async function revokeFamily(familyId: string): Promise<boolean> {
  try {
    const result = await withDb(async (db) => {
      await db.query(
        `UPDATE refresh_tokens
            SET is_revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
          WHERE family_id = $1
            AND is_revoked = FALSE`,
        [familyId],
      );
      await db.query(
        `UPDATE refresh_token_families
            SET status = 'revoked',
                revoked_at = COALESCE(revoked_at, NOW()),
                revoke_reason = COALESCE(revoke_reason, 'compatibility_revoke')
          WHERE id = $1`,
        [familyId],
      );
      return true;
    });
    if (!result.enabled) return false;
    logger.warn("[refresh-tokens] family revoked", { familyId });
    return true;
  } catch (err) {
    logger.warn("[refresh-tokens] family revoke failed", {
      familyId,
      err: String(err),
    });
    return false;
  }
}

/** Revoke all durable refresh authority inside the caller's transaction. */
export async function revokeAllRefreshTokensForUserWithClient(
  db: PoolClient,
  userId: string,
): Promise<number> {
  await db.query(
    `UPDATE refresh_token_families
        SET status = 'revoked',
            revoked_at = COALESCE(revoked_at, NOW()),
            revoke_reason = COALESCE(revoke_reason, 'user_scope_revoke')
      WHERE user_id = $1
        AND status <> 'revoked'`,
    [userId],
  );
  const updated = await db.query(
    `UPDATE refresh_tokens
        SET is_revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1
        AND is_revoked = FALSE`,
    [userId],
  );
  return updated.rowCount ?? 0;
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<boolean> {
  try {
    const result = await withDb(async (db) => {
      await revokeAllRefreshTokensForUserWithClient(db, userId);
      return true;
    });
    return result.enabled && result.value;
  } catch (err) {
    logger.warn("[refresh-tokens] revoke-all failed", {
      userId,
      err: String(err),
    });
    return false;
  }
}

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
