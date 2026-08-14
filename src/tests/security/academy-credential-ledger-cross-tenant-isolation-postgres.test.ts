import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

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

async function rejectsInSavepoint(
  client: PoolClient,
  operation: () => Promise<unknown>,
  expected: RegExp | ((error: unknown) => boolean),
): Promise<void> {
  await client.query("SAVEPOINT expected_rejection");
  try {
    await assert.rejects(operation(), expected);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
    await client.query("RELEASE SAVEPOINT expected_rejection");
  }
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
});

describe("Academy credential ledger cross-tenant authority", { skip: !configured }, () => {
  it("keeps one student's medals independent and rejects foreign workspace attribution", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const studentId = randomUUID();
        const tenantA = `tenant-a-${randomUUID()}`;
        const tenantB = `tenant-b-${randomUUID()}`;
        const workspaceA = `ws-a-${randomUUID()}`;
        const workspaceB = `ws-b-${randomUUID()}`;
        for (const [tenant, workspace] of [[tenantA, workspaceA], [tenantB, workspaceB]]) {
          await client.query(
            `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
             VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
            [tenant],
          );
          await client.query(
            `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
             VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
            [workspace, tenant],
          );
        }
        await client.query("INSERT INTO academy_students (id, locale) VALUES ($1, 'fa')", [studentId]);
        for (const [tenant, workspace] of [[tenantA, workspaceA], [tenantB, workspaceB]]) {
          await client.query(
            `INSERT INTO platform_principal_bindings
               (tenant_id, workspace_id, principal_type, principal_id, status, source)
             VALUES ($1, $2, 'student', $3, 'active', 'credential-ledger-test')`,
            [tenant, workspace, studentId],
          );
        }

        const evidence = createHash("sha256").update("league-result").digest("hex");
        const insertCredential = async (tenant: string, workspace: string, key: string) =>
          client.query<{ id: string }>(
            `INSERT INTO academy_credential_records
               (tenant_id, workspace_id, student_id, credential_key, credential_type,
                code, title_fa, title_en, description_fa, description_en, icon,
                competition_id, season_key, rank, points_bps, policy_version,
                evidence_sha256, evidence, issued_at)
             VALUES ($1, $2, $3, $4, 'league_medal', 'monthly-champion',
                     'قهرمان ماه', 'Monthly champion', 'رتبه لیگ', 'League rank', '🏆',
                     'academy-monthly-league', '2026-08', 1, 9200,
                     'academy-league-v1', $5, '{}'::jsonb, NOW())
             RETURNING id`,
            [tenant, workspace, studentId, key, evidence],
          );

        const a = await insertCredential(tenantA, workspaceA, "league:2026-08:rank:1");
        const b = await insertCredential(tenantB, workspaceB, "league:2026-08:rank:1");
        assert.notEqual(a.rows[0].id, b.rows[0].id);
        const scoped = await client.query<{ tenant_id: string; count: number }>(
          `SELECT tenant_id, COUNT(*)::int AS count
             FROM academy_credential_records
            WHERE student_id = $1 AND tenant_id = ANY($2::text[])
            GROUP BY tenant_id ORDER BY tenant_id`,
          [studentId, [tenantA, tenantB]],
        );
        assert.deepEqual(scoped.rows.map((row) => row.count), [1, 1]);

        await rejectsInSavepoint(
          client,
          () => insertCredential(tenantA, workspaceB, "league:2026-09:rank:1"),
          (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "23503"),
        );
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });

  it("enforces lifecycle ordering, owner-only visibility and append-only history", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const studentId = randomUUID();
        const otherStudentId = randomUUID();
        await client.query("INSERT INTO academy_students (id, locale) VALUES ($1, 'fa'), ($2, 'fa')", [studentId, otherStudentId]);
        await client.query(
          `INSERT INTO platform_principal_bindings
             (tenant_id, workspace_id, principal_type, principal_id, status, source)
           VALUES ('tecpey', 'main', 'student', $1, 'active', 'credential-ledger-test')`,
          [studentId],
        );
        const evidence = createHash("sha256").update("achievement").digest("hex");
        const record = await client.query<{ id: string }>(
          `INSERT INTO academy_credential_records
             (tenant_id, workspace_id, student_id, credential_key, credential_type,
              code, title_fa, title_en, description_fa, description_en, icon,
              policy_version, evidence_sha256, evidence, issued_at)
           VALUES ('tecpey', 'main', $1, $2, 'achievement', 'risk-master',
                   'استاد ریسک', 'Risk master', 'تسلط ریسک', 'Risk mastery', '⚖️',
                   'achievement-v1', $3, '{}'::jsonb, NOW()) RETURNING id`,
          [studentId, `achievement:risk-master:${randomUUID()}`, evidence],
        );
        const credentialId = record.rows[0].id;
        const event = (type: string, key: string) => client.query(
          `INSERT INTO academy_credential_events
             (credential_id, event_type, actor_type, actor_id, reason_code,
              policy_version, evidence_sha256, idempotency_key)
           VALUES ($1, $2, 'system', 'academy-policy-engine', 'policy.verified',
                   'achievement-v1', $3, $4)`,
          [credentialId, type, evidence, key],
        );

        await rejectsInSavepoint(client, () => event("suspended", `event:${randomUUID()}`), /must begin with issued/);
        await event("issued", `event:${randomUUID()}`);
        await event("suspended", `event:${randomUUID()}`);
        await event("reinstated", `event:${randomUUID()}`);
        await rejectsInSavepoint(client, () => event("reinstated", `event:${randomUUID()}`), /transition is invalid/);
        await rejectsInSavepoint(
          client,
          () => client.query(
            `INSERT INTO academy_credential_visibility_events
               (credential_id, visibility, actor_student_id, policy_version, source, idempotency_key)
             VALUES ($1, 'public', $2, 'privacy-v1', 'privacy_center', $3)`,
            [credentialId, otherStudentId, `visibility:${randomUUID()}`],
          ),
          /may only be changed by its student/,
        );
        await rejectsInSavepoint(
          client,
          () => client.query("UPDATE academy_credential_events SET reason_code = 'tampered' WHERE credential_id = $1", [credentialId]),
          /append-only/,
        );
      } finally {
        await client.query("ROLLBACK");
      }
    });
  });
});
