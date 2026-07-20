import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import {
  calculateExactTradeAmounts,
  crossesLimit,
  decimalAdd,
  decimalMin,
  exactAveragePrice,
} from "../../lib/trading/matching-financials";
import {
  getOrderBookStore,
  type EngineOrder,
} from "../../lib/trading/order-book-store";
import { isolateExchangeOrderTestCache } from "./exchange-order-test-environment";

const restoreTestCache = isolateExchangeOrderTestCache();
after(restoreTestCache);

function order(input: Partial<EngineOrder> & Pick<EngineOrder, "orderId" | "side">): EngineOrder {
  return {
    orderId: input.orderId,
    userId: input.userId ?? `user-${input.orderId}`,
    market: input.market ?? "EXACTUSDT",
    side: input.side,
    pricePerUnit: input.pricePerUnit ?? "0.1000000000",
    originalQty: input.originalQty ?? "0.3000000000",
    remaining: input.remaining ?? "0.3000000000",
    ts: input.ts ?? 1,
  };
}

afterEach(() => {
  globalThis.tecpeyEngineBooks = new Map();
  globalThis.tecpeyOrderBookStore = undefined;
});

describe("Exact Exchange matching primitives", () => {
  it("calculates quote, fees and conservation at NUMERIC(30,10) scale", () => {
    assert.deepEqual(
      calculateExactTradeAmounts({
        quantity: "0.3000000000",
        price: "0.1000000000",
        buyerFeeRate: "0.001",
        sellerFeeRate: "0.001",
      }),
      {
        quantity: "0.3000000000",
        price: "0.1000000000",
        quoteGross: "0.0300000000",
        buyerFee: "0.0000300000",
        sellerFee: "0.0000300000",
        buyerQuoteDebit: "0.0300300000",
        sellerQuoteNet: "0.0299700000",
        platformFeeCredit: "0.0000600000",
      },
    );
  });

  it("rounds sub-scale products toward zero without creating value", () => {
    assert.deepEqual(
      calculateExactTradeAmounts({
        quantity: "0.0000100000",
        price: "0.0100000000",
        buyerFeeRate: "0.001",
        sellerFeeRate: "0.001",
      }),
      {
        quantity: "0.0000100000",
        price: "0.0100000000",
        quoteGross: "0.0000001000",
        buyerFee: "0.0000000001",
        sellerFee: "0.0000000001",
        buyerQuoteDebit: "0.0000001001",
        sellerQuoteNet: "0.0000000999",
        platformFeeCredit: "0.0000000002",
      },
    );
  });

  it("derives exact VWAP for binary-unsafe multi-price fills", () => {
    const quote = decimalAdd("0.0100000000", "0.0400000000");
    const quantity = decimalAdd("0.1000000000", "0.2000000000");
    assert.equal(quote, "0.0500000000");
    assert.equal(quantity, "0.3000000000");
    assert.equal(
      exactAveragePrice({
        cumulativeQuote: quote,
        cumulativeQuantity: quantity,
      }),
      "0.1666666666",
    );
  });

  it("compares crossing and minimum values without floating point", () => {
    assert.equal(
      crossesLimit({
        takerSide: "buy",
        takerLimit: "0.3000000000",
        makerPrice: "0.3000000000",
      }),
      true,
    );
    assert.equal(
      crossesLimit({
        takerSide: "buy",
        takerLimit: "0.3000000000",
        makerPrice: "0.3000000001",
      }),
      false,
    );
    assert.equal(decimalMin("0.3000000001", "0.3000000000"), "0.3000000000");
  });

  it("sorts exact price keys and sums FOK volume as a string", () => {
    const store = getOrderBookStore();
    store.insert("EXACTUSDT", order({
      orderId: "ask-high",
      side: "sell",
      pricePerUnit: "0.3000000001",
      originalQty: "0.1000000000",
      remaining: "0.1000000000",
      ts: 2,
    }));
    store.insert("EXACTUSDT", order({
      orderId: "ask-low-a",
      side: "sell",
      pricePerUnit: "0.3000000000",
      originalQty: "0.1000000000",
      remaining: "0.1000000000",
      ts: 1,
    }));
    store.insert("EXACTUSDT", order({
      orderId: "ask-low-b",
      side: "sell",
      pricePerUnit: "0.3000000000",
      originalQty: "0.2000000000",
      remaining: "0.2000000000",
      ts: 3,
    }));

    const levels = store.getLevels("EXACTUSDT", "sell");
    assert.deepEqual(levels.map((level) => level.price), [
      "0.3000000000",
      "0.3000000001",
    ]);
    assert.deepEqual(levels[0]?.orders.map((entry) => entry.orderId), [
      "ask-low-a",
      "ask-low-b",
    ]);
    assert.equal(
      store.getFOKVolume("EXACTUSDT", "buy", "0.3000000000"),
      "0.3000000000",
    );
    assert.equal(
      store.getFOKVolume("EXACTUSDT", "buy", "0.3000000001"),
      "0.4000000000",
    );
  });
});
