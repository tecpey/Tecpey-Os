import type { PoolClient } from "pg";
import {
  parseNotificationProducerEvent,
} from "./producers";
import type { NotificationDomainOutboxClaim } from "./domain-outbox";

export function notificationDomainWorkerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 100);
  return normalized || "notification_domain_processing_failed";
}

export function isTerminalNotificationDomainError(code: string): boolean {
  return [
    "notification_domain_event_invalid",
    "notification_domain_outbox_event_invalid",
    "notification_principal_not_found",
    "notification_principal_inactive",
    "notification_event_locale_mismatch",
    "notification_correlation_payload_conflict",
    "notification_domain_event_identity_conflict",
  ].includes(code);
}

/**
 * Event locale is retained in the durable domain outbox as occurrence
 * provenance. Rendering follows the principal's current authoritative locale
 * so delayed work does not dead-letter after a legitimate language change.
 */
export async function loadEffectiveNotificationDomainClaim(
  client: PoolClient,
  claim: NotificationDomainOutboxClaim,
): Promise<NotificationDomainOutboxClaim> {
  const principal = await client.query<{
    locale: "fa" | "en";
    status: "active" | "suspended" | "disabled" | "deleted";
  }>(
    `SELECT locale, status
       FROM platform_principals
      WHERE tenant_id = $1 AND id = $2::uuid
      LIMIT 1
      FOR SHARE`,
    [claim.event.tenantId, claim.event.principalId],
  );
  const current = principal.rows[0];
  if (!current) throw new Error("notification_principal_not_found");
  if (current.status !== "active") {
    throw new Error("notification_principal_inactive");
  }

  const event = parseNotificationProducerEvent({
    ...claim.event,
    locale: current.locale,
  });
  if (!event) throw new Error("notification_domain_outbox_event_invalid");
  return { ...claim, event };
}
