// POST /api/auth/refresh — exchange a refresh token for a new access + refresh pair.
//
// The refresh cookie path is restricted to /api/auth/refresh (set by setRefreshCookie).
// Browsers send it only to this endpoint — it never leaks to other routes.
//
// On success: new access + refresh tokens set via Set-Cookie.
// On reuse (old/revoked token presented): entire family revoked, 401 returned.
// On expired or invalid: 401 returned.

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  verifyRefreshToken,
  revokeRefreshToken,
  issueRefreshToken,
  setRefreshCookie,
  getRefreshTokenFromRequest,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import { signUnifiedSession, extractJtiFromToken, extractExpFromToken } from "@/lib/unified-session";
import { registerSession } from "@/lib/security/session-store";
import { writeAudit } from "@/lib/security/audit-log";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/refresh" }, async () => {
    const rlimit = await rateLimit(req, {
      namespace: "auth-refresh",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const rawRefreshToken = getRefreshTokenFromRequest(req);
    if (!rawRefreshToken) return apiError("refresh_token_missing", 401);

    const ip = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);

    const result = await verifyRefreshToken(rawRefreshToken);

    if (!result.ok) {
      const reason = result.reason;
      writeAudit({
        actorId: "unknown",
        action: "logout",
        ip,
        userAgent: deviceInfo,
        metadata: { reason, action: "refresh_failed" },
      });
      return apiError("refresh_token_invalid", 401, { reason });
    }

    const { userId, jti: oldJti, familyId } = result;

    // Fetch user data to re-sign the access token
    type AccountRow = { id: string; email: string; username: string; display_name: string };
    const accountResult = await withDb(async (db) => {
      const res = await db.query<AccountRow>(
        `SELECT id, email, username, display_name FROM academy_auth_accounts WHERE id = $1`,
        [userId],
      );
      return res.rows[0] ?? null;
    });

    if (!accountResult.enabled || !accountResult.value) {
      return apiError("user_not_found", 401);
    }

    const account = accountResult.value;

    // Revoke old refresh token (rotation)
    await revokeRefreshToken(oldJti);

    // Issue new access token
    const accessToken = await signUnifiedSession({
      accountId: account.id,
      studentId: null,
      email: account.email,
      displayName: account.display_name,
      username: account.username,
    });

    // Issue new refresh token (same family)
    const newRefreshToken = await issueRefreshToken({
      userId: account.id,
      familyId,
      parentId: oldJti,
      deviceInfo,
      ip,
    });

    const response = apiOk({ authenticated: true });

    // Set new access cookie
    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });

    // Set new refresh cookie
    if (newRefreshToken) setRefreshCookie(response, newRefreshToken);

    // Register new access token session (fire-and-forget)
    const jti = extractJtiFromToken(accessToken);
    const exp = extractExpFromToken(accessToken);
    if (jti && exp) {
      void registerSession({ jti, userId: account.id, deviceInfo, ip, expiresAt: new Date(exp * 1000) });
    }

    writeAudit({
      actorId: account.id,
      action: "login",
      ip,
      userAgent: deviceInfo,
      metadata: { action: "token_refresh" },
    });

    return response;
  });
}
