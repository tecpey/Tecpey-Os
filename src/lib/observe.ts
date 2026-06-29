import type { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";
import { getRequestId, attachRequestId } from "./trace";
import { metrics } from "./metrics";
import { captureError, type ErrorTrackingContext } from "./error-tracking";

export type ObserveOptions = {
  /** Route label used in logs and metrics (e.g. "/api/academy/mentor-memory"). */
  route: string;
};

/**
 * Wrap an API handler body with request instrumentation.
 *
 * Adds:
 *  - Request ID extraction and x-request-id response header
 *  - Structured request/response log entry (method, status, latencyMs)
 *  - Metrics: request count, latency, error count
 *  - Error capture on unhandled handler rejections
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     return withObservability(req, { route: "/api/foo" }, async () => {
 *       // handler body
 *     });
 *   }
 */
export async function withObservability(
  req: NextRequest,
  options: ObserveOptions,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = getRequestId(req);
  const method = req.method;
  const startMs = Date.now();

  try {
    const response = await handler();
    const latencyMs = Date.now() - startMs;
    const status = response.status;

    logger.info("[api] request", {
      requestId,
      route: options.route,
      method,
      status,
      latencyMs,
    });

    metrics.recordRequest(options.route, status, latencyMs);
    return attachRequestId(response, requestId);
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const error = err instanceof Error ? err : new Error(String(err));

    logger.error("[api] unhandled error", {
      requestId,
      route: options.route,
      method,
      latencyMs,
      errorMessage: error.message,
    });

    const ctx: ErrorTrackingContext = { requestId, route: options.route, method };
    captureError(error, ctx);
    metrics.recordError(options.route, "unhandled");
    throw err;
  }
}
