// POST /api/auth/webauthn/auth/verify
// Verify a WebAuthn assertion response and issue a full authenticated session.

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  storeWebAuthnChallenge,
  verifyWebAuthnAuthentication,
  deviceFingerprint,
  markDeviceSeen,
} from "@/lib/security/webauthn";
import {
  consumeWebAuthnCeremonyChallenge,
  extractWebAuthnClientChallenge,
} from "@/lib/security/webauthn-ceremony";
import { signUnifiedSession, extractJtiFromToken, extractExpFromToken } from "@/lib/unified-session";
import { registerSession } from "@/lib/security/session-store";
import { issueRefreshToken, setRefreshCookie, ACCESS_COOKIE_TTL_S } from "@/lib/security/refresh-tokens";
import { writeAudit } from "@/lib/security/audit-log";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type AccountRow = { id: string; email: string; username: string; display_name: string };
type CredentialOwnerRow = { user_id: string };

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/auth/verify" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "webauthn-auth-verify", limit: 10, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const ip = getClientIp(req);
    const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);
    const body = await req.json().catch(() => ({}));
    const challenge = extractWebAuthnClientChallenge(
      body.response?.response?.clientDataJSON,
      "webauthn.get",
    );
    const ceremony = challenge
      ? await consumeWebAuthnCeremonyChallenge(challenge, "authentication")
      : null;
    const credentialId = typeof body.response?.rawId === "string"
      ? body.response.rawId
      : null;

    if (!challenge || !ceremony || !credentialId) {
      trackAuthEvent("webauthn_failed");
      writeAudit({
        actorId: typeof body.userId === "string" ? body.userId : "unknown",
        action: "login",
        ip,
        metadata: { event: "webauthn_auth_failed", reason: "invalid_challenge" },
      });
      return apiError("invalid_challenge", 401);
    }

    const credentialOwnerResult = await withDb(async (db) => {
      const result = await db.query<CredentialOwnerRow>(
        `SELECT user_id
         FROM webauthn_credentials
         WHERE credential_id = $1 AND is_active = TRUE
         LIMIT 1`,
        [credentialId],
      );
      return result.rows[0] ?? null;
    });

    if (!credentialOwnerResult.enabled) return apiError("db_unavailable", 503);
    const credentialOwner = credentialOwnerResult.value;
    if (!credentialOwner) return apiError("credential_not_found", 401);

    const suppliedUserId = typeof body.userId === "string" && body.userId.length > 0
      ? body.userId
      : null;
    if (
      (ceremony.userId !== null && ceremony.userId !== credentialOwner.user_id) ||
      (suppliedUserId !== null && suppliedUserId !== credentialOwner.user_id)
    ) {
      trackAuthEvent("webauthn_failed");
      writeAudit({
        actorId: suppliedUserId ?? ceremony.userId ?? "unknown",
        action: "login",
        ip,
        metadata: { event: "webauthn_auth_failed", reason: "user_mismatch" },
      });
      return apiError("user_mismatch", 401);
    }

    // The ceremony envelope was consumed atomically. Resolve the credential
    // owner before staging the compatibility key so discoverable credentials
    // work without the insecure legacy "anon" subject.
    try {
      await storeWebAuthnChallenge(challenge, credentialOwner.user_id);
    } catch {
      return apiError("webauthn_requires_redis", 503);
    }

    const result = await verifyWebAuthnAuthentication({
      userId: credentialOwner.user_id,
      response: body.response,
    });

    if (!result.ok) {
      trackAuthEvent("webauthn_failed");
      writeAudit({
        actorId: credentialOwner.user_id,
        action: "login",
        ip,
        metadata: { event: "webauthn_auth_failed", reason: result.reason },
      });
      return apiError(result.reason, 401);
    }

    const { userId } = result;

    const dbResult = await withDb(async (db) => {
      const res = await db.query<AccountRow>(
        `SELECT id, email, username, display_name FROM academy_auth_accounts WHERE id = $1`,
        [userId],
      );
      return res.rows[0] ?? null;
    });

    if (!dbResult.enabled) return apiError("db_unavailable", 503);
    const account = dbResult.value;
    if (!account) return apiError("user_not_found", 401);

    const accessToken = await signUnifiedSession({
      accountId: account.id,
      studentId: null,
      email: account.email,
      displayName: account.display_name,
      username: account.username,
    });

    const familyId = crypto.randomUUID();
    const refreshToken = await issueRefreshToken({ userId: account.id, familyId, deviceInfo, ip });

    const response = apiOk({ authenticated: true });

    response.cookies.set(COOKIES.SESSION, accessToken, {
      path: "/",
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: "lax",
      maxAge: ACCESS_COOKIE_TTL_S,
    });

    if (refreshToken) setRefreshCookie(response, refreshToken);

    const jti = extractJtiFromToken(accessToken);
    const exp = extractExpFromToken(accessToken);
    if (jti && exp) {
      void registerSession({ jti, userId: account.id, deviceInfo, ip, expiresAt: new Date(exp * 1000) });
    }

    const fp = deviceFingerprint(deviceInfo, ip);
    const { isNew } = await markDeviceSeen(account.id, fp);

    trackAuthEvent("webauthn_success");
    if (isNew) trackAuthEvent("new_device_detected");

    writeAudit({
      actorId: account.id,
      action: "login",
      ip,
      userAgent: deviceInfo,
      metadata: { method: "webauthn", isNewDevice: isNew },
    });

    return response;
  });
}
