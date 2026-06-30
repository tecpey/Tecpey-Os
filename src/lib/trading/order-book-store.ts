import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { OrderBookSnapshot, OrderSide } from "./types";
import { getOrderBook } from "./order-book";
import type { Redis } from "ioredis";

// ── EngineOrder ───────────────────────────────────────────────────────────────
//
// Tracks a single resting order inside the engine book. Separate from the
// display OrderBook (which holds aggregated price levels).

export type EngineOrder = {
  orderId: string;
  userId: string;
  market: string;
  side: OrderSide;
  pricePerUnit: number;  // 0 for market orders
  originalQty: number;   // original accepted qty — used for hold release on cancel
  remaining: number;     // current unfilled qty
  ts: number;            // epoch ms — establishes FIFO priority within a price level
};

// ── Internal book structure ───────────────────────────────────────────────────

type EngineBook = {
  bids: Map<string, EngineOrder[]>; // priceKey → FIFO queue (sorted desc externally)
  asks: Map<string, EngineOrder[]>; // priceKey → FIFO queue (sorted asc externally)
  index: Map<string, { side: OrderSide; priceKey: string }>; // O(1) cancel lookup
};

// ── OrderBookStore interface ──────────────────────────────────────────────────

export type PriceLevelEntry = {
  price: number;
  priceKey: string;
  orders: ReadonlyArray<EngineOrder>;
};

export interface OrderBookStore {
  // Add a resting GTC order.
  insert(market: string, entry: EngineOrder): void;
  // Search all markets for orderId and remove it. Returns null if not found.
  findAndRemove(orderId: string): EngineOrder | null;
  // Sorted price levels for the matching loop.
  // buy levels → descending (best bid first)
  // sell levels → ascending (best ask first)
  getLevels(market: string, side: OrderSide): PriceLevelEntry[];
  // Get total fillable volume for FOK pre-flight.
  getFOKVolume(market: string, takerSide: OrderSide, limitPrice: number): number;
  // After a fill: update maker remaining. Removes the entry if newRemaining <= 0.
  updateMakerRemaining(orderId: string, newRemaining: number): void;
  // Display-layer snapshot (delegates to display OrderBook).
  snapshot(market: string, depth?: number): OrderBookSnapshot;
  // Called at startup; throws in production if required backend is unavailable.
  validate(): void;
}

// ── Price key ─────────────────────────────────────────────────────────────────

export function pkStr(price: number): string {
  return price.toFixed(10);
}

// ── In-memory implementation ──────────────────────────────────────────────────

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

  insert(market: string, entry: EngineOrder): void {
    const book = this.getBook(market);
    const map = entry.side === "buy" ? book.bids : book.asks;
    const key = pkStr(entry.pricePerUnit);
    const level = map.get(key);
    if (level) {
      level.push(entry);
    } else {
      map.set(key, [entry]);
    }
    book.index.set(entry.orderId, { side: entry.side, priceKey: key });
  }

  findAndRemove(orderId: string): EngineOrder | null {
    if (!globalThis.tecpeyEngineBooks) return null;
    for (const book of globalThis.tecpeyEngineBooks.values()) {
      const loc = book.index.get(orderId);
      if (!loc) continue;
      const map = loc.side === "buy" ? book.bids : book.asks;
      const level = map.get(loc.priceKey);
      if (!level) continue;
      const idx = level.findIndex((e) => e.orderId === orderId);
      if (idx === -1) continue;
      const [removed] = level.splice(idx, 1);
      if (level.length === 0) map.delete(loc.priceKey);
      book.index.delete(orderId);
      return removed;
    }
    return null;
  }

  getLevels(market: string, side: OrderSide): PriceLevelEntry[] {
    const book = this.getBook(market);
    const map = side === "buy" ? book.bids : book.asks;
    const desc = side === "buy"; // bids descending, asks ascending
    return Array.from(map.entries())
      .filter(([, q]) => q.length > 0)
      .sort(([a], [b]) => {
        const diff = parseFloat(a) - parseFloat(b);
        return desc ? -diff : diff;
      })
      .map(([priceKey, orders]) => ({
        price: parseFloat(priceKey),
        priceKey,
        orders,
      }));
  }

  getFOKVolume(market: string, takerSide: OrderSide, limitPrice: number): number {
    const oppSide: OrderSide = takerSide === "buy" ? "sell" : "buy";
    const levels = this.getLevels(market, oppSide);
    let total = 0;
    for (const level of levels) {
      if (takerSide === "buy" && level.price > limitPrice) break;
      if (takerSide === "sell" && level.price < limitPrice) break;
      for (const o of level.orders) total += o.remaining;
    }
    return total;
  }

  updateMakerRemaining(orderId: string, newRemaining: number): void {
    if (!globalThis.tecpeyEngineBooks) return;
    for (const book of globalThis.tecpeyEngineBooks.values()) {
      const loc = book.index.get(orderId);
      if (!loc) continue;
      const map = loc.side === "buy" ? book.bids : book.asks;
      const level = map.get(loc.priceKey);
      if (!level) continue;
      const entry = level.find((e) => e.orderId === orderId);
      if (!entry) continue;
      if (newRemaining <= 1e-10) {
        // Remove the maker from the book.
        const idx = level.indexOf(entry);
        if (idx !== -1) level.splice(idx, 1);
        if (level.length === 0) map.delete(loc.priceKey);
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
    // In-memory store is always available — nothing to validate.
  }
}

// ── Redis implementation ──────────────────────────────────────────────────────
//
// Phase 32: Complete ioredis implementation.
// Architecture: in-memory is the synchronous read path; Redis is the async
// write-through layer for durability and future multi-instance sync.
//
// Key schema:
//   tecpey:ob:{market}:bids  — Sorted Set (score=price, member=JSON EngineOrder)
//   tecpey:ob:{market}:asks  — Sorted Set (score=price, member=JSON EngineOrder)
//   tecpey:order:{orderId}   — Hash (market, side, priceKey, remaining, member)

class RedisOrderBookStore extends InMemoryOrderBookStore {
  private redis: Redis;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
  }

  override insert(market: string, entry: EngineOrder): void {
    super.insert(market, entry);
    const sym = market.toUpperCase();
    const key = entry.side === "buy"
      ? `tecpey:ob:${sym}:bids`
      : `tecpey:ob:${sym}:asks`;
    const member = JSON.stringify(entry);
    void this.redis.pipeline()
      .zadd(key, entry.pricePerUnit, member)
      .hset(`tecpey:order:${entry.orderId}`, {
        market: sym,
        side: entry.side,
        priceKey: pkStr(entry.pricePerUnit),
        remaining: entry.remaining.toString(),
        member,
      })
      .exec()
      .catch((err) => logger.warn("[order-book-store] Redis insert failed", { err }));
  }

  override findAndRemove(orderId: string): EngineOrder | null {
    const removed = super.findAndRemove(orderId);
    if (!removed) return null;
    const sym = removed.market.toUpperCase();
    const key = removed.side === "buy"
      ? `tecpey:ob:${sym}:bids`
      : `tecpey:ob:${sym}:asks`;
    const member = JSON.stringify(removed);
    void this.redis.pipeline()
      .zrem(key, member)
      .del(`tecpey:order:${orderId}`)
      .exec()
      .catch((err) => logger.warn("[order-book-store] Redis findAndRemove failed", { err }));
    return removed;
  }

  override updateMakerRemaining(orderId: string, newRemaining: number): void {
    // Capture old entry before the in-memory update removes it.
    const oldMember = this.getMemberForUpdate(orderId);
    super.updateMakerRemaining(orderId, newRemaining);
    if (!oldMember) return;

    const { entry, key, member } = oldMember;
    if (newRemaining <= 1e-10) {
      void this.redis.pipeline()
        .zrem(key, member)
        .del(`tecpey:order:${orderId}`)
        .exec()
        .catch((err) => logger.warn("[order-book-store] Redis remove failed", { err }));
    } else {
      const updated = { ...entry, remaining: newRemaining };
      const newMember = JSON.stringify(updated);
      void this.redis.pipeline()
        .zrem(key, member)
        .zadd(key, entry.pricePerUnit, newMember)
        .hset(`tecpey:order:${orderId}`, { remaining: newRemaining.toString(), member: newMember })
        .exec()
        .catch((err) => logger.warn("[order-book-store] Redis update failed", { err }));
    }
  }

  private getMemberForUpdate(orderId: string): { entry: EngineOrder; key: string; member: string } | null {
    if (!globalThis.tecpeyEngineBooks) return null;
    for (const [, book] of globalThis.tecpeyEngineBooks) {
      const loc = book.index.get(orderId);
      if (!loc) continue;
      const map = loc.side === "buy" ? book.bids : book.asks;
      const level = map.get(loc.priceKey);
      const entry = level?.find((e) => e.orderId === orderId);
      if (!entry) continue;
      const sym = entry.market.toUpperCase();
      const key = `tecpey:ob:${sym}:${loc.side === "buy" ? "bids" : "asks"}`;
      return { entry, key, member: JSON.stringify(entry) };
    }
    return null;
  }

  override validate(): void {
    // Validate Redis connectivity asynchronously (non-blocking).
    void this.redis.ping()
      .then(() => logger.info("[order-book-store] Redis connected"))
      .catch((err) => {
        const isProd = process.env.NODE_ENV === "production";
        if (isProd) {
          logger.error("[order-book-store] Redis PING failed in production", { err });
        } else {
          logger.warn("[order-book-store] Redis PING failed; falling back to in-memory", { err });
        }
      });
  }

  // Warm-start from Redis (called instead of rebuildOrderBook when Redis is available).
  async warmFromRedis(market: string): Promise<number> {
    const sym = market.toUpperCase();
    let count = 0;
    try {
      const [bidMembers, askMembers] = await Promise.all([
        this.redis.zrange(`tecpey:ob:${sym}:bids`, 0, -1),
        this.redis.zrange(`tecpey:ob:${sym}:asks`, 0, -1),
      ]);
      const displayBook = getOrderBook(sym);
      for (const member of [...bidMembers, ...askMembers]) {
        try {
          const entry = JSON.parse(member) as EngineOrder;
          super.insert(entry.market, entry);
          displayBook.insert(entry.side, pkStr(entry.pricePerUnit), entry.remaining.toFixed(10));
          count++;
        } catch { /* skip malformed entry */ }
      }
    } catch (err) {
      logger.warn("[order-book-store] Redis warm-start failed, will fall back to DB", { err });
      return 0;
    }
    logger.info("[order-book-store] warmed from Redis", { market: sym, orders: count });
    return count;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

declare global {
  var tecpeyOrderBookStore: OrderBookStore | undefined;
  var tecpeyRedisClient: Redis | undefined;
}

function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // Dynamic require so the module can load without ioredis in non-Redis environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("ioredis") as typeof import("ioredis");
    if (!globalThis.tecpeyRedisClient) {
      globalThis.tecpeyRedisClient = new Redis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      globalThis.tecpeyRedisClient.on("error", (err) =>
        logger.warn("[redis] connection error", { err }),
      );
    }
    return globalThis.tecpeyRedisClient;
  } catch {
    logger.warn("[order-book-store] ioredis not available despite REDIS_URL being set");
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

// ── Warm-start recovery ───────────────────────────────────────────────────────
//
// Rebuilds the engine book and display order book from open orders in the DB.
// Called by the engine when the in-memory book is empty for a given market
// (process restart / first request after hot-reload).

export async function rebuildOrderBook(market: string): Promise<void> {
  const mkt = market.toUpperCase();

  // If the store is Redis-backed, try warm-start from Redis first.
  const store = getOrderBookStore();
  if (store instanceof RedisOrderBookStore) {
    const count = await store.warmFromRedis(mkt);
    if (count > 0) return; // Redis had data; no need to hit DB.
  }

  const result = await withDb(async (client) => {
    const rows = await client.query<{
      id: string;
      user_id: string;
      side: string;
      type: string;
      price: string | null;
      quantity: string;
      remaining_quantity: string;
      created_at: string;
    }>(
      `SELECT id, user_id, side, type, price, quantity, remaining_quantity, created_at
       FROM orders
       WHERE market = $1 AND status IN ('NEW', 'PARTIALLY_FILLED') AND type = 'limit'
       ORDER BY created_at ASC`,
      [mkt],
    );
    return rows.rows;
  });

  if (!result.enabled || !result.value?.length) return;

  const displayBook = getOrderBook(mkt);
  let rebuilt = 0;

  for (const row of result.value) {
    if (!row.price) continue; // skip market orders that shouldn't be resting

    const entry: EngineOrder = {
      orderId: row.id,
      userId: row.user_id,
      market: mkt,
      side: row.side as OrderSide,
      pricePerUnit: parseFloat(row.price),
      originalQty: parseFloat(row.quantity),
      remaining: parseFloat(row.remaining_quantity),
      ts: new Date(row.created_at).getTime(),
    };

    store.insert(mkt, entry);
    displayBook.insert(entry.side, pkStr(entry.pricePerUnit), entry.remaining.toFixed(10));
    rebuilt++;
  }

  logger.info("[order-book-store] rebuilt book from DB", { market: mkt, orders: rebuilt });
}
