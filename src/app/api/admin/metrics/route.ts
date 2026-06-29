import { NextRequest } from "next/server";
import { getCanonicalSession } from "@/lib/auth-session";
import { isAdminConfigured, adminNotConfiguredResponse } from "@/lib/admin-auth";
import { metrics } from "@/lib/metrics";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/admin/metrics" }, async () => {
    const limit = await rateLimit(req, { namespace: "admin-metrics", limit: 30, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);
    if (!isAdminConfigured()) return adminNotConfiguredResponse();
    const session = await getCanonicalSession(req);
    if (!session.isAdmin) return apiError("unauthorized", 401);
    return apiOk({ metrics: metrics.getSnapshot() });
  });
}
