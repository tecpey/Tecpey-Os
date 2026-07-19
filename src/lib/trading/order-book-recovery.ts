import { getOrderBook } from "./order-book";
import { getRedisClient, rebuildOrderBook } from "./order-book-store";

/**
 * Rebuilds one market cache from PostgreSQL authority. The Redis price queues
 * and both local book representations are cleared first so stale partial cache
 * state cannot survive a command retry. Per-order Redis hashes are non-authority
 * hints and expire naturally when the corresponding queues are rebuilt.
 */
export async function rebuildMarketBookFromAuthority(market: string): Promise<void> {
  const normalized = market.toUpperCase();
  globalThis.tecpeyEngineBooks?.delete(normalized);
  getOrderBook(normalized).clear();

  const redis = getRedisClient();
  if (redis) {
    await redis
      .pipeline()
      .del(`tecpey:ob:${normalized}:bids`)
      .del(`tecpey:ob:${normalized}:asks`)
      .exec();
  }

  await rebuildOrderBook(normalized);
}
