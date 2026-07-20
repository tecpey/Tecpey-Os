import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { logger } from "@/lib/logger";
import {
  hashApiCommand,
  parseApiIdempotencyKey,
} from "@/lib/security/api-command-idempotency";
import { writeAudit } from "@/lib/security/audit-log";
import { cancelOrderIdempotently } from "@/lib/trading/order-cancel-authority";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/orders/[id]" }, async () => {
    const startedAt = Date.now();
    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const session = await getCanonicalSession(req, { strictRevocation: true });
    if (!session.userId && !session.studentId) {
      return apiError("authentication_required", 401);
    }
    const userId = session.userId ?? session.studentId ?? "";
    const rlimit = await rateLimit(req, {
      namespace: "orders-cancel",
      limit: 30,
      windowMs: 60_000,
      identity: userId,
    });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const { id: orderId } = await params;
    if (
      !orderId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        orderId,
      )
    ) {
      return apiError("invalid_order_id", 400);
    }

    const idempotencyKey = parseApiIdempotencyKey(
      req.headers.get("Idempotency-Key"),
    );
    if (!idempotencyKey) return apiError("idempotency_key_required", 400);

    const result = await cancelOrderIdempotently({
      orderId,
      userId,
      idempotencyKey,
      requestHash: hashApiCommand({ orderId }),
    });

    logger.info("[orders] idempotent cancel command completed", {
      requestId: req.headers.get("x-tecpey-request-id") ?? undefined,
      userId,
      orderId,
      cancelled: result.cancelled,
      replayed: result.cancelled ? result.replayed : undefined,
      reason: result.cancelled ? undefined : result.reason,
      latencyMs: Date.now() - startedAt,
    });

    if (!result.cancelled) {
      const reason = result.reason ?? "order_not_cancellable";
      if (["storage_unavailable", "cancel_failed"].includes(reason)) {
        return apiError(reason, 503, { orderId, retryable: true });
      }
      if (reason === "idempotency_in_progress") {
        return apiError(reason, 425, { orderId, retryable: true });
      }
      if (["market_busy", "order_processing"].includes(reason)) {
        return apiError(reason, 409, { orderId, retryable: true });
      }
      if (["idempotency_conflict", "order_already_terminal"].includes(reason)) {
        return apiError(reason, 409, { orderId, retryable: false });
      }
      return apiError(reason, 404, { orderId, retryable: false });
    }

    if (!result.replayed) {
      writeAudit({
        actorId: userId,
        action: "order_cancelled",
        resourceType: "order",
        resourceId: orderId,
        metadata: { replayed: false },
      });
    }

    const response = apiOk({
      orderId,
      cancelled: true,
      replayed: result.replayed,
    });
    response.headers.set(
      "Idempotency-Replayed",
      result.replayed ? "true" : "false",
    );
    return response;
  });
}
