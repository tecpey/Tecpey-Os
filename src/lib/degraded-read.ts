// Degraded-read observability.
//
// A few academy read routes deliberately answer 200 with fallback content when
// their storage is unavailable, so a database outage degrades the page instead
// of breaking it. That choice is only safe if the degradation is *visible*:
// without a signal, "the database is down" and "this student has no
// achievements yet" produce the same response body, no log line and no metric.
//
// Every such fallback must therefore go through recordDegradedRead(), and the
// response must carry `degraded: true` so the client can say "temporarily
// unavailable" rather than render an authoritative-looking empty state.

import { logger } from "./logger";
import { metrics } from "./metrics";

export type DegradedReadReason =
  /** withDb reported the pool is not configured, or schema verification failed. */
  | "storage_unavailable"
  /** The tenant/principal context could not be resolved for this reader. */
  | "tenant_context_unavailable"
  /** The read threw after storage was reachable. */
  | "read_failed";

/** Counter name for the cross-route total, so one alert can watch every reader. */
export const DEGRADED_READ_COUNTER = "degraded_read_responses";

/**
 * Records that a read route served fallback content instead of stored data.
 * Emits a warn-level structured log and two metrics: a per-route error entry
 * and the cross-route counter.
 */
export function recordDegradedRead(
  route: string,
  reason: DegradedReadReason,
  error?: unknown,
): void {
  metrics.recordError(route, `degraded:${reason}`);
  metrics.increment(DEGRADED_READ_COUNTER);
  metrics.increment(`${DEGRADED_READ_COUNTER}:${route}`);
  logger.warn("[degraded-read] served fallback content instead of stored data", {
    route,
    reason,
    ...(error === undefined
      ? {}
      : { error: error instanceof Error ? error.message : String(error) }),
  });
}
