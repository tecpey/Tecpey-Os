import type Decimal from "decimal.js";
import { D } from "./decimal";
import {
  isExactIncrement,
  multiplyOrderDecimals,
  parseOrderDecimal,
  parsePositiveOrderDecimal,
} from "./order-financials";
import type { Asset, Market, OrderSide, OrderType, PlaceOrderRequest } from "./types";

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string };

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

  const quantity = parsePositiveOrderDecimal(request.quantity);
  if (!quantity) {
    return { ok: false, error: "invalid_quantity", detail: "quantity must be a positive plain decimal" };
  }
  if (quantity.decimalPlaces() > market.quantityPrecision) {
    return {
      ok: false,
      error: "quantity_precision_violation",
      detail: `quantity supports at most ${market.quantityPrecision} decimal places`,
    };
  }

  const step = parsePositiveOrderDecimal(market.stepSize);
  if (!step) return { ok: false, error: "market_configuration_invalid", detail: "invalid stepSize" };
  if (!isExactIncrement(quantity, step)) {
    return {
      ok: false,
      error: "quantity_step_size_violation",
      detail: `quantity must be a multiple of stepSize ${market.stepSize}`,
    };
  }

  const priceRequired = request.type !== "market";
  let price: Decimal | null = null;
  if (priceRequired) {
    if (!request.price) {
      return { ok: false, error: "price_required", detail: "price is required for non-market orders" };
    }
    price = parsePositiveOrderDecimal(request.price);
    if (!price) {
      return { ok: false, error: "invalid_price", detail: "price must be a positive plain decimal" };
    }
    if (price.decimalPlaces() > market.pricePrecision) {
      return {
        ok: false,
        error: "price_precision_violation",
        detail: `price supports at most ${market.pricePrecision} decimal places`,
      };
    }

    const tick = parsePositiveOrderDecimal(market.tickSize);
    if (!tick) return { ok: false, error: "market_configuration_invalid", detail: "invalid tickSize" };
    if (!isExactIncrement(price, tick)) {
      return {
        ok: false,
        error: "price_tick_size_violation",
        detail: `price must be a multiple of tickSize ${market.tickSize}`,
      };
    }

    const value = multiplyOrderDecimals(request.price, request.quantity);
    const minValue = parsePositiveOrderDecimal(market.minOrderValue);
    const maxValue = parseOrderDecimal(market.maxOrderValue);
    if (!minValue || !maxValue) {
      return { ok: false, error: "market_configuration_invalid", detail: "invalid order-value bounds" };
    }
    if (value.lt(minValue)) {
      return {
        ok: false,
        error: "order_value_too_small",
        detail: `order value ${value.toString()} is below minimum ${market.minOrderValue}`,
      };
    }
    if (maxValue.gt(0) && value.gt(maxValue)) {
      return {
        ok: false,
        error: "order_value_too_large",
        detail: `order value ${value.toString()} exceeds maximum ${market.maxOrderValue}`,
      };
    }
  }

  if (request.type === "stop_limit") {
    if (!request.stopPrice) {
      return { ok: false, error: "stop_price_required", detail: "stopPrice is required for stop_limit orders" };
    }
    const stopPrice = parsePositiveOrderDecimal(request.stopPrice);
    if (!stopPrice) return { ok: false, error: "invalid_stop_price" };
    if (stopPrice.decimalPlaces() > market.pricePrecision) {
      return { ok: false, error: "stop_price_precision_violation" };
    }
    const tick = parsePositiveOrderDecimal(market.tickSize);
    if (!tick || !isExactIncrement(stopPrice, tick)) {
      return { ok: false, error: "stop_price_tick_size_violation" };
    }
  }

  return { ok: true };
}

export function roundToPrecision(value: string | number, precision: number): string {
  return D(value).toFixed(precision);
}

export function isValidOrderSide(value: unknown): value is OrderSide {
  return value === "buy" || value === "sell";
}

export function isValidOrderType(value: unknown): value is OrderType {
  return ["limit", "market", "ioc", "fok", "gtc", "stop_limit"].includes(value as string);
}
