import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  normalizeCoinGeckoMarkets,
  PUBLIC_MARKET_SOURCE,
  PUBLIC_MARKET_SOURCE_URL,
} from "@/lib/public-market-data";
import { listMarkets, getMarket } from "@/lib/trading/market-service";

export const dynamic = "force-dynamic";

const MAX_PUBLIC_PAGE = 10;
const MAX_PUBLIC_LIMIT = 100;

function boundedInteger(raw: string | null, fallback: number, max: number) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

async function publicMarketResponse(request: NextRequest) {
  const page = boundedInteger(request.nextUrl.searchParams.get("page"), 1, MAX_PUBLIC_PAGE);
  const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 20, MAX_PUBLIC_LIMIT);
  const query = (request.nextUrl.searchParams.get("search") || "").trim().toLowerCase().slice(0, 40);
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  const params = new URLSearchParams({
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: String(limit),
    page: String(page),
    sparkline: "false",
    price_change_percentage: "24h",
  });

  let upstream: Response;
  try {
    upstream = await fetch(`https://api.coingecko.com/api/v3/coins/markets?${params}`, {
      headers: apiKey ? { "x-cg-demo-api-key": apiKey } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    return apiError("market_data_unavailable", 503);
  }
  if (!upstream.ok) return apiError("market_data_unavailable", 503);

  const normalized = normalizeCoinGeckoMarkets(await upstream.json().catch(() => null));
  const data = query
    ? normalized.filter((coin) =>
        String(coin.symbol || "").toLowerCase().includes(query)
        || String(coin.name || "").toLowerCase().includes(query),
      )
    : normalized;
  if (data.length === 0 && !query) return apiError("market_data_stale_or_empty", 503);

  const response = apiOk({
    data,
    meta: { current_page: page, last_page: data.length === limit ? page + 1 : page },
    provenance: {
      provider: PUBLIC_MARKET_SOURCE,
      providerUrl: PUBLIC_MARKET_SOURCE_URL,
      currency: "USD",
      fetchedAt: new Date().toISOString(),
      freshness: "upstream timestamps under 5 minutes",
    },
  });
  response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  return response;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/markets" }, async () => {
    const limit = await rateLimit(req, { namespace: "markets-read", limit: 240, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    if (url.searchParams.get("source") === "public") return publicMarketResponse(req);
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
