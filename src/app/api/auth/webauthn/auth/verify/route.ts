import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { deviceFingerprint } from "@/lib/security/webauthn";
import { verifyAndAdvanceWebAuthnAuthentication } from "@/lib/security/webauthn-credential-authority";
import {
  consumeWebAuthnCeremonyChallenge,
  extractWebAuthnClientChallenge,
} from "@/lib/security/webauthn-ceremony";
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
import { admitSession } from "@/lib/security/session-authority";
import { buildSessionAuditContext } from "@/lib/security/session-route-context";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import { PLATFORM, shouldUseSecureCookie, COOKIES } from "@/lib/platform-config";
import { withDb } from "@/lib/db";
import {
  hashSensitiveAuditRequest,
  resolveSensitiveAuditCorrelation,
} from "@/lib/security/sensitive-mutation-audit";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
};

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
        return apiError("invalid_challenge", 401);
      }

      let assertion;
      try {
        assertion = await verifyAndAdvanceWebAuthnAuthentication({
          expectedChallenge: challenge,
          expectedUserId: ceremony.userId,
          response: body.response,
          audit: {
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            correlationId: resolveSensitiveAuditCorrelation(
              req.headers.get("x-tecpey-request-id"),
            ),
            requestHash: hashSensitiveAuditRequest({
              tenantId: PLATFORM.DEFAULT_TENANT_ID,
              action: "credential.webauthn.authenticate",
              responseEvidence: body.response,
            }),
          },
        });
      } catch {
        return apiError("webauthn_service_unavailable", 503);
      }
      if (!assertion.ok) {
        trackAuthEvent("webauthn_failed");
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
      const accessJti = extractJtiFromToken(accessToken);
      const accessExp = extractExpFromToken(accessToken);
      if (!accessJti || !accessExp) return apiError("session_issue_failed", 503);

      const familyId = crypto.randomUUID();
      const preparedRefresh = await prepareRefreshToken({
        userId: account.id,
        familyId,
        deviceInfo,
        ip,
      });
      if (!preparedRefresh) return apiError("refresh_session_unavailable", 503);

      let admission;
      try {
        admission = await admitSession({
          userId: account.id,
          accessJti,
          accessExpiresAt: new Date(accessExp * 1000),
          preparedRefresh,
          deviceInfo,
          ip,
          deviceFingerprint: deviceFingerprint(deviceInfo, ip),
          method: "webauthn",
          audit: buildSessionAuditContext({
            req,
            userId: account.id,
            actorType: "user",
            action: "session.issue",
            evidence: {
              authenticationMethod: "webauthn",
              credentialId: assertion.credentialId,
            },
          }),
        });
      } catch {
        return apiError("session_registry_unavailable", 503);
      }

      trackAuthEvent("webauthn_success");
      if (admission.isNewDevice) trackAuthEvent("new_device_detected");

      const response = apiOk({ authenticated: true });
      response.cookies.set(COOKIES.SESSION, accessToken, {
        path: "/",
        httpOnly: true,
        secure: shouldUseSecureCookie(),
        sameSite: "lax",
        maxAge: ACCESS_COOKIE_TTL_S,
      });
      setRefreshCookie(response, admission.refreshToken);
      return response;
    },
  );
}
