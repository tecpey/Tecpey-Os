import { createHash } from "node:crypto";
import type {
  SensitiveMutationAuditAction,
  SensitiveMutationAuditEvent,
} from "@/lib/security/sensitive-mutation-audit";
import { parseOrderDecimal, parsePositiveOrderDecimal } from "./order-financials";
import type { OrderSide, OrderType, TimeInForce } from "./types";

export const EXCHANGE_ORDER_EVIDENCE_POLICY_VERSION =
  "exchange-order-evidence-v1";

export type ExchangeOrderEvidenceContext = {
  tenantId: string;
  actorType: "student" | "user" | "admin" | "service";
  actorId: string;
  correlationSeed: string;
  requestHash: string;
};

type OrderIdentity = {
  orderId: string;
  market: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
  quantity: string;
  price?: string | null;
  stopPrice?: string | null;
};

function domainHash(domain: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey:${domain}:v1\0`)
    .update(value)
    .digest("hex");
}

function assertContext(context: ExchangeOrderEvidenceContext): void {
  if (!/^[a-z][a-z0-9._-]{1,79}$/.test(context.tenantId)) {
    throw new Error("invalid_exchange_evidence_tenant");
  }
  if (!context.actorId || context.actorId.length > 300) {
    throw new Error("invalid_exchange_evidence_actor");
  }
  if (!context.correlationSeed || context.correlationSeed.length > 500) {
    throw new Error("invalid_exchange_evidence_correlation_seed");
  }
  if (!/^[0-9a-f]{64}$/.test(context.requestHash)) {
    throw new Error("invalid_exchange_evidence_request_hash");
  }
}

function canonicalPositive(value: string, field: string): string {
  const parsed = parsePositiveOrderDecimal(value);
  if (!parsed) throw new Error(`invalid_exchange_evidence_${field}`);
  return parsed.toFixed();
}

function canonicalOptional(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) return null;
  const parsed = parseOrderDecimal(value);
  if (!parsed) throw new Error(`invalid_exchange_evidence_${field}`);
  return parsed.toFixed();
}

function normalizedMarket(value: string): string {
  const market = value.toUpperCase().trim();
  if (!/^[A-Z0-9][A-Z0-9._:-]{2,39}$/.test(market)) {
    throw new Error("invalid_exchange_evidence_market");
  }
  return market;
}

function normalizedAsset(value: string): string {
  const asset = value.toUpperCase().trim();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,19}$/.test(asset)) {
    throw new Error("invalid_exchange_evidence_asset");
  }
  return asset;
}

function normalizedReason(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const reason = value.trim().slice(0, 100);
  if (!/^[a-z0-9][a-z0-9._:-]{0,99}$/.test(reason)) {
    throw new Error("invalid_exchange_evidence_reason");
  }
  return reason;
}

function correlationId(
  action: SensitiveMutationAuditAction,
  seed: string,
): string {
  return `${action.replaceAll(".", "-")}-${domainHash(action, seed).slice(0, 48)}`;
}

export function fingerprintExchangeOrder(orderId: string): string {
  if (!orderId || orderId.length > 300) {
    throw new Error("invalid_exchange_evidence_order");
  }
  return `exchange-order-${domainHash("order", orderId)}`;
}

export function fingerprintExchangeMarket(market: string): string {
  return `exchange-market-${domainHash("market", normalizedMarket(market))}`;
}

function baseEvent(
  context: ExchangeOrderEvidenceContext,
  action: SensitiveMutationAuditAction,
  orderId: string,
): Omit<SensitiveMutationAuditEvent, "outcome" | "metadata"> {
  assertContext(context);
  return {
    tenantId: context.tenantId,
    actorType: context.actorType,
    actorId: context.actorId,
    action,
    resourceType: "exchange_order",
    resourceId: fingerprintExchangeOrder(orderId),
    correlationId: correlationId(action, context.correlationSeed),
    requestHash: context.requestHash,
  };
}

function identityMetadata(order: OrderIdentity): Record<string, unknown> {
  return {
    policyVersion: EXCHANGE_ORDER_EVIDENCE_POLICY_VERSION,
    marketFingerprint: fingerprintExchangeMarket(order.market),
    side: order.side,
    orderType: order.orderType,
    timeInForce: order.timeInForce,
    quantity: canonicalPositive(order.quantity, "quantity"),
    price: canonicalOptional(order.price, "price"),
    stopPrice: canonicalOptional(order.stopPrice, "stop_price"),
  };
}

export function buildExchangeOrderAdmitEvidence(input: {
  context: ExchangeOrderEvidenceContext;
  order: OrderIdentity;
  holdAsset: string;
  holdAmount: string;
}): SensitiveMutationAuditEvent {
  return {
    ...baseEvent(input.context, "exchange.order.admit", input.order.orderId),
    outcome: "success",
    metadata: {
      ...identityMetadata(input.order),
      stateTransition: "none->admitted",
      holdAsset: normalizedAsset(input.holdAsset),
      holdAmount: canonicalPositive(input.holdAmount, "hold_amount"),
      holdRepresentation: "wallet_ledger",
    },
  };
}

export function buildExchangeOrderFinalEvidence(input: {
  context: ExchangeOrderEvidenceContext;
  order: OrderIdentity;
  accepted: boolean;
  finalState: string;
  reason?: string | null;
  tradeIds?: string[];
  holdClosed: boolean;
}): SensitiveMutationAuditEvent {
  const action: SensitiveMutationAuditAction = input.accepted
    ? "exchange.order.finalize"
    : "exchange.order.reject";
  const tradeIds = [...new Set(input.tradeIds ?? [])].sort();
  if (tradeIds.length > 10_000) {
    throw new Error("exchange_evidence_trade_count_exceeded");
  }
  const finalState = input.finalState.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(finalState)) {
    throw new Error("invalid_exchange_evidence_final_state");
  }
  return {
    ...baseEvent(input.context, action, input.order.orderId),
    outcome: input.accepted ? "success" : "rejected",
    metadata: {
      ...identityMetadata(input.order),
      finalState,
      accepted: input.accepted,
      reasonCode: normalizedReason(input.reason),
      tradeCount: tradeIds.length,
      tradeSetFingerprint: tradeIds.length
        ? domainHash("trade-set", tradeIds.join("\n"))
        : null,
      holdClosed: input.holdClosed,
    },
  };
}

export function buildExchangeOrderCancelEvidence(input: {
  context: ExchangeOrderEvidenceContext;
  order: OrderIdentity;
  previousState: string;
  holdAsset: string;
  releasedAmount: string;
}): SensitiveMutationAuditEvent {
  const previousState = input.previousState.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(previousState)) {
    throw new Error("invalid_exchange_evidence_previous_state");
  }
  const released = parseOrderDecimal(input.releasedAmount);
  if (!released || released.isNegative()) {
    throw new Error("invalid_exchange_evidence_released_amount");
  }
  return {
    ...baseEvent(input.context, "exchange.order.cancel", input.order.orderId),
    outcome: "success",
    metadata: {
      ...identityMetadata(input.order),
      stateTransition: `${previousState}->CANCELLED`,
      holdAsset: normalizedAsset(input.holdAsset),
      releasedAmount: released.toFixed(),
      holdClosed: true,
    },
  };
}
