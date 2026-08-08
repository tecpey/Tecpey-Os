import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import { refreshLearningBrain } from "../../lib/learning-os";

// Load-bearing guard for the learning_events READ aggregation predicate (#109).
//
// learning_events is tenant-scoped at the write boundary (its rows carry
// (tenant_id, workspace_id, principal_type, principal_id) bound by a composite
// FK to platform_principal_bindings). refreshLearningBrain (src/lib/learning-os.ts)
// recomputes a student's learning-brain profile by aggregating learning_events;
// before this change it filtered `WHERE student_id = $1` only, so for a student
// active in two tenants one tenant's refresh would count the other tenant's
// events. The aggregation now filters `AND tenant_id = $2`.
//
// This test proves that predicate is real and load-bearing: with tenant A
// holding one lesson and tenant B two, an A-scoped refresh derives 5 (one
// lesson, disciplineScore = min(100, lessons*5 + …)), never 15 (a tenant-blind
// read of all three). Removing `AND tenant_id = $2` makes it fail.
//
// The derived brain cache is now tenant-keyed. These assertions read the
// tenant-specific cache row after each refresh so the test proves both the read
// aggregation predicate and the persisted cache key.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID; // 'tecpey', with the seeded 'main' workspace
const WORKSPACE_A = PLATFORM.DEFAULT_WORKSPACE_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;
const WORKSPACE_B = `ws-b-${randomUUID()}`;
const cleanupTenants = new Set<string>([TENANT_B]);
// Track every student we admit so teardown can remove its default-tenant (A)
// fixtures too — tenant B's rows go with the tenant cascade, but the student,
// its tenant-A binding/events and its shared brain-cache rows live under the
// default tenant and would otherwise accumulate in the shared database.
const cleanupStudents = new Set<string>();

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function seedStudentBinding(client: PoolClient, studentId: string): Promise<void> {
  cleanupStudents.add(studentId);
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
       VALUES ($1, $1, $1, 'enterprise', '{}'::text[]) ON CONFLICT (id) DO NOTHING`,
    [TENANT_B],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
       VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
    [WORKSPACE_B, TENANT_B],
  );
  await client.query(
    `INSERT INTO academy_students (id, locale) VALUES ($1::uuid, 'fa')
       ON CONFLICT (id) DO NOTHING`,
    [studentId],
  );
  for (const [tenant, workspace] of [
    [TENANT_A, WORKSPACE_A],
    [TENANT_B, WORKSPACE_B],
  ]) {
    await client.query(
      `INSERT INTO platform_principal_bindings
         (tenant_id, workspace_id, principal_type, principal_id, status, source)
       VALUES ($1, $2, 'student', $3, 'active', 'test')
       ON CONFLICT (tenant_id, workspace_id, principal_type, principal_id) DO NOTHING`,
      [tenant, workspace, studentId],
    );
  }
}

async function seedLessons(
  client: PoolClient,
  studentId: string,
  tenant: string,
  workspace: string,
  count: number,
): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await client.query(
      `INSERT INTO learning_events
         (student_id, event_type, payload, tenant_id, workspace_id, principal_type, principal_id)
       VALUES ($1::uuid, 'lesson_completed', '{}'::jsonb, $2, $3, 'student', $1::text)`,
      [studentId, tenant, workspace],
    );
  }
}

async function disciplineScore(
  client: PoolClient,
  studentId: string,
  tenantId: string,
): Promise<number> {
  const rows = await client.query<{ discipline_score: number }>(
    `SELECT discipline_score
       FROM learning_brain_profiles
      WHERE tenant_id = $1 AND student_id = $2::uuid`,
    [tenantId, studentId],
  );
  return Number(rows.rows[0]?.discipline_score ?? -1);
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      // Remove every fixture this suite created, under BOTH tenants, so repeated
      // runs against a shared database do not accumulate rows. Everything that
      // references a student binding must go before the binding itself — the
      // learning_events and academy_public_profiles composite FKs onto
      // platform_principal_bindings are ON DELETE RESTRICT.
      for (const studentId of cleanupStudents) {
        await client.query("DELETE FROM learning_events WHERE student_id = $1::uuid", [studentId]);
        await client.query("DELETE FROM academy_public_profiles WHERE student_id = $1::uuid", [studentId]);
        await client.query("DELETE FROM notification_brain_snapshots WHERE student_id = $1::uuid", [studentId]);
        await client.query("DELETE FROM learning_brain_profiles WHERE student_id = $1::uuid", [studentId]);
        await client.query(
          "DELETE FROM platform_principal_bindings WHERE principal_type = 'student' AND principal_id = $1",
          [studentId],
        );
        await client.query("DELETE FROM academy_students WHERE id = $1::uuid", [studentId]);
      }
      for (const tenantId of cleanupTenants) {
        await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
      }
    });
  }
  await pool?.end();
  pool = null;
});

describe("learning_events read-aggregation tenant scoping", { skip: !configured }, () => {
  it(
    "refreshLearningBrain counts only the requested tenant's learning events for the same student",
    { timeout: 30_000 },
    async () => {
      const studentId = randomUUID();

      await withClient(async (client) => {
        await seedStudentBinding(client, studentId);
        // The same student: 1 lesson in tenant A, 2 lessons in tenant B.
        await seedLessons(client, studentId, TENANT_A, WORKSPACE_A, 1);
        await seedLessons(client, studentId, TENANT_B, WORKSPACE_B, 2);

        // Refresh under tenant A: discipline must reflect ONE lesson (5), not the
        // three events a tenant-blind read would aggregate (15).
        await refreshLearningBrain(client, studentId, TENANT_A);
        assert.equal(
          await disciplineScore(client, studentId, TENANT_A),
          5,
          "tenant A's refresh must count only tenant A's single lesson, not tenant B's events",
        );

        // Refresh under tenant B: its own TWO lessons (10) in a distinct
        // tenant-keyed cache row.
        await refreshLearningBrain(client, studentId, TENANT_B);
        assert.equal(
          await disciplineScore(client, studentId, TENANT_B),
          10,
          "tenant B's refresh must count only tenant B's two lessons",
        );
      });
    },
  );
});
