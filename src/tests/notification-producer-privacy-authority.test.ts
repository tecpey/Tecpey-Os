import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  buildNotificationRequest,
  produceDomainNotification,
  type SupportTicketStatusChangedEvent,
} from "../lib/notifications/producers";
import { resolveNotificationPrincipal } from "../lib/notifications/principal";

const databaseUrl = process.env.DATABASE_URL;

function supportEvent(
  principalId: string,
  locale: "fa" | "en" = "fa",
): SupportTicketStatusChangedEvent {
  return {
    id: `support-ticket-status:${crypto.randomUUID()}`,
    tenantId: "tecpey",
    principalId,
    occurredAt: new Date().toISOString(),
    locale,
    version: 1,
    type: "support.ticket_status_changed",
    payload: {
      ticketId: `ticket-${crypto.randomUUID()}`,
      status: "waiting_for_user",
    },
  };
}

test("producer metadata keeps only minimal governed provenance", () => {
  const event = supportEvent(crypto.randomUUID());
  const request = buildNotificationRequest(event);

  assert.deepEqual(request.metadata, {
    producerEventId: event.id,
    producerEventType: event.type,
    producerEventVersion: 1,
    producerOccurredAt: event.occurredAt,
    templateId: "support.ticket-status-changed.v1",
  });
  assert.equal("producerPayload" in request.metadata, false);
  assert.equal(JSON.stringify(request.metadata).includes(event.payload.ticketId), false);
});

test(
  "producer rejects event locale that differs from the authoritative principal locale",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    try {
      await applyDatabaseMigrationsWithLock(client);
      await client.query("BEGIN");

      const studentId = crypto.randomUUID();
      const email = `producer-locale-${studentId}@notification.test`;
      await client.query(
        `INSERT INTO academy_students (id, locale, email, display_name)
         VALUES ($1, 'fa', $2, 'Producer Locale Test')`,
        [studentId, email],
      );
      const principal = await resolveNotificationPrincipal(client, {
        accountId: `academy:${email}`,
        studentId,
        email,
        locale: "fa",
      });
      const event = supportEvent(principal.id, "en");

      await assert.rejects(
        produceDomainNotification(client, event),
        /notification_event_locale_mismatch/,
      );

      const evidence = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM notification_intents
          WHERE tenant_id = $1
            AND principal_id = $2
            AND correlation_key = $3`,
        [principal.tenantId, principal.id, `${event.type}:${event.id}`],
      );
      assert.equal(evidence.rows[0]?.count, "0");

      await client.query("ROLLBACK");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original assertion or database failure.
      }
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  },
);
