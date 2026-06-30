import { randomUUID } from "crypto";

// ── Event Type Catalogue ──────────────────────────────────────────────────────

export type TradingEventType =
  | "OrderCreated"
  | "OrderAccepted"
  | "OrderRejected"
  | "OrderCancelled"
  | "TradeExecuted"
  | "OrderExpired"
  | "LedgerPosted";

// ── Per-event payload shapes ──────────────────────────────────────────────────

type OrderCreatedPayload = {
  orderId: string;
  userId: string;
  market: string;
  side: string;
  type: string;
  price: string | null;
  quantity: string;
  timeInForce: string;
};

type OrderAcceptedPayload = {
  orderId: string;
  market: string;
};

type OrderRejectedPayload = {
  orderId: string;
  market: string;
  reason: string;
};

type OrderCancelledPayload = {
  orderId: string;
  userId: string;
  market: string;
  cancelledBy: "user" | "system";
};

type TradeExecutedPayload = {
  tradeId: string;
  market: string;
  price: string;
  quantity: string;
  buyerOrderId: string;
  sellerOrderId: string;
  makerSide: string;
};

type OrderExpiredPayload = {
  orderId: string;
  market: string;
};

type LedgerPostedPayload = {
  entryId: string;
  walletId: string;
  asset: string;
  type: string;
  amount: string;
};

type TradingEventPayloadMap = {
  OrderCreated: OrderCreatedPayload;
  OrderAccepted: OrderAcceptedPayload;
  OrderRejected: OrderRejectedPayload;
  OrderCancelled: OrderCancelledPayload;
  TradeExecuted: TradeExecutedPayload;
  OrderExpired: OrderExpiredPayload;
  LedgerPosted: LedgerPostedPayload;
};

// ── Event envelope ────────────────────────────────────────────────────────────

export type TradingEvent<T extends TradingEventType = TradingEventType> = {
  eventId: string;
  type: T;
  timestamp: string;
  payload: TradingEventPayloadMap[T];
};

// ── Factory ───────────────────────────────────────────────────────────────────

export function createTradingEvent<T extends TradingEventType>(
  type: T,
  payload: TradingEventPayloadMap[T],
): TradingEvent<T> {
  return {
    eventId: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}
