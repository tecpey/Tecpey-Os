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

/**
 * The concurrency cases need state both connections can see, so this commits
 * rather than working inside one transaction that is rolled back.
 */
async function seedCommitted(
  options: { withRevokedSibling?: boolean } = {},
): Promise<{ tenant: { tenantId: string; workspaceId: string }; studentId: string }> {
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const tenant = await seedTenant(client);
    const studentId = await seedStudent(client);
    await admit(client, tenant, studentId);
    if (options.withRevokedSibling) {
      const sibling = `${tenant.workspaceId}-revoked`;
      await client.query(
        `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
           VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
        [sibling, tenant.tenantId],
      );
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, status, source)
         VALUES ($1, $2, 'student', $3, 'revoked', 'test')`,
        [tenant.tenantId, sibling, studentId],
      );
      await insertRow(client, "learning_brain_profiles", tenant.tenantId, studentId);
    }
    await client.query("COMMIT");
    return { tenant, studentId };
  } finally {
    client.release();
  }
}

/** Children before bindings, or the delete guard refuses its own fixture. */
async function cleanupCommitted(tenantId: string, studentId: string): Promise<void> {
  const client = await pool!.connect();
  try {
    for (const table of GUARDED_TABLES) {
      await client.query(
        `DELETE FROM ${table} WHERE tenant_id = $1 AND student_id = $2::uuid`,
        [tenantId, studentId],
      );
    }
    await client.query(
      `DELETE FROM platform_principal_bindings WHERE tenant_id = $1 AND principal_id = $2`,
      [tenantId, studentId],
    );
    await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
    await client.query("DELETE FROM platform_workspaces WHERE tenant_id = $1", [tenantId]);
    await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
  } finally {
    client.release();
  }
}

async function backendPid(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return rows[0].pid;
}

/**
 * Wait until this connection's statement is parked on a lock.
 *
 * The interleaving is what these tests are about, so it is observed rather than
 * slept through. A connection that never blocks is the bug the test is looking
 * for, so the bounded wait simply returns and lets the assertion speak.
 *
 * It never throws. Observing the wait makes the interleaving deterministic; it
 * is not an assertion. A throw here would land in the caller's finally with a
 * query still in flight, which is the one state these connections must never be
 * left in — see `discard`.
 */
async function waitUntilBlocked(pid: number): Promise<void> {
  let observer: PoolClient | null = null;
  try {
    observer = await pool!.connect();
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const waiting = await observer.query(
        `SELECT 1 FROM pg_stat_activity
          WHERE pid = $1 AND state = 'active' AND wait_event_type = 'Lock'`,
        [pid],
      );
      if ((waiting.rowCount ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } catch {
    // Deliberately swallowed: the assertions decide the outcome, not this.
  } finally {
    observer?.release();
  }
}

/**
 * Both races park a statement on a lock on purpose, and a connection with a
 * query still in flight is a trap. node-postgres queues everything behind it, so
 * a ROLLBACK issued from a finally block never returns, its client is never
 * released, and `pool.end()` then never resolves either — the test process
 * wedges instead of failing, and the whole run hangs rather than reporting
 * anything. Two habits make that impossible.
 *
 * A statement timeout, so a query waiting on a lock nobody will release always
 * settles on its own.
 */
async function boundStatements(client: PoolClient): Promise<void> {
  await client.query("SET statement_timeout = '15s'");
}

/**
 * And a hard release, so a connection that raced is destroyed rather than
 * returned to the pool — nothing is ever queued behind a statement that may
 * still be in flight, and destroying it rolls back whatever it held.
 */
function discard(client: PoolClient): void {
  client.release(true);
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  const closing = pool;
  pool = null;
  if (!closing) return;
  // Bounded for the same reason as `discard`: a hook that never resolves turns
  // a failing test into a run that never finishes.
  await Promise.race([
    closing.end(),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
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

  // The two cases below are what separates a trigger from a foreign key. A
  // plain EXISTS under READ COMMITTED reads a snapshot, and a snapshot cannot
  // see what a concurrent uncommitted transaction is about to do. PostgreSQL's
  // own referential integrity does not rely on a snapshot for this — a child
  // write takes FOR KEY SHARE on the parent row, so a concurrent parent delete
  // must wait rather than race. Both tests interleave two real connections.

  it(
    "makes a write wait for a concurrent removal of the binding it depends on",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // Removing the binding first is what defeats an unlocked check: the
      // delete guard looks for dependent rows and finds none because the other
      // transaction has not inserted yet, and the write-side check finds the
      // binding because the delete has not committed yet. Both succeed and the
      // row outlives its binding.
      const { tenant, studentId } = await seedCommitted();
      const remover = await pool!.connect();
      const writer = await pool!.connect();
      let write: Promise<unknown> = Promise.resolve();
      try {
        await boundStatements(writer);
        await remover.query("BEGIN");
        await remover.query(
          `DELETE FROM platform_principal_bindings
            WHERE tenant_id = $1 AND principal_type = 'student' AND principal_id = $2`,
          [tenant.tenantId, studentId],
        );

        await writer.query("BEGIN");
        const writerPid = await backendPid(writer);
        write = insertRow(
          writer,
          "learning_brain_profiles",
          tenant.tenantId,
          studentId,
        ).then(
          () => "accepted" as const,
          (error: unknown) => error,
        );
        await waitUntilBlocked(writerPid);
        await remover.query("COMMIT");

        const outcome = await write;
        assert.notEqual(
          outcome,
          "accepted",
          "a row must not be accepted against a binding that is being removed",
        );
        assert.match(String(outcome), /is not bound to student/);
      } finally {
        await write;
        discard(writer);
        discard(remover);
        await cleanupCommitted(tenant.tenantId, studentId);
      }
    },
  );

  it(
    "serializes two concurrent removals so the last binding cannot slip out",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // Each removal is individually legitimate — a sibling binding remains, so
      // the guard lets it go. Run unlocked and concurrently, both read the
      // other's still-committed row, both return early, and the dependent row
      // is left with no binding at all.
      const { tenant, studentId } = await seedCommitted({ withRevokedSibling: true });
      const first = await pool!.connect();
      const second = await pool!.connect();
      let removal: Promise<unknown> = Promise.resolve();
      try {
        await boundStatements(second);
        await first.query("BEGIN");
        await first.query(
          `DELETE FROM platform_principal_bindings
            WHERE tenant_id = $1 AND workspace_id = $2
              AND principal_type = 'student' AND principal_id = $3`,
          [tenant.tenantId, tenant.workspaceId, studentId],
        );

        await second.query("BEGIN");
        const secondPid = await backendPid(second);
        removal = second
          .query(
            `DELETE FROM platform_principal_bindings
              WHERE tenant_id = $1 AND workspace_id = $2
                AND principal_type = 'student' AND principal_id = $3`,
            [tenant.tenantId, `${tenant.workspaceId}-revoked`, studentId],
          )
          .then(
            () => "removed" as const,
            (error: unknown) => error,
          );
        await waitUntilBlocked(secondPid);
        await first.query("COMMIT");

        const outcome = await removal;
        assert.notEqual(
          outcome,
          "removed",
          "the second removal must see the first and refuse to strand the row",
        );
        assert.match(String(outcome), /still has rows in learning_brain_profiles/);
      } finally {
        await removal;
        discard(second);
        discard(first);
        await cleanupCommitted(tenant.tenantId, studentId);
      }
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
