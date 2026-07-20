// POST /api/auth/webauthn/register/verify
// Verify the authenticator response from navigator.credentials.create().

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  storeWebAuthnChallenge,
  verifyWebAuthnRegistration,
} from "@/lib/security/webauthn";
import {
  consumeWebAuthnCeremonyChallenge,
  extractWebAuthnClientChallenge,
} from "@/lib/security/webauthn-ceremony";
import { writeAudit } from "@/lib/security/audit-log";
import { trackAuthEvent } from "@/lib/security/auth-metrics";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/register/verify" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "webauthn-reg-verify", limit: 10, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const ip = getClientIp(req);
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
      "webauthn.create",
    );
    const ceremony = challenge
      ? await consumeWebAuthnCeremonyChallenge(challenge, "registration")
      : null;

    if (!challenge || !ceremony || ceremony.userId !== userId) {
      trackAuthEvent("webauthn_failed");
      writeAudit({
        actorId: userId,
        action: "webauthn_registration_failed",
        ip,
        metadata: { event: "webauthn_register_failed", reason: "invalid_challenge" },
      });
      return apiError("invalid_challenge", 400);
    }

    // Compatibility bridge for the existing cryptographic verifier. The public
    // ceremony envelope has already been consumed atomically, so only this
    // request can stage and consume the legacy verifier key.
    try {
      await storeWebAuthnChallenge(challenge, userId);
    } catch {
      return apiError("webauthn_requires_redis", 503);
    }

    const result = await verifyWebAuthnRegistration({
      userId,
      response: body.response,
      deviceName: body.deviceName,
    });

    if (!result.ok) {
      trackAuthEvent("webauthn_failed");
      writeAudit({
        actorId: userId,
        action: "webauthn_registration_failed",
        ip,
        metadata: { event: "webauthn_register_failed", reason: result.reason },
      });
      return apiError(result.reason, 400);
    }

    trackAuthEvent("webauthn_registered");
    writeAudit({
      actorId: userId,
      action: "webauthn_registered",
      ip,
      metadata: { event: "webauthn_registered", credentialId: result.credentialId },
    });

    return apiOk({ credentialId: result.credentialId, aaguid: result.aaguid });
  });
}
