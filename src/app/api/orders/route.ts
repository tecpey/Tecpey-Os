import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { logger } from "@/lib/logger";
import { withTx } from "@/lib/db";
import { checkOrderRisk } from "@/lib/security/risk-engine";
import { writeAudit } from "@/lib/security/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { enforceTradeAllowed } from "@/lib/security/risk-enforcement";
import { getMarket } from "@/lib/trading/market-service";
import { createOrderTx, listOrders, getOrder } from "@/lib/trading/order-service";
import { validatePlaceOrderRequest, isValidOrderSide, isValidOrderType } from "@/lib/trading/validation";
import {
  getAvailableBalanceAmount,
  holdOrderFundsTx,
} from "@/lib/trading/wallet-service";
import { calculateOrderHold } from "@/lib/trading/order-financials";
import { D } from "@/lib/trading/decimal";
import { getOrderBook } from "@/lib/trading/order-book";
import { getMatchingEngine } from "@/lib/trading/engine";
import type { Order, OrderSide, OrderStatus, OrderType, PlaceOrderRequest, TimeInForce } from "@/lib/trading/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/orders" }, async () => {
    const rlimit = await rateLimit(req, { namespace: "orders-read", limit: 120, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.userId && !session.studentId) return apiError("authentication_required", 401);
    const userId = session.userId ?? session.studentId ?? "";

    const url = new URL(req.url);
    const market = url.searchParams.get("market") ?? undefined;
    const status = url.searchParams.get("status") as OrderStatus | undefined;
    const side = url.searchParams.get("side") as OrderSide | undefined;
    const type = url.searchParams.get("type") as OrderType | undefined;
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const rawLimit = Number(url.searchParams.get("limit") ?? 50);
    const queryLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 50;

    const orders = await listOrders({ userId, market, status, side, type, from, to, cursor, limit: queryLimit });
    const nextCursor = orders.length === queryLimit ? orders[orders.length - 1]?.createdAt : null;
    return apiOk({ orders, count: orders.length, nextCursor });
  });
}

// POST financial authority:
// validate Decimal strings → calculate no-under-reservation hold → compare exact
// available balance → atomically create order + hold + immutable ledger evidence.
export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/orders" }, async () => {
    const start = Date.now();

    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
    const rlimit = await rateLimit(req, { namespace: "orders-place", limit: 30, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.userId && !session.studentId) return apiError("authentication_required", 401);
    const userId = session.userId ?? session.studentId ?? "";

    let body: Record<string, unknown>;
    try {
      const raw = await req.text();
      if (raw.length > 4_000) return apiError("payload_too_large", 413);
      body = JSON.parse(raw || "{}");
    } catch {
      return apiError("invalid_json", 400);
    }

    const market = String(body.market ?? "").toUpperCase().trim();
    const side = body.side;
    const type = body.type;
    const quantity = String(body.quantity ?? "");
    const price = body.price ? String(body.price) : undefined;
    const stopPrice = body.stopPrice ? String(body.stopPrice) : undefined;
    const clientOrderId = body.clientOrderId ? String(body.clientOrderId).slice(0, 64) : undefined;
    const rawTIF = body.timeInForce ? String(body.timeInForce).toUpperCase() : undefined;

    if (!market) return apiError("market_required", 400);
    if (!isValidOrderSide(side)) return apiError("invalid_order_side", 400);
    if (!isValidOrderType(type)) return apiError("invalid_order_type", 400);
    if (rawTIF && !["GTC", "IOC", "FOK"].includes(rawTIF)) {
      return apiError("invalid_time_in_force", 400);
    }
    const timeInForce = rawTIF as TimeInForce | undefined;

    const marketDef = await getMarket(market);
    if (!marketDef) return apiError("market_not_found", 404);

    const ip = getClientIp(req);
    const tradeBlock = await enforceTradeAllowed(userId);
    if (tradeBlock) return apiError(tradeBlock, 403);

    const fingerprint = `${market}:${side}:${quantity}:${price ?? "mkt"}:${userId}`;
    checkOrderRisk({ userId, market, ip, orderFingerprint: fingerprint });

    const request: PlaceOrderRequest = {
      market,
      side,
      type,
      quantity,
      price,
      stopPrice,
      clientOrderId,
      timeInForce,
    };

    const validation = validatePlaceOrderRequest(request, marketDef);
    if (!validation.ok) return apiError(validation.error, 400, { detail: validation.detail });

    let bestAskPrice: string | undefined;
    if (side === "buy" && type === "market") {
      const bestAsk = getOrderBook(market).bestAsk();
      if (!bestAsk) return apiError("no_liquidity", 422);
      bestAskPrice = bestAsk.price;
    }

    let hold: ReturnType<typeof calculateOrderHold>;
    try {
      hold = calculateOrderHold({ request, market: marketDef, bestAskPrice });
    } catch (error) {
      logger.error("[orders] exact hold calculation failed", { userId, market, error });
      return apiError("invalid_order_hold", 400);
    }

    const available = await getAvailableBalanceAmount(userId, hold.asset);
    if (D(available).lt(hold.amount)) {
      return apiError("insufficient_balance", 422, {
        detail: `requires ${hold.amount} ${hold.asset}, available ${available}`,
      });
    }

    let order: Order;
    try {
      const txResult = await withTx(async (client) => {
        const created = await createOrderTx(client, { ...request, userId });
        if (!created) throw new Error("order_creation_failed");
        const held = await holdOrderFundsTx(client, userId, hold.asset, hold.amount, created.id);
        if (!held) throw new Error("insufficient_balance");
        return created;
      });

      if (!txResult.enabled) return apiError("order_creation_failed", 503);
      order = txResult.value;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (message === "insufficient_balance") {
        return apiError("insufficient_balance", 422, {
          detail: `requires ${hold.amount} ${hold.asset} — balance changed between check and hold`,
        });
      }
      logger.error("[orders] order+exact-hold transaction failed", { userId, market, error });
      return apiError("order_creation_failed", 503);
    }

    const engine = getMatchingEngine();
    const engineResult = await engine.placeOrder(order);
    const finalOrder = await getOrder(order.id, userId) ?? order;

    logger.info("[orders] order processed", {
      requestId: req.headers.get("x-tecpey-request-id") ?? undefined,
      userId,
      market,
      orderId: order.id,
      type: order.type,
      side: order.side,
      holdAsset: hold.asset,
      holdAmount: hold.amount,
      accepted: engineResult.accepted,
      tradeCount: engineResult.tradeIds.length,
      finalStatus: finalOrder.status,
      latencyMs: Date.now() - start,
    });

    writeAudit({
      actorId: userId,
      action: "order_placed",
      resourceType: "order",
      resourceId: order.id,
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        market,
        side,
        type: order.type,
        quantity,
        holdAsset: hold.asset,
        holdAmount: hold.amount,
        accepted: engineResult.accepted,
        tradeCount: engineResult.tradeIds.length,
      },
    });

    if (!engineResult.accepted) {
      return apiError(engineResult.reason ?? "order_not_accepted", 422, {
        orderId: order.id,
        status: finalOrder.status,
      });
    }
    return apiOk({ order: finalOrder, tradeIds: engineResult.tradeIds }, 201);
  });
}
