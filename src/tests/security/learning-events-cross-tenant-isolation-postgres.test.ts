import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  processOfflineSyncCommand,
  type OfflineSyncAuthorityContext,
} from "../../lib/offline-sync-authority";
import type { OfflineSyncItem } from "../../lib/offline-sync";
import { PLATFORM } from "../../lib/platform-config";

// Cross-tenant adversarial proof for learning_events (#109).
//
// learning_events is the durable academy learning ledger. Its tenant boundary
// is the composite FK learning_events_principal_binding_fk:
//   (tenant_id, workspace_id, principal_type, principal_id)
//     -> platform_principal_bindings (tenant_id, workspace_id, principal_type, principal_id)
// so a learning event can only be recorded for a principal that is actually
// admitted into the event's own tenant/workspace. The real writer is
// insertLearningEventExactlyOnce inside processOfflineSyncCommand, which takes
// the tenant/workspace/principal from the resolved principal context.
//
// The threat proven closed: the same student enrolled in two tenants must
// produce two independent, tenant-partitioned learning events (not one shared
// row), and a learning event may never be recorded for a (tenant, principal)
// that is not bound — if the composite FK dropped tenant_id/workspace_id, a
// student's activity in one tenant could be written against, or read as,
// another tenant's learning evidence.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID;
const WORKSPACE_A = PLATFORM.DEFAULT_WORKSPACE_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;
const WORKSPACE_B = `workspace-b-${randomUUID()}`;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function item(id: string, payload: Record<string, unknown> = {}): OfflineSyncItem {
  return {
    id,
    eventType: "lesson_viewed",
    source: "pwa",
    locale: "fa",
    clientCreatedAt: "2026-07-19T12:00:00.000Z",
    payload,
  };
}

function context(
  tenantId: string,
  workspaceId: string,
  studentId: string,
): OfflineSyncAuthorityContext {
  return {
    available: true,
    tenantId,
    workspaceId,
    principalType: "student",
    principalId: studentId,
    roles: [],
    scopes: ["offline-sync:write"],
    bindingSource: "academy_students_trigger",
    bindingStatus: "active",
    membershipId: null,
    requestId: `request-${randomUUID()}`,
    authEvidence: { strictRevocation: true, sessionPrincipal: true },
  };
}

async function learningEventRowsFor(
  studentId: string,
): Promise<Array<{ tenant_id: string; workspace_id: string; event_id: string }>> {
  return withClient(async (client) => {
    const rows = await client.query<{ tenant_id: string; workspace_id: string; event_id: string }>(
      `SELECT tenant_id, workspace_id, event_id::text
         FROM learning_events
        WHERE student_id = $1::uuid
        ORDER BY tenant_id`,
      [studentId],
    );
    return rows.rows;
  });
}

// Inserting an academy_students row auto-creates the student's binding into the
// default tenant (TENANT_A) via the platform_principal_bindings trigger. Tenant
// B must be admitted explicitly — which is itself the isolation boundary.
async function seedStudent(studentId: string): Promise<void> {
  await withClient((client) =>
    client.query(
      `INSERT INTO academy_students (id, locale, email, display_name)
       VALUES ($1::uuid, 'fa', $2, 'cross-tenant-learning')`,
      [studentId, `xt-le-${studentId}@learning.test`],
    ),
  );
}

async function seedTenantBBinding(studentId: string): Promise<void> {
  await withClient((client) =>
    client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
      [TENANT_B, WORKSPACE_B, studentId],
    ),
  );
}

async function cleanupStudent(studentId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query("DELETE FROM offline_sync_commands WHERE student_id = $1::uuid", [studentId]);
    await client.query("DELETE FROM learning_events WHERE student_id = $1::uuid", [studentId]);
    await client.query(
      "DELETE FROM platform_principal_bindings WHERE principal_id = $1 AND tenant_id = $2",
      [studentId, TENANT_B],
    );
    await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
  });
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 8, allowExitOnIdle: true });
  await withClient(async (client) => {
    await applyDatabaseMigrationsWithLock(client);
    await client.query(
      `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[])
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_B],
    );
    await client.query(
      `INSERT INTO platform_workspaces
         (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [WORKSPACE_B, TENANT_B],
    );
  });
});

after(async () => {
  if (pool) {
    // platform_tenants ON DELETE CASCADE clears TENANT_B's workspace and bindings.
    await withClient((client) =>
      client.query("DELETE FROM platform_tenants WHERE id = $1", [TENANT_B]),
    );
  }
  await pool?.end();
  pool = null;
});

describe("Learning events cross-tenant isolation", () => {
  it(
    "partitions a shared student's learning events by tenant: two tenants record two independent rows",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const studentId = randomUUID();
      await seedStudent(studentId);
      await seedTenantBBinding(studentId);

      try {
        const committedA = await processOfflineSyncCommand({
          context: context(TENANT_A, WORKSPACE_A, studentId),
          item: item(`le-xt-a-${randomUUID()}`, { progress: 10 }),
        });
        assert.equal(committedA.status, "committed");

        const committedB = await processOfflineSyncCommand({
          context: context(TENANT_B, WORKSPACE_B, studentId),
          item: item(`le-xt-b-${randomUUID()}`, { progress: 20 }),
        });
        assert.equal(committedB.status, "committed");

        // The same student's learning events must be two distinct rows, each
        // carrying its own tenant/workspace — not one shared row. A boundary that
        // dropped tenant_id from the binding FK would let one tenant's event be
        // recorded against, or read as, the other tenant's learning evidence.
        const rows = await learningEventRowsFor(studentId);
        assert.equal(rows.length, 2, "each tenant must own a distinct learning event");
        assert.deepEqual(
          rows.map((row) => row.tenant_id),
          [TENANT_A, TENANT_B].sort(),
        );
        const byTenant = new Map(rows.map((row) => [row.tenant_id, row]));
        assert.equal(byTenant.get(TENANT_A)?.workspace_id, WORKSPACE_A);
        assert.equal(byTenant.get(TENANT_B)?.workspace_id, WORKSPACE_B);
        assert.notEqual(
          byTenant.get(TENANT_A)?.event_id,
          byTenant.get(TENANT_B)?.event_id,
          "the two tenants must own distinct learning event ids",
        );
      } finally {
        await cleanupStudent(studentId);
      }
    },
  );

  it(
    "refuses to record a learning event for a tenant the student is not bound to",
    { skip: !configured, timeout: 30_000 },
    async () => {
      const studentId = randomUUID();
      // Student is admitted into TENANT_A only (auto-bound by the trigger); no
      // TENANT_B binding is seeded here.
      await seedStudent(studentId);

      try {
        // The load-bearing negative: a learning event claiming TENANT_B for a
        // student bound only into TENANT_A must be rejected by the composite
        // binding FK — proving tenant_id/workspace_id are part of the boundary,
        // not just principal_id. A single-column principal FK would accept this.
        await assert.rejects(
          withClient((client) =>
            client.query(
              `INSERT INTO learning_events
                 (event_id, student_id, event_type, source, locale, payload,
                  tenant_id, workspace_id, principal_type, principal_id)
               VALUES ($1, $2::uuid, 'lesson_viewed', 'pwa', 'fa', '{}'::jsonb,
                       $3, $4, 'student', $5)`,
              [randomUUID(), studentId, TENANT_B, WORKSPACE_B, studentId],
            ),
          ),
          /learning_events_principal_binding_fk|foreign key/i,
          "a learning event must not bind a student into an unadmitted tenant",
        );

        const rows = await learningEventRowsFor(studentId);
        assert.equal(
          rows.filter((row) => row.tenant_id === TENANT_B).length,
          0,
          "no learning event may exist for the unbound tenant",
        );

        // Sanity: the student's own tenant records cleanly through the authority.
        const committedA = await processOfflineSyncCommand({
          context: context(TENANT_A, WORKSPACE_A, studentId),
          item: item(`le-xt-sanity-${randomUUID()}`, { progress: 5 }),
        });
        assert.equal(committedA.status, "committed");
        const afterRows = await learningEventRowsFor(studentId);
        assert.equal(afterRows.length, 1);
        assert.equal(afterRows[0]?.tenant_id, TENANT_A);
      } finally {
        await cleanupStudent(studentId);
      }
    },
  );
});
