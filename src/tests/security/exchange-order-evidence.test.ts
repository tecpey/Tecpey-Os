import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExchangeOrderAdmitEvidence,
  buildExchangeOrderCancelEvidence,
  buildExchangeOrderFinalEvidence,
  fingerprintExchangeMarket,
  fingerprintExchangeOrder,
} from "@/lib/trading/exchange-order-evidence";

const context = {
  tenantId: "tecpey",
  actorType: "user" as const,
  actorId: "user-authority-1",
  correlationSeed: "order-idempotency-key-0001",
  requestHash: "a".repeat(64),
};

const order = {
  orderId: "11111111-1111-4111-8111-111111111111",
  market: "BTC-USDT",
  side: "buy" as const,
  orderType: "limit" as const,
  timeInForce: "GTC" as const,
  quantity: "1.2500000000",
  price: "100.5000000000",
  stopPrice: null,
};

describe("Exchange order mandatory evidence builders", () => {
  it("builds deterministic admission evidence from exact strings without raw order identity", () => {
    const first = buildExchangeOrderAdmitEvidence({
      context,
      order,
      holdAsset: "USDT",
      holdAmount: "126.2562500000",
    });
    const second = buildExchangeOrderAdmitEvidence({
      context,
      order,
      holdAsset: "usdt",
      holdAmount: "126.2562500000",
    });

    assert.deepEqual(first, second);
    assert.equal(first.action, "exchange.order.admit");
    assert.equal(first.resourceType, "exchange_order");
    assert.equal(first.outcome, "success");
    assert.equal(first.metadata?.quantity, "1.25");
    assert.equal(first.metadata?.price, "100.5");
    assert.equal(first.metadata?.holdAmount, "126.25625");
    assert.equal(first.metadata?.holdAsset, "USDT");
    assert.equal(first.correlationId.length <= 160, true);

    const encoded = JSON.stringify(first);
    assert.equal(encoded.includes(order.orderId), false);
    assert.equal(encoded.includes("order-idempotency-key-0001"), false);
    assert.equal(first.resourceId, fingerprintExchangeOrder(order.orderId));
    assert.equal(
      first.metadata?.marketFingerprint,
      fingerprintExchangeMarket(order.market),
    );
  });

  it("builds order finalization evidence with a bounded order-independent trade fingerprint", () => {
    const first = buildExchangeOrderFinalEvidence({
      context: { ...context, actorType: "service", actorId: "exchange-order-worker" },
      order,
      accepted: true,
      finalState: "FILLED",
      tradeIds: ["trade-b", "trade-a", "trade-a"],
      holdClosed: true,
    });
    const second = buildExchangeOrderFinalEvidence({
      context: { ...context, actorType: "service", actorId: "exchange-order-worker" },
      order,
      accepted: true,
      finalState: "filled",
      tradeIds: ["trade-a", "trade-b"],
      holdClosed: true,
    });

    assert.equal(first.action, "exchange.order.finalize");
    assert.equal(first.metadata?.tradeCount, 2);
    assert.equal(
      first.metadata?.tradeSetFingerprint,
      second.metadata?.tradeSetFingerprint,
    );
    assert.equal(JSON.stringify(first).includes("trade-a"), false);
    assert.equal(JSON.stringify(first).includes("trade-b"), false);
  });

  it("uses rejected evidence for a committed terminal rejection", () => {
    const event = buildExchangeOrderFinalEvidence({
      context: { ...context, actorType: "service", actorId: "exchange-order-worker" },
      order,
      accepted: false,
      finalState: "REJECTED",
      reason: "market_price_protection",
      tradeIds: [],
      holdClosed: true,
    });

    assert.equal(event.action, "exchange.order.reject");
    assert.equal(event.outcome, "rejected");
    assert.equal(event.metadata?.reasonCode, "market_price_protection");
    assert.equal(event.metadata?.tradeCount, 0);
  });

  it("builds cancellation evidence with exact zero or positive residual release", () => {
    const event = buildExchangeOrderCancelEvidence({
      context,
      order,
      previousState: "PARTIALLY_FILLED",
      holdAsset: "USDT",
      releasedAmount: "0.2500000000",
    });
    const zero = buildExchangeOrderCancelEvidence({
      context: { ...context, correlationSeed: "order-idempotency-key-0002" },
      order,
      previousState: "NEW",
      holdAsset: "USDT",
      releasedAmount: "0",
    });

    assert.equal(event.action, "exchange.order.cancel");
    assert.equal(event.metadata?.stateTransition, "PARTIALLY_FILLED->CANCELLED");
    assert.equal(event.metadata?.releasedAmount, "0.25");
    assert.equal(zero.metadata?.releasedAmount, "0");
  });

  it("rejects scientific notation, negative release and unbounded reason values", () => {
    assert.throws(
      () => buildExchangeOrderAdmitEvidence({
        context,
        order: { ...order, quantity: "1e3" },
        holdAsset: "USDT",
        holdAmount: "10",
      }),
      /invalid_exchange_evidence_quantity/,
    );
    assert.throws(
      () => buildExchangeOrderCancelEvidence({
        context,
        order,
        previousState: "NEW",
        holdAsset: "USDT",
        releasedAmount: "-1",
      }),
      /invalid_exchange_evidence_released_amount/,
    );
    assert.throws(
      () => buildExchangeOrderFinalEvidence({
        context,
        order,
        accepted: false,
        finalState: "REJECTED",
        reason: "contains spaces and unrestricted text",
        holdClosed: true,
      }),
      /invalid_exchange_evidence_reason/,
    );
  });
});
