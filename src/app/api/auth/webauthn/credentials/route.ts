// GET /api/auth/webauthn/credentials
// List registered WebAuthn credentials for the current strict session.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listWebAuthnCredentials } from "@/lib/security/webauthn-credential-authority";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/credentials" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, {
      namespace: "webauthn-credentials",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    try {
      const credentials = await listWebAuthnCredentials(userId);
      return apiOk({
        credentials: credentials.map((credential) => ({
          id: credential.id,
          credentialId: credential.credentialId,
          deviceName: credential.deviceName,
          aaguid: credential.aaguid,
          transports: credential.transports,
          isActive: credential.isActive,
          createdAt: credential.createdAt,
          lastUsedAt: credential.lastUsedAt,
        })),
      });
    } catch {
      return apiError("webauthn_service_unavailable", 503);
    }
  });
}
