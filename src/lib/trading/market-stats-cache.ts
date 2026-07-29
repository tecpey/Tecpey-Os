import { getMarketStats, type MarketStats } from "./market-stats-service";
import { getOrderBook } from "./order-book";

// ── Cache entry ───────────────────────────────────────────────────────────────

type CacheEntry = {
  stats: MarketStats;
  expiresAt: number;
};

const TTL_MS = 5_000;

declare global {
  var tecpeyStatsCache: Map<string, CacheEntry> | undefined;
}

function getCache(): Map<string, CacheEntry> {
  if (!globalThis.tecpeyStatsCache) globalThis.tecpeyStatsCache = new Map();
  return globalThis.tecpeyStatsCache;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getCachedMarketStats(market: string): Promise<MarketStats | null> {
  const sym = market.toUpperCase();
  const cache = getCache();
  const entry = cache.get(sym);
  if (entry && entry.expiresAt > Date.now()) return entry.stats;

  const stats = await getMarketStats(sym);
  if (stats) {
    cache.set(sym, { stats, expiresAt: Date.now() + TTL_MS });
  }
  return stats;
}

export function invalidateStatsCache(market: string): void {
  getCache().delete(market.toUpperCase());
}

export async function buildTickerPayload(market: string) {
  const sym = market.toUpperCase();
  const [stats, book] = await Promise.all([
    getCachedMarketStats(sym),
    Promise.resolve(getOrderBook(sym)),
  ]);
  const snap = book.snapshot(1);
  return {
    market: sym,
    lastPrice: stats?.lastPrice ?? null,
    priceChange24h: stats?.priceChange24h ?? null,
    priceChangePct24h: stats?.priceChangePct24h ?? null,
    highPrice24h: stats?.highPrice24h ?? null,
    lowPrice24h: stats?.lowPrice24h ?? null,
    baseVolume24h: stats?.baseVolume24h ?? "0",
    quoteVolume24h: stats?.quoteVolume24h ?? "0",
    vwap24h: stats?.vwap24h ?? null,
    tradeCount24h: stats?.tradeCount24h ?? 0,
    bestBid: snap.bids[0]?.price ?? null,
    bestAsk: snap.asks[0]?.price ?? null,
  };
}
