// Delta order book computation.
// Compares consecutive snapshots per market and produces a minimal delta.
// Quantity "0" means a price level was removed entirely.
//
// The delta is broadcast instead of a full snapshot when the client has
// the previous sequence number. On gap detection, the client requests a
// full snapshot via { "type": "get_snapshot", ... }.

import type { OrderBookSnapshot } from "@/lib/trading/types";

export type ObDelta = {
  bids: Array<{ price: string; quantity: string }>;
  asks: Array<{ price: string; quantity: string }>;
};

// ── Per-market previous snapshot storage ──────────────────────────────────────

declare global {
  var tecpeyObPrevSnap: Map<string, OrderBookSnapshot> | undefined;
}

function getPrev(): Map<string, OrderBookSnapshot> {
  if (!globalThis.tecpeyObPrevSnap) globalThis.tecpeyObPrevSnap = new Map();
  return globalThis.tecpeyObPrevSnap;
}

// ── Compute delta ─────────────────────────────────────────────────────────────

export function computeObDelta(market: string, next: OrderBookSnapshot): ObDelta | null {
  const prev = getPrev().get(market);
  getPrev().set(market, next);

  if (!prev) return null; // first snapshot for this market — send full

  const bidDelta = levelDiff(prev.bids, next.bids);
  const askDelta = levelDiff(prev.asks, next.asks);

  if (bidDelta.length === 0 && askDelta.length === 0) return null; // no change
  return { bids: bidDelta, asks: askDelta };
}

type Level = { price: string; quantity: string };

function levelDiff(prev: Level[], next: Level[]): Level[] {
  const prevMap = new Map(prev.map((l) => [l.price, l.quantity]));
  const nextMap = new Map(next.map((l) => [l.price, l.quantity]));
  const delta: Level[] = [];

  // Updated or added levels
  for (const [price, quantity] of nextMap) {
    if (prevMap.get(price) !== quantity) {
      delta.push({ price, quantity });
    }
  }
  // Removed levels
  for (const price of prevMap.keys()) {
    if (!nextMap.has(price)) {
      delta.push({ price, quantity: "0" });
    }
  }
  return delta;
}

// ── Reset (on resync request) ─────────────────────────────────────────────────

export function resetObDelta(market: string): void {
  getPrev().delete(market);
}
