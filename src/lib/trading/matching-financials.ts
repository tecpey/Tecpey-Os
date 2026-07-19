import Decimal from "decimal.js";
import { D } from "./decimal";
import {
  multiplyOrderDecimals,
  parseOrderDecimal,
  toSettlementAmount,
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

export function decimalMin(left: string, right: string): string {
  return Decimal.min(D(left), D(right)).toString();
}

export function decimalAdd(...values: string[]): string {
  return values.reduce((sum, value) => sum.plus(D(value)), D(0)).toFixed(10);
}

export function decimalSubtract(left: string, right: string): string {
  const result = D(left).minus(D(right));
  if (result.lt(0)) throw new Error("negative_decimal_result");
  return result.toFixed(10);
}

export function isZeroAmount(value: string): boolean {
  return D(value).isZero();
}

export function isPositiveAmount(value: string): boolean {
  return D(value).gt(0);
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
  const quantity = parseOrderDecimal(input.quantity);
  const price = parseOrderDecimal(input.price);
  const buyerFeeRate = parseOrderDecimal(input.buyerFeeRate);
  const sellerFeeRate = parseOrderDecimal(input.sellerFeeRate);
  if (!quantity || !price || !buyerFeeRate || !sellerFeeRate) {
    throw new Error("invalid_matching_decimal");
  }
  if (quantity.lte(0) || price.lte(0) || buyerFeeRate.lt(0) || sellerFeeRate.lt(0)) {
    throw new Error("invalid_matching_amount");
  }

  const quoteGross = toSettlementAmount(multiplyOrderDecimals(input.quantity, input.price));
  const buyerFee = toSettlementAmount(multiplyOrderDecimals(quoteGross, input.buyerFeeRate));
  const sellerFee = toSettlementAmount(multiplyOrderDecimals(quoteGross, input.sellerFeeRate));
  const buyerQuoteDebit = D(quoteGross).plus(D(buyerFee)).toFixed(10);
  const sellerQuoteNet = D(quoteGross).minus(D(sellerFee)).toFixed(10);
  const platformFeeCredit = D(buyerFee).plus(D(sellerFee)).toFixed(10);

  if (D(sellerQuoteNet).lt(0)) throw new Error("fee_exceeds_trade_value");
  return {
    quantity: D(input.quantity).toFixed(10),
    price: D(input.price).toFixed(10),
    quoteGross,
    buyerFee,
    sellerFee,
    buyerQuoteDebit,
    sellerQuoteNet,
    platformFeeCredit,
  };
}
