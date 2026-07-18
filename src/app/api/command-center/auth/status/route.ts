import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { loadAdminPrincipal } from "@/lib/admin-control-plane";
import { getAdminBootstrapState } from "@/lib/admin-passkey-service";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/auth/status" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "admin-auth-status",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const [principal, bootstrapState] = await Promise.all([
      loadAdminPrincipal(req),
      getAdminBootstrapState(),
    ]);

    if (principal === "unavailable" || bootstrapState === "unavailable") {
      return apiError("admin_service_unavailable", 503);
    }

    return apiOk({
      authenticated: Boolean(principal),
      bootstrapRequired: bootstrapState === "open",
      admin: principal
        ? {
            id: principal.adminId,
            email: principal.email,
            displayName: principal.displayName,
            roles: principal.roles,
            authenticationMethods: principal.authenticationMethods,
            stepUpAt: principal.stepUpAt,
          }
        : null,
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
