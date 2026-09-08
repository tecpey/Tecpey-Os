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
const BITYCLE_BASE_URL = "https://api.bitycle.com";
const DEFAULT_IRAN_SOURCES = ["nobitex_spot", "ramzinex_spot", "bit24_spot"] as const;
const SOURCE_RE = /^[a-z0-9_]{2,40}$/;
const IRAN_REQUEST_TIMEOUT_MS = 4_000;
const MAX_LOCAL_SOURCES = 5;

type PriceRow = { name?: unknown; market?: unknown; symbol?: unknown; price?: unknown };

type IranComparison = {
  source: string;
  btcIrt: number;
  usdtIrt: number;
  impliedBtcUsdt: number;
  premiumPercent: number;
};

function boundedInteger(raw: string | null, fallback: number, max: number) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanSource(value: string): string | null {
  const source = value.trim().toLowerCase();
  return SOURCE_RE.test(source) ? source : null;
}

function configuredIranSources(): string[] {
  const configured = process.env.BITYCLE_IRAN_SOURCES?.trim();
  const values = configured ? configured.split(",") : [...DEFAULT_IRAN_SOURCES];
  const unique = new Set<string>();
  for (const value of values) {
    const source = cleanSource(value);
    if (source) unique.add(source);
    if (unique.size >= MAX_LOCAL_SOURCES) break;
  }
  return [...unique];
}

function extractMarketPrice(payload: unknown, market: string): number | null {
  const data = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data?: unknown }).data
    : payload;
  const target = market.toUpperCase();

  if (Array.isArray(data)) {
    for (const entry of data as PriceRow[]) {
      if (!entry || typeof entry !== "object") continue;
      const name = String(entry.name ?? entry.market ?? entry.symbol ?? "").trim().toUpperCase();
      if (name !== target) continue;
      return finitePositive(entry.price);
    }
    return null;
  }

  if (data && typeof data === "object") {
    const row = data as PriceRow;
    const name = String(row.name ?? row.market ?? row.symbol ?? target).trim().toUpperCase();
    if (name !== target) return null;
    return finitePositive(row.price);
  }

  return null;
}

async function fetchMarketPrice(apiKey: string, source: string, market: string): Promise<number | null> {
  const params = new URLSearchParams({ source, market });
  try {
    const response = await fetch(`${BITYCLE_BASE_URL}/api/exchange/source_market_price?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(IRAN_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return extractMarketPrice(await response.json().catch(() => null), market);
  } catch {
    return null;
  }
}

function compareLocalMarket(
  source: string,
  globalBtcUsdt: number,
  btcIrt: number | null,
  usdtIrt: number | null,
): IranComparison | null {
  if (!btcIrt || !usdtIrt || globalBtcUsdt <= 0) return null;
  const impliedBtcUsdt = btcIrt / usdtIrt;
  if (!Number.isFinite(impliedBtcUsdt) || impliedBtcUsdt <= 0) return null;
  const premiumPercent = ((impliedBtcUsdt / globalBtcUsdt) - 1) * 100;
  if (!Number.isFinite(premiumPercent)) return null;
  return { source, btcIrt, usdtIrt, impliedBtcUsdt, premiumPercent };
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
    upstream = await fetch(`${BITYCLE_BASE_URL}/api/exchange/source_currency_info?${params}`, {
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

async function iranMarketResponse() {
  const apiKey = process.env.BITYCLE_API_KEY?.trim();
  if (!apiKey) return apiError("market_intelligence_not_configured", 503);

  const globalSource = cleanSource(process.env.BITYCLE_MARKET_SOURCE?.trim() || BITYCLE_DEFAULT_SOURCE)
    || BITYCLE_DEFAULT_SOURCE;
  const localSources = configuredIranSources();
  if (localSources.length === 0) return apiError("iran_market_sources_not_configured", 503);

  const globalBtcUsdt = await fetchMarketPrice(apiKey, globalSource, "BTCUSDT");
  if (!globalBtcUsdt) return apiError("global_market_reference_unavailable", 503);

  const comparisons = (await Promise.all(localSources.map(async (source) => {
    const [btcIrt, usdtIrt] = await Promise.all([
      fetchMarketPrice(apiKey, source, "BTCIRT"),
      fetchMarketPrice(apiKey, source, "USDTIRT"),
    ]);
    return compareLocalMarket(source, globalBtcUsdt, btcIrt, usdtIrt);
  }))).filter((row): row is IranComparison => row !== null);

  if (comparisons.length === 0) return apiError("iran_market_intelligence_unavailable", 503);

  comparisons.sort((a, b) => a.premiumPercent - b.premiumPercent);
  const observedAt = new Date().toISOString();
  const response = apiOk({
    reference: {
      source: globalSource,
      market: "BTCUSDT",
      price: globalBtcUsdt,
    },
    local: comparisons,
    summary: {
      lowestPremiumPercent: comparisons[0].premiumPercent,
      highestPremiumPercent: comparisons[comparisons.length - 1].premiumPercent,
      sourcesAvailable: comparisons.length,
      sourcesRequested: localSources.length,
    },
    provenance: {
      provider: "Bitycle",
      method: "BTCIRT / USDTIRT compared with global BTCUSDT",
      observedAt,
      note: "ObservedAt is TecPey fetch time; this response does not claim an upstream exchange timestamp.",
    },
  });
  response.headers.set("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
  return response;
}

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/markets" }, async () => {
    const limit = await rateLimit(req, { namespace: "markets-read", limit: 240, windowMs: 60_000 });
    if (!limit.ok) return apiError("rate_limited", 429);

    const url = new URL(req.url);
    const source = url.searchParams.get("source");
    if (source === "public") return publicMarketResponse(req);
    if (source === "iran") return iranMarketResponse();
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
