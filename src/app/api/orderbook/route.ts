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

    // aggregate=N: round prices to N decimal places and merge levels (0 = no aggregation)
    const rawAgg = url.searchParams.get("aggregate");
    const aggregatePrecision = rawAgg !== null ? Math.min(Math.max(Math.floor(Number(rawAgg)), 0), 10) : null;

    const market = await getMarket(symbol);
    if (!market) return apiError("market_not_found", 404);
    if (market.status !== "active") return apiError("market_not_active", 503);

    const book = getOrderBook(market.symbol);
    let snapshot = book.snapshot(depth);

    if (aggregatePrecision !== null) {
      const factor = Math.pow(10, aggregatePrecision);
      const aggregate = (levels: typeof snapshot.bids, isBid: boolean) => {
        const map = new Map<string, { price: string; quantity: number; orderCount: number }>();
        for (const level of levels) {
          const rounded = isBid
            ? Math.floor(parseFloat(level.price) * factor) / factor
            : Math.ceil(parseFloat(level.price) * factor) / factor;
          const key = rounded.toFixed(aggregatePrecision);
          const existing = map.get(key);
          if (existing) {
            existing.quantity += parseFloat(level.quantity);
            existing.orderCount += level.orderCount;
          } else {
            map.set(key, { price: key, quantity: parseFloat(level.quantity), orderCount: level.orderCount });
          }
        }
        return Array.from(map.values()).map(l => ({
          price: l.price,
          quantity: l.quantity.toFixed(10),
          orderCount: l.orderCount,
        }));
      };
      snapshot = {
        ...snapshot,
        bids: aggregate(snapshot.bids, true),
        asks: aggregate(snapshot.asks, false),
      };
    }

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
