// POST /api/auth/refresh — rotate one verified refresh token into a new
// access/refresh pair. Cookies are set only after every durable write succeeds.

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import {
  verifyRefreshToken,
  revokeRefreshToken,
  issueRefreshToken,
  setRefreshCookie,
  getRefreshTokenFromRequest,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import {
  signUnifiedSession,
  extractJtiFromToken,
  extractExpFromToken,
} from "@/lib/unified-session";
import { registerSession } from "@/lib/security/session-store";
import { writeAudit } from "@/lib/security/audit-log";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/refresh" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "auth-refresh",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const rawRefreshToken = getRefreshTokenFromRequest(req);
    if (!rawRefreshToken) return apiError("refresh_token_missing", 401);

    const ip = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const verified = await verifyRefreshToken(rawRefreshToken);

    if (!verified.ok) {
      writeAudit({
        actorId: "unknown",
        action: "logout",
        ip,
        userAgent: deviceInfo,
        metadata: { reason: verified.reason, action: "refresh_failed" },
      });
      return apiError("refresh_token_invalid", 401, {
        reason: verified.reason,
      });
    }

    const { userId, jti: oldJti, familyId } = verified;
    type AccountRow = {
      id: string;
      email: string;
      username: string;
      display_name: string;
    };
    const accountResult = await withDb(async (db) => {
      const result = await db.query<AccountRow>(
        `SELECT id, email, username, display_name
           FROM academy_auth_accounts
          WHERE id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    });
    if (!accountResult.enabled) return apiError("auth_storage_unavailable", 503);
    if (!accountResult.value) return apiError("user_not_found", 401);

    const oldRevoked = await revokeRefreshToken(oldJti);
    if (!oldRevoked) return apiError("refresh_rotation_unavailable", 503);

    const account = accountResult.value;
    const accessToken = await signUnifiedSession({
      accountId: account.id,
      studentId: null,
      email: account.email,
      displayName: account.display_name,
      username: account.username,
    });
    const accessJti = extractJtiFromToken(accessToken);
    const accessExp = extractExpFromToken(accessToken);
    if (!accessJti || !accessExp) return apiError("session_issue_failed", 503);

    const newRefreshToken = await issueRefreshToken({
      userId: account.id,
      familyId,
      parentId: oldJti,
      deviceInfo,
      ip,
    });
    if (!newRefreshToken) return apiError("refresh_rotation_unavailable", 503);

    const registered = await registerSession({
      jti: accessJti,
      userId: account.id,
      deviceInfo,
      ip,
      expiresAt: new Date(accessExp * 1000),
    });
    if (!registered) {
      const replacement = await verifyRefreshToken(newRefreshToken);
      if (replacement.ok) await revokeRefreshToken(replacement.jti);
      return apiError("session_registry_unavailable", 503);
    }

    writeAudit({
      actorId: account.id,
      action: "login",
      ip,
      userAgent: deviceInfo,
      metadata: { action: "token_refresh" },
    });

    const response = apiOk({ authenticated: true });
    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });
    setRefreshCookie(response, newRefreshToken);
    return response;
  });
}
