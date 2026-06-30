import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listMarkets, getMarket } from "@/lib/trading/market-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/markets" }, async () => {
    const limit = await rateLimit(req, { namespace: "markets-read", limit: 240, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");

    if (symbol) {
      const market = await getMarket(symbol);
      if (!market) return apiError("market_not_found", 404);
      return apiOk({ market });
    }

    const markets = await listMarkets(true);
    return apiOk({ markets, count: markets.length });
  });
}
