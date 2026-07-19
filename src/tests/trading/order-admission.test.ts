import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateOrderHold, parseOrderDecimal } from "../../lib/trading/order-financials";
import { validatePlaceOrderRequest } from "../../lib/trading/validation";
import type { Market, PlaceOrderRequest } from "../../lib/trading/types";

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

function request(overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest {
  return {
    market: market.symbol,
    side: "buy",
    type: "limit",
    quantity: "0.3",
    price: "0.10",
    ...overrides,
  };
}

describe("Decimal-safe Exchange order admission", () => {
  it("accepts exact binary-unsafe decimal boundaries", () => {
    assert.deepEqual(validatePlaceOrderRequest(request(), market), { ok: true });
    const decimalMarket = {
      ...market,
      tickSize: "0.1",
      stepSize: "0.1",
      minOrderValue: "0.09",
      pricePrecision: 18,
      quantityPrecision: 18,
    };
    assert.deepEqual(
      validatePlaceOrderRequest(request({ quantity: "0.3", price: "0.3" }), decimalMarket),
      { ok: true },
    );
  });

  it("rejects values that only appear aligned after floating-point rounding", () => {
    const decimalMarket = {
      ...market,
      tickSize: "0.1",
      stepSize: "0.1",
      minOrderValue: "0.01",
      pricePrecision: 18,
      quantityPrecision: 18,
    };
    const result = validatePlaceOrderRequest(
      request({ quantity: "0.30000000000000004", price: "0.3" }),
      decimalMarket,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "quantity_step_size_violation");
  });

  it("rejects exponent, special, signed and malformed decimal notation", () => {
    for (const value of ["1e-5", "NaN", "Infinity", "-1", "+1", "00.1", ".1", "1."]) {
      assert.equal(parseOrderDecimal(value), null, value);
    }
  });

  it("enforces exact tick, step, precision and value bounds", () => {
    const badTick = validatePlaceOrderRequest(request({ price: "0.101" }), {
      ...market,
      pricePrecision: 3,
    });
    assert.equal(badTick.ok, false);
    if (!badTick.ok) assert.equal(badTick.error, "price_tick_size_violation");

    const belowMinimum = validatePlaceOrderRequest(request({ quantity: "0.29999" }), market);
    assert.equal(belowMinimum.ok, false);
    if (!belowMinimum.ok) assert.equal(belowMinimum.error, "order_value_too_small");

    const aboveMaximum = validatePlaceOrderRequest(request({ quantity: "10000", price: "0.11" }), {
      ...market,
      maxOrderValue: "1000",
    });
    assert.equal(aboveMaximum.ok, false);
    if (!aboveMaximum.ok) assert.equal(aboveMaximum.error, "order_value_too_large");
  });

  it("treats any parsed zero maxOrderValue as unlimited", () => {
    assert.deepEqual(
      validatePlaceOrderRequest(request(), { ...market, maxOrderValue: "0.0000000000" }),
      { ok: true },
    );
  });

  it("reserves exact limit-buy gross plus maximum fee and exact sell base", () => {
    assert.deepEqual(calculateOrderHold({ request: request(), market }), {
      asset: "USDT",
      amount: "0.0300300000",
      basisPrice: "0.10",
    });

    assert.deepEqual(calculateOrderHold({
      request: request({ side: "sell", quantity: "0.30000" }),
      market,
    }), {
      asset: "BTC",
      amount: "0.3000000000",
      basisPrice: null,
    });
  });

  it("fails closed for market buys until depth reservation exists", () => {
    assert.throws(
      () => calculateOrderHold({
        request: request({ type: "market", price: undefined }),
        market,
      }),
      /market_buy_depth_reservation_required/,
    );
  });

  it("preserves a large exact product and its fee reserve", () => {
    const hold = calculateOrderHold({
      request: request({ quantity: "9999999999.12345", price: "999999999.12345" }),
      market,
    });
    assert.equal(hold.amount, "10009999990248295000.7691082425");
  });

  it("rounds reservation upward at the database scale", () => {
    const reserveMarket = {
      ...market,
      makerFee: "0",
      takerFee: "0",
      pricePrecision: 11,
      quantityPrecision: 1,
      tickSize: "0.00000000001",
      stepSize: "1",
      minOrderValue: "0.00000000001",
    };
    const hold = calculateOrderHold({
      request: request({ quantity: "1", price: "1.00000000001" }),
      market: reserveMarket,
    });
    assert.equal(hold.amount, "1.0000000001");
  });
});
