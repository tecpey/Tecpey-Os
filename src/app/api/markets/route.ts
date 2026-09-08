import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  BITYCLE_MARKET_SOURCE,
  BITYCLE_MARKET_SOURCE_URL,
  normalizeBitycleCurrencyInfo,
  normalizeCoinGeckoMarkets,
  PUBLIC_MARKET_SOURCE,
  PUBLIC_MARKET_SOURCE_URL,
} from "@/lib/public-market-data";
import { listMarkets, getMarket } from "@/lib/trading/market-service";

export const dynamic = "force-dynamic";

const MAX_PUBLIC_PAGE = 10;
const MAX_PUBLIC_LIMIT = 100;
const BITYCLE_DEFAULT_SOURCE = "binance_spot";

function boundedInteger(raw: string | null, fallback: number, max: number) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function filterAndPagePublicMarkets(
  data: ReturnType<typeof normalizeCoinGeckoMarkets>,
  query: string,
  page: number,
  limit: number,
) {
  const filtered = query
    ? data.filter((coin) =>
        String(coin.symbol || "").toLowerCase().includes(query)
        || String(coin.name || "").toLowerCase().includes(query),
      )
    : data;
  const sorted = [...filtered].sort((a, b) => {
    const left = Number(a.rank ?? Number.MAX_SAFE_INTEGER);
    const right = Number(b.rank ?? Number.MAX_SAFE_INTEGER);
    return left - right;
  });
  const offset = (page - 1) * limit;
  return sorted.slice(offset, offset + limit);
}

async function fetchBitycleMarkets() {
  const apiKey = process.env.BITYCLE_API_KEY?.trim();
  if (!apiKey) return null;

  const source = process.env.BITYCLE_MARKET_SOURCE?.trim() || BITYCLE_DEFAULT_SOURCE;
  const params = new URLSearchParams({ source });
  let upstream: Response;
  try {
    upstream = await fetch(`https://api.bitycle.com/api/exchange/source_currency_info?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    return null;
  }
  if (!upstream.ok) return null;

  const observedAt = new Date().toISOString();
  const data = normalizeBitycleCurrencyInfo(await upstream.json().catch(() => null), observedAt);
  return data.length > 0 ? { data, observedAt, source } : null;
}

async function fetchCoinGeckoMarkets(page: number, limit: number) {
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
    return null;
  }
  if (!upstream.ok) return null;

  const data = normalizeCoinGeckoMarkets(await upstream.json().catch(() => null));
  return data.length > 0 ? { data, observedAt: new Date().toISOString() } : null;
}

async function publicMarketResponse(request: NextRequest) {
  const page = boundedInteger(request.nextUrl.searchParams.get("page"), 1, MAX_PUBLIC_PAGE);
  const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 20, MAX_PUBLIC_LIMIT);
  const query = (request.nextUrl.searchParams.get("search") || "").trim().toLowerCase().slice(0, 40);

  const bitycle = await fetchBitycleMarkets();
  if (bitycle) {
    const data = filterAndPagePublicMarkets(bitycle.data, query, page, limit);
    if (data.length > 0 || query) {
      const response = apiOk({
        data,
        meta: { current_page: page, last_page: data.length === limit ? page + 1 : page },
        provenance: {
          provider: BITYCLE_MARKET_SOURCE,
          providerUrl: BITYCLE_MARKET_SOURCE_URL,
          upstreamSource: bitycle.source,
          currency: "USDT",
          fetchedAt: bitycle.observedAt,
          freshness: "live Bitycle business market feed",
          fallback: false,
        },
      });
      response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
      return response;
    }
  }

  const coinGecko = await fetchCoinGeckoMarkets(page, limit);
  if (!coinGecko) return apiError("market_data_unavailable", 503);

  const data = query
    ? coinGecko.data.filter((coin) =>
        String(coin.symbol || "").toLowerCase().includes(query)
        || String(coin.name || "").toLowerCase().includes(query),
      )
    : coinGecko.data;
  if (data.length === 0 && !query) return apiError("market_data_stale_or_empty", 503);

  const response = apiOk({
    data,
    meta: { current_page: page, last_page: data.length === limit ? page + 1 : page },
    provenance: {
      provider: PUBLIC_MARKET_SOURCE,
      providerUrl: PUBLIC_MARKET_SOURCE_URL,
      currency: "USD",
      fetchedAt: coinGecko.observedAt,
      freshness: "upstream timestamps under 5 minutes",
      fallback: Boolean(process.env.BITYCLE_API_KEY?.trim()),
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
