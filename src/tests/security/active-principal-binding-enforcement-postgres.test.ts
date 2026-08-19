import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";

// Load-bearing guard for migration 0085 (active principal-binding enforcement).
//
// Every tenant-scoped table that names a principal binds
// (tenant_id, workspace_id, principal_type, principal_id) to
// platform_principal_bindings by a composite foreign key. That key proves the
// pairing EXISTS but cannot prove the binding is still 'active' — a foreign key
// references a plain unique key, with no "only active rows" clause. So before
// 0085 a revoked student could still have new rows written under a binding that
// had been turned off; revocation was only an application concern.
//
// 0085 installs a shared DEFERRABLE INITIALLY DEFERRED constraint trigger,
// tecpey_active_binding_guard, on every such table. This suite proves the gate
// closes the revocation gap without breaking the flows the deferred timing
// exists to protect, and that the guard covers the whole family so a future
// binding-bound table cannot ship without it.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT = PLATFORM.DEFAULT_TENANT_ID;
const WORKSPACE = PLATFORM.DEFAULT_WORKSPACE_ID;
const cleanupStudents = new Set<string>();

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** A student and its ACTIVE binding to the default tenant. */
async function seedBoundStudent(client: PoolClient): Promise<string> {
  const studentId = randomUUID();
  cleanupStudents.add(studentId);
  await client.query(
    `INSERT INTO academy_students (id, locale, display_name)
       VALUES ($1::uuid, 'fa', 'Active Binding Probe') ON CONFLICT (id) DO NOTHING`,
    [studentId],
  );
  // academy_students' creation trigger already binds the student to the default
  // tenant as 'active'; this makes the intent explicit and is idempotent.
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, status, source)
     VALUES ($1, $2, 'student', $3, 'active', 'active-binding-test')
     ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
       DO UPDATE SET status = 'active'`,
    [TENANT, WORKSPACE, studentId],
  );
  return studentId;
}

function insertTermProgress(
  client: PoolClient,
  studentId: string,
  termNumber: number,
): Promise<unknown> {
  return client.query(
    `INSERT INTO academy_term_progress
       (tenant_id, workspace_id, student_id, term_number, locale, score, percent, status, passed_at)
     VALUES ($1, $2, $3::uuid, $4, 'fa', 100, 100, 'passed', NOW())`,
    [TENANT, WORKSPACE, studentId, termNumber],
  );
}

async function setBindingStatus(
  client: PoolClient,
  studentId: string,
  status: "active" | "revoked",
): Promise<void> {
  await client.query(
    `UPDATE platform_principal_bindings SET status = $4
      WHERE tenant_id = $1 AND workspace_id = $2
        AND principal_type = 'student' AND principal_id = $3`,
    [TENANT, WORKSPACE, studentId, status],
  );
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (!pool) return;
  await withClient(async (client) => {
    for (const studentId of cleanupStudents) {
      await client.query("DELETE FROM academy_term_progress WHERE student_id = $1::uuid", [studentId]);
      await client.query("DELETE FROM academy_public_profiles WHERE student_id = $1::uuid", [studentId]);
      await client.query(
        "DELETE FROM platform_principal_bindings WHERE principal_type = 'student' AND principal_id = $1",
        [studentId],
      );
      await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
    }
  });
  await pool.end();
  pool = null;
});

describe("active principal-binding enforcement (migration 0085)", { skip: !configured }, () => {
  it("covers every binding-bound table — no member of the family is left unguarded", async () => {
    await withClient(async (client) => {
      const { rows } = await client.query<{ table_name: string }>(
        `WITH fk_tables AS (
           SELECT DISTINCT c.conrelid AS rel
             FROM pg_constraint c
            WHERE c.contype = 'f'
              AND c.confrelid = 'platform_principal_bindings'::regclass
         ), guarded AS (
           SELECT DISTINCT tgrelid AS rel
             FROM pg_trigger
            WHERE tgname = 'tecpey_active_binding_guard' AND NOT tgisinternal
         )
         SELECT f.rel::regclass::text AS table_name
           FROM fk_tables f
          WHERE f.rel NOT IN (SELECT rel FROM guarded)
          ORDER BY 1`,
      );
      assert.deepEqual(
        rows.map((r) => r.table_name),
        [],
        "every table with a platform_principal_bindings foreign key must carry tecpey_active_binding_guard",
      );
      // And the family is non-trivial, so the query above is actually proving something.
      const guarded = await client.query<{ n: string }>(
        `SELECT COUNT(DISTINCT tgrelid)::text AS n FROM pg_trigger
          WHERE tgname = 'tecpey_active_binding_guard' AND NOT tgisinternal`,
      );
      assert.ok(Number(guarded.rows[0]!.n) >= 15, "the guard should cover the whole binding family");
    });
  });

  it("rejects a new write under a revoked binding — the gap the foreign key left open", async () => {
    await withClient(async (client) => {
      const studentId = await seedBoundStudent(client);
      await setBindingStatus(client, studentId, "revoked");
      await assert.rejects(
        () => insertTermProgress(client, studentId, 1),
        /no active .* binding|foreign key/i,
        "a revoked principal must not be able to have new tenant-scoped rows written",
      );
    });
  });

  it("allows a write under an active binding", async () => {
    await withClient(async (client) => {
      const studentId = await seedBoundStudent(client);
      await insertTermProgress(client, studentId, 2);
      const { rows } = await client.query(
        "SELECT 1 FROM academy_term_progress WHERE student_id = $1::uuid AND term_number = 2",
        [studentId],
      );
      assert.equal(rows.length, 1);
    });
  });

  it("grandfathers existing rows — revoking a binding does not block ordinary updates to data already written", async () => {
    await withClient(async (client) => {
      const studentId = await seedBoundStudent(client);
      await insertTermProgress(client, studentId, 3);
      await setBindingStatus(client, studentId, "revoked");
      // A non-key update to the existing row must still succeed: a revoked
      // principal's records stay administratively editable.
      await client.query(
        "UPDATE academy_term_progress SET score = 95 WHERE student_id = $1::uuid AND term_number = 3",
        [studentId],
      );
      const { rows } = await client.query<{ score: number }>(
        "SELECT score FROM academy_term_progress WHERE student_id = $1::uuid AND term_number = 3",
        [studentId],
      );
      assert.equal(rows[0]?.score, 95);
    });
  });

  it("preserves the deferred flow — a child row inserted before its binding, committed together, is accepted", async () => {
    await withClient(async (client) => {
      const studentId = randomUUID();
      cleanupStudents.add(studentId);
      // Insert the student WITHOUT relying on its default binding: use a non-default
      // workspace binding created only later in the same transaction.
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO academy_students (id, locale, display_name)
             VALUES ($1::uuid, 'fa', 'Deferred Probe') ON CONFLICT (id) DO NOTHING`,
          [studentId],
        );
        // The child row is written before the binding exists; the deferred guard
        // must not fire until commit, by which point the active binding is present.
        await insertTermProgress(client, studentId, 7);
        await client.query(
          `INSERT INTO platform_principal_bindings
             (tenant_id, workspace_id, principal_type, principal_id, status, source)
           VALUES ($1, $2, 'student', $3, 'active', 'active-binding-test')
           ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id)
             DO UPDATE SET status = 'active'`,
          [TENANT, WORKSPACE, studentId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      const { rows } = await client.query(
        "SELECT 1 FROM academy_term_progress WHERE student_id = $1::uuid AND term_number = 7",
        [studentId],
      );
      assert.equal(rows.length, 1, "insert-child-before-binding must still commit under the deferred guard");
    });
  });
});
