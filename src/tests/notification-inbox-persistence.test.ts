import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import {
  resolveNotificationPrincipal,
  type NotificationIdentity,
} from "../lib/notifications/principal";
import {
  decodeNotificationCursor,
  getNotificationPreferences,
  listInboxNotifications,
  migrateLegacyNotificationsForPrincipal,
  mutateInboxNotification,
} from "../lib/notifications/repository";
import {
  getCurrentNotificationConsents,
  recordNotificationConsent,
  updateNotificationSettings,
  upsertNotificationPreference,
} from "../lib/notifications/preferences";

const databaseUrl = process.env.DATABASE_URL;

function identity(studentId: string, accountId: string): NotificationIdentity {
  return {
    studentId,
    accountId,
    email: `${studentId}@notification.test`,
    locale: "fa",
  };
}

test(
  "durable notification inbox binds account and student identity without fabricated fallback",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    try {
      await applyDatabaseMigrationsWithLock(client);
      await client.query("BEGIN");

      const studentId = crypto.randomUUID();
      const accountId = `academy:notification-${studentId}@test.local`;
      await client.query(
        `INSERT INTO academy_students (id, locale, email, display_name)
         VALUES ($1, 'fa', $2, 'Notification Test')`,
        [studentId, `${studentId}@notification.test`],
      );

      const first = await resolveNotificationPrincipal(
        client,
        identity(studentId, accountId),
      );
      const second = await resolveNotificationPrincipal(
        client,
        identity(studentId, accountId),
      );
      assert.equal(second.id, first.id);
      assert.equal(first.studentId, studentId);
      assert.equal(first.accountId, accountId);

      await client.query(
        `INSERT INTO notification_center
          (student_id, type, title, body, action_url, priority, metadata)
         VALUES ($1, 'mentor', 'Legacy mentor note', 'Continue the lesson',
                 '/academy/profile', 3, '{"origin":"legacy"}'::jsonb)`,
        [studentId],
      );

      assert.equal(
        await migrateLegacyNotificationsForPrincipal(client, first),
        1,
      );
      assert.equal(
        await migrateLegacyNotificationsForPrincipal(client, first),
        0,
      );

      const inbox = await listInboxNotifications(client, first, {
        limit: 20,
        cursor: null,
      });
      assert.equal(inbox.notifications.length, 1);
      assert.equal(inbox.unread, 1);
      assert.equal(inbox.notifications[0]?.notificationClass, "mentor_ai");
      assert.equal(inbox.notifications[0]?.sourceType, "legacy_notification_center");
      assert.equal(inbox.notifications[0]?.metadata.origin, "legacy");

      const notificationId = inbox.notifications[0]?.id;
      assert.ok(notificationId);
      const read = await mutateInboxNotification(
        client,
        first,
        notificationId,
        "read",
      );
      assert.ok(read?.readAt);

      const unread = await mutateInboxNotification(
        client,
        first,
        notificationId,
        "unread",
      );
      assert.equal(unread?.readAt, null);

      const actioned = await mutateInboxNotification(
        client,
        first,
        notificationId,
        "actioned",
      );
      assert.ok(actioned?.actionedAt);
      assert.ok(actioned?.readAt);

      const dismissed = await mutateInboxNotification(
        client,
        first,
        notificationId,
        "dismiss",
      );
      assert.ok(dismissed?.dismissedAt);

      const afterDismiss = await listInboxNotifications(client, first, {
        limit: 20,
        cursor: null,
      });
      assert.equal(afterDismiss.notifications.length, 0);
      assert.equal(afterDismiss.unread, 0);

      await upsertNotificationPreference(client, first.id, {
        notificationClass: "academy",
        channel: "in_app",
        enabled: true,
        cadence: "digest",
      });
      await assert.rejects(
        upsertNotificationPreference(client, first.id, {
          notificationClass: "security_critical",
          channel: "email",
          enabled: false,
          cadence: "instant",
        }),
        /mandatory_notification_class_cannot_be_disabled/,
      );

      await updateNotificationSettings(client, first.id, {
        timezone: "Asia/Tehran",
        quietStart: "23:00",
        quietEnd: "07:30",
        digestTime: "09:15",
        muteUntil: null,
      });

      const preferences = await getNotificationPreferences(client, first.id);
      assert.equal(preferences.settings.timezone, "Asia/Tehran");
      assert.equal(preferences.settings.quietStart, "23:00");
      assert.equal(preferences.settings.quietEnd, "07:30");
      assert.equal(preferences.settings.digestTime, "09:15");
      assert.deepEqual(
        preferences.preferences.map((item) => ({
          notificationClass: item.notificationClass,
          channel: item.channel,
          enabled: item.enabled,
          cadence: item.cadence,
        })),
        [
          {
            notificationClass: "academy",
            channel: "in_app",
            enabled: true,
            cadence: "digest",
          },
        ],
      );

      const granted = await recordNotificationConsent(client, first.id, {
        purpose: "marketing",
        status: "granted",
        policyVersion: "marketing-v1",
        source: "notification-center",
        jurisdiction: "IR",
      });
      assert.equal(granted.status, "granted");
      const revoked = await recordNotificationConsent(client, first.id, {
        purpose: "marketing",
        status: "revoked",
        policyVersion: "marketing-v1",
        source: "notification-center",
        jurisdiction: "IR",
      });
      assert.equal(revoked.status, "revoked");

      const currentConsents = await getCurrentNotificationConsents(
        client,
        first.id,
      );
      assert.equal(currentConsents.length, 1);
      assert.equal(currentConsents[0]?.status, "revoked");

      assert.equal(decodeNotificationCursor("not-a-valid-cursor"), null);

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

test(
  "principal resolution fails closed when account and student already belong to different principals",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    try {
      await applyDatabaseMigrationsWithLock(client);
      await client.query("BEGIN");

      const studentId = crypto.randomUUID();
      const accountId = `academy:conflict-${studentId}@test.local`;
      await client.query(
        `INSERT INTO academy_students (id, locale, email)
         VALUES ($1, 'fa', $2)`,
        [studentId, `${studentId}@notification.test`],
      );

      await resolveNotificationPrincipal(client, {
        accountId,
        studentId: null,
        email: null,
        locale: "fa",
      });
      await resolveNotificationPrincipal(client, {
        accountId: null,
        studentId,
        email: null,
        locale: "fa",
      });

      await assert.rejects(
        resolveNotificationPrincipal(client, identity(studentId, accountId)),
        /notification_principal_identity_conflict/,
      );

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
  },
);
