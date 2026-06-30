import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { OrderBookSnapshot, OrderSide } from "./types";
import { getOrderBook } from "./order-book";

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

// ── Redis stub ────────────────────────────────────────────────────────────────
//
// Phase 30 foundation: the Redis implementation is stubbed.
// When REDIS_URL is set: warn that ioredis is not installed and fall back to
// in-memory in development/test. In production, fail loudly at startup.
//
// To activate Redis support in a future phase:
//   npm install ioredis
//   Implement each method using ZADD/ZRANGE/HSET/HGET Sorted Set commands.
//   Key schema:
//     tecpey:ob:{market}:bids  — Sorted Set  (score = price, member = JSON EngineOrder)
//     tecpey:ob:{market}:asks  — Sorted Set  (score = price, member = JSON EngineOrder)
//     tecpey:order:{orderId}   — Hash         (fields: market, side, priceKey, remaining …)

class RedisOrderBookStore extends InMemoryOrderBookStore {
  constructor() {
    super();
    this.validate();
  }

  override validate(): void {
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      throw new Error(
        "[order-book-store] REDIS_URL is set but ioredis is not installed. " +
          "Run `npm install ioredis` and implement RedisOrderBookStore before deploying.",
      );
    }
    // Non-production: warn and fall back to in-memory.
    logger.warn(
      "[order-book-store] REDIS_URL detected but ioredis is not installed. " +
        "Falling back to in-memory order book. Install ioredis for Redis-backed order books.",
    );
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

declare global {
  var tecpeyOrderBookStore: OrderBookStore | undefined;
}

export function getOrderBookStore(): OrderBookStore {
  if (!globalThis.tecpeyOrderBookStore) {
    const redisUrl = process.env.REDIS_URL;
    globalThis.tecpeyOrderBookStore = redisUrl
      ? new RedisOrderBookStore()
      : new InMemoryOrderBookStore();
  }
  return globalThis.tecpeyOrderBookStore;
}

// ── Warm-start recovery ───────────────────────────────────────────────────────
//
// Rebuilds the engine book and display order book from open orders in the DB.
// Called by the engine when the in-memory book is empty for a given market
// (process restart / first request after hot-reload).

export async function rebuildOrderBook(market: string): Promise<void> {
  const mkt = market.toUpperCase();
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

  const store = getOrderBookStore();
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
