import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { getMarket } from "@/lib/trading/market-service";
import { getMarketStats } from "@/lib/trading/market-stats-service";
import { getOrderBook } from "@/lib/trading/order-book";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ market: string }> },
) {
  return withObservability(req, { route: "/api/markets/[market]/summary" }, async () => {
    const rl = await rateLimit(req, { namespace: "market-summary", limit: 120, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const { market: marketParam } = await params;
    const symbol = marketParam.toUpperCase();

    const market = await getMarket(symbol);
    if (!market) return apiError("market_not_found", 404);

    const [stats, book] = await Promise.all([
      getMarketStats(symbol),
      Promise.resolve(getOrderBook(symbol)),
    ]);

    const bookSnap = book.snapshot(5);

    return apiOk({
      market: {
        symbol: market.symbol,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        status: market.status,
        pricePrecision: market.pricePrecision,
        quantityPrecision: market.quantityPrecision,
        tickSize: market.tickSize,
        stepSize: market.stepSize,
        makerFee: market.makerFee,
        takerFee: market.takerFee,
      },
      stats: stats ?? {
        market: symbol,
        lastPrice: null,
        openPrice24h: null,
        closePrice: null,
        highPrice24h: null,
        lowPrice24h: null,
        baseVolume24h: "0",
        quoteVolume24h: "0",
        vwap24h: null,
        priceChange24h: null,
        priceChangePct24h: null,
        tradeCount24h: 0,
        updatedAt: new Date().toISOString(),
      },
      orderBook: {
        bestBid: bookSnap.bids[0] ?? null,
        bestAsk: bookSnap.asks[0] ?? null,
        bidCount: bookSnap.bids.length,
        askCount: bookSnap.asks.length,
      },
    });
  });
}
