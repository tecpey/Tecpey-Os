import type { Asset } from "@/lib/trading-arena";

export type ArenaMarketPrices = Record<Asset, number>;

export type ArenaMarketPriceSnapshot = {
  prices: ArenaMarketPrices;
  source: "binance_spot_public" | "configured_https_feed";
  observedAt: string;
};

type PriceTicker = { symbol?: unknown; price?: unknown };

const DEFAULT_PRICE_FEED_URL =
  "https://api.binance.com/api/v3/ticker/price?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22%5D";
const CACHE_TTL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 2_500;

let cached: { snapshot: ArenaMarketPriceSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<ArenaMarketPriceSnapshot> | null = null;

export class ArenaMarketPriceError extends Error {
  constructor(message = "arena_price_feed_unavailable") {
    super(message);
    this.name = "ArenaMarketPriceError";
  }
}

function positivePrice(value: unknown): number | null {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 && price < 100_000_000 ? price : null;
}

export function parseArenaPriceFeed(payload: unknown): ArenaMarketPrices {
  if (!Array.isArray(payload)) throw new ArenaMarketPriceError("arena_price_feed_invalid_shape");

  const bySymbol = new Map<string, number>();
  for (const item of payload as PriceTicker[]) {
    const symbol = typeof item?.symbol === "string" ? item.symbol.toUpperCase() : "";
    const price = positivePrice(item?.price);
    if (price) bySymbol.set(symbol, price);
  }

  const BTC = bySymbol.get("BTCUSDT");
  const ETH = bySymbol.get("ETHUSDT");
  if (!BTC || !ETH) throw new ArenaMarketPriceError("arena_price_feed_missing_symbols");
  return { BTC, ETH };
}

function priceFeedUrl(): URL {
  const configured = process.env.ARENA_PRICE_FEED_URL?.trim();
  let url: URL;
  try {
    url = new URL(configured || DEFAULT_PRICE_FEED_URL);
  } catch {
    throw new ArenaMarketPriceError("arena_price_feed_invalid_url");
  }
  if (url.protocol !== "https:") {
    throw new ArenaMarketPriceError("arena_price_feed_requires_https");
  }
  return url;
}

async function requestPriceSnapshot(): Promise<ArenaMarketPriceSnapshot> {
  const url = priceFeedUrl();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ArenaMarketPriceError();
  }
  if (!response.ok) throw new ArenaMarketPriceError(`arena_price_feed_http_${response.status}`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ArenaMarketPriceError("arena_price_feed_invalid_json");
  }

  return {
    prices: parseArenaPriceFeed(payload),
    source: process.env.ARENA_PRICE_FEED_URL ? "configured_https_feed" : "binance_spot_public",
    observedAt: new Date().toISOString(),
  };
}

export async function getArenaMarketPrices(now = Date.now()): Promise<ArenaMarketPriceSnapshot> {
  if (cached && cached.expiresAt > now) return cached.snapshot;
  if (inFlight) return inFlight;

  inFlight = requestPriceSnapshot()
    .then((snapshot) => {
      cached = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function clearArenaMarketPriceCacheForTests(): void {
  cached = null;
  inFlight = null;
}
