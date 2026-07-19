import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";

export const dynamic = "force-dynamic";

/**
 * This ingress is intentionally disabled.
 *
 * The previous implementation described a browser caller but required a shared
 * server token. Shipping that token to a browser would destroy the service
 * boundary, while omitting it made the route unusable. It also lacked durable
 * replay protection and an authenticated server-side producer.
 *
 * Re-enable only after a dedicated price-feed monitor exists with verified
 * service identity, bounded signed payloads, replay protection, network policy,
 * audit evidence, and negative integration tests.
 */
export async function POST(req: NextRequest) {
  return withObservability(
    req,
    { route: "/api/internal/price-feed-status" },
    async () => apiError(
      "internal_price_feed_status_disabled",
      503,
      { authority: "server_price_feed_monitor_required" },
      { "Retry-After": "3600" },
    ),
  );
}
