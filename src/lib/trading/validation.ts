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

// SB-015. `stop_limit` is a declared order type — it is in the OrderType union
// and in the persisted CHECK constraint — but no trigger engine exists. The
// matching engine never reads `stopPrice`: it derives
// `isGTC = !isMarket && !isFOK && !isIOC`, which is true for a stop order, so
// such an order would rest on the book immediately live at its limit price with
// the stop condition silently discarded. For a protective stop that inverts the
// user's intent, so admission must refuse it rather than accept it and behave
// differently. The type is deliberately left in place: closing this means
// building real stop activation, and that work should not also have to
// re-introduce the type and migrate the constraint.
function stopOrdersAreUnsupported(type: OrderType): boolean {
  return type === "stop_limit";
}

export function validatePlaceOrderRequest(
  request: PlaceOrderRequest,
  market: Market,
): ValidationResult {
  if (stopOrdersAreUnsupported(request.type)) {
    return {
      ok: false,
      error: "order_type_unsupported",
      detail: "stop_limit orders are not supported: no stop trigger engine exists",
    };
  }

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

  // The former stop-price validation lived here. It is intentionally gone: it
  // validated stopPrice for precision and tick size and then returned ok, which
  // is what made the silent fallthrough convincing to a caller. Stop orders are
  // now refused above, so reaching this point with one is impossible.

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
