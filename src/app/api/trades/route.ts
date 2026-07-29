import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listTrades, listUserTrades } from "@/lib/trading/trade-service";

export const dynamic = "force-dynamic";

// GET /api/trades
// ?market=BTCUSDT    — public recent trades for a market
// ?mine=1            — authenticated user's trade history (across all markets)
// ?mine=1&market=X   — authenticated user's trades for a specific market
// ?limit=N           — page size (1–200, default 50)
// ?before=<ISO>      — cursor: only trades executed before this timestamp
// ?from=<ISO>        — lower bound (inclusive)
// ?to=<ISO>          — upper bound (inclusive)
export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/trades" }, async () => {
    const rl = await rateLimit(req, { namespace: "trades-read", limit: 120, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    const market = url.searchParams.get("market");
    const mine = url.searchParams.get("mine") === "1";
    const rawLimit = Number(url.searchParams.get("limit") ?? 50);
    const queryLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 50;
    const before = url.searchParams.get("before") ?? undefined;
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;

    if (mine) {
      const session = await getCanonicalSession(req);
      if (!session.userId && !session.studentId) return apiError("authentication_required", 401);
      const userId = session.userId ?? session.studentId ?? "";
      const trades = await listUserTrades(userId, market ?? undefined, queryLimit, before);
      const nextCursor = trades.length === queryLimit ? trades[trades.length - 1]?.executedAt : null;
      return apiOk({ trades, count: trades.length, nextCursor });
    }

    if (!market) return apiError("symbol_required", 400);
    const trades = await listTrades({ market, limit: queryLimit, before, from, to });
    const nextCursor = trades.length === queryLimit ? trades[trades.length - 1]?.executedAt : null;
    return apiOk({ trades, count: trades.length, market, nextCursor });
  });
}
