import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { getAdminBootstrapState } from "@/lib/admin-passkey-service";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateAdminWebAuthnChallenge,
  getAdminWebAuthnRpConfig,
  storeAdminWebAuthnChallenge,
} from "@/lib/security/admin-webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/passkey/challenge" }, async () => {
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const limit = await rateLimit(req, {
      namespace: "admin-passkey-challenge",
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const bootstrapState = await getAdminBootstrapState();
    if (bootstrapState === "unavailable") return apiError("admin_service_unavailable", 503);
    if (bootstrapState === "open") return apiError("admin_bootstrap_required", 409);

    const challenge = generateAdminWebAuthnChallenge();
    try {
      await storeAdminWebAuthnChallenge({
        challenge,
        ceremony: "authentication",
        adminId: null,
      });
    } catch {
      return apiError("admin_webauthn_unavailable", 503);
    }

    const rp = getAdminWebAuthnRpConfig();
    return apiOk({
      publicKey: {
        challenge,
        rpId: rp.rpId,
        allowCredentials: [],
        timeout: 300_000,
        userVerification: "required",
      },
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
