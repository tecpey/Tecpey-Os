// POST /api/auth/webauthn/register/verify
// Verify the authenticator response from navigator.credentials.create().

import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { verifyWebAuthnRegistration } from "@/lib/security/webauthn";
import { writeAudit } from "@/lib/security/audit-log";
import { trackAuthEvent } from "@/lib/security/auth-metrics";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/auth/webauthn/register/verify" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "webauthn-reg-verify", limit: 10, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    const userId = session.academyAccountId ?? session.userId ?? session.studentId;
    if (!userId) return apiError("authentication_required", 401);

    const ip = getClientIp(req);
    const body = await req.json().catch(() => ({}));

    const result = await verifyWebAuthnRegistration({
      userId,
      response: body.response,
      deviceName: body.deviceName,
    });

    if (!result.ok) {
      trackAuthEvent("webauthn_failed");
      writeAudit({
        actorId: userId,
        action: "admin_action",
        ip,
        metadata: { event: "webauthn_register_failed", reason: result.reason },
      });
      return apiError(result.reason, 400);
    }

    trackAuthEvent("webauthn_registered");
    writeAudit({
      actorId: userId,
      action: "admin_action",
      ip,
      metadata: { event: "webauthn_registered", credentialId: result.credentialId },
    });

    return apiOk({ credentialId: result.credentialId, aaguid: result.aaguid });
  });
}
