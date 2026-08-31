import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import {
  activateAcademyMasterySeason,
  type AcademyMasteryTenantScope,
} from "../../lib/academy-mastery-seasons-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function seedGraduate(
  client: PoolClient,
  scope: AcademyMasteryTenantScope,
  studentId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', '{}'::text[])
     ON CONFLICT (id) DO NOTHING`,
    [scope.tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [scope.workspaceId, scope.tenantId],
  );
  await client.query(
    `INSERT INTO academy_students (id, locale)
     VALUES ($1::uuid, 'fa')
     ON CONFLICT (id) DO NOTHING`,
    [studentId],
  );
  await client.query(
    `INSERT INTO academy_student_mastery_profiles
       (tenant_id, workspace_id, student_id, locale, completed_terms, ranking_consent)
     VALUES ($1, $2, $3::uuid, 'fa', 7, FALSE)
     ON CONFLICT (tenant_id, workspace_id, student_id, locale)
     DO UPDATE SET completed_terms = 7,
                   ranking_consent = FALSE`,
    [scope.tenantId, scope.workspaceId, studentId],
  );
  for (let term = 1; term <= 7; term += 1) {
    await client.query(
      `INSERT INTO academy_term_progress
         (tenant_id, workspace_id, student_id, term_number, status, locale, score, percent)
       VALUES ($1, $2, $3::uuid, $4, 'passed', 'fa', 100, 100)
       ON CONFLICT (tenant_id, workspace_id, student_id, term_number, locale)
       DO UPDATE SET status = 'passed', score = 100, percent = 100`,
      [scope.tenantId, scope.workspaceId, studentId, term],
    );
  }
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Mastery Season activation command authority", () => {
  it(
    "binds ranking consent and idempotency to the server-side command lifecycle",
    { skip: !configured, timeout: 45_000 },
    async () => {
      await withClient(async (client) => {
        await client.query("BEGIN");
        try {
          const tenantId = `tenant-idem-${randomUUID()}`;
          const workspaceId = `workspace-idem-${randomUUID()}`;
          const studentId = randomUUID();
          const scope: AcademyMasteryTenantScope = { tenantId, workspaceId };
          await seedGraduate(client, scope, studentId);

          const activationKey = `mastery-replay-${randomUUID()}`;
          const first = await activateAcademyMasterySeason({
            client,
            scope,
            studentId,
            locale: "fa",
            seasonId: "risk-repair-season",
            idempotencyKey: activationKey,
          });
          assert.equal(first.changed, true);
          assert.equal(first.assignment.status, "active");

          await client.query(
            `UPDATE academy_mastery_season_assignments
                SET status = 'completed', completed_at = NOW(), updated_at = NOW()
              WHERE id = $1::uuid`,
            [first.assignment.id],
          );

          const replay = await activateAcademyMasterySeason({
            client,
            scope,
            studentId,
            locale: "fa",
            seasonId: "risk-repair-season",
            idempotencyKey: activationKey,
          });
          assert.equal(replay.changed, false, "a delayed retry must not start a second lifecycle");
          assert.equal(replay.assignment.id, first.assignment.id);
          assert.equal(replay.assignment.status, "active", "the replay returns the original activation result");

          const assignments = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM academy_mastery_season_assignments
              WHERE tenant_id = $1
                AND workspace_id = $2
                AND student_id = $3::uuid
                AND locale = 'fa'
                AND season_id = 'risk-repair-season'`,
            [tenantId, workspaceId, studentId],
          );
          assert.equal(Number(assignments.rows[0]?.count || 0), 1);

          await assert.rejects(
            activateAcademyMasterySeason({
              client,
              scope,
              studentId,
              locale: "fa",
              seasonId: "security-repair-season",
              idempotencyKey: activationKey,
            }),
            /mastery_idempotency_key_conflict/,
            "one command key cannot be reused for a different season",
          );

          await assert.rejects(
            activateAcademyMasterySeason({
              client,
              scope,
              studentId,
              locale: "fa",
              seasonId: "mastery-league-season",
              idempotencyKey: `mastery-league-${randomUUID()}`,
            }),
            /mastery_ranking_consent_required/,
            "league activation must fail closed without ranking visibility consent",
          );

          await client.query(
            `UPDATE academy_student_mastery_profiles
                SET ranking_consent = TRUE, updated_at = NOW()
              WHERE tenant_id = $1
                AND workspace_id = $2
                AND student_id = $3::uuid
                AND locale = 'fa'`,
            [tenantId, workspaceId, studentId],
          );

          const league = await activateAcademyMasterySeason({
            client,
            scope,
            studentId,
            locale: "fa",
            seasonId: "mastery-league-season",
            idempotencyKey: `mastery-league-${randomUUID()}`,
          });
          assert.equal(league.changed, true);
          assert.equal(league.assignment.seasonId, "mastery-league-season");
        } finally {
          await client.query("ROLLBACK");
        }
      });
    },
  );
});
