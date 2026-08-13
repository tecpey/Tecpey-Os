import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import { createSmartNotification } from "../../lib/learning-os";
import { resolveNotificationPrincipal } from "../../lib/notifications/principal";
import { migrateLegacyNotificationsForPrincipal } from "../../lib/notifications/repository";
import type { NotificationPrincipal } from "../../lib/notifications/principal";

// Load-bearing guard for notification_center (#109, migration 0071).
//
// notification_center is the legacy inbox being drained into
// platform_notifications, and migrateLegacyNotificationsForPrincipal runs on
// every GET /api/notifications. It selected legacy rows by student_id alone and
// copied each into platform_notifications under the *reading* principal's
// tenant. Its NOT EXISTS guard is keyed by that same tenant, so it did not
// prevent the copy — it guaranteed that every tenant a student is bound to
// drains the same legacy rows into its own inbox.
//
// So a notification written while the student acted in one tenant appeared
// verbatim in another tenant's inbox, automatically, on read. This was
// reproduced against main before the fix; these cases keep it closed.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const WORKSPACE_A = PLATFORM.DEFAULT_WORKSPACE_ID;

async function withRollback<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function seedTenantB(client: PoolClient): Promise<{ tenantId: string; workspaceId: string }> {
  const tenantId = `tenant-b-${randomUUID()}`;
  const workspaceId = `ws-b-${randomUUID()}`;
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
    [workspaceId, tenantId],
  );
  return { tenantId, workspaceId };
}

async function seedStudent(client: PoolClient): Promise<string> {
  const studentId = randomUUID();
  await client.query(
    `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, 'fa', $2, 'Notification Tenant Probe')`,
    [studentId, `${studentId}@notification-tenant.test`],
  );
  return studentId;
}

async function inboxTitles(
  client: PoolClient,
  tenantId: string,
  principalId: string,
): Promise<string[]> {
  const rows = await client.query<{ title: string }>(
    `SELECT title FROM platform_notifications
      WHERE tenant_id = $1 AND principal_id = $2
      ORDER BY title`,
    [tenantId, principalId],
  );
  return rows.rows.map((row) => row.title);
}

async function principalFor(
  client: PoolClient,
  studentId: string,
  tenantId: string,
): Promise<NotificationPrincipal> {
  return resolveNotificationPrincipal(
    client,
    { accountId: null, studentId, email: null, locale: "fa" },
    tenantId,
  );
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  if (!pool) return;
  await pool.end();
  pool = null;
});

describe("notification_center cross-tenant isolation", () => {
  it(
    "does not drain one tenant's notification into another tenant's inbox",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const tenantB = await seedTenantB(client);
        const studentId = await seedStudent(client);
        const title = `Tenant A private ${randomUUID()}`;

        await createSmartNotification(client, {
          studentId,
          scope: { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
          type: "achievement",
          title,
          body: "written while acting in tenant A",
        });

        const principalB = await principalFor(client, studentId, tenantB.tenantId);
        const migratedIntoB = await migrateLegacyNotificationsForPrincipal(client, principalB);

        assert.equal(migratedIntoB, 0, "tenant B must drain none of tenant A's notifications");
        assert.deepEqual(
          await inboxTitles(client, tenantB.tenantId, principalB.id),
          [],
          "tenant B's inbox must not contain a notification written in tenant A",
        );

        // The owning tenant still drains it, so this is a boundary and not a
        // blanket refusal.
        const principalA = await principalFor(client, studentId, TENANT_A);
        assert.equal(await migrateLegacyNotificationsForPrincipal(client, principalA), 1);
        assert.deepEqual(await inboxTitles(client, TENANT_A, principalA.id), [title]);
      });
    },
  );

  it(
    "keeps each tenant's own notifications separate for the same student",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const tenantB = await seedTenantB(client);
        const studentId = await seedStudent(client);
        const titleA = `A ${randomUUID()}`;
        const titleB = `B ${randomUUID()}`;

        await createSmartNotification(client, {
          studentId,
          scope: { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
          type: "achievement",
          title: titleA,
          body: "A",
        });
        await createSmartNotification(client, {
          studentId,
          scope: { tenantId: tenantB.tenantId, workspaceId: tenantB.workspaceId },
          type: "achievement",
          title: titleB,
          body: "B",
        });

        const principalA = await principalFor(client, studentId, TENANT_A);
        const principalB = await principalFor(client, studentId, tenantB.tenantId);
        await migrateLegacyNotificationsForPrincipal(client, principalA);
        await migrateLegacyNotificationsForPrincipal(client, principalB);

        assert.deepEqual(await inboxTitles(client, TENANT_A, principalA.id), [titleA]);
        assert.deepEqual(await inboxTitles(client, tenantB.tenantId, principalB.id), [titleB]);
      });
    },
  );

  it(
    "refuses a notification whose workspace belongs to another tenant",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const tenantB = await seedTenantB(client);
        const studentId = await seedStudent(client);

        // Syntactically valid, but the workspace is tenant B's. The composite
        // foreign key is what stops it, not a regex.
        await assert.rejects(
          createSmartNotification(client, {
            studentId,
            scope: { tenantId: TENANT_A, workspaceId: tenantB.workspaceId },
            type: "achievement",
            title: "mismatched pair",
            body: "should not be storable",
          }),
          /notification_center_tenant_workspace_fk/,
        );
      });
    },
  );
});
