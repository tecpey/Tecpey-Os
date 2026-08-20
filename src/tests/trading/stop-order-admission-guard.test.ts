import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePlaceOrderRequest } from "../../lib/trading/validation";
import type { Market, PlaceOrderRequest } from "../../lib/trading/types";

// SB-015. `stop_limit` is a declared order type with a persisted CHECK
// constraint, but no stop trigger engine exists. Admission used to validate
// stopPrice for precision and tick size and then return ok, so the order was
// accepted and stored — and the matching engine, which never reads stopPrice,
// derived `isGTC = !isMarket && !isFOK && !isIOC` (true for a stop order) and
// rested it on the book immediately live at its limit price. A protective stop
// became an order that fires right now: the inverse of the user's intent.
//
// Admission must refuse stop orders until real trigger activation exists. These
// tests lock the refusal itself, and the two properties that made the old
// behaviour dangerous: that the refusal is unconditional, and that it happens
// before any stopPrice validation can make the request look supported.

const market: Market = {
  symbol: "BTCUSDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  status: "active",
  tickSize: "0.01",
  stepSize: "0.00001",
  minOrderValue: "0.03",
  maxOrderValue: "1000",
  pricePrecision: 2,
  quantityPrecision: 5,
  makerFee: "0.001",
  takerFee: "0.001",
};

function stopRequest(overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest {
  return {
    market: market.symbol,
    side: "sell",
    type: "stop_limit",
    quantity: "0.3",
    price: "0.10",
    stopPrice: "0.09",
    ...overrides,
  };
}

describe("stop order admission guard", () => {
  it("refuses a stop order that is valid in every other respect", () => {
    // Every field here satisfies the market's precision, tick and value rules,
    // so nothing but the order type itself can be the cause of the refusal.
    const result = validatePlaceOrderRequest(stopRequest(), market);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error, "order_type_unsupported");
  });

  it("refuses a stop order regardless of the stop price supplied", () => {
    // The old code accepted a well-formed stopPrice and rejected a malformed
    // one, which is exactly what signalled to callers that the type worked.
    // Refusal must not depend on the stop price at all.
    for (const stopPrice of ["0.09", "0.001", "12345.67", "not-a-number", ""]) {
      const result = validatePlaceOrderRequest(stopRequest({ stopPrice }), market);
      assert.equal(result.ok, false, `stopPrice ${JSON.stringify(stopPrice)} must not be admitted`);
      assert.equal(
        result.ok === false && result.error,
        "order_type_unsupported",
        `stopPrice ${JSON.stringify(stopPrice)} must fail on the type, not on the stop price`,
      );
    }
  });

  it("refuses a stop order even with no stop price at all", () => {
    const bare = stopRequest();
    delete (bare as { stopPrice?: string }).stopPrice;
    const result = validatePlaceOrderRequest(bare, market);
    assert.equal(result.ok, false);
    // Not "stop_price_required" — that error implies supplying one would work.
    assert.equal(result.ok === false && result.error, "order_type_unsupported");
  });

  it("refuses a stop order before market-inactive and malformed-quantity checks", () => {
    // The type refusal must be the first gate. If a stop order on a suspended
    // market reported "market_not_active", a caller would reasonably conclude
    // the type is supported and retry once the market reopens.
    const suspended = validatePlaceOrderRequest(stopRequest(), { ...market, status: "suspended" });
    assert.equal(suspended.ok === false && suspended.error, "order_type_unsupported");

    const malformed = validatePlaceOrderRequest(stopRequest({ quantity: "-1" }), market);
    assert.equal(malformed.ok === false && malformed.error, "order_type_unsupported");
  });

  it("still admits the supported order types", () => {
    // The guard must be narrow: it may not become a blanket rejection.
    for (const type of ["limit", "market", "ioc", "fok", "gtc"] as const) {
      const result = validatePlaceOrderRequest(
        { market: market.symbol, side: "buy", type, quantity: "0.3", price: "0.10" },
        market,
      );
      assert.equal(result.ok, true, `${type} orders must still be admitted`);
    }
  });

  it("keeps the matching engine free of any stop-trigger claim", () => {
    // The refusal above is only correct while no trigger engine exists. If stop
    // activation is ever implemented, this assertion fails and forces whoever
    // built it to revisit the admission guard rather than leave it stranded.
    const engine = readFileSync("src/lib/trading/engine.ts", "utf8");
    for (const token of ["stopPrice", "stop_limit", "stop_price"]) {
      assert.ok(
        !engine.includes(token),
        `engine.ts now references ${token}: implement stop admission instead of refusing it`,
      );
    }
  });
});
