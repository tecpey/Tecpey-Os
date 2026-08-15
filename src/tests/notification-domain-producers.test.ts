import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  buildNotificationRequest,
  parseNotificationProducerEvent,
  produceDomainNotification,
  type AcademyAssessmentCompletedEvent,
  type AcademyArenaProEntitlementGrantedEvent,
  type AcademyCertificateIssuedEvent,
  type AcademyCredentialIssuedEvent,
  type AcademyCredentialLifecycleEvent,
  type AcademyLessonAvailableEvent,
  type SecurityCredentialChangedEvent,
  type SecurityNewLoginEvent,
  type SecuritySessionRevokedEvent,
  type SupportTicketStatusChangedEvent,
} from "../lib/notifications/producers";
import {
  claimNotificationOutbox,
  acceptInAppNotificationDelivery,
} from "../lib/notifications/outbox";
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

function eventBase(principal: { tenantId: string; id: string }) {
  return {
    tenantId: principal.tenantId,
    principalId: principal.id,
    occurredAt: new Date().toISOString(),
    locale: "fa" as const,
    version: 1 as const,
  };
}

function lessonEvent(
  principal: { tenantId: string; id: string },
  overrides: Partial<AcademyLessonAvailableEvent> = {},
): AcademyLessonAvailableEvent {
  return {
    ...eventBase(principal),
    id: `academy-event:${crypto.randomUUID()}`,
    type: "academy.lesson_available",
    payload: {
      termNumber: 1,
      lessonSlug: "lesson-2",
      lessonTitle: "مدیریت ریسک مقدماتی",
    },
    ...overrides,
  };
}

function supportEvent(
  principal: { tenantId: string; id: string },
): SupportTicketStatusChangedEvent {
  return {
    ...eventBase(principal),
    id: `support-event:${crypto.randomUUID()}`,
    type: "support.ticket_status_changed",
    payload: {
      ticketId: `ticket-${crypto.randomUUID()}`,
      status: "waiting_for_user",
    },
  };
}

function securityEvent(
  principal: { tenantId: string; id: string },
  occurredAt: string,
): SecurityNewLoginEvent {
  return {
    ...eventBase(principal),
    id: `security-event:${crypto.randomUUID()}`,
    occurredAt,
    type: "security.new_login",
    payload: {},
  };
}

test("runtime parser rejects unknown fields, arbitrary copy and invalid enums", () => {
  const principal = { tenantId: "tecpey", id: crypto.randomUUID() };
  const valid = lessonEvent(principal);
  assert.ok(parseNotificationProducerEvent(valid));

  assert.equal(
    parseNotificationProducerEvent({ ...valid, title: "Injected title" }),
    null,
  );
  assert.equal(
    parseNotificationProducerEvent({ ...valid, type: "ai.unapproved_send" }),
    null,
  );
  assert.equal(
    parseNotificationProducerEvent({ ...valid, locale: "unknown" }),
    null,
  );
  assert.equal(
    parseNotificationProducerEvent({
      ...valid,
      payload: { ...valid.payload, body: "Injected" },
    }),
    null,
  );
  assert.equal(parseNotificationProducerEvent({ ...valid, version: 2 }), null);
  assert.equal(
    parseNotificationProducerEvent({
      ...valid,
      occurredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
    null,
  );
});

test("controlled templates point only to existing stable product routes", () => {
  const principal = { tenantId: "tecpey", id: crypto.randomUUID() };
  const base = eventBase(principal);

  const assessment: AcademyAssessmentCompletedEvent = {
    ...base,
    id: `assessment:${crypto.randomUUID()}`,
    type: "academy.assessment_completed",
    payload: {
      assessmentId: "assessment-1",
      title: "ارزیابی مدیریت ریسک",
      score: 90,
      passed: true,
    },
  };
  const certificate: AcademyCertificateIssuedEvent = {
    ...base,
    id: `certificate:${crypto.randomUUID()}`,
    type: "academy.certificate_issued",
    payload: { certificateId: "certificate-1", title: "ترم نخست" },
  };
  const credential: SecurityCredentialChangedEvent = {
    ...base,
    id: `credential:${crypto.randomUUID()}`,
    type: "security.credential_changed",
    payload: { credential: "passkey" },
  };
  const session: SecuritySessionRevokedEvent = {
    ...base,
    id: `session:${crypto.randomUUID()}`,
    type: "security.session_revoked",
    payload: { scope: "all_other" },
  };

  assert.equal(buildNotificationRequest(lessonEvent(principal)).actionUrl, "/academy/term-1");
  assert.equal(buildNotificationRequest(assessment).actionUrl, "/academy/profile");
  assert.equal(buildNotificationRequest(certificate).actionUrl, "/academy/certificates");
  assert.equal(
    buildNotificationRequest(securityEvent(principal, base.occurredAt)).actionUrl,
    "/academy/security",
  );
  assert.equal(buildNotificationRequest(credential).actionUrl, "/academy/security");
  assert.equal(buildNotificationRequest(session).actionUrl, "/academy/security");
  assert.equal(buildNotificationRequest(supportEvent(principal)).actionUrl, "/support");
});

test("credential-issued events use governed bilingual copy and profile destination", () => {
  const event: AcademyCredentialIssuedEvent = {
    id: "credential:00000000-0000-4000-8000-000000000010",
    tenantId: "tenant-a",
    principalId: "00000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-15T00:00:00.000Z",
    locale: "fa",
    version: 1,
    type: "academy.credential_issued",
    payload: {
      credentialId: "00000000-0000-4000-8000-000000000010",
      credentialType: "league_medal",
      titleFa: "قهرمان ماه",
      titleEn: "Monthly champion",
      rank: 1,
      seasonKey: "2026-08",
    },
  };
  assert.deepEqual(parseNotificationProducerEvent(event), event);
  const request = buildNotificationRequest(event);
  assert.equal(request.actionUrl, "/academy/profile#credentials");
  assert.equal(request.priority, 6);
  assert.equal(request.metadata.templateId, "academy.credential-issued.v1");
});

test("credential lifecycle events use governed copy and profile destination", () => {
  const event: AcademyCredentialLifecycleEvent = {
    id: "credential-lifecycle:00000000-0000-4000-8000-000000000010:abcdef1234567890abcdef12",
    tenantId: "tenant-a",
    principalId: "00000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-15T00:00:00.000Z",
    locale: "en",
    version: 1,
    type: "academy.credential_lifecycle_changed",
    payload: {
      credentialId: "00000000-0000-4000-8000-000000000010",
      lifecycleEvent: "suspended",
      titleFa: "قهرمان ماه",
      titleEn: "Monthly champion",
      reasonCode: "policy.review",
    },
  };
  assert.deepEqual(parseNotificationProducerEvent(event), event);
  const request = buildNotificationRequest(event);
  assert.equal(request.actionUrl, "/en/academy/profile#credentials");
  assert.equal(request.urgency, "high");
  assert.equal(request.priority, 7);
  assert.equal(request.metadata.templateId, "academy.credential-lifecycle-changed.v1");
});

test("Arena Pro entitlement events use governed copy without enabling cash rewards", () => {
  const event: AcademyArenaProEntitlementGrantedEvent = {
    id: "arena-pro-entitlement:00000000-0000-4000-8000-000000000010",
    tenantId: "tenant-a",
    principalId: "00000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-15T00:00:00.000Z",
    locale: "fa",
    version: 1,
    type: "academy.arena_pro_entitlement_granted",
    payload: {
      grantId: "00000000-0000-4000-8000-000000000010",
      sourceSnapshotId: "22222222-2222-4222-8222-222222222222",
      windowType: "monthly",
      windowKey: "2026-08",
      rank: 1,
      grantDays: 90,
      startsAt: "2026-08-15T00:00:00.000Z",
      expiresAt: "2026-11-13T00:00:00.000Z",
    },
  };

  assert.deepEqual(parseNotificationProducerEvent(event), event);
  assert.equal(
    parseNotificationProducerEvent({
      ...event,
      payload: { ...event.payload, cashAmount: 100 },
    }),
    null,
  );
  const request = buildNotificationRequest(event);
  assert.equal(request.actionUrl, "/academy/trading-arena");
  assert.equal(request.priority, 7);
  assert.equal(request.metadata.templateId, "academy.arena-pro-entitlement-granted.v1");
  assert.equal(request.metadata.cashExecutionEnabled, false);
});

test(
  "Academy producer creates controlled evidence, replays safely and reaches inbox after delivery",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "producer-academy");
      const event = lessonEvent(principal);

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
          payload: { ...event.payload, lessonSlug: "lesson-3" },
        }),
        /notification_correlation_payload_conflict/,
      );

      const intent = await client.query<{
        source_type: string;
        title: string;
        notification_class: string;
        action_url: string | null;
        metadata: Record<string, unknown>;
      }>(
        `SELECT source_type, title, notification_class, action_url, metadata
           FROM notification_intents
          WHERE id = $1`,
        [created.intentId],
      );
      assert.equal(intent.rows[0]?.source_type, "academy.lesson_available");
      assert.equal(intent.rows[0]?.notification_class, "academy");
      assert.equal(intent.rows[0]?.title, "درس بعدی آکادمی آماده است");
      assert.equal(intent.rows[0]?.action_url, "/academy/term-1");
      assert.equal(
        intent.rows[0]?.metadata.templateId,
        "academy.lesson-available.v1",
      );
      assert.equal("producerPayload" in (intent.rows[0]?.metadata ?? {}), false);

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
  "delayed events use current processing time for quiet-hour policy",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "producer-processing-time");
      const now = new Date();
      const quietStart = new Date(now.getTime() - 30 * 60_000);
      const quietEnd = new Date(now.getTime() + 30 * 60_000);
      const time = (value: Date) =>
        `${String(value.getUTCHours()).padStart(2, "0")}:${String(
          value.getUTCMinutes(),
        ).padStart(2, "0")}`;

      await updateNotificationSettings(client, principal.id, {
        timezone: "UTC",
        quietStart: time(quietStart),
        quietEnd: time(quietEnd),
        digestTime: "09:00",
        muteUntil: null,
      });

      const delayed = lessonEvent(principal, {
        occurredAt: new Date(now.getTime() - 2 * 60 * 60_000).toISOString(),
      });
      const result = await produceDomainNotification(client, delayed);
      assert.equal(result.status, "created");
      assert.equal(result.decision, "defer");
      assert.equal(result.reason, "quiet_hours");
      assert.ok(result.scheduledFor);
      assert.ok(Date.parse(result.scheduledFor) > now.getTime());
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
      const support = await produceDomainNotification(client, supportEvent(principal));
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
        securityEvent(principal, now.toISOString()),
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
          ...lessonEvent(principal),
          tenantId: otherTenantId,
        }),
        /notification_principal_not_found/,
      );
    });
  },
);
