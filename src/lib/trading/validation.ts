import Decimal from "decimal.js";
import type { Asset, Market, OrderSide, OrderType, PlaceOrderRequest } from "./types";

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string };

const DECIMAL_INPUT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function decimal(value: string): Decimal | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 120) return null;
  if (!DECIMAL_INPUT.test(value)) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function positiveDecimal(value: string): Decimal | null {
  const parsed = decimal(value);
  return parsed?.gt(0) ? parsed : null;
}

function nonNegativeDecimal(value: string): Decimal | null {
  const parsed = decimal(value);
  return parsed?.gte(0) ? parsed : null;
}

function isExactMultiple(value: Decimal, increment: Decimal): boolean {
  return value.mod(increment).isZero();
}

export function validateAssetForDeposit(asset: Asset): ValidationResult {
  if (asset.status !== "active") return { ok: false, error: "asset_not_active", detail: asset.symbol };
  if (!asset.depositEnabled) return { ok: false, error: "deposit_disabled", detail: asset.symbol };
  return { ok: true };
}

export function validateAssetForWithdraw(asset: Asset): ValidationResult {
  if (asset.status !== "active") return { ok: false, error: "asset_not_active", detail: asset.symbol };
  if (!asset.withdrawEnabled) return { ok: false, error: "withdraw_disabled", detail: asset.symbol };
  return { ok: true };
}

export function validateMarketActive(market: Market): ValidationResult {
  if (market.status !== "active") {
    return { ok: false, error: "market_not_active", detail: market.symbol };
  }
  return { ok: true };
}

export function validatePlaceOrderRequest(
  request: PlaceOrderRequest,
  market: Market,
): ValidationResult {
  const marketCheck = validateMarketActive(market);
  if (!marketCheck.ok) return marketCheck;

  const quantity = positiveDecimal(request.quantity);
  if (!quantity) {
    return { ok: false, error: "invalid_quantity", detail: "quantity must be a positive decimal string" };
  }

  const stepSize = positiveDecimal(market.stepSize);
  if (!stepSize) {
    return { ok: false, error: "invalid_market_step_size", detail: market.stepSize };
  }
  if (!isExactMultiple(quantity, stepSize)) {
    return {
      ok: false,
      error: "quantity_step_size_violation",
      detail: `quantity must be a multiple of stepSize ${market.stepSize}`,
    };
  }

  if (request.type === "limit" || request.type === "stop_limit") {
    if (!request.price) {
      return { ok: false, error: "price_required", detail: "price is required for limit orders" };
    }

    const price = positiveDecimal(request.price);
    if (!price) {
      return { ok: false, error: "invalid_price", detail: "price must be a positive decimal string" };
    }

    const tickSize = positiveDecimal(market.tickSize);
    if (!tickSize) {
      return { ok: false, error: "invalid_market_tick_size", detail: market.tickSize };
    }
    if (!isExactMultiple(price, tickSize)) {
      return {
        ok: false,
        error: "price_tick_size_violation",
        detail: `price must be a multiple of tickSize ${market.tickSize}`,
      };
    }

    const minOrderValue = nonNegativeDecimal(market.minOrderValue);
    const maxOrderValue = nonNegativeDecimal(market.maxOrderValue);
    if (!minOrderValue) {
      return { ok: false, error: "invalid_market_min_order_value", detail: market.minOrderValue };
    }
    if (!maxOrderValue) {
      return { ok: false, error: "invalid_market_max_order_value", detail: market.maxOrderValue };
    }

    const orderValue = price.mul(quantity);
    if (orderValue.lt(minOrderValue)) {
      return {
        ok: false,
        error: "order_value_too_small",
        detail: `order value ${orderValue.toFixed()} is below minimum ${market.minOrderValue}`,
      };
    }
    if (maxOrderValue.gt(0) && orderValue.gt(maxOrderValue)) {
      return {
        ok: false,
        error: "order_value_too_large",
        detail: `order value ${orderValue.toFixed()} exceeds maximum ${market.maxOrderValue}`,
      };
    }
  }

  if (request.type === "stop_limit") {
    if (!request.stopPrice) {
      return { ok: false, error: "stop_price_required", detail: "stopPrice is required for stop_limit orders" };
    }
    if (!positiveDecimal(request.stopPrice)) {
      return { ok: false, error: "invalid_stop_price" };
    }
  }

  return { ok: true };
}

export function roundToPrecision(value: string | number, precision: number): string {
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 30) {
    throw new Error("invalid_precision");
  }
  const source = typeof value === "number" ? String(value) : value;
  const parsed = decimal(source);
  if (!parsed) throw new Error("invalid_decimal_value");
  return parsed.toFixed(precision, Decimal.ROUND_HALF_UP);
}

export function isValidOrderSide(value: unknown): value is OrderSide {
  return value === "buy" || value === "sell";
}

export function isValidOrderType(value: unknown): value is OrderType {
  return ["limit", "market", "ioc", "fok", "gtc", "stop_limit"].includes(value as string);
}
