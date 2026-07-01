// GET /api/auth/webauthn/credentials
// List all registered WebAuthn credentials for the current user.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listCredentials } from "@/lib/security/webauthn";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/credentials" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "webauthn-credentials", limit: 30, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const credentials = await listCredentials(userId);

    return apiOk({
      credentials: credentials.map((c) => ({
        id: c.id,
        credentialId: c.credentialId,
        deviceName: c.deviceName,
        aaguid: c.aaguid,
        transports: c.transports,
        isActive: c.isActive,
        createdAt: c.createdAt,
        lastUsedAt: c.lastUsedAt,
      })),
    });
  });
}
