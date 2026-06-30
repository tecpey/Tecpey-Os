import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiOk, apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { getCanonicalSession } from "@/lib/auth-session";
import type { WsManager } from "@/lib/ws/ws-manager";

declare global {
  var tecpeyWsManager: WsManager | undefined;
}

export const dynamic = "force-dynamic";

// GET /api/ws/metrics — admin-only WebSocket observability.
// Returns connected clients, subscriptions, messages/sec, and queue metrics.
export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/ws/metrics" }, async () => {
    const rl = await rateLimit(req, { namespace: "ws-metrics", limit: 30, windowMs: 60_000 });
    if (!rl.ok) return apiError("rate_limited", 429);

    const session = await getCanonicalSession(req);
    if (!session.isAdmin) return apiError("forbidden", 403);

    // Lazy import — WsManager only exists when using custom server.
    const wsManager = globalThis.tecpeyWsManager;
    if (!wsManager) {
      return apiOk({
        available: false,
        reason: "WebSocket server not running (use `npm run dev` or `npm run start`)",
      });
    }

    const metrics = wsManager.getMetrics();
    return apiOk({ available: true, ...metrics });
  });
}
