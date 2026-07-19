// POST /api/auth/webauthn/register/challenge
// Generate a WebAuthn registration challenge for the current user.
// The client passes this challenge to navigator.credentials.create().

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import {
  generateChallenge,
  listCredentials,
} from "@/lib/security/webauthn";
import { storeWebAuthnCeremonyChallenge } from "@/lib/security/webauthn-ceremony";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/register/challenge" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "webauthn-reg-challenge",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const challenge = generateChallenge();

    try {
      await storeWebAuthnCeremonyChallenge({
        challenge,
        ceremony: "registration",
        userId,
      });
    } catch {
      return apiError("webauthn_requires_redis", 503);
    }

    const existingCredentials = await listCredentials(userId);

    const rpConfig = (() => {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      try {
        const url = new URL(siteUrl);
        return { id: process.env.WEBAUTHN_RP_ID ?? url.hostname, name: "TecPey" };
      } catch {
        return { id: "localhost", name: "TecPey" };
      }
    })();

    return apiOk({
      challenge,
      rp: rpConfig,
      user: {
        id: Buffer.from(userId).toString("base64url"),
        name: session.email ?? session.username ?? userId,
        displayName: session.displayName ?? session.email ?? userId,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      timeout: 300_000,
      attestation: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        requireResidentKey: false,
        userVerification: "preferred",
      },
      excludeCredentials: existingCredentials
        .filter((credential) => credential.isActive)
        .map((credential) => ({
          id: credential.credentialId,
          type: "public-key",
          transports: credential.transports,
        })),
    });
  });
}
