import type { PoolClient } from "pg";
import type { NotificationDomainOutboxClaim } from "./domain-outbox";
import {
  parseNotificationProducerEvent,
  produceDomainNotification,
} from "./producers";

type AuthoritativeDomainRow = {
  tenant_id: string;
  principal_id: string;
  event_type: string;
  event_version: number;
  event_id: string;
  occurred_at: Date;
  event_locale: "fa" | "en";
  payload: Record<string, unknown>;
  principal_locale: "fa" | "en";
  principal_status: "active" | "suspended" | "disabled" | "deleted";
};

/**
 * The claim object is only a lease reference. Event content is reloaded from
 * PostgreSQL under row lock so mutated in-memory claim payloads have no
 * authority over notification class, copy, recipient, locale or correlation.
 */
export async function processAuthoritativeNotificationDomainClaim(
  client: PoolClient,
  claim: Pick<
    NotificationDomainOutboxClaim,
    "outboxId" | "attemptNumber" | "maxAttempts"
  >,
  workerId: string,
): Promise<{ intentId: string; status: string; decision: string }> {
  const authoritative = await client.query<AuthoritativeDomainRow>(
    `SELECT o.tenant_id, o.principal_id, o.event_type, o.event_version,
            o.event_id, o.occurred_at, o.locale AS event_locale, o.payload,
            p.locale AS principal_locale, p.status AS principal_status
       FROM notification_domain_outbox o
       JOIN platform_principals p
         ON p.tenant_id = o.tenant_id AND p.id = o.principal_id
      WHERE o.id = $1
        AND o.status = 'processing'
        AND o.locked_by = $2
        AND o.attempt_count = $3
        AND o.lease_expires_at > NOW()
      FOR UPDATE OF o
      FOR SHARE OF p`,
    [claim.outboxId, workerId, claim.attemptNumber],
  );
  const row = authoritative.rows[0];
  if (!row) throw new Error("notification_domain_outbox_lease_lost");
  if (row.principal_status !== "active") {
    throw new Error("notification_principal_inactive");
  }

  const event = parseNotificationProducerEvent({
    id: row.event_id,
    tenantId: row.tenant_id,
    principalId: row.principal_id,
    occurredAt: row.occurred_at.toISOString(),
    locale: row.principal_locale,
    version: row.event_version,
    type: row.event_type,
    payload: row.payload,
  });
  if (!event) throw new Error("notification_domain_outbox_event_invalid");

  const result = await produceDomainNotification(client, event);

  const updated = await client.query(
    `UPDATE notification_domain_outbox
        SET status = 'processed',
            notification_intent_id = $4::uuid,
            processed_at = NOW(),
            terminal_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            lease_expires_at = NULL,
            last_error_code = NULL,
            last_error_detail = NULL,
            updated_at = NOW()
      WHERE id = $1
        AND status = 'processing'
        AND locked_by = $2
        AND attempt_count = $3
        AND lease_expires_at > NOW()`,
    [claim.outboxId, workerId, claim.attemptNumber, result.intentId],
  );
  if ((updated.rowCount ?? 0) !== 1) {
    throw new Error("notification_domain_outbox_lease_lost");
  }

  const attempt = await client.query(
    `UPDATE notification_domain_outbox_attempts
        SET status = 'processed',
            completed_at = NOW(),
            metadata = jsonb_build_object(
              'intentId', $4::text,
              'creationStatus', $5::text,
              'policyDecision', $6::text,
              'eventLocale', $7::text,
              'effectiveLocale', $8::text
            )
      WHERE domain_outbox_id = $1
        AND attempt_number = $2
        AND worker_id = $3
        AND status = 'claimed'`,
    [
      claim.outboxId,
      claim.attemptNumber,
      workerId,
      result.intentId,
      result.status,
      result.decision,
      row.event_locale,
      row.principal_locale,
    ],
  );
  if ((attempt.rowCount ?? 0) !== 1) {
    throw new Error("notification_domain_attempt_state_missing");
  }

  return {
    intentId: result.intentId,
    status: result.status,
    decision: result.decision,
  };
}
