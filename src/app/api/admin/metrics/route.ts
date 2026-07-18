import { NextRequest } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import { metrics } from "@/lib/metrics";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/admin/metrics" }, async () => {
    const limit = await rateLimit(req, {
      namespace: "admin-metrics",
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "system.health.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    return apiOk({ metrics: metrics.getSnapshot() }, 200, {
      "Cache-Control": "no-store, max-age=0",
    });
  });
}
