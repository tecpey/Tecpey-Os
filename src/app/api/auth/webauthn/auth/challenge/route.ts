// POST /api/auth/webauthn/auth/challenge
// Generate a discoverable-credential WebAuthn authentication challenge.
// Caller-controlled user identifiers are deliberately not accepted: the
// authenticator selects the passkey and the credential owner is resolved only
// after a signed assertion reaches the server.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { generateChallenge } from "@/lib/security/webauthn";
import { storeWebAuthnCeremonyChallenge } from "@/lib/security/webauthn-ceremony";
import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/auth/challenge" }, async () => {
    const rlimit = await rateLimit(req, {
      namespace: "webauthn-auth-challenge",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const boundedBodyRequest = await readBoundedJsonRequest(req, {
      maxBytes: 2_048,
      allowEmptyObject: true,
    });
    if (!boundedBodyRequest.ok) {
      return apiError(boundedBodyRequest.error, boundedBodyRequest.status);
    }

    const challenge = generateChallenge();
    try {
      await storeWebAuthnCeremonyChallenge({
        challenge,
        ceremony: "authentication",
        userId: null,
      });
    } catch {
      return apiError("webauthn_requires_redis", 503);
    }

    return apiOk({
      challenge,
      allowCredentials: [],
      timeout: 300_000,
      userVerification: "required",
    });
  });
}
