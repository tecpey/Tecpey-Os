/**
 * Price feed status adapter — Phase 27.
 *
 * The live price WebSocket (LivePriceChart.tsx) runs entirely client-side.
 * There is no server-side price-feed handler, so PRICE_FEED_DOWN alerts
 * cannot be emitted directly from the WebSocket lifecycle.
 *
 * This endpoint acts as the adapter: the client calls it when the WebSocket
 * fails to reconnect, enabling server-side alerting.
 *
 * Usage (client-side):
 *   fetch('/api/internal/price-feed-status', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ status: 'down', reason: 'reconnect_failed', attempts: 5 }),
 *   });
 *
 * Wiring LivePriceChart.tsx to this endpoint is deferred to a future phase
 * when the chart component is refactored for server-component compatibility.
 */

import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { emitAlert } from "@/lib/alerts";
import { apiOk, apiError } from "@/lib/api-validation";

export const dynamic = "force-dynamic";

const PRICE_FEED_STATUS_TOKEN_HEADER = "x-tecpey-price-feed-token";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.TECPEY_PRICE_FEED_STATUS_TOKEN;
  const provided = req.headers.get(PRICE_FEED_STATUS_TOKEN_HEADER);

  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length) return false;

  return timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return apiError("unauthorized", 401);

  // Strict rate limit — this endpoint must not be used as a DDoS amplifier.
  const limit = await rateLimit(req, { namespace: "price-feed-status", limit: 5, windowMs: 60_000 });
  if (!limit.ok) return apiError("rate_limited", 429);

  const body = await req.json().catch(() => ({})) as { status?: string; reason?: string; attempts?: number };
  const status = String(body.status ?? "").toLowerCase();

  if (status === "down") {
    emitAlert("PRICE_FEED_DOWN", "Client reported price feed WebSocket failure", {
      reason: String(body.reason ?? "unknown").slice(0, 100),
      attempts: Number.isFinite(body.attempts) ? body.attempts : undefined,
    });
  }

  return apiOk({ received: true, status });
}
