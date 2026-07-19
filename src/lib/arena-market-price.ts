import Decimal from "decimal.js";
import type { ArenaPriceSnapshot } from "./trading-arena-execution-v2";

const DEFAULT_BINANCE_FEED =
  "https://api.binance.com/api/v3/ticker/price?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22%5D";
const CACHE_TTL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 2_500;

let cached: { value: ArenaPriceSnapshot; expiresAt: number } | null = null;
let inFlight: Promise<ArenaPriceSnapshot> | null = null;

type BinanceTicker = { symbol?: unknown; price?: unknown };

export class ArenaMarketPriceError extends Error {
  constructor(message = "arena_price_feed_unavailable") {
    super(message);
    this.name = "ArenaMarketPriceError";
  }
}

function decimalPrice(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    const price = new Decimal(value);
    if (!price.isFinite() || price.lte(0) || price.gte("1000000000")) return null;
    return price.toDecimalPlaces(10, Decimal.ROUND_DOWN).toFixed(10);
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0;
}

function feedUrl(): { url: URL; source: string; token: string | null } {
  const configured = process.env.ARENA_PRICE_FEED_URL?.trim();
  const production = process.env.NODE_ENV === "production";
  const allowPublic = process.env.ARENA_ALLOW_PUBLIC_BINANCE_PRICE_FEED === "true";
  if (!configured && production && !allowPublic) {
    throw new ArenaMarketPriceError("arena_price_feed_not_configured");
  }

  let url: URL;
  try {
    url = new URL(configured || DEFAULT_BINANCE_FEED);
  } catch {
    throw new ArenaMarketPriceError("arena_price_feed_invalid_url");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "::1" ||
    isPrivateIpv4(hostname)
  ) {
    throw new ArenaMarketPriceError("arena_price_feed_url_not_allowed");
  }

  return {
    url,
    source: configured ? "configured_https_feed" : "binance_spot_public",
    token: configured ? process.env.ARENA_PRICE_FEED_TOKEN?.trim() || null : null,
  };
}

export function parseArenaMarketPricePayload(
  payload: unknown,
  source = "test_feed",
  observedAt = new Date().toISOString(),
): ArenaPriceSnapshot {
  let BTC: string | null = null;
  let ETH: string | null = null;

  if (Array.isArray(payload)) {
    for (const item of payload as BinanceTicker[]) {
      const symbol = typeof item?.symbol === "string" ? item.symbol.toUpperCase() : "";
      if (symbol === "BTCUSDT") BTC = decimalPrice(item.price);
      if (symbol === "ETHUSDT") ETH = decimalPrice(item.price);
    }
  } else if (payload && typeof payload === "object") {
    const raw = payload as { prices?: { BTC?: unknown; ETH?: unknown }; observedAt?: unknown };
    BTC = decimalPrice(raw.prices?.BTC);
    ETH = decimalPrice(raw.prices?.ETH);
    if (typeof raw.observedAt === "string" && Number.isFinite(Date.parse(raw.observedAt))) {
      observedAt = new Date(raw.observedAt).toISOString();
    }
  }

  if (!BTC || !ETH) throw new ArenaMarketPriceError("arena_price_feed_invalid_payload");
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new ArenaMarketPriceError("arena_price_feed_invalid_timestamp");
  }

  return {
    prices: { BTC, ETH },
    source: source.slice(0, 120),
    observedAt: new Date(observedAt).toISOString(),
  };
}

async function requestSnapshot(): Promise<ArenaPriceSnapshot> {
  const config = feedUrl();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "GET",
      cache: "no-store",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ArenaMarketPriceError();
  }
  if (!response.ok) {
    throw new ArenaMarketPriceError(`arena_price_feed_http_${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ArenaMarketPriceError("arena_price_feed_invalid_json");
  }
  return parseArenaMarketPricePayload(payload, config.source);
}

export async function getArenaMarketPriceSnapshot(now = Date.now()): Promise<ArenaPriceSnapshot> {
  if (cached && cached.expiresAt > now) return cached.value;
  if (inFlight) return inFlight;

  inFlight = requestSnapshot()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
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
