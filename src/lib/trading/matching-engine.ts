import type { Order, OrderBookSnapshot, Trade } from "./types";

// ── Matching Engine Interface ──────────────────────────────────────────────────
//
// This interface defines the contract every matching engine implementation must
// fulfil. Phase 28 ships the interface only — a concrete implementation will be
// added in a future phase when the execution pipeline is built out.
//
// Design constraints:
//  - Implementations MUST be replaceable without changing callers.
//  - Async throughout: network-backed engines (e.g., a C++ co-process via IPC)
//    must be first-class citizens.
//  - No implementation detail leaks through this interface.

export interface MatchingEngineInterface {
  /**
   * Submit an order for matching.
   * Returns accepted=true when the order is accepted into the book or immediately
   * filled; accepted=false when rejected (e.g. invalid market, balance, limits).
   * tradeIds lists any trades that were executed synchronously.
   */
  placeOrder(order: Order): Promise<PlaceOrderResult>;

  /**
   * Cancel an open order by ID.
   * Only the owning user (userId) may cancel; system cancels use "system" userId.
   */
  cancelOrder(orderId: string, userId: string): Promise<CancelOrderResult>;

  /**
   * Run one matching iteration for the given market.
   * Returns all trades that were executed in this pass.
   * In event-loop mode (most production engines), match() is called continuously
   * by the engine itself — callers do not need to call it manually.
   */
  match(market: string): Promise<MatchResult>;

  /**
   * Return a point-in-time snapshot of the current order book.
   * depth controls how many price levels to include per side.
   */
  snapshot(market: string, depth?: number): Promise<OrderBookSnapshot>;
}

// ── Result types ──────────────────────────────────────────────────────────────

export type PlaceOrderResult = {
  accepted: boolean;
  orderId: string;
  tradeIds: string[];
  reason?: string;
};

export type CancelOrderResult = {
  cancelled: boolean;
  orderId: string;
  reason?: string;
};

export type MatchResult = {
  market: string;
  trades: Trade[];
  matched: number;
};
