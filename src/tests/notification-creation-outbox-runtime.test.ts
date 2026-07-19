import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import { createInAppNotification } from "../lib/notifications/creation";
import {
  acceptInAppNotificationDelivery,
  claimNotificationOutbox,
  expireDueNotificationOutbox,
  failNotificationDelivery,
  getNotificationOutboxReconciliation,
  recoverExpiredNotificationLeases,
} from "../lib/notifications/outbox";
import { resolveNotificationPrincipal } from "../lib/notifications/principal";
import {
  listInboxNotifications,
} from "../lib/notifications/repository";
import {
  updateNotificationSettings,
  upsertNotificationPreference,
} from "../lib/notifications/preferences";

const databaseUrl = process.env.DATABASE_URL;

function isoAfter(milliseconds: number): string {
  return new Date(Date.now() + milliseconds).toISOString();
}

function hhmm(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

async function createPrincipal(client: PoolClient, prefix: string) {
  const studentId = crypto.randomUUID();
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
     VALUES ($1, 'fa', $2, $3)`,
    [studentId, `${prefix}-${studentId}@notification.test`, prefix],
  );
  return resolveNotificationPrincipal(client, {
    accountId: `academy:${prefix}-${studentId}@notification.test`,
    studentId,
    email: `${prefix}-${studentId}@notification.test`,
    locale: "fa",
  });
}

function academyRequest(correlationKey: string, overrides: Record<string, unknown> = {}) {
  return {
    notificationClass: "academy" as const,
    sourceType: "academy_progress",
    sourceId: crypto.randomUUID(),
    title: "ادامه مسیر یادگیری",
    body: "درس بعدی آکادمی برای ادامه مسیر آماده است.",
    locale: "fa" as const,
    actionUrl: "/academy/profile",
    urgency: "normal" as const,
    priority: 3,
    cadence: "instant" as const,
    correlationKey,
    expiresAt: isoAfter(86_400_000),
    templateAvailable: true,
    metadata: { lessonId: "term-1-lesson-2", verified: true },
    ...overrides,
  };
}

async function withRolledBackTest(
  callback: (client: PoolClient) => Promise<void>,
): Promise<void> {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
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

async function expectDatabaseFailure(
  client: PoolClient,
  name: string,
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    await assert.rejects(operation, (error: unknown) => {
      assert.equal((error as { code?: string }).code, expectedCode);
      return true;
    });
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await client.query(`RELEASE SAVEPOINT ${name}`);
  }
}

test(
  "policy creation is idempotent and inbox visibility begins only after accepted delivery",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "notification-runtime");
      const correlationKey = `academy:lesson-ready:${crypto.randomUUID()}`;
      const request = academyRequest(correlationKey);
      const now = new Date().toISOString();

      const created = await createInAppNotification(client, principal, request, {
        now,
      });
      assert.equal(created.status, "created");
      assert.equal(created.decision, "allow");
      assert.ok(created.intentId);
      assert.ok(created.notificationId);
      assert.ok(created.outboxId);

      const beforeDelivery = await listInboxNotifications(client, principal, {
        limit: 20,
        cursor: null,
      });
      assert.equal(
        beforeDelivery.notifications.some(
          (item) => item.id === created.notificationId,
        ),
        false,
      );

      const replayed = await createInAppNotification(client, principal, request, {
        now: isoAfter(1_000),
      });
      assert.equal(replayed.status, "replayed");
      assert.equal(replayed.intentId, created.intentId);
      assert.equal(replayed.notificationId, created.notificationId);
      assert.equal(replayed.outboxId, created.outboxId);

      await assert.rejects(
        createInAppNotification(
          client,
          principal,
          { ...request, body: "A changed payload must not reuse this key." },
          { now: isoAfter(2_000) },
        ),
        /notification_correlation_payload_conflict/,
      );

      const claims = await claimNotificationOutbox(client, {
        workerId: "test-worker-a",
        limit: 10,
        leaseSeconds: 60,
      });
      const claim = claims.find((item) => item.outboxId === created.outboxId);
      assert.ok(claim);

      await assert.rejects(
        acceptInAppNotificationDelivery(client, claim, "test-worker-b"),
        /notification_outbox_lease_lost/,
      );
      await acceptInAppNotificationDelivery(client, claim, "test-worker-a");

      const afterDelivery = await listInboxNotifications(client, principal, {
        limit: 20,
        cursor: null,
      });
      const visible = afterDelivery.notifications.find(
        (item) => item.id === created.notificationId,
      );
      assert.ok(visible);
      assert.ok(visible.deliveredAt);
      assert.equal(visible.notificationClass, "academy");

      await expectDatabaseFailure(
        client,
        "intent_update_blocked",
        () =>
          client.query(
            `UPDATE notification_intents SET title = 'tampered' WHERE id = $1`,
            [created.intentId],
          ),
        "55000",
      );
      await expectDatabaseFailure(
        client,
        "intent_delete_blocked",
        () =>
          client.query(`DELETE FROM notification_intents WHERE id = $1`, [
            created.intentId,
          ]),
        "55000",
      );
      await expectDatabaseFailure(
        client,
        "notification_delete_restricted",
        () =>
          client.query(`DELETE FROM platform_notifications WHERE id = $1`, [
            created.notificationId,
          ]),
        "23503",
      );
    });
  },
);

test(
  "server-owned preferences produce suppress defer and digest decisions",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "notification-policy");

      await upsertNotificationPreference(client, principal.id, {
        notificationClass: "academy",
        channel: "in_app",
        enabled: false,
        cadence: "instant",
      });
      const suppressed = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:suppressed:${crypto.randomUUID()}`),
      );
      assert.equal(suppressed.status, "suppressed");
      assert.equal(suppressed.reason, "category_disabled");
      assert.equal(suppressed.notificationId, null);
      assert.equal(suppressed.outboxId, null);

      await upsertNotificationPreference(client, principal.id, {
        notificationClass: "academy",
        channel: "in_app",
        enabled: true,
        cadence: "instant",
      });
      const now = new Date();
      const quietStart = hhmm(new Date(now.getTime() - 60 * 60 * 1000));
      const quietEnd = hhmm(new Date(now.getTime() + 60 * 60 * 1000));
      await updateNotificationSettings(client, principal.id, {
        timezone: "UTC",
        quietStart,
        quietEnd,
        digestTime: "09:00",
        muteUntil: null,
      });

      const deferred = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:deferred:${crypto.randomUUID()}`),
        { now: now.toISOString() },
      );
      assert.equal(deferred.status, "created");
      assert.equal(deferred.decision, "defer");
      assert.equal(deferred.reason, "quiet_hours");
      assert.ok(deferred.scheduledFor);
      assert.ok(Date.parse(deferred.scheduledFor) > now.getTime());

      await updateNotificationSettings(client, principal.id, {
        timezone: "UTC",
        quietStart: null,
        quietEnd: null,
        digestTime: "09:00",
        muteUntil: null,
      });
      await upsertNotificationPreference(client, principal.id, {
        notificationClass: "academy",
        channel: "in_app",
        enabled: true,
        cadence: "digest",
      });
      const digested = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:digest:${crypto.randomUUID()}`),
      );
      assert.equal(digested.status, "created");
      assert.equal(digested.decision, "digest");
      assert.ok(digested.scheduledFor);
    });
  },
);

test(
  "outbox retry recovery expiration DLQ and reconciliation are deterministic",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "notification-outbox");
      const retryCreated = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:retry:${crypto.randomUUID()}`),
      );
      assert.ok(retryCreated.outboxId);
      await client.query(
        `UPDATE notification_outbox SET max_attempts = 2 WHERE id = $1`,
        [retryCreated.outboxId],
      );

      const firstClaim = (
        await claimNotificationOutbox(client, {
          workerId: "retry-worker",
          limit: 10,
          leaseSeconds: 60,
        })
      ).find((item) => item.outboxId === retryCreated.outboxId);
      assert.ok(firstClaim);
      const firstFailure = await failNotificationDelivery(
        client,
        firstClaim,
        "retry-worker",
        {
          errorCode: "temporary_in_app_failure",
          errorDetail: "retry fixture",
          retryable: true,
        },
      );
      assert.equal(firstFailure.terminal, false);
      assert.ok(firstFailure.availableAt);

      await client.query(
        `UPDATE notification_outbox SET available_at = NOW() WHERE id = $1`,
        [retryCreated.outboxId],
      );
      const secondClaim = (
        await claimNotificationOutbox(client, {
          workerId: "retry-worker-2",
          limit: 10,
          leaseSeconds: 60,
        })
      ).find((item) => item.outboxId === retryCreated.outboxId);
      assert.ok(secondClaim);
      assert.equal(secondClaim.attemptNumber, 2);

      const terminal = await failNotificationDelivery(
        client,
        secondClaim,
        "retry-worker-2",
        {
          errorCode: "persistent_in_app_failure",
          errorDetail: null,
          retryable: true,
        },
      );
      assert.equal(terminal.terminal, true);

      const deadLetter = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM notification_dead_letters
          WHERE outbox_id = $1`,
        [retryCreated.outboxId],
      );
      assert.equal(deadLetter.rows[0]?.count, "1");

      const staleCreated = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:stale:${crypto.randomUUID()}`),
      );
      const staleClaim = (
        await claimNotificationOutbox(client, {
          workerId: "stale-worker",
          limit: 10,
          leaseSeconds: 60,
        })
      ).find((item) => item.outboxId === staleCreated.outboxId);
      assert.ok(staleClaim);
      await client.query(
        `UPDATE notification_outbox
            SET lease_expires_at = NOW() - INTERVAL '1 second'
          WHERE id = $1`,
        [staleCreated.outboxId],
      );
      const recovered = await recoverExpiredNotificationLeases(client, 20);
      assert.ok(recovered.recovered >= 1);

      const recoveredAttempt = await client.query<{ status: string }>(
        `SELECT status FROM notification_delivery_attempts
          WHERE outbox_id = $1 AND attempt_number = $2`,
        [staleCreated.outboxId, staleClaim.attemptNumber],
      );
      assert.equal(recoveredAttempt.rows[0]?.status, "lease_recovered");

      const expiringCreated = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:expired:${crypto.randomUUID()}`),
      );
      assert.ok(expiringCreated.notificationId);
      await client.query(
        `UPDATE platform_notifications
            SET created_at = NOW() - INTERVAL '2 hours',
                expires_at = NOW() - INTERVAL '1 hour'
          WHERE id = $1`,
        [expiringCreated.notificationId],
      );
      const expired = await expireDueNotificationOutbox(client, 20);
      assert.ok(expired >= 1);

      const reconciliation = await getNotificationOutboxReconciliation(client);
      assert.ok((reconciliation.failed_terminal ?? 0) >= 1);
      assert.ok((reconciliation.expired ?? 0) >= 1);
      assert.equal(reconciliation.processingWithoutAttempt, 0);
    });
  },
);
