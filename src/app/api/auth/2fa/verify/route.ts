import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { withDb } from "@/lib/db";
import {
  decryptTotpSecret,
  verifyTotp,
  consumePreAuthToken,
} from "@/lib/security/totp";
import { writeAudit } from "@/lib/security/audit-log";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import {
  signUnifiedSession,
  extractJtiFromToken,
  extractExpFromToken,
} from "@/lib/unified-session";
import { registerSession } from "@/lib/security/session-store";
import {
  issueRefreshToken,
  setRefreshCookie,
  revokeAllRefreshTokensForUser,
  ACCESS_COOKIE_TTL_S,
} from "@/lib/security/refresh-tokens";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { deviceFingerprint, markDeviceSeen } from "@/lib/security/webauthn";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
};

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
    const isPreAuthFlow = Boolean(preAuthToken);
    let userId: string | null = null;

    if (isPreAuthFlow) {
      userId = await consumePreAuthToken(preAuthToken);
      if (!userId) return apiError("preauth_token_invalid", 401);
    } else {
      const session = await getCanonicalSession(req, { strictRevocation: true });
      userId = session.academyAccountId ?? session.userId ?? session.studentId ?? null;
      if (!userId) return apiError("authentication_required", 401);
    }

    const twoFactor = await withDb(async (db) => {
      const result = await db.query<{
        encrypted_secret: string;
        enabled: boolean;
      }>(
        `SELECT encrypted_secret, enabled
           FROM user_2fa
          WHERE user_id = $1 AND enabled = TRUE`,
        [userId],
      );
      return result.rows[0] ?? null;
    });
    if (!twoFactor.enabled) return apiError("db_unavailable", 503);
    if (!twoFactor.value) return apiError("2fa_not_enabled", 404);

    let rawSecret: string;
    try {
      rawSecret = decryptTotpSecret(twoFactor.value.encrypted_secret);
    } catch {
      return apiError("2fa_secret_corrupt", 500);
    }

    if (!verifyTotp(rawSecret, code)) {
      trackAuthEvent("2fa_failed");
      writeAudit({
        actorId: userId,
        action: "2fa_verify_failed",
        ip,
        metadata: { event: "verify_failed" },
      });
      return apiError("invalid_totp_code", 401);
    }

    const touched = await withDb(async (db) => {
      await db.query(
        `UPDATE user_2fa SET last_used_at = NOW() WHERE user_id = $1`,
        [userId],
      );
      return true;
    });
    if (!touched.enabled) return apiError("db_unavailable", 503);

    trackAuthEvent("2fa_success");
    writeAudit({
      actorId: userId,
      action: "2fa_verify_success",
      ip,
      metadata: { event: "verify_ok" },
    });

    if (!isPreAuthFlow) return apiOk({ verified: true, userId });

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
    const refreshToken = await issueRefreshToken({
      userId: account.id,
      familyId,
      deviceInfo,
      ip,
    });
    if (!refreshToken) return apiError("refresh_session_unavailable", 503);

    const registered = await registerSession({
      jti,
      userId: account.id,
      deviceInfo,
      ip,
      expiresAt: new Date(exp * 1000),
    });
    if (!registered) {
      await revokeAllRefreshTokensForUser(account.id);
      return apiError("session_registry_unavailable", 503);
    }

    const fingerprint = deviceFingerprint(deviceInfo, ip);
    const { isNew } = await markDeviceSeen(account.id, fingerprint);
    if (isNew) trackAuthEvent("new_device_detected");
    trackAuthEvent("login_success");
    writeAudit({
      actorId: account.id,
      action: "login",
      ip,
      userAgent: deviceInfo,
      metadata: { method: "password+2fa", isNewDevice: isNew },
    });

    const response = apiOk({ authenticated: true });
    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });
    setRefreshCookie(response, refreshToken);
    return response;
  });
}
