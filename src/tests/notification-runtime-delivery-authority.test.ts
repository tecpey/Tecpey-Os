import assert from "node:assert/strict";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  createInAppNotification,
  type NotificationCreationResult,
} from "../lib/notifications/creation";
import {
  acceptInAppNotificationDelivery,
  claimNotificationOutbox,
} from "../lib/notifications/outbox";
import { resolveNotificationPrincipal } from "../lib/notifications/principal";
import {
  listInboxNotifications,
  mutateInboxNotification,
} from "../lib/notifications/repository";

const databaseUrl = process.env.DATABASE_URL;

function isoAfter(milliseconds: number): string {
  return new Date(Date.now() + milliseconds).toISOString();
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

function academyRequest(correlationKey: string) {
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
    metadata: { verified: true },
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

test(
  "pending in-app notifications are invisible and immutable until accepted delivery",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "notification-delivery-gate");
      const created = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:delivery-gate:${crypto.randomUUID()}`),
      );
      assert.equal(created.decision, "allow");
      assert.ok(created.notificationId);
      assert.ok(created.outboxId);

      const before = await listInboxNotifications(client, principal, {
        limit: 20,
        cursor: null,
      });
      assert.equal(
        before.notifications.some((item) => item.id === created.notificationId),
        false,
      );
      assert.equal(
        await mutateInboxNotification(
          client,
          principal,
          created.notificationId,
          "read",
        ),
        null,
      );

      const claims = await claimNotificationOutbox(client, {
        workerId: "delivery-gate-worker",
        limit: 20,
        leaseSeconds: 60,
      });
      const claim = claims.find((item) => item.outboxId === created.outboxId);
      assert.ok(claim);
      await acceptInAppNotificationDelivery(
        client,
        claim,
        "delivery-gate-worker",
      );

      const after = await listInboxNotifications(client, principal, {
        limit: 20,
        cursor: null,
      });
      const visible = after.notifications.find(
        (item) => item.id === created.notificationId,
      );
      assert.ok(visible?.deliveredAt);

      const read = await mutateInboxNotification(
        client,
        principal,
        created.notificationId,
        "read",
      );
      assert.ok(read?.deliveredAt);
      assert.ok(read?.readAt);
    });
  },
);

test(
  "fatigue caps count delivered notifications rather than pending outbox rows",
  { skip: !databaseUrl },
  async () => {
    await withRolledBackTest(async (client) => {
      const principal = await createPrincipal(client, "notification-fatigue");
      const pending: NotificationCreationResult[] = [];

      for (let index = 0; index < 4; index += 1) {
        const created = await createInAppNotification(
          client,
          principal,
          academyRequest(`academy:fatigue-pending:${index}:${crypto.randomUUID()}`),
        );
        assert.equal(created.decision, "allow");
        assert.ok(created.outboxId);
        pending.push(created);
      }

      const beforeDelivery = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:fatigue-before-delivery:${crypto.randomUUID()}`),
      );
      assert.equal(beforeDelivery.decision, "allow");

      const claims = await claimNotificationOutbox(client, {
        workerId: "fatigue-worker",
        limit: 20,
        leaseSeconds: 60,
      });
      for (const created of pending) {
        const claim = claims.find((item) => item.outboxId === created.outboxId);
        assert.ok(claim);
        await acceptInAppNotificationDelivery(client, claim, "fatigue-worker");
      }

      const afterDelivery = await createInAppNotification(
        client,
        principal,
        academyRequest(`academy:fatigue-after-delivery:${crypto.randomUUID()}`),
      );
      assert.equal(afterDelivery.decision, "digest");
      assert.equal(afterDelivery.reason, "frequency_cap");
      assert.ok(afterDelivery.scheduledFor);
    });
  },
);
