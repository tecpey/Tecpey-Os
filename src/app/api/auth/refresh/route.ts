// POST /api/auth/refresh — atomically rotate one verified refresh token into a
// new access/refresh pair. Cookies are published only after Session Authority
// commits the old-token revocation, replacement pair and mandatory evidence.

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyCsrfOrigin } from "@/lib/csrf";
import {
  verifyRefreshTokenSignature,
  prepareRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import {
  signUnifiedSession,
  extractJtiFromToken,
  extractExpFromToken,
} from "@/lib/unified-session";
import { rotateSessionAuthority } from "@/lib/security/session-authority";
import { shouldUseSecureCookie, COOKIES, PLATFORM } from "@/lib/platform-config";
import { withDb } from "@/lib/db";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";

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

    const claims = await verifyRefreshTokenSignature(rawRefreshToken);
    if (!claims.ok) {
      const response = apiError("refresh_token_invalid", 401, {
        reason: claims.reason,
      });
      clearRefreshCookie(response);
      return response;
    }

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
    const account = accountResult.value;
    if (!account) {
      const response = apiError("user_not_found", 401);
      clearRefreshCookie(response);
      return response;
    }

    const ip = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
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

    const replacement = await prepareRefreshToken({
      userId: account.id,
      familyId: claims.familyId,
      parentId: claims.jti,
      deviceInfo,
      ip,
    });
    if (!replacement) return apiError("refresh_rotation_unavailable", 503);

    let rotated;
    try {
      rotated = await rotateSessionAuthority({
        rawRefreshToken,
        access: {
          jti: accessJti,
          userId: account.id,
          expiresAt: new Date(accessExp * 1000),
        },
        replacement,
        deviceInfo,
        ip,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          correlationId,
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "session.refresh.rotate",
            userId: account.id,
            familyFingerprintVersion: 1,
          }),
        },
      });
    } catch {
      return apiError("refresh_rotation_unavailable", 503);
    }

    if (!rotated.ok) {
      const response = apiError("refresh_token_invalid", 401, {
        reason: rotated.reason,
        revocationPending: rotated.revocationPending ?? false,
      });
      clearRefreshCookie(response);
      response.cookies.set(COOKIES.SESSION, "", {
        path: "/",
        httpOnly: true,
        secure: shouldUseSecureCookie(),
        sameSite: "lax",
        maxAge: 0,
      });
      return response;
    }

    const response = apiOk({ authenticated: true });
    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });
    setRefreshCookie(response, rotated.refreshToken);
    return response;
  });
}
