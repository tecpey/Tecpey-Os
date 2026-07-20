import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { OrderBookSnapshot, OrderSide } from "./types";
import { getOrderBook } from "./order-book";
import {
  canonicalMatchingInput,
  crossesLimit,
  decimalAdd,
  isZeroAmount,
} from "./matching-financials";
import { D } from "./decimal";
import type { Redis } from "ioredis";

// Financial values in the matching cache are canonical strings. PostgreSQL is
// authoritative; Redis and in-memory books are rebuildable projections.
export type EngineOrder = {
  orderId: string;
  userId: string;
  market: string;
  side: OrderSide;
  pricePerUnit: string;
  originalQty: string;
  remaining: string;
  ts: number;
};

type EngineBook = {
  bids: Map<string, EngineOrder[]>;
  asks: Map<string, EngineOrder[]>;
  index: Map<string, { side: OrderSide; priceKey: string }>;
};

export type PriceLevelEntry = {
  price: string;
  priceKey: string;
  orders: ReadonlyArray<EngineOrder>;
};

export interface OrderBookStore {
  insert(market: string, entry: EngineOrder): void;
  findAndRemove(orderId: string): EngineOrder | null;
  getLevels(market: string, side: OrderSide): PriceLevelEntry[];
  getFOKVolume(
    market: string,
    takerSide: OrderSide,
    limitPrice: string | null,
  ): string;
  updateMakerRemaining(orderId: string, newRemaining: string): void;
  snapshot(market: string, depth?: number): OrderBookSnapshot;
  validate(): void;
}

export function pkStr(price: string): string {
  const canonical = canonicalMatchingInput(price, "book_price");
  if (!D(canonical).isPositive()) throw new Error("invalid_book_price");
  return canonical;
}

function normalizeEntry(entry: EngineOrder): EngineOrder {
  const pricePerUnit = pkStr(entry.pricePerUnit);
  const originalQty = canonicalMatchingInput(entry.originalQty, "book_original_quantity");
  const remaining = canonicalMatchingInput(entry.remaining, "book_remaining_quantity");
  if (!D(originalQty).isPositive() || D(remaining).isNegative()) {
    throw new Error("invalid_book_quantity");
  }
  if (!Number.isSafeInteger(entry.ts) || entry.ts < 0) {
    throw new Error("invalid_book_priority_time");
  }
  return {
    ...entry,
    market: entry.market.toUpperCase(),
    pricePerUnit,
    originalQty,
    remaining,
  };
}

declare global {
  var tecpeyEngineBooks: Map<string, EngineBook> | undefined;
}

class InMemoryOrderBookStore implements OrderBookStore {
  private getBook(market: string): EngineBook {
    if (!globalThis.tecpeyEngineBooks) {
      globalThis.tecpeyEngineBooks = new Map();
    }
    const key = market.toUpperCase();
    let book = globalThis.tecpeyEngineBooks.get(key);
    if (!book) {
      book = { bids: new Map(), asks: new Map(), index: new Map() };
      globalThis.tecpeyEngineBooks.set(key, book);
    }
    return book;
  }

  insert(market: string, rawEntry: EngineOrder): void {
    const entry = normalizeEntry({ ...rawEntry, market });
    if (isZeroAmount(entry.remaining)) return;
    const book = this.getBook(entry.market);
    const map = entry.side === "buy" ? book.bids : book.asks;
    const key = entry.pricePerUnit;
    const level = map.get(key);
    if (level) {
      if (!level.some((existing) => existing.orderId === entry.orderId)) {
        level.push(entry);
        level.sort((left, right) =>
          left.ts !== right.ts
            ? left.ts - right.ts
            : left.orderId.localeCompare(right.orderId),
        );
      }
    } else {
      map.set(key, [entry]);
    }
    book.index.set(entry.orderId, { side: entry.side, priceKey: key });
  }

  findAndRemove(orderId: string): EngineOrder | null {
    if (!globalThis.tecpeyEngineBooks) return null;
    for (const book of globalThis.tecpeyEngineBooks.values()) {
      const location = book.index.get(orderId);
      if (!location) continue;
      const map = location.side === "buy" ? book.bids : book.asks;
      const level = map.get(location.priceKey);
      if (!level) continue;
      const index = level.findIndex((entry) => entry.orderId === orderId);
      if (index === -1) continue;
      const [removed] = level.splice(index, 1);
      if (level.length === 0) map.delete(location.priceKey);
      book.index.delete(orderId);
      return removed;
    }
    return null;
  }

  getLevels(market: string, side: OrderSide): PriceLevelEntry[] {
    const book = this.getBook(market);
    const map = side === "buy" ? book.bids : book.asks;
    const descending = side === "buy";
    return Array.from(map.entries())
      .filter(([, queue]) => queue.length > 0)
      .sort(([left], [right]) =>
        descending ? D(right).cmp(D(left)) : D(left).cmp(D(right)),
      )
      .map(([priceKey, orders]) => ({
        price: priceKey,
        priceKey,
        orders,
      }));
  }

  getFOKVolume(
    market: string,
    takerSide: OrderSide,
    limitPrice: string | null,
  ): string {
    const oppositeSide: OrderSide = takerSide === "buy" ? "sell" : "buy";
    let total = "0.0000000000";
    for (const level of this.getLevels(market, oppositeSide)) {
      if (!crossesLimit({
        takerSide,
        takerLimit: limitPrice,
        makerPrice: level.price,
      })) {
        break;
      }
      for (const order of level.orders) {
        total = decimalAdd(total, order.remaining);
      }
    }
    return total;
  }

  updateMakerRemaining(orderId: string, rawRemaining: string): void {
    if (!globalThis.tecpeyEngineBooks) return;
    const newRemaining = canonicalMatchingInput(
      rawRemaining,
      "book_remaining_quantity",
    );
    for (const book of globalThis.tecpeyEngineBooks.values()) {
      const location = book.index.get(orderId);
      if (!location) continue;
      const map = location.side === "buy" ? book.bids : book.asks;
      const level = map.get(location.priceKey);
      if (!level) continue;
      const entry = level.find((candidate) => candidate.orderId === orderId);
      if (!entry) continue;
      if (isZeroAmount(newRemaining)) {
        const index = level.indexOf(entry);
        if (index !== -1) level.splice(index, 1);
        if (level.length === 0) map.delete(location.priceKey);
        book.index.delete(orderId);
      } else {
        entry.remaining = newRemaining;
      }
      return;
    }
  }

  snapshot(market: string, depth = 20): OrderBookSnapshot {
    return getOrderBook(market).snapshot(depth);
  }

  validate(): void {
    // In-memory projection is always available.
  }
}

class RedisOrderBookStore extends InMemoryOrderBookStore {
  constructor(private readonly redis: Redis) {
    super();
  }

  override insert(market: string, rawEntry: EngineOrder): void {
    const entry = normalizeEntry({ ...rawEntry, market });
    super.insert(market, entry);
    const symbol = entry.market;
    const key = entry.side === "buy"
      ? `tecpey:ob:${symbol}:bids`
      : `tecpey:ob:${symbol}:asks`;
    const member = JSON.stringify(entry);
    void this.redis.pipeline()
      // Redis score is projection ordering only. Exact matching reads priceKey.
      .zadd(key, entry.pricePerUnit, member)
      .hset(`tecpey:order:${entry.orderId}`, {
        market: symbol,
        side: entry.side,
        priceKey: entry.pricePerUnit,
        remaining: entry.remaining,
        member,
      })
      .exec()
      .catch((error) => logger.warn("[order-book-store] Redis insert failed", { error }));
  }

  override findAndRemove(orderId: string): EngineOrder | null {
    const removed = super.findAndRemove(orderId);
    if (!removed) return null;
    const key = removed.side === "buy"
      ? `tecpey:ob:${removed.market}:bids`
      : `tecpey:ob:${removed.market}:asks`;
    const member = JSON.stringify(removed);
    void this.redis.pipeline()
      .zrem(key, member)
      .del(`tecpey:order:${orderId}`)
      .exec()
      .catch((error) => logger.warn("[order-book-store] Redis remove failed", { error }));
    return removed;
  }

  override updateMakerRemaining(orderId: string, rawRemaining: string): void {
    const oldMember = this.getMemberForUpdate(orderId);
    const newRemaining = canonicalMatchingInput(
      rawRemaining,
      "book_remaining_quantity",
    );
    super.updateMakerRemaining(orderId, newRemaining);
    if (!oldMember) return;

    const { entry, key, member } = oldMember;
    if (isZeroAmount(newRemaining)) {
      void this.redis.pipeline()
        .zrem(key, member)
        .del(`tecpey:order:${orderId}`)
        .exec()
        .catch((error) => logger.warn("[order-book-store] Redis remove failed", { error }));
    } else {
      const updated = { ...entry, remaining: newRemaining };
      const updatedMember = JSON.stringify(updated);
      void this.redis.pipeline()
        .zrem(key, member)
        .zadd(key, entry.pricePerUnit, updatedMember)
        .hset(`tecpey:order:${orderId}`, {
          remaining: newRemaining,
          member: updatedMember,
        })
        .exec()
        .catch((error) => logger.warn("[order-book-store] Redis update failed", { error }));
    }
  }

  private getMemberForUpdate(
    orderId: string,
  ): { entry: EngineOrder; key: string; member: string } | null {
    if (!globalThis.tecpeyEngineBooks) return null;
    for (const book of globalThis.tecpeyEngineBooks.values()) {
      const location = book.index.get(orderId);
      if (!location) continue;
      const map = location.side === "buy" ? book.bids : book.asks;
      const level = map.get(location.priceKey);
      const entry = level?.find((candidate) => candidate.orderId === orderId);
      if (!entry) continue;
      const key = `tecpey:ob:${entry.market}:${location.side === "buy" ? "bids" : "asks"}`;
      return { entry, key, member: JSON.stringify(entry) };
    }
    return null;
  }

  override validate(): void {
    void this.redis.ping()
      .then(() => logger.info("[order-book-store] Redis connected"))
      .catch((error) => {
        if (process.env.NODE_ENV === "production") {
          logger.error("[order-book-store] Redis PING failed in production", { error });
        } else {
          logger.warn("[order-book-store] Redis unavailable; in-memory projection remains", { error });
        }
      });
  }

  async warmFromRedis(market: string): Promise<number> {
    const symbol = market.toUpperCase();
    let count = 0;
    try {
      const [bids, asks] = await Promise.all([
        this.redis.zrange(`tecpey:ob:${symbol}:bids`, 0, -1),
        this.redis.zrange(`tecpey:ob:${symbol}:asks`, 0, -1),
      ]);
      const displayBook = getOrderBook(symbol);
      for (const member of [...bids, ...asks]) {
        try {
          const entry = normalizeEntry(JSON.parse(member) as EngineOrder);
          super.insert(entry.market, entry);
          displayBook.insert(entry.side, entry.pricePerUnit, entry.remaining);
          count += 1;
        } catch {
          // Ignore malformed projection members; PostgreSQL rebuild remains available.
        }
      }
    } catch (error) {
      logger.warn("[order-book-store] Redis warm-start failed", { error });
      return 0;
    }
    logger.info("[order-book-store] warmed from Redis", { market: symbol, orders: count });
    return count;
  }
}

declare global {
  var tecpeyOrderBookStore: OrderBookStore | undefined;
  var tecpeyRedisClient: Redis | undefined;
}

function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("ioredis") as typeof import("ioredis");
    if (!globalThis.tecpeyRedisClient) {
      globalThis.tecpeyRedisClient = new Redis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      globalThis.tecpeyRedisClient.on("error", (error) =>
        logger.warn("[redis] connection error", { error }),
      );
    }
    return globalThis.tecpeyRedisClient;
  } catch {
    logger.warn("[order-book-store] ioredis unavailable despite REDIS_URL");
    return null;
  }
}

export function getOrderBookStore(): OrderBookStore {
  if (!globalThis.tecpeyOrderBookStore) {
    const redis = createRedisClient();
    globalThis.tecpeyOrderBookStore = redis
      ? new RedisOrderBookStore(redis)
      : new InMemoryOrderBookStore();
    globalThis.tecpeyOrderBookStore.validate();
  }
  return globalThis.tecpeyOrderBookStore;
}

export function getRedisClient(): Redis | undefined {
  return globalThis.tecpeyRedisClient;
}

export async function rebuildOrderBook(market: string): Promise<void> {
  const symbol = market.toUpperCase();
  const store = getOrderBookStore();
  if (store instanceof RedisOrderBookStore) {
    const count = await store.warmFromRedis(symbol);
    if (count > 0) return;
  }

  const result = await withDb(async (client) => {
    const rows = await client.query<{
      id: string;
      user_id: string;
      side: OrderSide;
      price: string | null;
      quantity: string;
      remaining_quantity: string;
      created_at: Date;
    }>(
      `SELECT id::text, user_id, side, price::text, quantity::text,
              remaining_quantity::text, created_at
         FROM orders
        WHERE market = $1
          AND status IN ('NEW', 'PARTIALLY_FILLED')
          AND type = 'limit'
        ORDER BY created_at ASC, id ASC`,
      [symbol],
    );
    return rows.rows;
  });
  if (!result.enabled || !result.value?.length) return;

  const displayBook = getOrderBook(symbol);
  let rebuilt = 0;
  for (const row of result.value) {
    if (!row.price) continue;
    const entry: EngineOrder = normalizeEntry({
      orderId: row.id,
      userId: row.user_id,
      market: symbol,
      side: row.side,
      pricePerUnit: row.price,
      originalQty: row.quantity,
      remaining: row.remaining_quantity,
      ts: row.created_at.getTime(),
    });
    store.insert(symbol, entry);
    displayBook.insert(entry.side, entry.pricePerUnit, entry.remaining);
    rebuilt += 1;
  }
  logger.info("[order-book-store] rebuilt book from DB", { market: symbol, orders: rebuilt });
}
