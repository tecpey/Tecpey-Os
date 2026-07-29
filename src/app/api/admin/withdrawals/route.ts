import { NextRequest } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin-control-plane";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { listPendingReviewWithdrawalsStrict } from "@/lib/security/withdrawal-read-authority";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/admin/withdrawals" }, async () => {
    const requestLimit = await rateLimit(req, {
      namespace: "admin-withdrawals",
      limit: 60,
      windowMs: 60_000,
    });
    if (!requestLimit.ok) return apiError("rate_limited", 429);

    const authorization = await authorizeAdminRequest(req, "withdrawals.read");
    if (!authorization.ok) return apiError(authorization.error, authorization.status);

    const url = new URL(req.url);
    const limit = Math.min(
      Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
      200,
    );
    const offset = Math.max(
      Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    const result = await listPendingReviewWithdrawalsStrict(limit, offset);
    if (!result.ok) return apiError(result.reason, 503);

    return apiOk(
      {
        withdrawals: result.withdrawals,
        limit,
        offset,
        count: result.withdrawals.length,
      },
      200,
      { "Cache-Control": "no-store, max-age=0" },
    );
  });
}
