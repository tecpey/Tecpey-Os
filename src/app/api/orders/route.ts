import { readJsonBody } from "@/lib/security/request-body";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { logger } from "@/lib/logger";
import { checkOrderRisk } from "@/lib/security/risk-engine";
import { writeAudit } from "@/lib/security/audit-log";
import { enforceTradeAllowed } from "@/lib/security/risk-enforcement";
import { getActiveMarketStrict } from "@/lib/trading/market-service";
import { listOrders } from "@/lib/trading/order-service";
import {
  validatePlaceOrderRequest,
  isValidOrderSide,
  isValidOrderType,
} from "@/lib/trading/validation";
import { getAvailableBalanceAmount } from "@/lib/trading/wallet-service";
import { calculateOrderHold } from "@/lib/trading/order-financials";
import { D } from "@/lib/trading/decimal";
import {
  admitExchangeOrderCommand,
  processExchangeOrderCommand,
  type ExchangeOrderCommandOutcome,
} from "@/lib/trading/order-command-service";
import type {
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  PlaceOrderRequest,
  TimeInForce,
} from "@/lib/trading/types";
import { PLATFORM } from "@/lib/platform-config";

export const dynamic = "force-dynamic";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,160}$/;

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/orders" }, async () => {
    const rlimit = await rateLimit(req, {
      namespace: "orders-read",
      limit: 120,
      windowMs: 60_000,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.userId && !session.studentId) {
      return apiError("authentication_required", 401);
    }
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
    const queryLimit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.floor(rawLimit), 1), 200)
      : 50;

    const orders = await listOrders({
      userId,
      market,
      status,
      side,
      type,
      from,
      to,
      cursor,
      limit: queryLimit,
    });
    const nextCursor = orders.length === queryLimit
      ? orders[orders.length - 1]?.createdAt
      : null;
    return apiOk({ orders, count: orders.length, nextCursor });
  });
}

function finalResponse(input: {
  order: Order;
  outcome: ExchangeOrderCommandOutcome;
  commandId: string;
  replayed: boolean;
}) {
  const payload = {
    commandId: input.commandId,
    order: input.order,
    tradeIds: input.outcome.tradeIds,
    replayed: input.replayed,
  };
  if (!input.outcome.accepted) {
    return apiError(input.outcome.reason ?? "order_not_accepted", 422, {
      commandId: input.commandId,
      orderId: input.order.id,
      status: input.outcome.orderStatus,
      replayed: input.replayed,
    });
  }
  return apiOk(payload, input.replayed ? 200 : 201);
}

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/orders" }, async () => {
    const startedAt = Date.now();
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.userId && !session.studentId) {
      return apiError("authentication_required", 401);
    }
    const userId = session.userId ?? session.studentId ?? "";
    const rlimit = await rateLimit(req, {
      namespace: "orders-place",
      limit: 30,
      windowMs: 60_000,
      identity: userId,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const bodyResult = await readJsonBody<Record<string, unknown>>(req, {
      maxBytes: 4_000,
      allowEmptyObject: true,
    });
    if (!bodyResult.ok) return apiError(bodyResult.error, bodyResult.status);
    const body = bodyResult.value;

    const market = String(body.market ?? "").toUpperCase().trim();
    const side = body.side;
    const type = body.type;
    if (typeof body.quantity !== "string") {
      return apiError("quantity_must_be_string", 400);
    }
    if (body.price !== undefined && typeof body.price !== "string") {
      return apiError("price_must_be_string", 400);
    }
    if (body.stopPrice !== undefined && typeof body.stopPrice !== "string") {
      return apiError("stop_price_must_be_string", 400);
    }
    if (
      body.maxQuoteAmount !== undefined &&
      typeof body.maxQuoteAmount !== "string"
    ) {
      return apiError("max_quote_amount_must_be_string", 400);
    }

    const quantity = body.quantity;
    const price = body.price as string | undefined;
    const stopPrice = body.stopPrice as string | undefined;
    const maxQuoteAmount = body.maxQuoteAmount as string | undefined;
    const clientOrderId = body.clientOrderId
      ? String(body.clientOrderId).slice(0, 64)
      : undefined;
    const rawTimeInForce = body.timeInForce
      ? String(body.timeInForce).toUpperCase()
      : undefined;
    const idempotencyKey = (
      req.headers.get("idempotency-key") ??
      (typeof body.idempotencyKey === "string" ? body.idempotencyKey : null) ??
      clientOrderId ??
      ""
    ).trim();

    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return apiError("idempotency_key_required", 400);
    }
    if (!market) return apiError("market_required", 400);
    if (!isValidOrderSide(side)) return apiError("invalid_order_side", 400);
    if (!isValidOrderType(type)) return apiError("invalid_order_type", 400);
    if (rawTimeInForce && !["GTC", "IOC", "FOK"].includes(rawTimeInForce)) {
      return apiError("invalid_time_in_force", 400);
    }
    const timeInForce = rawTimeInForce as TimeInForce | undefined;

    let marketDefinition;
    try {
      marketDefinition = await getActiveMarketStrict(market);
    } catch {
      return apiError("market_storage_unavailable", 503);
    }
    if (!marketDefinition) return apiError("market_not_active", 422);

    const tradeBlock = await enforceTradeAllowed(userId);
    if (tradeBlock) return apiError(tradeBlock, 403);
    checkOrderRisk({
      userId,
      market,
      ip: `principal:${userId}`,
      orderFingerprint: `${market}:${side}:${quantity}:${price ?? "market"}:${idempotencyKey}`,
    });

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
    const validation = validatePlaceOrderRequest(request, marketDefinition);
    if (!validation.ok) {
      return apiError(validation.error, 400, { detail: validation.detail });
    }

    let hold: ReturnType<typeof calculateOrderHold>;
    try {
      hold = calculateOrderHold({
        request,
        market: marketDefinition,
        marketBuyMaxQuoteAmount: maxQuoteAmount,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid_order_hold";
      return apiError(code, 400);
    }

    try {
      const available = await getAvailableBalanceAmount(userId, hold.asset);
      if (D(available).lt(hold.amount)) {
        return apiError("insufficient_balance", 422, {
          detail: `requires ${hold.amount} ${hold.asset}, available ${available}`,
        });
      }
    } catch {
      return apiError("wallet_storage_unavailable", 503);
    }

    const admission = await admitExchangeOrderCommand({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      userId,
      idempotencyKey,
      request,
      hold: { asset: hold.asset, amount: hold.amount },
    });
    if (admission.status === "conflict") {
      return apiError("idempotency_conflict", 409);
    }
    if (admission.status === "insufficient_balance") {
      return apiError("insufficient_balance", 422, {
        detail: "balance changed between precheck and committed hold",
      });
    }
    if (admission.status === "unavailable") {
      return apiError("order_admission_unavailable", 503);
    }

    if (admission.state === "final" && admission.outcome) {
      return finalResponse({
        order: admission.order,
        outcome: admission.outcome,
        commandId: admission.commandId,
        replayed: true,
      });
    }
    if (admission.state === "failed_terminal") {
      return apiError("order_reconciliation_required", 503, {
        commandId: admission.commandId,
        orderId: admission.order.id,
      });
    }

    const processing = await processExchangeOrderCommand(
      admission.commandId,
      `api-order-${randomUUID()}`,
    );
    if (processing.status === "final") {
      writeAudit({
        actorId: userId,
        action: "order_placed",
        resourceType: "order",
        resourceId: processing.order.id,
        metadata: {
          commandId: processing.commandId,
          market,
          side,
          type,
          quantity,
          holdAsset: hold.asset,
          holdAmount: hold.amount,
          accepted: processing.outcome.accepted,
          tradeCount: processing.outcome.tradeIds.length,
          replayed: admission.status === "replayed",
        },
      });
      logger.info("[orders] command finalized", {
        requestId: req.headers.get("x-tecpey-request-id") ?? undefined,
        commandId: processing.commandId,
        orderId: processing.order.id,
        userId,
        market,
        accepted: processing.outcome.accepted,
        finalStatus: processing.order.status,
        tradeCount: processing.outcome.tradeIds.length,
        latencyMs: Date.now() - startedAt,
      });
      return finalResponse({
        order: processing.order,
        outcome: processing.outcome,
        commandId: processing.commandId,
        replayed: admission.status === "replayed",
      });
    }

    if (processing.status === "unavailable") {
      return apiError("order_processing_unavailable", 503, {
        commandId: processing.commandId,
        orderId: admission.order.id,
      });
    }

    return apiOk(
      {
        commandId: processing.commandId,
        order: processing.order ?? admission.order,
        state: processing.status,
        retryable: true,
      },
      202,
    );
  });
}
