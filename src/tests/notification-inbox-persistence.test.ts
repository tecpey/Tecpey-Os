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
  MARKETING_CONSENT_POLICY_VERSION,
  NOTIFICATION_CONSENT_SOURCE,
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
      const legacyTitle = `Legacy mentor note ${studentId}`;
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
         VALUES ($1, 'mentor', $2, 'Continue the lesson',
                 '/academy/profile', 3, '{"origin":"legacy"}'::jsonb)`,
        [studentId, legacyTitle],
      );

      const firstMigrationCount = await migrateLegacyNotificationsForPrincipal(
        client,
        first,
      );
      assert.ok(firstMigrationCount >= 1);
      assert.equal(
        await migrateLegacyNotificationsForPrincipal(client, first),
        0,
      );

      const inbox = await listInboxNotifications(client, first, {
        limit: 50,
        cursor: null,
      });
      const target = inbox.notifications.find(
        (item) => item.title === legacyTitle,
      );
      assert.ok(target);
      assert.equal(target.notificationClass, "mentor_ai");
      assert.equal(target.sourceType, "legacy_notification_center");
      assert.equal(target.metadata.origin, "legacy");
      assert.ok(inbox.unread >= 1);

      const notificationId = target.id;
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
        limit: 50,
        cursor: null,
      });
      assert.equal(
        afterDismiss.notifications.some((item) => item.id === notificationId),
        false,
      );

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
      const academyPreference = preferences.preferences.find(
        (item) =>
          item.notificationClass === "academy" && item.channel === "in_app",
      );
      assert.deepEqual(
        academyPreference
          ? {
              notificationClass: academyPreference.notificationClass,
              channel: academyPreference.channel,
              enabled: academyPreference.enabled,
              cadence: academyPreference.cadence,
            }
          : null,
        {
          notificationClass: "academy",
          channel: "in_app",
          enabled: true,
          cadence: "digest",
        },
      );

      const granted = await recordNotificationConsent(client, first.id, {
        purpose: "marketing",
        status: "granted",
        policyVersion: MARKETING_CONSENT_POLICY_VERSION,
        source: NOTIFICATION_CONSENT_SOURCE,
        jurisdiction: null,
      });
      assert.equal(granted.status, "granted");
      assert.equal(granted.policyVersion, MARKETING_CONSENT_POLICY_VERSION);
      assert.equal(granted.source, NOTIFICATION_CONSENT_SOURCE);

      const revoked = await recordNotificationConsent(client, first.id, {
        purpose: "marketing",
        status: "revoked",
        policyVersion: MARKETING_CONSENT_POLICY_VERSION,
        source: NOTIFICATION_CONSENT_SOURCE,
        jurisdiction: null,
      });
      assert.equal(revoked.status, "revoked");

      const currentConsents = await getCurrentNotificationConsents(
        client,
        first.id,
      );
      assert.equal(currentConsents.length, 1);
      assert.equal(currentConsents[0]?.status, "revoked");
      assert.equal(
        currentConsents[0]?.policyVersion,
        MARKETING_CONSENT_POLICY_VERSION,
      );
      assert.equal(currentConsents[0]?.source, NOTIFICATION_CONSENT_SOURCE);

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
  "database rejects a notification whose principal belongs to another tenant",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    try {
      await applyDatabaseMigrationsWithLock(client);
      await client.query("BEGIN");

      const studentId = crypto.randomUUID();
      const accountId = `academy:tenant-bound-${studentId}@test.local`;
      const otherTenantId = `notification-tenant-${studentId}`;
      await client.query(
        `INSERT INTO academy_students (id, locale, email)
         VALUES ($1, 'fa', $2)`,
        [studentId, `${studentId}@notification.test`],
      );
      await client.query(
        `INSERT INTO platform_tenants (id, slug, display_name, plan)
         VALUES ($1, $1, 'Notification Isolation Test', 'enterprise')`,
        [otherTenantId],
      );

      const principal = await resolveNotificationPrincipal(
        client,
        identity(studentId, accountId),
        "tecpey",
      );

      await assert.rejects(
        client.query(
          `INSERT INTO platform_notifications
            (tenant_id, principal_id, notification_class, source_type, title, body,
             correlation_key, policy_decision, policy_reason)
           VALUES ($1, $2, 'academy', 'tenant_isolation_test', 'Isolation test',
                   'This insert must fail.', $3, 'allow', 'test')`,
          [otherTenantId, principal.id, `tenant-isolation:${studentId}`],
        ),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, "23503");
          return true;
        },
      );

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
