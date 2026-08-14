import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import { resolveAdminControlPlaneMatrix } from "@/lib/admin-control-plane-matrix";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/command-center/control-plane" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "command-center-control-plane-read",
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "admin.roles.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    return apiOk(
      {
        configured: true,
        tenantId: authorization.principal.tenantId,
        workspaceId: authorization.principal.workspaceId,
        snapshot: resolveAdminControlPlaneMatrix(),
      },
      200,
      { "Cache-Control": "no-store, max-age=0" },
    );
  });
}
