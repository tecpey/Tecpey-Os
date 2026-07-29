import { EventEmitter } from "events";
import type { MakerSide, OrderStatus } from "@/lib/trading/types";
import type { OrderBookSnapshot } from "@/lib/trading/types";

// ── Event payload types ───────────────────────────────────────────────────────

export type TradeExecutedPayload = {
  tradeId: string;
  market: string;
  price: string;
  quantity: string;
  buyerOrderId: string;
  sellerOrderId: string;
  buyerUserId: string;
  sellerUserId: string;
  makerSide: MakerSide;
  executedAt: string;
};

export type OrderUpdatedPayload = {
  orderId: string;
  userId: string;
  market: string;
  status: OrderStatus;
  filledQuantity: string;
  remainingQuantity: string;
  avgFillPrice: string | null;
};

export type OrderBookChangedPayload = {
  market: string;
  snapshot: OrderBookSnapshot;
  seqNum: number;
};

export type TickerUpdatedPayload = {
  market: string;
  lastPrice: string | null;
  priceChange24h: string | null;
  priceChangePct24h: string | null;
  highPrice24h: string | null;
  lowPrice24h: string | null;
  baseVolume24h: string;
  quoteVolume24h: string;
  vwap24h: string | null;
  tradeCount24h: number;
  bestBid: string | null;
  bestAsk: string | null;
};

export type WalletChangedPayload = {
  userId: string;
  asset: string;
};

// ── Typed event map ───────────────────────────────────────────────────────────

type BusEvents = {
  "trade:executed": TradeExecutedPayload;
  "order:updated": OrderUpdatedPayload;
  "orderbook:changed": OrderBookChangedPayload;
  "ticker:updated": TickerUpdatedPayload;
  "wallet:changed": WalletChangedPayload;
};

// ── Bus class ─────────────────────────────────────────────────────────────────

class TradingEventBus extends EventEmitter {
  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): boolean {
    return super.emit(event as string, payload);
  }
  on<K extends keyof BusEvents>(event: K, listener: (payload: BusEvents[K]) => void): this {
    return super.on(event as string, listener);
  }
  off<K extends keyof BusEvents>(event: K, listener: (payload: BusEvents[K]) => void): this {
    return super.off(event as string, listener);
  }
}

declare global {
  var tecpeyEventBus: TradingEventBus | undefined;
}

export function getEventBus(): TradingEventBus {
  if (!globalThis.tecpeyEventBus) {
    globalThis.tecpeyEventBus = new TradingEventBus();
    globalThis.tecpeyEventBus.setMaxListeners(200);
  }
  return globalThis.tecpeyEventBus;
}

// ── Sequence counter per market ────────────────────────────────────────────────

declare global {
  var tecpeyObSeq: Map<string, number> | undefined;
}

export function nextSeq(market: string): number {
  if (!globalThis.tecpeyObSeq) globalThis.tecpeyObSeq = new Map();
  const n = (globalThis.tecpeyObSeq.get(market) ?? 0) + 1;
  globalThis.tecpeyObSeq.set(market, n);
  return n;
}

// ── Redis publisher wiring ────────────────────────────────────────────────────
// Called once from server.ts after Redis pub/sub is initialized.
// Routes local EventBus events → Redis channels for cross-instance distribution.
// The WsManager listens on Redis subscriber (not the local bus) for WS broadcasts.

export function wireRedisPublisher(pubsub: {
  publish: (channel: string, payload: unknown) => void;
  publishOrderBook: (payload: OrderBookChangedPayload) => void;
}): void {
  const bus = getEventBus();

  bus.on("trade:executed", (payload) => {
    pubsub.publish("tecpey:events:trade", payload);
  });

  bus.on("order:updated", (payload) => {
    pubsub.publish("tecpey:events:order", payload);
  });

  bus.on("orderbook:changed", (payload) => {
    // Debounced: multiple rapid OB changes collapse to one publish per market.
    pubsub.publishOrderBook(payload);
  });

  bus.on("wallet:changed", (payload) => {
    pubsub.publish("tecpey:events:wallet", payload);
  });
}
