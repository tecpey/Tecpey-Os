import { getOrderBook } from "./order-book";
import { getRedisClient, rebuildOrderBook } from "./order-book-store";

/**
 * Rebuilds one market cache from PostgreSQL authority. Redis and both local book
 * representations are cleared first so a stale partial cache cannot survive a
 * command retry or process recovery.
 */
export async function rebuildMarketBookFromAuthority(market: string): Promise<void> {
  const normalized = market.toUpperCase();
  globalThis.tecpeyEngineBooks?.delete(normalized);
  getOrderBook(normalized).clear();

  const redis = getRedisClient();
  if (redis) {
    const orderKeys = await redis.keys("tecpey:order:*");
    const pipeline = redis.pipeline()
      .del(`tecpey:ob:${normalized}:bids`)
      .del(`tecpey:ob:${normalized}:asks`);
    for (const key of orderKeys) {
      const storedMarket = await redis.hget(key, "market");
      if (storedMarket === normalized) pipeline.del(key);
    }
    await pipeline.exec();
  }

  await rebuildOrderBook(normalized);
}
