// POST /api/auth/webauthn/auth/challenge
// Generate a WebAuthn authentication challenge.
// Body: { userId? } — optional for discoverable credentials (passkeys without username).

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  generateChallenge,
  storeWebAuthnChallenge,
  listCredentials,
} from "@/lib/security/webauthn";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/auth/challenge" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "webauthn-auth-challenge", limit: 20, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body.userId;

    const challenge = generateChallenge();

    try {
      // Store challenge associated with userId (or "anon" for resident key flow)
      await storeWebAuthnChallenge(challenge, userId ?? "anon");
    } catch {
      return apiError("webauthn_requires_redis", 503);
    }

    // For resident keys: no allowCredentials (browser discovers them)
    // For non-resident: provide the user's registered credentials
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
