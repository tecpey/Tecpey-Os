import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getExchangeSession } from "@/lib/security/exchange-session";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { listOpenOrders } from "@/lib/trading/order-service";

export const dynamic = "force-dynamic";

// GET /api/orders/open
// Returns orders in NEW or PARTIALLY_FILLED status for the authenticated Exchange account.
// ?market=BTCUSDT — optional market filter
export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/orders/open" }, async () => {
    const rl = await rateLimit(req, { namespace: "orders-read", limit: 120, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getExchangeSession(req);
    if (!session) return apiError("exchange_authentication_required", 401);
    const userId = session.productAccountId;

    const url = new URL(req.url);
    const market = url.searchParams.get("market") ?? undefined;

    const orders = await listOpenOrders(userId, market);
    return apiOk({ orders, count: orders.length });
  });
}