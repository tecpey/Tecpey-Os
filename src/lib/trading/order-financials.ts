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

/**
 * Decimal's global precision is intentionally bounded for the legacy engine.
 * Admission multiplication uses an isolated constructor with enough significant
 * digits to preserve the complete finite-decimal product before scale checks.
 */
export function multiplyOrderDecimals(left: string, right: string): Decimal {
  const precision = coefficientDigits(left) + coefficientDigits(right) + 4;
  const ExactDecimal = Decimal.clone({
    precision: Math.max(40, precision),
    rounding: Decimal.ROUND_HALF_UP,
  });
  return new ExactDecimal(left).times(new ExactDecimal(right));
}

/**
 * The existing matching/release engine still serializes fills at scale 10.
 * Until that next #30 slice is Decimal-safe, admission rejects any hold that
 * would require rounding. This prevents both under-reservation and terminal
 * held-balance dust from asymmetric hold/release rounding.
 */
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
    amount: toHoldAmount(multiplyOrderDecimals(input.request.quantity, basisPrice)),
    basisPrice,
  };
}
