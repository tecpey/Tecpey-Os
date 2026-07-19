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

/** Preserve the complete finite-decimal product before database rounding. */
export function multiplyOrderDecimals(...values: string[]): Decimal {
  if (values.length < 2) throw new Error("decimal_product_requires_two_values");
  const precision = values.reduce((sum, value) => sum + coefficientDigits(value), 4);
  const ExactDecimal = Decimal.clone({
    precision: Math.max(40, precision),
    rounding: Decimal.ROUND_HALF_UP,
  });
  return values.reduce(
    (product, value) => product.times(new ExactDecimal(value)),
    new ExactDecimal(1),
  );
}

function assertDatabaseRange(value: Decimal): void {
  if (!value.isFinite() || value.lt(0)) throw new Error("invalid_database_amount");
  if (value.gte(`1e${DATABASE_AMOUNT_INTEGER_DIGITS}`)) {
    throw new Error("database_amount_range_exceeded");
  }
}

/** Settlement truncates at asset scale so a fill can never debit/create more value. */
export function toSettlementAmount(value: Decimal): string {
  assertDatabaseRange(value);
  return value.toDecimalPlaces(DATABASE_AMOUNT_SCALE, Decimal.ROUND_DOWN)
    .toFixed(DATABASE_AMOUNT_SCALE);
}

/** Reservation rounds upward so the worst permitted limit fill is fully covered. */
export function toReserveAmount(value: Decimal): string {
  assertDatabaseRange(value);
  return value.toDecimalPlaces(DATABASE_AMOUNT_SCALE, Decimal.ROUND_UP)
    .toFixed(DATABASE_AMOUNT_SCALE);
}

/** Exact database-scale value; no rounding is accepted. */
export function toHoldAmount(value: Decimal): string {
  if (!value.isFinite() || value.lte(0)) throw new Error("invalid_order_hold_amount");
  if (value.decimalPlaces() > DATABASE_AMOUNT_SCALE) {
    throw new Error("order_hold_scale_exceeded");
  }
  assertDatabaseRange(value);
  return value.toFixed(DATABASE_AMOUNT_SCALE);
}

export function maximumFeeRate(market: Market): string {
  const maker = parseOrderDecimal(market.makerFee);
  const taker = parseOrderDecimal(market.takerFee);
  if (!maker || !taker || maker.lt(0) || taker.lt(0)) {
    throw new Error("market_fee_configuration_invalid");
  }
  return Decimal.max(maker, taker).toString();
}

export function calculateOrderHold(input: {
  request: PlaceOrderRequest;
  market: Market;
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
    throw new Error("market_buy_depth_reservation_required");
  }
  const basisPrice = input.request.price;
  if (!basisPrice || !parsePositiveOrderDecimal(basisPrice)) {
    throw new Error("invalid_order_hold_price");
  }

  const grossExact = multiplyOrderDecimals(input.request.quantity, basisPrice);
  const feeExact = multiplyOrderDecimals(
    grossExact.toFixed(grossExact.decimalPlaces()),
    maximumFeeRate(input.market),
  );
  const grossReserve = toReserveAmount(grossExact);
  const feeReserve = toReserveAmount(feeExact);
  const totalReserve = D(grossReserve).plus(D(feeReserve));

  return {
    asset: input.market.quoteAsset,
    amount: toHoldAmount(totalReserve),
    basisPrice,
  };
}
