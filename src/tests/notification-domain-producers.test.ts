import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  parseDomainNotificationEvent,
  produceDomainNotification,
} from "../lib/notifications/producers";
import { claimNotificationOutbox, acceptInAppNotificationDelivery } from "../lib/notifications/outbox";
import { resolveNotificationPrincipal } from "../lib/notifications/principal";
import { listInboxNotifications } from "../lib/notifications/repository";
import {
  updateNotificationSettings,
  upsertNotificationPreference,
} from "../lib/notifications/preferences";

const databaseUrl = process.env.DATABASE_URL;

async function withRolledBackTest(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
    await client.query("BEGIN");
    await callback(client);
    await client.query("ROLLBACK");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function createPrincipal(client: PoolClient, prefix: string) {
  const studentId = crypto.randomUUID();
  const email = `${prefix}-${studentId}@notification.test`;
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
     VALUES ($1, 'fa', $2, $3)`,
    [studentId, email, prefix],
  );
  return resolveNotificationPrincipal(client, {
    accountId: `academy:${email}`,
    studentId,
    email,
    locale: "fa",
  });
}

function baseEvent(
  principal: { tenantId: string; id: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    eventType: "academy.lesson_available",
    eventId: `academy-event:${crypto.randomUUID()}`,
    tenantId: principal.tenantId,
    principalId: principal.id,
    occurredAt: new Date().toISOString(),
    locale: "fa",
    payload: { termId: "term-1", lessonId: "lesson-2" },
    ...overrides,
  };
}

test("runtime parser rejects unknown fields, arbitrary copy and invalid enums", () => {
  const principal = { tenantId: "tecpey", id: crypto.randomUUID() };
  const valid = baseEvent(principal);
  assert.ok(parseDomainNotificationEvent(valid));

  assert.equal(
    parseDomainNotificationEvent({ ...valid, title: "Injected title" }),
    null,
  );
  assert.equal(
    parseDomainNotificationEvent({ ...valid, eventType: "ai.unapproved_send" }),
    null,
  );
  assert.equal(
    parseDomainNotificationEvent({ ...valid, locale: "unknown" }),
    null,
  );
  assert.equal(
    parseDomainNotificationEvent({
      ...valid,
      payload: { termId: "term-1", lessonId: "lesson-2", body: "Injected" },
    }),
    null,
  );
  assert.equal(
    parseDomainNotificationEvent({
      ...valid,
      occurredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
    null,
  );
});

test(
  "Academy producer creates controlled evidence, replays safely and reaches inbox after delivery",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "producer-academy");
      const event = baseEvent(principal);

      const created = await produceDomainNotification(client, event);
      assert.equal(created.status, "created");
      assert.equal(created.decision, "allow");
      assert.ok(created.notificationId);
      assert.ok(created.outboxId);

      const replayed = await produceDomainNotification(client, event);
      assert.equal(replayed.status, "replayed");
      assert.equal(replayed.intentId, created.intentId);

      await assert.rejects(
        produceDomainNotification(client, {
          ...event,
          payload: { termId: "term-1", lessonId: "lesson-3" },
        }),
        /notification_correlation_payload_conflict/,
      );

      const intent = await client.query<{
        source_type: string;
        title: string;
        notification_class: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT source_type, title, notification_class, metadata
           FROM notification_intents
          WHERE id = $1`,
        [created.intentId],
      );
      assert.equal(intent.rows[0]?.source_type, "academy.lesson_available");
      assert.equal(intent.rows[0]?.notification_class, "academy");
      assert.equal(intent.rows[0]?.title, "درس بعدی آماده است");
      assert.equal(
        intent.rows[0]?.metadata.templateId,
        "academy.lesson_available.v1",
      );

      const before = await listInboxNotifications(client, principal, {
        limit: 20,
        cursor: null,
      });
      assert.equal(
        before.notifications.some((item) => item.id === created.notificationId),
        false,
      );

      const claim = (
        await claimNotificationOutbox(client, {
          workerId: "producer-test-worker",
          limit: 20,
          leaseSeconds: 60,
        })
      ).find((item) => item.outboxId === created.outboxId);
      assert.ok(claim);
      await acceptInAppNotificationDelivery(
        client,
        claim,
        "producer-test-worker",
      );

      const after = await listInboxNotifications(client, principal, {
        limit: 20,
        cursor: null,
      });
      assert.ok(
        after.notifications.some((item) => item.id === created.notificationId),
      );
    });
  },
);

test(
  "optional support events respect preferences while critical security events bypass mute and quiet hours",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "producer-policy");

      await upsertNotificationPreference(client, principal.id, {
        notificationClass: "product_support",
        channel: "in_app",
        enabled: false,
        cadence: "instant",
      });
      const support = await produceDomainNotification(client, {
        eventType: "support.ticket_status_changed",
        eventId: `support-event:${crypto.randomUUID()}`,
        tenantId: principal.tenantId,
        principalId: principal.id,
        occurredAt: new Date().toISOString(),
        locale: "fa",
        payload: {
          ticketId: `ticket:${crypto.randomUUID()}`,
          status: "waiting_for_user",
        },
      });
      assert.equal(support.status, "suppressed");
      assert.equal(support.reason, "category_disabled");

      const now = new Date();
      const start = new Date(now.getTime() - 60 * 60_000);
      const end = new Date(now.getTime() + 60 * 60_000);
      const time = (value: Date) =>
        `${String(value.getUTCHours()).padStart(2, "0")}:${String(
          value.getUTCMinutes(),
        ).padStart(2, "0")}`;
      await updateNotificationSettings(client, principal.id, {
        timezone: "UTC",
        quietStart: time(start),
        quietEnd: time(end),
        digestTime: "09:00",
        muteUntil: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      });

      const security = await produceDomainNotification(
        client,
        {
          eventType: "security.new_login",
          eventId: `security-event:${crypto.randomUUID()}`,
          tenantId: principal.tenantId,
          principalId: principal.id,
          occurredAt: now.toISOString(),
          locale: "fa",
          payload: {},
        },
        { now: now.toISOString() },
      );
      assert.equal(security.status, "created");
      assert.equal(security.decision, "allow");
      assert.equal(security.reason, "critical_policy_allowed");
    });
  },
);

test(
  "producer fails closed for a principal outside the supplied tenant",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "producer-tenant");
      const otherTenantId = `producer-tenant-${crypto.randomUUID()}`;
      await client.query(
        `INSERT INTO platform_tenants (id, slug, display_name, plan)
         VALUES ($1, $1, 'Producer Tenant Test', 'enterprise')`,
        [otherTenantId],
      );

      await assert.rejects(
        produceDomainNotification(client, {
          ...baseEvent(principal),
          tenantId: otherTenantId,
        }),
        /notification_event_principal_not_found/,
      );
    });
  },
);
