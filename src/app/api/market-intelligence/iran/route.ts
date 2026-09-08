import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BITYCLE_BASE_URL = "https://api.bitycle.com";
const DEFAULT_GLOBAL_SOURCE = "binance_spot";
const DEFAULT_IRAN_SOURCES = ["nobitex_spot", "ramzinex_spot", "bit24_spot"] as const;
const SOURCE_RE = /^[a-z0-9_]{2,40}$/;
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_LOCAL_SOURCES = 5;

type PriceRow = { name?: unknown; market?: unknown; symbol?: unknown; price?: unknown };

type IranComparison = {
  source: string;
  btcIrt: number;
  usdtIrt: number;
  impliedBtcUsdt: number;
  premiumPercent: number;
};

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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/market-intelligence/iran" }, async () => {
    const limited = await rateLimit(req, {
      namespace: "iran-market-intelligence-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!limited.ok) return apiError("rate_limited", 429);

    const apiKey = process.env.BITYCLE_API_KEY?.trim();
    if (!apiKey) return apiError("market_intelligence_not_configured", 503);

    const globalSource = cleanSource(process.env.BITYCLE_MARKET_SOURCE?.trim() || DEFAULT_GLOBAL_SOURCE)
      || DEFAULT_GLOBAL_SOURCE;
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
        note: "ObservedAt is TecPey fetch time; this endpoint does not claim an upstream exchange timestamp.",
      },
    });
    response.headers.set("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
    return response;
  });
}
