import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { loadAdminPrincipal } from "@/lib/admin-control-plane";
import { rateLimit } from "@/lib/rate-limit";
import { withObservability } from "@/lib/observe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/me" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "command-center-me",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const principal = await loadAdminPrincipal(req);
    if (principal === "unavailable") return apiError("admin_service_unavailable", 503);
    if (!principal) return apiError("admin_session_required", 401);

    return apiOk({
      admin: {
        id: principal.adminId,
        email: principal.email,
        displayName: principal.displayName,
        roles: principal.roles,
        permissions: principal.permissions,
        authenticationMethods: principal.authenticationMethods,
        stepUpAt: principal.stepUpAt,
        session: {
          id: principal.sessionId,
          idleExpiresAt: principal.idleExpiresAt,
          absoluteExpiresAt: principal.absoluteExpiresAt,
        },
      },
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  });
}
