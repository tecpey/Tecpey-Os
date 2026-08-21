import { containsEnvPlaceholder } from "./env-placeholders";
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

export type AlertWebhookStatus = "configured" | "unconfigured" | "misconfigured";

// Beyond the environment contract's template markers, a reserved-for-documentation
// domain is never a real destination. Kept local because it is a fact about URLs,
// not about unfinished env values — ENV_PLACEHOLDER_TOKENS must stay exactly the
// preflight's list so the two cannot drift.
const NON_DESTINATION_HOSTS = ["example.com"];

/**
 * Whether ALERT_WEBHOOK_URL names somewhere an alert can actually arrive.
 *
 * One authority, used by the environment contract and by /api/health, because the
 * two disagreeing is the failure this exists to prevent: a preflight passing on a
 * value the runtime then treats differently. deliverWebhook only checked that the
 * variable was non-empty, so a placeholder produced a POST that failed into a
 * logger.warn while health reported the webhook as configured — and R-04 makes
 * alert delivery a precondition for any Go record.
 */
export function alertWebhookStatus(
  raw: string | undefined = process.env.ALERT_WEBHOOK_URL,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): AlertWebhookStatus {
  const value = (raw ?? "").trim();
  if (!value) return "unconfigured";

  const lowered = value.toLowerCase();
  if (containsEnvPlaceholder(value) || NON_DESTINATION_HOSTS.some((host) => lowered.includes(host))) {
    return "misconfigured";
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "misconfigured";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "misconfigured";
  // Plain HTTP would put alert contents — which name failing subsystems — on the
  // wire in clear text. Matches the rule ACADEMY_LEADS_WEBHOOK_URL already follows.
  if (nodeEnv === "production" && parsed.protocol !== "https:") return "misconfigured";

  return "configured";
}

/** Throws when the alert webhook is set to something alerts cannot reach. */
export function assertAlertWebhookUsable(): void {
  if (alertWebhookStatus() !== "misconfigured") return;
  throw new Error("alert_webhook_url_unusable");
}

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
  const status = alertWebhookStatus(url);
  if (status === "unconfigured") return;
  if (status === "misconfigured") {
    // Say so once per alert rather than letting the POST fail into a generic
    // delivery warning. The distinction matters during an incident: "no webhook
    // set" is a known posture, "webhook set to something unreachable" is someone
    // believing alerts are going out.
    logger.error("[alerts] webhook is configured but unusable", {
      type: event.type,
      delivered: false,
      remedy: "set ALERT_WEBHOOK_URL to a real https endpoint",
    });
    return;
  }
  try {
    await fetch(url as string, {
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
