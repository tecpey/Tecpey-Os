import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateOrderHold } from "../../lib/trading/order-financials";
import {
  calculateExactTradeAmounts,
  crossesLimit,
  decimalMin,
} from "../../lib/trading/matching-financials";
import type { Market, PlaceOrderRequest } from "../../lib/trading/types";

const market: Market = {
  symbol: "BTCUSDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  status: "active",
  tickSize: "0.01",
  stepSize: "0.00001",
  minOrderValue: "0.01",
  maxOrderValue: "1000",
  pricePrecision: 2,
  quantityPrecision: 5,
  makerFee: "0.001",
  takerFee: "0.001",
};

const buy: PlaceOrderRequest = {
  market: market.symbol,
  side: "buy",
  type: "limit",
  quantity: "0.3",
  price: "0.10",
  timeInForce: "GTC",
};

describe("Exact Exchange matching financials", () => {
  it("reserves limit price plus the maximum fee", () => {
    assert.deepEqual(calculateOrderHold({ request: buy, market }), {
      asset: "USDT",
      amount: "0.0300300000",
      basisPrice: "0.10",
    });
  });

  it("fails closed for market buys without a depth reservation envelope", () => {
    assert.throws(
      () => calculateOrderHold({ request: { ...buy, type: "market", price: undefined }, market }),
      /market_buy_depth_reservation_required/,
    );
  });

  it("calculates gross, both fees and platform conservation exactly", () => {
    assert.deepEqual(calculateExactTradeAmounts({
      quantity: "0.3",
      price: "0.10",
      buyerFeeRate: "0.001",
      sellerFeeRate: "0.001",
    }), {
      quantity: "0.3000000000",
      price: "0.1000000000",
      quoteGross: "0.0300000000",
      buyerFee: "0.0000300000",
      sellerFee: "0.0000300000",
      buyerQuoteDebit: "0.0300300000",
      sellerQuoteNet: "0.0299700000",
      platformFeeCredit: "0.0000600000",
    });
  });

  it("truncates sub-scale fees rather than creating or over-debiting value", () => {
    const result = calculateExactTradeAmounts({
      quantity: "0.00001",
      price: "0.01",
      buyerFeeRate: "0.001",
      sellerFeeRate: "0.001",
    });
    assert.equal(result.quoteGross, "0.0000001000");
    assert.equal(result.buyerFee, "0.0000000001");
    assert.equal(result.sellerFee, "0.0000000001");
  });

  it("compares crossing prices and minimum quantities without floating point", () => {
    assert.equal(crossesLimit({ takerSide: "buy", takerLimit: "0.3", makerPrice: "0.30" }), true);
    assert.equal(crossesLimit({ takerSide: "buy", takerLimit: "0.3", makerPrice: "0.3000000001" }), false);
    assert.equal(crossesLimit({ takerSide: "sell", takerLimit: "0.3", makerPrice: "0.30" }), true);
    assert.equal(decimalMin("0.3000000001", "0.3"), "0.3");
  });
});
