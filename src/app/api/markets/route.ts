import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import {
  applyBitycleMarketFrameAuthority,
  BITYCLE_MARKET_SOURCE,
  BITYCLE_MARKET_SOURCE_URL,
  BITYCLE_PUBLIC_MARKET_FRESHNESS_MS,
  type BitycleMarketFrameAuthority,
  normalizeBitycleCurrencyInfo,
  normalizeBitycleMarketFrames,
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
const BITYCLE_REQUEST_TIMEOUT_MS = 6_000;
const MAX_LOCAL_SOURCES = 5;
const IRAN_MAX_COMPARISON_SKEW_MS = 60_000;
const BITYCLE_MARKETS_CACHE_TTL_MS = 20_000;
const BITYCLE_FRAME_CACHE_TTL_MS = 10_000;

type IranComparison = {
  source: string;
  btcIrt: number;
  usdtIrt: number;
  impliedBtcUsdt: number;
  premiumPercent: number;
  updatedAt: string;
  maxSkewMs: number;
};

type BitycleMarketsSnapshot = {
  data: ReturnType<typeof normalizeCoinGeckoMarkets>;
  observedAt: string;
  source: string;
};

type BitycleFrameCacheEntry = {
  frames: Map<string, BitycleMarketFrameAuthority>;
  expiresAt: number;
};

let bitycleMarketsCache: {
  source: string;
  value: BitycleMarketsSnapshot;
  expiresAt: number;
} | null = null;
let bitycleMarketsInFlight: {
  source: string;
  promise: Promise<BitycleMarketsSnapshot | null>;
} | null = null;
const bitycleFrameCache = new Map<string, BitycleFrameCacheEntry>();
const bitycleFrameInFlight = new Map<string, Promise<Map<string, BitycleMarketFrameAuthority> | null>>();

function boundedInteger(raw: string | null, fallback: number, max: number) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
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

function frameFreshUntil(frame: BitycleMarketFrameAuthority): number {
  return Date.parse(frame.updatedAt) + BITYCLE_PUBLIC_MARKET_FRESHNESS_MS;
}

function earliestFreshUntil(frames: Iterable<BitycleMarketFrameAuthority>): number {
  let earliest = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    const freshUntil = frameFreshUntil(frame);
    if (Number.isFinite(freshUntil)) earliest = Math.min(earliest, freshUntil);
  }
  return earliest;
}

async function fetchBitycleMarketFrames(
  apiKey: string,
  source: string,
): Promise<Map<string, BitycleMarketFrameAuthority> | null> {
  const now = Date.now();
  const cached = bitycleFrameCache.get(source);
  if (cached && cached.expiresAt > now) return cached.frames;
  if (cached) bitycleFrameCache.delete(source);

  const pending = bitycleFrameInFlight.get(source);
  if (pending) return pending;

  const promise = (async () => {
    const params = new URLSearchParams({ source, frame: "24h" });
    let response: Response;
    try {
      response = await fetch(`${BITYCLE_BASE_URL}/api/exchange/source_markets_frame?${params}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(BITYCLE_REQUEST_TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;

    const frames = normalizeBitycleMarketFrames(
      await response.json().catch(() => null),
      Date.now(),
      source,
    );
    if (frames.size === 0) return null;

    const freshnessDeadline = earliestFreshUntil(frames.values());
    const expiresAt = Math.min(Date.now() + BITYCLE_FRAME_CACHE_TTL_MS, freshnessDeadline);
    if (expiresAt > Date.now()) {
      bitycleFrameCache.set(source, { frames, expiresAt });
    }
    return frames;
  })().finally(() => {
    bitycleFrameInFlight.delete(source);
  });

  bitycleFrameInFlight.set(source, promise);
  return promise;
}

function compareLocalMarket(
  source: string,
  globalBtcUsdt: BitycleMarketFrameAuthority,
  btcIrt: BitycleMarketFrameAuthority | undefined,
  usdtIrt: BitycleMarketFrameAuthority | undefined,
): IranComparison | null {
  if (!btcIrt || !usdtIrt) return null;
  if (btcIrt.source !== source || usdtIrt.source !== source) return null;
  if (globalBtcUsdt.price <= 0 || btcIrt.price <= 0 || usdtIrt.price <= 0) return null;

  const timestamps = [globalBtcUsdt.updatedAt, btcIrt.updatedAt, usdtIrt.updatedAt].map(Date.parse);
  if (timestamps.some((timestamp) => !Number.isFinite(timestamp))) return null;
  const oldest = Math.min(...timestamps);
  const newest = Math.max(...timestamps);
  const maxSkewMs = newest - oldest;
  if (maxSkewMs > IRAN_MAX_COMPARISON_SKEW_MS) return null;

  const impliedBtcUsdt = btcIrt.price / usdtIrt.price;
  if (!Number.isFinite(impliedBtcUsdt) || impliedBtcUsdt <= 0) return null;
  const premiumPercent = ((impliedBtcUsdt / globalBtcUsdt.price) - 1) * 100;
  if (!Number.isFinite(premiumPercent)) return null;

  return {
    source,
    btcIrt: btcIrt.price,
    usdtIrt: usdtIrt.price,
    impliedBtcUsdt,
    premiumPercent,
    updatedAt: new Date(oldest).toISOString(),
    maxSkewMs,
  };
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
  return {
    data: sorted.slice(offset, offset + limit),
    total: sorted.length,
    lastPage: Math.max(1, Math.ceil(sorted.length / limit)),
  };
}

async function fetchBitycleMarkets(): Promise<BitycleMarketsSnapshot | null> {
  const apiKey = process.env.BITYCLE_API_KEY?.trim();
  if (!apiKey) return null;

  const source = cleanSource(process.env.BITYCLE_MARKET_SOURCE?.trim() || BITYCLE_DEFAULT_SOURCE);
  if (!source) return null;

  const now = Date.now();
  if (bitycleMarketsCache && bitycleMarketsCache.source === source && bitycleMarketsCache.expiresAt > now) {
    return bitycleMarketsCache.value;
  }
  if (bitycleMarketsInFlight && bitycleMarketsInFlight.source === source) {
    return bitycleMarketsInFlight.promise;
  }

  const promise = (async () => {
    const params = new URLSearchParams({ source });
    const infoRequest = fetch(`${BITYCLE_BASE_URL}/api/exchange/source_currency_info?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(BITYCLE_REQUEST_TIMEOUT_MS),
    }).catch(() => null);

    const [infoResponse, frames] = await Promise.all([
      infoRequest,
      fetchBitycleMarketFrames(apiKey, source),
    ]);
    if (!infoResponse?.ok || !frames || frames.size === 0) return null;

    const observedAt = new Date().toISOString();
    const enriched = normalizeBitycleCurrencyInfo(
      await infoResponse.json().catch(() => null),
      observedAt,
    ).filter((row) => row.priceData?.symbol === `${String(row.symbol || "").toUpperCase()}USDT`);
    const data = applyBitycleMarketFrameAuthority(enriched, frames);
    if (data.length === 0) return null;

    const value = { data, observedAt, source } satisfies BitycleMarketsSnapshot;
    const freshUntil = data.reduce((deadline, row) => {
      const updated = Date.parse(String(row.marketDataUpdatedAt || ""));
      return Number.isFinite(updated)
        ? Math.min(deadline, updated + BITYCLE_PUBLIC_MARKET_FRESHNESS_MS)
        : deadline;
    }, Number.POSITIVE_INFINITY);
    const expiresAt = Math.min(Date.now() + BITYCLE_MARKETS_CACHE_TTL_MS, freshUntil);
    if (expiresAt > Date.now()) {
      bitycleMarketsCache = { source, value, expiresAt };
    }
    return value;
  })().finally(() => {
    if (bitycleMarketsInFlight?.promise === promise) bitycleMarketsInFlight = null;
  });

  bitycleMarketsInFlight = { source, promise };
  return promise;
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
      redirect: "error",
      signal: AbortSignal.timeout(BITYCLE_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!upstream.ok) return null;

  const data = normalizeCoinGeckoMarkets(await upstream.json().catch(() => null));
  return data.length > 0 ? { data, observedAt: new Date().toISOString() } : null;
}

function oldestMarketTimestamp(data: ReturnType<typeof normalizeCoinGeckoMarkets>): string | null {
  let oldest = Number.POSITIVE_INFINITY;
  for (const row of data) {
    const timestamp = Date.parse(String(row.marketDataUpdatedAt || ""));
    if (Number.isFinite(timestamp)) oldest = Math.min(oldest, timestamp);
  }
  return Number.isFinite(oldest) ? new Date(oldest).toISOString() : null;
}

async function publicMarketResponse(request: NextRequest) {
  const page = boundedInteger(request.nextUrl.searchParams.get("page"), 1, MAX_PUBLIC_PAGE);
  const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 20, MAX_PUBLIC_LIMIT);
  const query = (request.nextUrl.searchParams.get("search") || "").trim().toLowerCase().slice(0, 40);

  const bitycle = await fetchBitycleMarkets();
  if (bitycle) {
    const paged = filterAndPagePublicMarkets(bitycle.data, query, page, limit);
    if (paged.data.length > 0 || query) {
      const response = apiOk({
        data: paged.data,
        meta: { current_page: page, last_page: paged.lastPage, total: paged.total },
        provenance: {
          provider: BITYCLE_MARKET_SOURCE,
          providerUrl: BITYCLE_MARKET_SOURCE_URL,
          upstreamSource: bitycle.source,
          currency: "USDT",
          fetchedAt: bitycle.observedAt,
          upstreamUpdatedAt: oldestMarketTimestamp(paged.data),
          freshness: "Bitycle 24h market frames verified by upstream updated_at",
          fallback: false,
        },
      });
      response.headers.set("Cache-Control", "public, s-maxage=10, stale-while-revalidate=10");
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

  const sources = [globalSource, ...localSources];
  const frameSets = await Promise.all(sources.map((source) => fetchBitycleMarketFrames(apiKey, source)));
  const globalBtcUsdt = frameSets[0]?.get("BTCUSDT");
  if (!globalBtcUsdt || globalBtcUsdt.source !== globalSource) {
    return apiError("global_market_reference_unavailable", 503);
  }

  const comparisons = localSources.map((source, index) => {
    const frames = frameSets[index + 1];
    return compareLocalMarket(
      source,
      globalBtcUsdt,
      frames?.get("BTCIRT"),
      frames?.get("USDTIRT"),
    );
  }).filter((row): row is IranComparison => row !== null);

  if (comparisons.length === 0) return apiError("iran_market_intelligence_unavailable", 503);

  comparisons.sort((a, b) => a.premiumPercent - b.premiumPercent);
  const observedAt = new Date().toISOString();
  const oldestUpstreamUpdatedAt = new Date(Math.min(
    Date.parse(globalBtcUsdt.updatedAt),
    ...comparisons.map((row) => Date.parse(row.updatedAt)),
  )).toISOString();
  const response = apiOk({
    reference: {
      source: globalSource,
      market: "BTCUSDT",
      price: globalBtcUsdt.price,
      updatedAt: globalBtcUsdt.updatedAt,
    },
    local: comparisons,
    summary: {
      lowestPremiumPercent: comparisons[0].premiumPercent,
      highestPremiumPercent: comparisons[comparisons.length - 1].premiumPercent,
      sourcesAvailable: comparisons.length,
      sourcesRequested: localSources.length,
      maxComparisonSkewMs: Math.max(...comparisons.map((row) => row.maxSkewMs)),
    },
    provenance: {
      provider: "Bitycle",
      method: "BTCIRT / USDTIRT compared with global BTCUSDT",
      observedAt,
      upstreamUpdatedAt: oldestUpstreamUpdatedAt,
      timestampAuthority: "source_markets_frame.updated_at",
      note: "TecPey rejects stale market frames and comparisons whose global/local timestamps differ by more than 60 seconds.",
    },
  });
  response.headers.set("Cache-Control", "public, s-maxage=10, stale-while-revalidate=10");
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
