import Decimal from "decimal.js";
import { D } from "./decimal";
import type { Market, PlaceOrderRequest } from "./types";

export const DATABASE_AMOUNT_SCALE = 10;
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

/**
 * Balance NUMERIC columns have scale 10. Holds always round away from zero so a
 * multiplication with more than ten fractional digits can never under-reserve.
 */
export function toHoldAmount(value: Decimal): string {
  if (!value.isFinite() || value.lte(0)) throw new Error("invalid_order_hold_amount");
  return value.toDecimalPlaces(DATABASE_AMOUNT_SCALE, Decimal.ROUND_UP).toFixed(DATABASE_AMOUNT_SCALE);
}

export function calculateOrderHold(input: {
  request: PlaceOrderRequest;
  market: Market;
  bestAskPrice?: string;
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

  const basisPrice = input.request.type === "market"
    ? input.bestAskPrice
    : input.request.price;
  if (!basisPrice) throw new Error("order_hold_price_required");

  const price = parsePositiveOrderDecimal(basisPrice);
  if (!price) throw new Error("invalid_order_hold_price");

  return {
    asset: input.market.quoteAsset,
    amount: toHoldAmount(quantity.times(price)),
    basisPrice,
  };
}
