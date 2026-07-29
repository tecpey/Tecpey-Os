import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { applyDatabaseMigrationsWithLock } from "../lib/db-migration-plan";
import { resolveNotificationPrincipal } from "../lib/notifications/principal";
import {
  LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE,
  migrateLegacyNotificationsForPrincipal,
} from "../lib/notifications/repository";

const databaseUrl = process.env.DATABASE_URL;

test(
  "legacy notification migration anti-joins completed rows and caps each inbox read",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    try {
      await applyDatabaseMigrationsWithLock(client);
      await client.query("BEGIN");

      const studentId = crypto.randomUUID();
      const titlePrefix = `Legacy migration batch ${studentId}`;
      await client.query(
        `INSERT INTO academy_students (id, locale, email, display_name)
         VALUES ($1, 'fa', $2, 'Legacy Migration Test')`,
        [studentId, `${studentId}@notification.test`],
      );
      const principal = await resolveNotificationPrincipal(client, {
        accountId: null,
        studentId,
        email: null,
        locale: "fa",
      });

      // Keep this test independent from any repository-level legacy broadcast fixture.
      await client.query(`DELETE FROM notification_center WHERE student_id IS NULL`);
      const totalLegacyRows = LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE + 5;
      await client.query(
        `INSERT INTO notification_center
          (student_id, type, title, body, priority, created_at, scheduled_for, metadata)
         SELECT $1::uuid,
                'academy',
                $2 || ':' || sequence_number::text,
                'Legacy migration batch body',
                1,
                NOW() + ((1000 - sequence_number) * INTERVAL '1 second'),
                NOW(),
                '{}'::jsonb
           FROM generate_series(1, $3::integer) AS sequence_number`,
        [studentId, titlePrefix, totalLegacyRows],
      );

      assert.equal(
        await migrateLegacyNotificationsForPrincipal(client, principal),
        LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE,
      );

      const afterFirstBatch = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM platform_notifications
          WHERE tenant_id = $1
            AND principal_id = $2
            AND title LIKE $3`,
        [principal.tenantId, principal.id, `${titlePrefix}:%`],
      );
      assert.equal(
        Number.parseInt(afterFirstBatch.rows[0]?.count ?? "0", 10),
        LEGACY_NOTIFICATION_MIGRATION_BATCH_SIZE,
      );

      const oldestAfterFirstBatch = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM platform_notifications
          WHERE tenant_id = $1
            AND principal_id = $2
            AND title = $3`,
        [principal.tenantId, principal.id, `${titlePrefix}:${totalLegacyRows}`],
      );
      assert.equal(oldestAfterFirstBatch.rows[0]?.count, "0");

      assert.equal(
        await migrateLegacyNotificationsForPrincipal(client, principal),
        5,
      );
      assert.equal(
        await migrateLegacyNotificationsForPrincipal(client, principal),
        0,
      );

      const finalCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM platform_notifications
          WHERE tenant_id = $1
            AND principal_id = $2
            AND title LIKE $3`,
        [principal.tenantId, principal.id, `${titlePrefix}:%`],
      );
      assert.equal(
        Number.parseInt(finalCount.rows[0]?.count ?? "0", 10),
        totalLegacyRows,
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
