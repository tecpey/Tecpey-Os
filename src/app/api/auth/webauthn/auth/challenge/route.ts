import { readJsonBody } from "@/lib/security/request-body";
// POST /api/auth/webauthn/auth/challenge
// Generate a WebAuthn authentication challenge.
// Body: { userId? } — optional for discoverable credentials (passkeys without username).

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  generateChallenge,
  listCredentials,
} from "@/lib/security/webauthn";
import { storeWebAuthnCeremonyChallenge } from "@/lib/security/webauthn-ceremony";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/auth/challenge" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "webauthn-auth-challenge", limit: 20, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const bodyResult = await readJsonBody(req, {
      maxBytes: 8_192,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;
    const userId = typeof body.userId === "string" && body.userId.length > 0
      ? body.userId
      : null;

    const challenge = generateChallenge();

    try {
      await storeWebAuthnCeremonyChallenge({
        challenge,
        ceremony: "authentication",
        userId,
      });
    } catch {
      return apiError("webauthn_requires_redis", 503);
    }

    // For discoverable credentials: no allowCredentials (browser discovers them).
    // For username-bound authentication: return only that user's active credentials.
    const allowCredentials = userId
      ? (await listCredentials(userId))
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.credentialId, type: "public-key", transports: c.transports }))
      : [];

    return apiOk({
      challenge,
      allowCredentials,
      timeout: 300_000,
      userVerification: "required",
    });
  });
}
