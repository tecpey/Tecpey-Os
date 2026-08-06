import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { PLATFORM } from "../../lib/platform-config";
import { refreshLearningBrain } from "../../lib/learning-os";

// Cross-tenant adversarial proof for learning_events (#109).
//
// learning_events is tenant-scoped: its rows carry (tenant_id, workspace_id,
// principal_type, principal_id) bound by a composite FK to
// platform_principal_bindings, so a student admitted into two tenants owns
// independent learning evidence per tenant. The write side already enforces
// this; the gap this closes is the READ/aggregation side. refreshLearningBrain
// (src/lib/learning-os.ts) recomputes a student's learning-brain profile from
// learning_events; before this change it filtered `WHERE student_id = $1` only,
// so for a student active in two tenants one tenant's brain would count the
// other tenant's events. The read now filters `AND tenant_id = $2`.
//
// disciplineScore = min(100, lessons*5 + quizzes*8 + simulator*5). With tenant A
// holding one lesson and tenant B holding two, a tenant-scoped refresh for A
// must yield 5 (one lesson), never 15 (a tenant-blind read of all three).

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const TENANT_A = PLATFORM.DEFAULT_TENANT_ID; // 'tecpey', with the seeded 'main' workspace
const WORKSPACE_A = PLATFORM.DEFAULT_WORKSPACE_ID;
const TENANT_B = `tenant-b-${randomUUID()}`;
const WORKSPACE_B = `ws-b-${randomUUID()}`;
const cleanupTenants = new Set<string>([TENANT_B]);

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function seedStudentBinding(client: PoolClient, studentId: string): Promise<void> {
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

async function disciplineScore(client: PoolClient, studentId: string): Promise<number> {
  const rows = await client.query<{ discipline_score: number }>(
    "SELECT discipline_score FROM learning_brain_profiles WHERE student_id = $1::uuid LIMIT 1",
    [studentId],
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
      for (const tenantId of cleanupTenants) {
        // learning_events → platform_principal_bindings via composite FK, so the
        // events must go before the tenant cascade can drop the bindings.
        await client.query("DELETE FROM learning_events WHERE tenant_id = $1", [tenantId]);
        await client.query("DELETE FROM platform_tenants WHERE id = $1", [tenantId]);
      }
    });
  }
  await pool?.end();
  pool = null;
});

describe("learning_events cross-tenant isolation", { skip: !configured }, () => {
  it(
    "refreshLearningBrain aggregates only the requested tenant's learning events for the same student",
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
          await disciplineScore(client, studentId),
          5,
          "tenant A's brain must count only tenant A's single lesson, not tenant B's events",
        );

        // Refresh under tenant B: discipline must reflect its own TWO lessons (10).
        await refreshLearningBrain(client, studentId, TENANT_B);
        assert.equal(
          await disciplineScore(client, studentId),
          10,
          "tenant B's brain must count only tenant B's two lessons",
        );
      });
    },
  );
});
