import { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { loadArenaLeagueLeaderboard } from "@/lib/arena-league-leaderboard-authority";
import { getCanonicalSession } from "@/lib/auth-session";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { resolveSensitiveAuditCorrelation } from "@/lib/security/sensitive-mutation-audit";
import { resolveTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import { requireTenantProduct } from "@/lib/security/tenant-product-entitlement";

export const dynamic = "force-dynamic";

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/arena/leaderboard GET" }, async () => {
    const url = new URL(req.url);
    if ([...url.searchParams.keys()].length > 0) {
      return noStore(apiError("invalid_arena_leaderboard_query", 400));
    }
    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.studentId) return noStore(apiError("academy_profile_required", 401));
    const limited = await rateLimit(req, {
      namespace: "arena-leaderboard-read", identity: session.studentId,
      limit: 60, windowMs: 60_000,
    });
    if (!limited.ok) return noStore(apiError("rate_limited", 429));
    const tenantContext = await resolveTenantPrincipalContext({
      session, request: req, requiredPrincipalType: "student",
      scopes: ["community:profile:read"],
      requestId: resolveSensitiveAuditCorrelation(req.headers.get("x-tecpey-request-id")),
    });
    if (!tenantContext.available) return noStore(apiError("arena_leaderboard_unavailable", 503));
    const productGate = await requireTenantProduct(tenantContext.tenantId, "academy");
    if (productGate) return noStore(productGate);
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = `${year}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const windows = [
      { windowType: "monthly" as const, windowKey: month },
      { windowType: "yearly" as const, windowKey: year },
      { windowType: "lifetime" as const, windowKey: "all-time" },
    ];
    const leaderboards = [];
    for (const window of windows) {
      const loaded = await loadArenaLeagueLeaderboard({
        context: tenantContext, ...window, limit: 50,
      });
      if (!loaded.available) return noStore(apiError("arena_leaderboard_unavailable", 503));
      leaderboards.push(loaded.leaderboard);
    }
    return noStore(apiOk({ leaderboards }));
  });
}
