import Decimal from "decimal.js";
import { D } from "./decimal";
import {
  DATABASE_AMOUNT_INTEGER_DIGITS,
  DATABASE_AMOUNT_SCALE,
  parseOrderDecimal,
} from "./order-financials";

export type ExactTradeAmounts = {
  quantity: string;
  price: string;
  quoteGross: string;
  buyerFee: string;
  sellerFee: string;
  buyerQuoteDebit: string;
  sellerQuoteNet: string;
  platformFeeCredit: string;
};

function assertDatabaseRange(value: Decimal, label: string): void {
  if (!value.isFinite() || value.isNegative()) {
    throw new Error(`invalid_${label}`);
  }
  if (value.gte(`1e${DATABASE_AMOUNT_INTEGER_DIGITS}`)) {
    throw new Error(`${label}_range_exceeded`);
  }
}

/** Canonical persisted input. Rounding an admitted price/quantity is forbidden. */
export function canonicalMatchingInput(value: string, label = "matching_amount"): string {
  const parsed = parseOrderDecimal(value);
  if (!parsed) throw new Error(`invalid_${label}`);
  assertDatabaseRange(parsed, label);
  if (parsed.decimalPlaces() > DATABASE_AMOUNT_SCALE) {
    throw new Error(`${label}_scale_exceeded`);
  }
  return parsed.toFixed(DATABASE_AMOUNT_SCALE);
}

/**
 * Settlement policy: exact products/divisions are rounded toward zero at the
 * PostgreSQL NUMERIC(30,10) boundary. This never creates value or over-debits a
 * participant. All conservation equations are evaluated after this rounding.
 */
export function toSettlementAmount(
  value: Decimal,
  label = "settlement_amount",
): string {
  assertDatabaseRange(value, label);
  return value
    .toDecimalPlaces(DATABASE_AMOUNT_SCALE, Decimal.ROUND_DOWN)
    .toFixed(DATABASE_AMOUNT_SCALE);
}

export function decimalMin(left: string, right: string): string {
  return Decimal.min(D(left), D(right)).toFixed(DATABASE_AMOUNT_SCALE);
}

export function decimalAdd(...values: string[]): string {
  return toSettlementAmount(
    values.reduce((sum, value) => sum.plus(D(value)), D(0)),
    "decimal_sum",
  );
}

export function decimalSubtract(left: string, right: string): string {
  const result = D(left).minus(D(right));
  if (result.isNegative()) throw new Error("negative_decimal_result");
  return toSettlementAmount(result, "decimal_difference");
}

export function isZeroAmount(value: string): boolean {
  return D(value).isZero();
}

export function isPositiveAmount(value: string): boolean {
  return D(value).isPositive();
}

export function crossesLimit(input: {
  takerSide: "buy" | "sell";
  takerLimit: string | null;
  makerPrice: string;
}): boolean {
  if (input.takerLimit === null) return true;
  const limit = D(input.takerLimit);
  const maker = D(input.makerPrice);
  return input.takerSide === "buy" ? maker.lte(limit) : maker.gte(limit);
}

export function calculateExactTradeAmounts(input: {
  quantity: string;
  price: string;
  buyerFeeRate: string;
  sellerFeeRate: string;
}): ExactTradeAmounts {
  const quantity = D(canonicalMatchingInput(input.quantity, "trade_quantity"));
  const price = D(canonicalMatchingInput(input.price, "trade_price"));
  const buyerFeeRate = parseOrderDecimal(input.buyerFeeRate);
  const sellerFeeRate = parseOrderDecimal(input.sellerFeeRate);
  if (!buyerFeeRate || !sellerFeeRate) throw new Error("invalid_matching_fee_rate");
  if (
    !quantity.isPositive() ||
    !price.isPositive() ||
    buyerFeeRate.isNegative() ||
    sellerFeeRate.isNegative()
  ) {
    throw new Error("invalid_matching_amount");
  }

  const quoteGross = toSettlementAmount(
    quantity.times(price),
    "trade_quote_gross",
  );
  if (!D(quoteGross).isPositive()) {
    throw new Error("trade_amount_below_settlement_scale");
  }
  const buyerFee = toSettlementAmount(
    D(quoteGross).times(buyerFeeRate),
    "buyer_trade_fee",
  );
  const sellerFee = toSettlementAmount(
    D(quoteGross).times(sellerFeeRate),
    "seller_trade_fee",
  );
  const buyerQuoteDebit = decimalAdd(quoteGross, buyerFee);
  const sellerQuoteNet = decimalSubtract(quoteGross, sellerFee);
  const platformFeeCredit = decimalAdd(buyerFee, sellerFee);

  return {
    quantity: quantity.toFixed(DATABASE_AMOUNT_SCALE),
    price: price.toFixed(DATABASE_AMOUNT_SCALE),
    quoteGross,
    buyerFee,
    sellerFee,
    buyerQuoteDebit,
    sellerQuoteNet,
    platformFeeCredit,
  };
}

export function exactAveragePrice(input: {
  cumulativeQuote: string;
  cumulativeQuantity: string;
}): string {
  const quantity = D(input.cumulativeQuantity);
  if (!quantity.isPositive()) return D(0).toFixed(DATABASE_AMOUNT_SCALE);
  return toSettlementAmount(
    D(input.cumulativeQuote).div(quantity),
    "average_fill_price",
  );
}
