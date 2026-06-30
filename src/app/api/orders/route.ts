import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { logger } from "@/lib/logger";
import { getMarket } from "@/lib/trading/market-service";
import { createOrder, listOrders } from "@/lib/trading/order-service";
import { validatePlaceOrderRequest, isValidOrderSide, isValidOrderType } from "@/lib/trading/validation";
import type { OrderStatus, PlaceOrderRequest } from "@/lib/trading/types";

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
    const rawLimit = Number(url.searchParams.get("limit") ?? 50);
    const queryLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 50;

    const orders = await listOrders({ userId, market, status, limit: queryLimit });
    return apiOk({ orders, count: orders.length });
  });
}

// ── POST /api/orders — place a new order ──────────────────────────────────────

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

    // Parse and validate fields.
    const market = String(body.market ?? "").toUpperCase().trim();
    const side = body.side;
    const type = body.type;
    const quantity = String(body.quantity ?? "");
    const price = body.price ? String(body.price) : undefined;
    const stopPrice = body.stopPrice ? String(body.stopPrice) : undefined;
    const clientOrderId = body.clientOrderId ? String(body.clientOrderId).slice(0, 64) : undefined;

    if (!market) return apiError("market_required", 400);
    if (!isValidOrderSide(side)) return apiError("invalid_order_side", 400);
    if (!isValidOrderType(type)) return apiError("invalid_order_type", 400);

    const marketDef = await getMarket(market);
    if (!marketDef) return apiError("market_not_found", 404);

    const request: PlaceOrderRequest = {
      market,
      side,
      type,
      quantity,
      price,
      stopPrice,
      clientOrderId,
    };

    const validation = validatePlaceOrderRequest(request, marketDef);
    if (!validation.ok) {
      return apiError(validation.error, 400, { detail: validation.detail });
    }

    const order = await createOrder({ ...request, userId });
    if (!order) return apiError("order_creation_failed", 503);

    const latencyMs = Date.now() - start;
    logger.info("[orders] order placed", {
      requestId: req.headers.get("x-tecpey-request-id") ?? undefined,
      userId,
      market,
      orderId: order.id,
      type: order.type,
      side: order.side,
      latencyMs,
    });

    return apiOk({ order }, 201);
  });
}
