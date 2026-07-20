// POST /api/auth/refresh — atomically rotate one verified refresh token into
// a new access/refresh/session tuple. Cookies are published only after commit.

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import {
  prepareRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import {
  rotateSession,
  verifyRefreshTokenClaims,
} from "@/lib/security/session-authority";
import { buildSessionAuditContext } from "@/lib/security/session-route-context";
import { deviceFingerprint } from "@/lib/security/webauthn";
import {
  signUnifiedSession,
  extractJtiFromToken,
  extractExpFromToken,
} from "@/lib/unified-session";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
};

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

    const claimsResult = await verifyRefreshTokenClaims(rawRefreshToken);
    if (!claimsResult.ok) {
      const response = apiError("refresh_token_invalid", 401, {
        reason: claimsResult.reason,
      });
      clearRefreshCookie(response);
      return response;
    }
    const claims = claimsResult.claims;

    const accountResult = await withDb(async (db) => {
      const result = await db.query<AccountRow>(
        `SELECT id, email, username, display_name
           FROM academy_auth_accounts
          WHERE id = $1`,
        [claims.userId],
      );
      return result.rows[0] ?? null;
    });
    if (!accountResult.enabled) return apiError("auth_storage_unavailable", 503);
    if (!accountResult.value) return apiError("user_not_found", 401);

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

    const ip = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const preparedRefresh = await prepareRefreshToken({
      userId: account.id,
      familyId: claims.familyId,
      parentId: claims.jti,
      deviceInfo,
      ip,
    });
    if (!preparedRefresh) return apiError("refresh_rotation_unavailable", 503);

    const audit = buildSessionAuditContext({
      req,
      userId: account.id,
      actorType: "user",
      action: "session.refresh.rotate",
      evidence: {
        refreshFamilyId: claims.familyId,
        previousRefreshId: claims.jti,
      },
    });

    let rotation;
    try {
      rotation = await rotateSession({
        rawRefreshToken,
        accessJti,
        accessExpiresAt: new Date(accessExp * 1000),
        preparedRefresh,
        deviceInfo,
        ip,
        deviceFingerprint: deviceFingerprint(deviceInfo, ip),
        tenantId: audit.tenantId,
        correlationId: audit.correlationId,
        requestHash: audit.requestHash,
      });
    } catch {
      return apiError("refresh_rotation_unavailable", 503);
    }

    if (!rotation.ok) {
      const response = apiError("refresh_token_invalid", 401, {
        reason: rotation.reason,
        denyCachePending: rotation.denyCachePending,
      });
      clearRefreshCookie(response);
      return response;
    }

    const response = apiOk({
      authenticated: true,
      denyCachePending: rotation.denyCachePending,
    });
    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });
    setRefreshCookie(response, rotation.refreshToken);
    return response;
  });
}
