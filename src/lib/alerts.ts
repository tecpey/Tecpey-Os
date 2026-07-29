import { logger } from "./logger";

export type AlertType =
  | "DB_DOWN"
  | "REDIS_DOWN"
  | "EMAIL_NOT_CONFIGURED"
  | "EMAIL_SEND_FAILED"
  | "API_ERROR_SPIKE"
  | "PRICE_FEED_DOWN"
  | "MIGRATION_FAILED";

export type AlertSeverity = "critical" | "warning" | "info";

const SEVERITY: Record<AlertType, AlertSeverity> = {
  DB_DOWN:               "critical",
  REDIS_DOWN:            "warning",
  EMAIL_NOT_CONFIGURED:  "warning",
  EMAIL_SEND_FAILED:     "warning",
  API_ERROR_SPIKE:       "critical",
  PRICE_FEED_DOWN:       "warning",
  MIGRATION_FAILED:      "critical",
};

export type AlertEvent = {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  extra?: Record<string, unknown>;
  timestamp: string;
  service: string;
  environment: string;
};

// Deduplicate repeated alerts within a 60-second window to avoid log floods.
const recentAlerts = new Map<AlertType, number>();
const DEDUP_WINDOW_MS = 60_000;

function isDuplicate(type: AlertType): boolean {
  const lastAt = recentAlerts.get(type) ?? 0;
  const now = Date.now();
  if (now - lastAt < DEDUP_WINDOW_MS) return true;
  recentAlerts.set(type, now);
  return false;
}

// Generic webhook delivery — connect Slack, PagerDuty, or Discord at the URL level.
// Requires ALERT_WEBHOOK_URL env var. Does not block the caller.
async function deliverWebhook(event: AlertEvent): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[alerts] webhook delivery failed", { type: event.type, message: msg });
  }
}

/**
 * Emit a platform alert event.
 *
 * Behavior:
 *  - Logs at error (critical) or warn (warning) level as structured JSON.
 *  - Delivers to ALERT_WEBHOOK_URL if configured (non-blocking).
 *  - Deduplicates repeated alerts within a 60-second window.
 *
 * Connect external alerting (Slack, PagerDuty, email) by routing the webhook URL
 * through a relay service rather than adding SDK dependencies here.
 */
export function emitAlert(type: AlertType, message: string, extra?: Record<string, unknown>): void {
  if (isDuplicate(type)) return;

  const event: AlertEvent = {
    type,
    severity: SEVERITY[type],
    message,
    extra,
    timestamp: new Date().toISOString(),
    service: "tecpey-web",
    environment: process.env.NODE_ENV ?? "unknown",
  };

  const logMsg = `[alert] ${type}: ${message}`;
  if (event.severity === "critical") logger.error(logMsg, event);
  else logger.warn(logMsg, event);

  deliverWebhook(event).catch(() => null);
}
