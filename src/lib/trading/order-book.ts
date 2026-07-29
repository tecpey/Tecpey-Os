import type { OrderBookLevel, OrderBookSnapshot, OrderSide } from "./types";
import { D, toDP } from "./decimal";
import Decimal from "decimal.js";

// ── Internal level representation ─────────────────────────────────────────────

type LevelEntry = {
  quantity: Decimal;
  orderCount: number;
};

// ── OrderBook ─────────────────────────────────────────────────────────────────
//
// In-memory order book that maintains sorted price levels for a single market.
// This is the foundation abstraction — not the production matching engine.
//
// Bids are sorted descending (highest first); asks ascending (lowest first).
// Prices are stored as strings to preserve precision across serialization.
// Internal arithmetic now uses Decimal for exact precision.
//
// Note: OrderBookLevel quantities are strings (8 decimal places) for API compatibility.
// Internal LevelEntry uses Decimal for precise arithmetic.

export class OrderBook {
  private readonly market: string;
  private readonly bids: Map<string, LevelEntry> = new Map();
  private readonly asks: Map<string, LevelEntry> = new Map();
  private updateId = 0;

  constructor(market: string) {
    this.market = market;
  }

  // Add or increase a price level.
  insert(side: OrderSide, price: string, quantity: string): void {
    const map = side === "buy" ? this.bids : this.asks;
    const existing = map.get(price);
    if (existing) {
      existing.quantity = existing.quantity.plus(D(quantity));
      existing.orderCount += 1;
    } else {
      map.set(price, { quantity: D(quantity), orderCount: 1 });
    }
    this.updateId += 1;
  }

  // Reduce or remove a price level (returns true if level found and modified).
  cancel(side: OrderSide, price: string, quantity: string): boolean {
    const map = side === "buy" ? this.bids : this.asks;
    const existing = map.get(price);
    if (!existing) return false;

    existing.quantity = existing.quantity.minus(D(quantity));
    existing.orderCount = Math.max(0, existing.orderCount - 1);

    if (existing.quantity.lte(D(0)) || existing.orderCount <= 0) {
      map.delete(price);
    }
    this.updateId += 1;
    return true;
  }

  // Best bid (highest buy price).
  bestBid(): OrderBookLevel | null {
    const sorted = this._sortedBids();
    if (!sorted.length) return null;
    return sorted[0];
  }

  // Best ask (lowest sell price).
  bestAsk(): OrderBookLevel | null {
    const sorted = this._sortedAsks();
    if (!sorted.length) return null;
    return sorted[0];
  }

  // All levels for a given side (bids: desc; asks: asc).
  priceLevels(side: OrderSide, depth?: number): OrderBookLevel[] {
    const levels = side === "buy" ? this._sortedBids() : this._sortedAsks();
    return depth ? levels.slice(0, depth) : levels;
  }

  // Full snapshot suitable for API responses.
  snapshot(depth = 20): OrderBookSnapshot {
    return {
      market: this.market,
      bids: this._sortedBids().slice(0, depth),
      asks: this._sortedAsks().slice(0, depth),
      lastUpdateId: this.updateId,
      timestamp: new Date().toISOString(),
    };
  }

  // Reset the book (e.g. on reconnect or test reset).
  clear(): void {
    this.bids.clear();
    this.asks.clear();
    this.updateId += 1;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _sortedBids(): OrderBookLevel[] {
    return Array.from(this.bids.entries())
      .sort(([a], [b]) => D(b).comparedTo(D(a)))
      .map(([price, entry]) => ({
        price,
        quantity: toDP(entry.quantity.toString(), 8).toString(),
        orderCount: entry.orderCount,
      }));
  }

  private _sortedAsks(): OrderBookLevel[] {
    return Array.from(this.asks.entries())
      .sort(([a], [b]) => D(a).comparedTo(D(b)))
      .map(([price, entry]) => ({
        price,
        quantity: toDP(entry.quantity.toString(), 8).toString(),
        orderCount: entry.orderCount,
      }));
  }
}

// ── Global in-memory registry (one book per market) ───────────────────────────
//
// In production, replace with Redis Sorted Sets or a C++ matching engine.
// The registry is keyed by market symbol and survives hot-reload via globalThis.

declare global {
  var tecpeyOrderBooks: Map<string, OrderBook> | undefined;
}

export function getOrderBook(market: string): OrderBook {
  if (!globalThis.tecpeyOrderBooks) {
    globalThis.tecpeyOrderBooks = new Map();
  }
  let book = globalThis.tecpeyOrderBooks.get(market);
  if (!book) {
    book = new OrderBook(market);
    globalThis.tecpeyOrderBooks.set(market, book);
  }
  return book;
}