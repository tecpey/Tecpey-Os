import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Market, PlaceOrderRequest } from "../../lib/trading/types";
import { roundToPrecision, validatePlaceOrderRequest } from "../../lib/trading/validation";

const market: Market = {
  symbol: "BTCUSDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  status: "active",
  tickSize: "0.01",
  stepSize: "0.00001",
  minOrderValue: "10",
  maxOrderValue: "500000",
  pricePrecision: 2,
  quantityPrecision: 5,
  makerFee: "0.001",
  takerFee: "0.001",
};

function limit(overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest {
  return {
    market: market.symbol,
    side: "buy",
    type: "limit",
    quantity: "0.00020",
    price: "50000.00",
    ...overrides,
  };
}

describe("Decimal-safe exchange validation", () => {
  it("accepts exact tick and step multiples without binary-float tolerance", () => {
    assert.deepEqual(validatePlaceOrderRequest(limit(), market), { ok: true });
    assert.deepEqual(validatePlaceOrderRequest(limit({ quantity: "0.00030", price: "33333.33" }), market), { ok: true });
  });

  it("rejects quantities and prices one smallest decimal unit off-grid", () => {
    assert.equal(
      validatePlaceOrderRequest(limit({ quantity: "0.000200000000000001" }), market).ok,
      false,
    );
    assert.equal(
      validatePlaceOrderRequest(limit({ price: "50000.001" }), market).ok,
      false,
    );
  });

  it("calculates min and max order value with exact decimal multiplication", () => {
    assert.deepEqual(
      validatePlaceOrderRequest(limit({ quantity: "0.00020", price: "50000.00" }), market),
      { ok: true },
    );
    assert.equal(
      validatePlaceOrderRequest(limit({ quantity: "0.00019", price: "50000.00" }), market).ok,
      false,
    );
    assert.equal(
      validatePlaceOrderRequest(limit({ quantity: "10.00001", price: "50000.00" }), market).ok,
      false,
    );
  });

  it("rejects exponent notation, signs, whitespace and malformed market increments", () => {
    for (const quantity of ["1e-5", "+0.00020", " 0.00020", "0.00020 ", ".00020", "00.00020"]) {
      assert.equal(validatePlaceOrderRequest(limit({ quantity }), market).ok, false, quantity);
    }
    assert.equal(validatePlaceOrderRequest(limit(), { ...market, stepSize: "0" }).ok, false);
    assert.equal(validatePlaceOrderRequest(limit(), { ...market, tickSize: "NaN" }).ok, false);
  });

  it("rounds deterministically without converting through JavaScript number", () => {
    assert.equal(roundToPrecision("1.005", 2), "1.01");
    assert.equal(roundToPrecision("999999999999999999.995", 2), "1000000000000000000.00");
    assert.throws(() => roundToPrecision("1e-8", 8), /invalid_decimal_value/);
    assert.throws(() => roundToPrecision("1.2", -1), /invalid_precision/);
  });
});
