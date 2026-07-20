import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb } from "@/lib/db";
import {
  claimPreAuthToken,
  peekPreAuthToken,
} from "@/lib/security/totp";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import {
  signUnifiedSession,
  extractJtiFromToken,
  extractExpFromToken,
} from "@/lib/unified-session";
import {
  prepareRefreshToken,
  setRefreshCookie,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import { admitSessionAuthority } from "@/lib/security/session-authority";
import { verifyTwoFactorCredential } from "@/lib/security/two-factor-authority";
import { PLATFORM, shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
  type SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
};

type VerificationActorType = Extract<
  SensitiveMutationAuditEvent["actorType"],
  "student" | "user" | "admin"
>;

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/2fa/verify" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "2fa-verify",
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 4_096,
      allowEmptyObject: true,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }
    req = boundedBodyRequest.request;
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    const preAuthToken = String(body.preAuthToken ?? "").trim();
    if (!/^\d{6}$/.test(code)) return apiError("invalid_code_format", 400);

    const ip = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const correlationId = resolveSensitiveAuditCorrelation(
      req.headers.get("x-tecpey-request-id"),
    );
    const isPreAuthFlow = Boolean(preAuthToken);
    let userId: string | null = null;
    let actorType: VerificationActorType = "user";

    if (isPreAuthFlow) {
      const resolved = await peekPreAuthToken(preAuthToken);
      if (!resolved.available) {
        return apiError("preauth_authority_unavailable", 503);
      }
      userId = resolved.userId;
      if (!userId) return apiError("preauth_token_invalid", 401);
    } else {
      const session = await getCanonicalSession(req, { strictRevocation: true });
      userId = session.academyAccountId ?? session.userId ?? session.studentId ?? null;
      if (!userId) return apiError("authentication_required", 401);
      actorType = session.isAdmin
        ? "admin"
        : session.studentId && !session.userId && !session.academyAccountId
          ? "student"
          : "user";
    }

    let verification;
    try {
      verification = await verifyTwoFactorCredential({
        userId,
        code,
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType,
          actorId: userId,
          correlationId,
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "credential.2fa.verify",
            userId,
            flow: isPreAuthFlow ? "password_2fa" : "step_up",
          }),
        },
      });
    } catch {
      return apiError("db_unavailable", 503);
    }

    if (!verification.ok) {
      if (verification.status === "invalid_code") {
        trackAuthEvent("2fa_failed");
        return apiError("invalid_totp_code", 401);
      }
      if (verification.status === "not_enabled") {
        return apiError("2fa_not_enabled", 404);
      }
      return apiError("2fa_secret_corrupt", 500);
    }

    trackAuthEvent("2fa_success");
    if (!isPreAuthFlow) return apiOk({ verified: true, userId });

    const claimed = await claimPreAuthToken(preAuthToken);
    if (!claimed.available) {
      return apiError("preauth_authority_unavailable", 503);
    }
    if (!claimed.userId) return apiError("preauth_token_invalid", 401);
    if (claimed.userId !== userId) {
      return apiError("preauth_principal_mismatch", 401);
    }

    const accountResult = await withDb(async (db) => {
      const result = await db.query<AccountRow>(
        `SELECT id, email, username, display_name
           FROM academy_auth_accounts
          WHERE id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    });
    if (!accountResult.enabled) return apiError("db_unavailable", 503);
    const account = accountResult.value;
    if (!account) return apiError("user_not_found", 401);

    const accessToken = await signUnifiedSession({
      accountId: account.id,
      studentId: null,
      email: account.email,
      displayName: account.display_name,
      username: account.username,
    });
    const jti = extractJtiFromToken(accessToken);
    const exp = extractExpFromToken(accessToken);
    if (!jti || !exp) return apiError("session_issue_failed", 503);

    const familyId = crypto.randomUUID();
    const preparedRefresh = await prepareRefreshToken({
      userId: account.id,
      familyId,
      deviceInfo,
      ip,
    });
    if (!preparedRefresh) return apiError("refresh_session_unavailable", 503);

    let admitted;
    try {
      admitted = await admitSessionAuthority({
        userId: account.id,
        access: {
          jti,
          userId: account.id,
          expiresAt: new Date(exp * 1000),
        },
        refresh: preparedRefresh,
        deviceInfo,
        ip,
        method: "password_2fa",
        audit: {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorType: "user",
          actorId: account.id,
          correlationId,
          requestHash: hashSensitiveAuditRequest({
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            action: "session.issue",
            method: "password_2fa",
            userId: account.id,
          }),
        },
      });
    } catch {
      return apiError("session_registry_unavailable", 503);
    }

    if (admitted.isNewDevice) trackAuthEvent("new_device_detected");
    trackAuthEvent("login_success");

    const response = apiOk({ authenticated: true });
    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });
    setRefreshCookie(response, admitted.refreshToken);
    return response;
  });
}
