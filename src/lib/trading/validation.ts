import type { Asset, Market, OrderSide, OrderType, PlaceOrderRequest } from "./types";

// ── Validation result ─────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string };

// ── Asset validation ──────────────────────────────────────────────────────────

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

// ── Market validation ─────────────────────────────────────────────────────────

export function validateMarketActive(market: Market): ValidationResult {
  if (market.status !== "active") {
    return { ok: false, error: "market_not_active", detail: market.symbol };
  }
  return { ok: true };
}

// ── Order field validation ────────────────────────────────────────────────────

export function validatePlaceOrderRequest(
  request: PlaceOrderRequest,
  market: Market,
): ValidationResult {
  const marketCheck = validateMarketActive(market);
  if (!marketCheck.ok) return marketCheck;

  // Quantity
  const qty = parseFloat(request.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "invalid_quantity", detail: "quantity must be a positive number" };
  }

  // Step size (quantity granularity)
  const step = parseFloat(market.stepSize);
  if (step > 0 && Math.abs(Math.round(qty / step) * step - qty) > 1e-10) {
    return {
      ok: false,
      error: "quantity_step_size_violation",
      detail: `quantity must be a multiple of stepSize ${market.stepSize}`,
    };
  }

  // Price — required for limit / stop_limit
  if (request.type === "limit" || request.type === "stop_limit") {
    if (!request.price) {
      return { ok: false, error: "price_required", detail: "price is required for limit orders" };
    }
    const price = parseFloat(request.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, error: "invalid_price", detail: "price must be a positive number" };
    }

    // Tick size (price granularity)
    const tick = parseFloat(market.tickSize);
    if (tick > 0 && Math.abs(Math.round(price / tick) * tick - price) > 1e-10) {
      return {
        ok: false,
        error: "price_tick_size_violation",
        detail: `price must be a multiple of tickSize ${market.tickSize}`,
      };
    }

    // Order value bounds
    const value = price * qty;
    const minValue = parseFloat(market.minOrderValue);
    const maxValue = parseFloat(market.maxOrderValue);
    if (value < minValue) {
      return {
        ok: false,
        error: "order_value_too_small",
        detail: `order value ${value} is below minimum ${market.minOrderValue}`,
      };
    }
    if (maxValue > 0 && value > maxValue) {
      return {
        ok: false,
        error: "order_value_too_large",
        detail: `order value ${value} exceeds maximum ${market.maxOrderValue}`,
      };
    }
  }

  // Stop price — required for stop_limit
  if (request.type === "stop_limit") {
    if (!request.stopPrice) {
      return { ok: false, error: "stop_price_required", detail: "stopPrice is required for stop_limit orders" };
    }
    const stopPrice = parseFloat(request.stopPrice);
    if (!Number.isFinite(stopPrice) || stopPrice <= 0) {
      return { ok: false, error: "invalid_stop_price" };
    }
  }

  return { ok: true };
}

// ── Precision helpers ─────────────────────────────────────────────────────────

export function roundToPrecision(value: string | number, precision: number): string {
  return parseFloat(String(value)).toFixed(precision);
}

export function isValidOrderSide(value: unknown): value is OrderSide {
  return value === "buy" || value === "sell";
}

export function isValidOrderType(value: unknown): value is OrderType {
  return ["limit", "market", "ioc", "fok", "gtc", "stop_limit"].includes(value as string);
}
