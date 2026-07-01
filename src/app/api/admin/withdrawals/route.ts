// GET /api/admin/withdrawals
// List withdrawals in the review queue (state: pending | compliance_review).
// Requires admin session.

import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
import { isAdminConfigured, adminNotConfiguredResponse } from "@/lib/admin-auth";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listPendingReviewWithdrawals } from "@/lib/security/withdrawal-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/admin/withdrawals" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "admin-withdrawals", limit: 60, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    if (!isAdminConfigured()) return adminNotConfiguredResponse();

    const session = await getCanonicalSession(req);
    if (!session.isAdmin) return apiError("unauthorized", 401);

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

    const withdrawals = await listPendingReviewWithdrawals(limit, offset);
    return apiOk({ withdrawals, limit, offset, count: withdrawals.length });
  });
}
