import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { getOrderBook } from "@/lib/trading/order-book";
import { getMarket } from "@/lib/trading/market-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/orderbook" }, async () => {
    const limit = await rateLimit(req, { namespace: "orderbook-read", limit: 480, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    if (!symbol) return apiError("symbol_required", 400);

    const rawDepth = Number(url.searchParams.get("depth") ?? 20);
    const depth = Number.isFinite(rawDepth) ? Math.min(Math.max(Math.floor(rawDepth), 1), 100) : 20;

    const market = await getMarket(symbol);
    if (!market) return apiError("market_not_found", 404);
    if (market.status !== "active") return apiError("market_not_active", 503);

    const book = getOrderBook(market.symbol);
    const snapshot = book.snapshot(depth);

    return apiOk({
      snapshot,
      market: {
        symbol: market.symbol,
        pricePrecision: market.pricePrecision,
        quantityPrecision: market.quantityPrecision,
        tickSize: market.tickSize,
      },
    });
  });
}
