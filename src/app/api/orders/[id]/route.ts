import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getCanonicalSession } from "@/lib/auth-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { logger } from "@/lib/logger";
import { getMatchingEngine } from "@/lib/trading/engine";

export const dynamic = "force-dynamic";

// DELETE /api/orders/:id — cancel an open order via the matching engine.
//
// The engine handles: book removal, DB status update, hold release, audit log.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withObservability(req, { route: "/api/orders/[id]" }, async () => {
    const start = Date.now();

    if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);

    const rlimit = await rateLimit(req, { namespace: "orders-cancel", limit: 30, windowMs: 60_000 });
    if (!rlimit.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.userId && !session.studentId) return apiError("authentication_required", 401);
    const userId = session.userId ?? session.studentId ?? "";

    const { id: orderId } = await params;
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return apiError("invalid_order_id", 400);
    }

    const engine = getMatchingEngine();
    const result = await engine.cancelOrder(orderId, userId);

    const latencyMs = Date.now() - start;
    logger.info("[orders] cancel attempt", {
      requestId: req.headers.get("x-tecpey-request-id") ?? undefined,
      userId,
      orderId,
      cancelled: result.cancelled,
      latencyMs,
    });

    if (!result.cancelled) {
      return apiError(result.reason ?? "order_not_cancellable", 404);
    }

    return apiOk({ orderId, cancelled: true });
  });
}
