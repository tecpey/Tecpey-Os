// GET /api/admin/security-metrics
// Returns auth event counters from Redis for security monitoring.
// Requires admin session.
//
// DELETE /api/admin/security-metrics
// Resets all counters. Requires admin session.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
import { isAdminConfigured, adminNotConfiguredResponse } from "@/lib/admin-auth";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { getAuthMetrics, resetAuthMetrics } from "@/lib/security/auth-metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/admin/security-metrics" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "admin-security-metrics", limit: 30, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    if (!isAdminConfigured()) return adminNotConfiguredResponse();

    const session = await getCanonicalSession(req);
    if (!session.isAdmin) return apiError("unauthorized", 401);

    const counters = await getAuthMetrics();
    return apiOk({ counters, retrievedAt: new Date().toISOString() });
  });
}

export async function DELETE(req: NextRequest) {
  return withObservability(req, { route: "/api/admin/security-metrics DELETE" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "admin-security-metrics", limit: 5, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    if (!isAdminConfigured()) return adminNotConfiguredResponse();

    const session = await getCanonicalSession(req);
    if (!session.isAdmin) return apiError("unauthorized", 401);

    await resetAuthMetrics();
    return apiOk({ reset: true });
  });
}
