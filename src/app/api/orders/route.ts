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
import { getMarket } from "@/lib/trading/market-service";
import { createOrderTx, listOrders, getOrder } from "@/lib/trading/order-service";
import { validatePlaceOrderRequest, isValidOrderSide, isValidOrderType } from "@/lib/trading/validation";
import { getAvailableBalance } from "@/lib/trading/wallet-service";
import { holdFundsTx } from "@/lib/trading/wallet-balance-service";
import { getOrderBook } from "@/lib/trading/order-book";
import { getMatchingEngine } from "@/lib/trading/engine";
import type { Order, OrderSide, OrderStatus, OrderType, PlaceOrderRequest, TimeInForce } from "@/lib/trading/types";

export const dynamic = "force-dynamic";

// ── GET /api/orders — authenticated user's open/recent orders ─────────────────

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

// ── POST /api/orders — place a new order ──────────────────────────────────────
//
// Phase 30 flow:
//  1. Validate request fields and market rules.
//  2. Compute hold amount (funds to earmark before matching).
//  3. Pre-flight balance check — early rejection with descriptive error.
//  4. Atomic transaction: create order record + holdFundsTx.
//     Rolls back atomically if balance is insufficient (prevents orphaned orders).
//  5. Run matching engine — has its own transaction for the fill sequence.
//  6. Re-fetch order from DB (status/fills updated by engine).
//  7. Return 201 if accepted; 422 if the engine rejected/expired the order.

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

    // ── Parse fields ───────────────────────────────────────────────────────────

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

    // Risk engine check — fire-and-forget; does NOT block the order
    const ip = getClientIp(req);
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
    if (!validation.ok) {
      return apiError(validation.error, 400, { detail: validation.detail });
    }

    // ── Balance pre-check and hold ─────────────────────────────────────────────

    const qty = parseFloat(quantity);
    const isMarketOrder = type === "market";
    const limitPrice = price ? parseFloat(price) : 0;

    let holdAsset: string;
    let holdAmount: number;

    if (side === "buy") {
      holdAsset = marketDef.quoteAsset;
      if (isMarketOrder) {
        // Market buy: estimate cost from current best ask.
        const bestAsk = getOrderBook(market).bestAsk();
        if (!bestAsk) return apiError("no_liquidity", 422);
        holdAmount = parseFloat(bestAsk.price) * qty;
      } else {
        // Limit buy: hold limit_price × quantity of quote asset.
        holdAmount = limitPrice * qty;
      }
    } else {
      // Sell: hold base asset quantity.
      holdAsset = marketDef.baseAsset;
      holdAmount = qty;
    }

    // Pre-flight balance check — early rejection with a descriptive error.
    // The atomic hold inside the transaction below is the true enforcement gate.
    const available = await getAvailableBalance(userId, holdAsset);
    if (available < holdAmount - 1e-10) {
      return apiError("insufficient_balance", 422, {
        detail: `requires ${holdAmount.toFixed(8)} ${holdAsset}, available ${available.toFixed(8)}`,
      });
    }

    // ── Atomic: create order + hold funds in one transaction ──────────────────
    //
    // If the hold UPDATE matches 0 rows (concurrent request drained the balance),
    // the entire transaction rolls back — no orphaned order in the DB.

    let order: Order;
    try {
      const txResult = await withTx(async (client) => {
        const o = await createOrderTx(client, { ...request, userId });
        if (!o) throw new Error("order_creation_failed");

        const held = await holdFundsTx(client, userId, holdAsset, holdAmount, o.id);
        if (!held) throw new Error("insufficient_balance");

        return o;
      });

      if (!txResult.enabled) return apiError("order_creation_failed", 503);
      order = txResult.value;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg === "insufficient_balance") {
        return apiError("insufficient_balance", 422, {
          detail: `requires ${holdAmount.toFixed(8)} ${holdAsset} — balance changed between check and hold`,
        });
      }
      logger.error("[orders] order+hold transaction failed", { userId, market, err });
      return apiError("order_creation_failed", 503);
    }

    // ── Run matching engine ───────────────────────────────────────────────────

    const engine = getMatchingEngine();
    const engineResult = await engine.placeOrder(order);

    // Re-fetch the order so the response reflects engine-applied fills/status.
    const finalOrder = await getOrder(order.id, userId) ?? order;

    const latencyMs = Date.now() - start;
    logger.info("[orders] order processed", {
      requestId: req.headers.get("x-tecpey-request-id") ?? undefined,
      userId,
      market,
      orderId: order.id,
      type: order.type,
      side: order.side,
      accepted: engineResult.accepted,
      tradeCount: engineResult.tradeIds.length,
      finalStatus: finalOrder.status,
      latencyMs,
    });

    // Audit trail — write after engine result is known
    writeAudit({
      actorId: userId,
      action: "order_placed",
      resourceType: "order",
      resourceId: order.id,
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        market, side, type: order.type, quantity,
        accepted: engineResult.accepted,
        tradeCount: engineResult.tradeIds.length,
      },
    });

    if (!engineResult.accepted) {
      // Engine rejected or expired the order (FOK failure, no liquidity, etc.).
      return apiError(engineResult.reason ?? "order_not_accepted", 422, {
        orderId: order.id,
        status: finalOrder.status,
      });
    }

    return apiOk({ order: finalOrder, tradeIds: engineResult.tradeIds }, 201);
  });
}
