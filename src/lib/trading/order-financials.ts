import Decimal from "decimal.js";
import { D } from "./decimal";
import type { Market, PlaceOrderRequest } from "./types";

export const DATABASE_AMOUNT_SCALE = 10;
export const DATABASE_AMOUNT_INTEGER_DIGITS = 20;
const PLAIN_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export type OrderHold = {
  asset: string;
  amount: string;
  basisPrice: string | null;
};

/** Accept only plain, finite decimal notation at the HTTP/financial boundary. */
export function parseOrderDecimal(value: string): Decimal | null {
  if (value.length === 0 || value.length > 100 || !PLAIN_DECIMAL.test(value)) return null;
  try {
    const parsed = D(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

export function parsePositiveOrderDecimal(value: string): Decimal | null {
  const parsed = parseOrderDecimal(value);
  return parsed && parsed.gt(0) ? parsed : null;
}

export function isExactIncrement(value: Decimal, increment: Decimal): boolean {
  return increment.gt(0) && value.mod(increment).isZero();
}

function coefficientDigits(value: string): number {
  const digits = value.replace(".", "").replace(/^0+/, "");
  return Math.max(1, digits.length);
}

function exactDecimalFor(values: string[]): typeof Decimal {
  const precision = values.reduce(
    (sum, value) => sum + coefficientDigits(value),
    8 + values.length * 2,
  );
  return Decimal.clone({
    precision: Math.max(40, precision),
    rounding: Decimal.ROUND_HALF_UP,
  });
}

/** Preserve the complete finite-decimal product used by validation and holds. */
export function multiplyOrderDecimals(left: string, right: string): Decimal {
  const ExactDecimal = exactDecimalFor([left, right]);
  return new ExactDecimal(left).times(new ExactDecimal(right));
}

function buyReserve(
  quantity: string,
  price: string,
  feeRate: string,
): Decimal {
  const ExactDecimal = exactDecimalFor([quantity, price, feeRate]);
  const notional = new ExactDecimal(quantity).times(new ExactDecimal(price));
  return notional.times(new ExactDecimal(1).plus(new ExactDecimal(feeRate)));
}

function maximumBuyFeeRate(market: Market): string {
  const maker = parseOrderDecimal(market.makerFee);
  const taker = parseOrderDecimal(market.takerFee);
  if (!maker || !taker) throw new Error("invalid_market_fee_rate");
  return Decimal.max(maker, taker).toFixed();
}

export function toHoldAmount(value: Decimal): string {
  if (!value.isFinite() || value.lte(0)) throw new Error("invalid_order_hold_amount");
  if (value.decimalPlaces() > DATABASE_AMOUNT_SCALE) {
    throw new Error("order_hold_scale_exceeded");
  }
  if (value.gte(`1e${DATABASE_AMOUNT_INTEGER_DIGITS}`)) {
    throw new Error("order_hold_range_exceeded");
  }
  return value.toFixed(DATABASE_AMOUNT_SCALE);
}

export function calculateOrderHold(input: {
  request: PlaceOrderRequest;
  market: Market;
  bestAskPrice?: string;
  marketBuyMaxQuoteAmount?: string;
}): OrderHold {
  const quantity = parsePositiveOrderDecimal(input.request.quantity);
  if (!quantity) throw new Error("invalid_quantity");

  if (input.request.side === "sell") {
    return {
      asset: input.market.baseAsset,
      amount: toHoldAmount(quantity),
      basisPrice: null,
    };
  }

  if (input.request.type === "market") {
    if (!input.marketBuyMaxQuoteAmount) {
      throw new Error("market_buy_max_quote_required");
    }
    const maxQuote = parsePositiveOrderDecimal(input.marketBuyMaxQuoteAmount);
    if (!maxQuote) throw new Error("invalid_market_buy_max_quote");
    if (input.bestAskPrice) {
      const minimumAtBestAsk = buyReserve(
        input.request.quantity,
        input.bestAskPrice,
        input.market.takerFee,
      );
      if (maxQuote.lt(minimumAtBestAsk)) {
        throw new Error("market_buy_max_quote_below_best_ask");
      }
    }
    return {
      asset: input.market.quoteAsset,
      amount: toHoldAmount(maxQuote),
      basisPrice: input.bestAskPrice ?? null,
    };
  }

  if (!input.request.price) throw new Error("order_hold_price_required");
  const price = parsePositiveOrderDecimal(input.request.price);
  if (!price) throw new Error("invalid_order_hold_price");
  return {
    asset: input.market.quoteAsset,
    amount: toHoldAmount(
      buyReserve(
        input.request.quantity,
        input.request.price,
        maximumBuyFeeRate(input.market),
      ),
    ),
    basisPrice: input.request.price,
  };
}
