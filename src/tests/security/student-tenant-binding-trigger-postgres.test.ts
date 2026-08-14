import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";

import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

// The three per-student derived tables that carry a tenant but no workspace
// (#109, roadmap 7.2, migration 0074).
//
// Migration 0073 bound the eight tables that carry a workspace to
// platform_principal_bindings with a composite foreign key. These three cannot
// use that idiom without a workspace column, and they should not get one: every
// read and write of them keys on (student_id, tenant_id) and nothing else, so
// the column would invent a dimension the domain does not have purely to make
// the constraint fit.
//
// The same invariant is enforced by trigger instead, at the level the data
// actually lives at, and on both ends — a foreign key guards writes *and*
// deletes, so a trigger on only the child table would be weaker than what it
// replaces.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const GUARDED_TABLES = [
  "learning_brain_profiles",
  "notification_brain_snapshots",
  "ai_mentor_request_evidence",
] as const;

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

async function seedTenant(client: PoolClient): Promise<{ tenantId: string; workspaceId: string }> {
  const tenantId = `tenant-trg-${randomUUID()}`;
  const workspaceId = `ws-trg-${randomUUID()}`;
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
       VALUES ($1::uuid, 'fa', $2, 'Trigger Probe')`,
    [studentId, `${studentId}@trigger-probe.test`],
  );
  return studentId;
}

async function admit(
  client: PoolClient,
  scope: { tenantId: string; workspaceId: string },
  studentId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, status, source)
     VALUES ($1, $2, 'student', $3, 'active', 'test')
     ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
    [scope.tenantId, scope.workspaceId, studentId],
  );
}

/** A minimal row for each guarded table, enough for the trigger to see. */
function insertRow(
  client: PoolClient,
  table: (typeof GUARDED_TABLES)[number],
  tenantId: string,
  studentId: string,
) {
  if (table === "learning_brain_profiles") {
    return client.query(
      `INSERT INTO learning_brain_profiles (student_id, tenant_id) VALUES ($1::uuid, $2)`,
      [studentId, tenantId],
    );
  }
  if (table === "notification_brain_snapshots") {
    return client.query(
      `INSERT INTO notification_brain_snapshots (student_id, tenant_id) VALUES ($1::uuid, $2)`,
      [studentId, tenantId],
    );
  }
  return client.query(
    `INSERT INTO ai_mentor_request_evidence
       (tenant_id, request_id, student_id, phase, provider, policy_version,
        input_hash, outcome)
     VALUES ($1, gen_random_uuid(), $2::uuid, 'local', 'local', 'policy-v1',
             repeat('a', 64), 'local_guidance')`,
    [tenantId, studentId],
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
  await pool?.end();
  pool = null;
});

describe("Student tenant binding trigger", () => {
  for (const table of GUARDED_TABLES) {
    it(
      `refuses a ${table} row whose tenant never admitted the student`,
      { skip: !configured, timeout: 45_000 },
      async () => {
        await withRollback(async (client) => {
          const tenantA = await seedTenant(client);
          const tenantB = await seedTenant(client);
          const studentId = await seedStudent(client);
          await admit(client, tenantB, studentId);

          await assert.rejects(
            insertRow(client, table, tenantA.tenantId, studentId),
            /is not bound to student/,
            `${table} must not hold a row for a student its tenant never admitted`,
          );
        });
      },
    );
  }

  it(
    "accepts the same row once that tenant admits the student",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const tenant = await seedTenant(client);
        const studentId = await seedStudent(client);
        await admit(client, tenant, studentId);

        for (const table of GUARDED_TABLES) {
          const inserted = await insertRow(client, table, tenant.tenantId, studentId);
          assert.equal(inserted.rowCount, 1, table);
        }
      });
    },
  );

  it(
    "refuses to remove the last binding while rows still depend on it",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // This is what ON DELETE RESTRICT gives the eight tables migration 0073
      // constrained. Without it the write-side trigger would guard one end while
      // the binding could still be pulled out from under existing rows.
      await withRollback(async (client) => {
        const tenant = await seedTenant(client);
        const studentId = await seedStudent(client);
        await admit(client, tenant, studentId);
        await insertRow(client, "learning_brain_profiles", tenant.tenantId, studentId);

        await assert.rejects(
          client.query(
            `DELETE FROM platform_principal_bindings
              WHERE tenant_id = $1 AND principal_type = 'student' AND principal_id = $2`,
            [tenant.tenantId, studentId],
          ),
          /still has rows in learning_brain_profiles/,
        );
      });
    },
  );

  it(
    "allows removing a binding while another row for that student remains",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // platform_principal_bindings_active_tenant_idx is UNIQUE on
      // (tenant_id, principal_type, principal_id) WHERE status = 'active', so a
      // student has at most ONE active binding per tenant. Two can only coexist
      // if one is revoked — which is also why that partial index cannot back a
      // foreign key, and why migration 0073 had to key on the full primary key
      // including the workspace.
      //
      // The write-side check accepts any binding, active or not, matching the
      // foreign key semantics on the other eight tables. So the delete guard
      // must let the active one go while a revoked one still satisfies that
      // check, and refuse only when the last row disappears.
      await withRollback(async (client) => {
        const tenant = await seedTenant(client);
        const second = `ws-second-${randomUUID()}`;
        await client.query(
          `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
             VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
          [second, tenant.tenantId],
        );
        const studentId = await seedStudent(client);
        await admit(client, tenant, studentId);
        await client.query(
          `INSERT INTO platform_principal_bindings
             (tenant_id, workspace_id, principal_type, principal_id, status, source)
           VALUES ($1, $2, 'student', $3, 'revoked', 'test')`,
          [tenant.tenantId, second, studentId],
        );
        await insertRow(client, "learning_brain_profiles", tenant.tenantId, studentId);

        const removed = await client.query(
          `DELETE FROM platform_principal_bindings
            WHERE tenant_id = $1 AND workspace_id = $2
              AND principal_type = 'student' AND principal_id = $3`,
          [tenant.tenantId, tenant.workspaceId, studentId],
        );
        assert.equal(removed.rowCount, 1, "a binding may go while another remains");
      });
    },
  );

  it(
    "guards every named table, on both the write and the delete side",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withRollback(async (client) => {
        const { rows } = await client.query<{ tbl: string; fn: string }>(
          `SELECT c.relname AS tbl, p.proname AS fn
             FROM pg_trigger t
             JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_proc p ON p.oid = t.tgfoid
            WHERE p.proname IN ('tecpey_require_student_tenant_binding',
                                'tecpey_guard_student_binding_delete')
            ORDER BY 1`,
        );
        assert.deepEqual(
          rows.map((row) => row.tbl).sort(),
          [...GUARDED_TABLES, "platform_principal_bindings"].sort(),
          "every guarded table plus the binding table itself must carry a trigger",
        );
      });
    },
  );
});
