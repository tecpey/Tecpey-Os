import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import { createInAppNotification } from "../lib/notifications/creation";
import { resolveNotificationPrincipal } from "../lib/notifications/principal";

const databaseUrl = process.env.DATABASE_URL;

async function createPrincipal(client: PoolClient) {
  const studentId = crypto.randomUUID();
  const email = `schedule-expiry-${studentId}@notification.test`;
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
     VALUES ($1, 'fa', $2, 'Schedule Expiry Test')`,
    [studentId, email],
  );
  return resolveNotificationPrincipal(client, {
    accountId: `academy:${email}`,
    studentId,
    email,
    locale: "fa",
  });
}

function request(
  correlationKey: string,
  cadence: "instant" | "digest",
  expiresAt: string,
) {
  return {
    notificationClass: "academy" as const,
    sourceType: "academy_progress",
    sourceId: crypto.randomUUID(),
    title: "ادامه مسیر یادگیری",
    body: "این اعلان پیش از زمان ارسال برنامه‌ریزی‌شده منقضی می‌شود.",
    locale: "fa" as const,
    actionUrl: "/academy/profile",
    urgency: "normal" as const,
    priority: 3,
    cadence,
    correlationKey,
    expiresAt,
    templateAvailable: true,
    metadata: { expiryTest: true },
  };
}

async function assertSuppressedIntent(
  client: PoolClient,
  correlationKey: string,
): Promise<void> {
  const intent = await client.query<{
    policy_decision: string;
    policy_reason: string;
    notification_id: string | null;
    outbox_id: string | null;
    scheduled_for: Date | null;
  }>(
    `SELECT policy_decision, policy_reason, notification_id, outbox_id, scheduled_for
       FROM notification_intents
      WHERE correlation_key = $1`,
    [correlationKey],
  );
  assert.equal(intent.rows.length, 1);
  assert.deepEqual(intent.rows[0], {
    policy_decision: "suppress",
    policy_reason: "expired",
    notification_id: null,
    outbox_id: null,
    scheduled_for: null,
  });
}

test(
  "deferred and digest notifications are suppressed when their schedule reaches expiry",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    try {
      await applyDatabaseMigrationsWithLock(client);
      await client.query("BEGIN");
      const principal = await createPrincipal(client);

      await client.query(
        `UPDATE notification_settings
            SET timezone = 'UTC', quiet_start = NULL, quiet_end = NULL,
                digest_time = '23:59'
          WHERE principal_id = $1`,
        [principal.id],
      );

      const digestKey = `academy:schedule-expiry:digest:${crypto.randomUUID()}`;
      const digest = await createInAppNotification(
        client,
        principal,
        request(digestKey, "digest", "2099-01-01T01:00:00.000Z"),
        { now: "2099-01-01T00:00:00.000Z" },
      );
      assert.deepEqual(
        {
          status: digest.status,
          decision: digest.decision,
          reason: digest.reason,
          notificationId: digest.notificationId,
          outboxId: digest.outboxId,
          scheduledFor: digest.scheduledFor,
        },
        {
          status: "suppressed",
          decision: "suppress",
          reason: "expired",
          notificationId: null,
          outboxId: null,
          scheduledFor: null,
        },
      );
      await assertSuppressedIntent(client, digestKey);

      await client.query(
        `UPDATE notification_settings
            SET timezone = 'UTC', quiet_start = '00:00', quiet_end = '02:00',
                digest_time = '09:00'
          WHERE principal_id = $1`,
        [principal.id],
      );

      const deferKey = `academy:schedule-expiry:defer:${crypto.randomUUID()}`;
      const deferred = await createInAppNotification(
        client,
        principal,
        request(deferKey, "instant", "2099-01-01T01:00:00.000Z"),
        { now: "2099-01-01T00:30:00.000Z" },
      );
      assert.deepEqual(
        {
          status: deferred.status,
          decision: deferred.decision,
          reason: deferred.reason,
          notificationId: deferred.notificationId,
          outboxId: deferred.outboxId,
          scheduledFor: deferred.scheduledFor,
        },
        {
          status: "suppressed",
          decision: "suppress",
          reason: "expired",
          notificationId: null,
          outboxId: null,
          scheduledFor: null,
        },
      );
      await assertSuppressedIntent(client, deferKey);

      const orphanRows = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM platform_notifications
          WHERE correlation_key = ANY($1::text[])`,
        [[digestKey, deferKey]],
      );
      assert.equal(orphanRows.rows[0]?.count, "0");

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
