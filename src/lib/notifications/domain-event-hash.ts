import { createHash } from "crypto";
import type { NotificationProducerEvent } from "./producers";

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("notification_domain_event_number_invalid");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("notification_domain_event_value_invalid");
}

/**
 * Stable across JavaScript object insertion order and PostgreSQL JSONB key
 * normalization. This is an integrity fingerprint, not a substitute for
 * encryption or authorization.
 */
export function hashNotificationDomainEvent(
  event: NotificationProducerEvent,
): string {
  const canonical = canonicalJson({
    tenantId: event.tenantId,
    principalId: event.principalId,
    occurredAt: event.occurredAt,
    locale: event.locale,
    version: event.version,
    type: event.type,
    payload: event.payload,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
