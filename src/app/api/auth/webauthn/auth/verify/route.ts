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
import { writeAudit } from "@/lib/security/audit-log";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import { shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { withDb } from "@/lib/db";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
};
type CredentialOwnerRow = { user_id: string };

export async function POST(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/auth/webauthn/auth/verify" },
    async () => {
      if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

      const limit = await rateLimit(req, {
        namespace: "webauthn-auth-verify",
        limit: 10,
        windowMs: 60_000,
      });
      if (!limit.ok) return apiError("rate_limited", 429);

      const ip = getClientIp(req);
      const deviceInfo = (req.headers.get("user-agent") ?? "").slice(0, 500);
      const boundedBodyRequest = await readBoundedJsonRequest(req, {
        maxBytes: 131_072,
      });
      if (!boundedBodyRequest.ok) {
        return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
      }
      req = boundedBodyRequest.request;
      const body = await req.json().catch(() => ({}));
      const challenge = extractWebAuthnClientChallenge(
        body.response?.response?.clientDataJSON,
        "webauthn.get",
      );
      const ceremony = challenge
        ? await consumeWebAuthnCeremonyChallenge(challenge, "authentication")
        : null;
      const credentialId =
        typeof body.response?.rawId === "string" ? body.response.rawId : null;

      if (!challenge || !ceremony || !credentialId) {
        trackAuthEvent("webauthn_failed");
        writeAudit({
          actorId: typeof body.userId === "string" ? body.userId : "unknown",
          action: "login",
          ip,
          metadata: {
            event: "webauthn_auth_failed",
            reason: "invalid_challenge",
          },
        });
        return apiError("invalid_challenge", 401);
      }

      const credentialOwnerResult = await withDb(async (db) => {
        const result = await db.query<CredentialOwnerRow>(
          `SELECT user_id
             FROM webauthn_credentials
            WHERE credential_id = $1
              AND is_active = TRUE
            LIMIT 1`,
          [credentialId],
        );
        return result.rows[0] ?? null;
      });
      if (!credentialOwnerResult.enabled) return apiError("db_unavailable", 503);
      const credentialOwner = credentialOwnerResult.value;
      if (!credentialOwner) return apiError("credential_not_found", 401);

      const suppliedUserId =
        typeof body.userId === "string" && body.userId.length > 0
          ? body.userId
          : null;
      if (
        (ceremony.userId !== null &&
          ceremony.userId !== credentialOwner.user_id) ||
        (suppliedUserId !== null && suppliedUserId !== credentialOwner.user_id)
      ) {
        trackAuthEvent("webauthn_failed");
        writeAudit({
          actorId: suppliedUserId ?? ceremony.userId ?? "unknown",
          action: "login",
          ip,
          metadata: {
            event: "webauthn_auth_failed",
            reason: "user_mismatch",
          },
        });
        return apiError("user_mismatch", 401);
      }

      try {
        await storeWebAuthnChallenge(challenge, credentialOwner.user_id);
      } catch {
        return apiError("webauthn_requires_redis", 503);
      }

      const assertion = await verifyWebAuthnAuthentication({
        userId: credentialOwner.user_id,
        response: body.response,
      });
      if (!assertion.ok) {
        trackAuthEvent("webauthn_failed");
        writeAudit({
          actorId: credentialOwner.user_id,
          action: "login",
          ip,
          metadata: {
            event: "webauthn_auth_failed",
            reason: assertion.reason,
          },
        });
        return apiError(assertion.reason, 401);
      }

      const accountResult = await withDb(async (db) => {
        const result = await db.query<AccountRow>(
          `SELECT id, email, username, display_name
             FROM academy_auth_accounts
            WHERE id = $1`,
          [assertion.userId],
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
      trackAuthEvent("webauthn_success");
      if (isNew) trackAuthEvent("new_device_detected");
      writeAudit({
        actorId: account.id,
        action: "login",
        ip,
        userAgent: deviceInfo,
        metadata: { method: "webauthn", isNewDevice: isNew },
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
    },
  );
}
