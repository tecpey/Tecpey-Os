import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import {
  createArenaLeagueSeasonTx,
  enrollArenaLeagueSeasonTx,
  transitionArenaLeagueSeasonTx,
} from "../../lib/arena-league-season-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function seedTenantScope(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`,
    [input.tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
    [input.workspaceId, input.tenantId],
  );
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, source)
     VALUES ($1, $2, 'student', $3, 'arena_league_season_cross_tenant_test')`,
    [input.tenantId, input.workspaceId, input.studentId],
  );
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 3, allowExitOnIdle: true });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Arena league season cross-tenant PostgreSQL authority", () => {
  it("enforces tenant isolation with FORCE RLS for a non-bypass runtime role", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const suffix = randomUUID();
    const studentId = randomUUID();
    const tenantA = `arena-season-a-${suffix}`;
    const tenantB = `arena-season-b-${suffix}`;
    const workspaceA = `workspace-a-${suffix}`;
    const workspaceB = `workspace-b-${suffix}`;
    const role = `arena_rls_${suffix.replaceAll("-", "").slice(0, 20)}`;

    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO academy_students (id, locale, display_name, username)
           VALUES ($1::uuid, 'fa', 'Arena Season Isolation Student', $2)`,
          [studentId, `arena_season_${suffix.replaceAll("-", "").slice(0, 16)}`],
        );
        await seedTenantScope(client, { tenantId: tenantA, workspaceId: workspaceA, studentId });
        await seedTenantScope(client, { tenantId: tenantB, workspaceId: workspaceB, studentId });

        const config = {
          seasonKey: "league:2026-10",
          timeZone: "UTC",
          enrollmentOpensAt: "2026-09-28T00:00:00.000Z",
          enrollmentClosesAt: "2026-10-01T00:00:00.000Z",
          startsAt: "2026-10-01T00:00:00.000Z",
          endsAt: "2026-11-01T00:00:00.000Z",
          scoringPolicyVersion: "arena-league-scoring-v1",
          initialBalance: "100000",
          attemptsPerCycle: 3,
        } as const;

        const seasonA = await createArenaLeagueSeasonTx(
          client,
          { tenantId: tenantA, workspaceId: workspaceA },
          config,
        );
        const seasonB = await createArenaLeagueSeasonTx(
          client,
          { tenantId: tenantB, workspaceId: workspaceB },
          config,
        );
        assert.notEqual(seasonA.id, seasonB.id);
        assert.equal(seasonA.configDigest, seasonB.configDigest);

        await transitionArenaLeagueSeasonTx(
          client,
          { tenantId: tenantA, workspaceId: workspaceA },
          seasonA.id,
          "enrollment",
          config.enrollmentOpensAt,
        );
        await transitionArenaLeagueSeasonTx(
          client,
          { tenantId: tenantB, workspaceId: workspaceB },
          seasonB.id,
          "enrollment",
          config.enrollmentOpensAt,
        );

        const enrollmentA = await enrollArenaLeagueSeasonTx(
          client,
          { tenantId: tenantA, workspaceId: workspaceA },
          { seasonId: seasonA.id, studentId, enrolledAt: config.enrollmentOpensAt },
        );
        const enrollmentB = await enrollArenaLeagueSeasonTx(
          client,
          { tenantId: tenantB, workspaceId: workspaceB },
          { seasonId: seasonB.id, studentId, enrolledAt: config.enrollmentOpensAt },
        );
        assert.notEqual(enrollmentA.id, enrollmentB.id);

        await assert.rejects(
          transitionArenaLeagueSeasonTx(
            client,
            { tenantId: tenantB, workspaceId: workspaceB },
            seasonA.id,
            "active",
            config.startsAt,
          ),
          /arena_season_not_found/,
        );

        const rlsFlags = await client.query<{
          relname: string;
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          `SELECT relname, relrowsecurity, relforcerowsecurity
             FROM pg_class
            WHERE relname = ANY($1::text[])
            ORDER BY relname`,
          [["academy_arena_league_enrollments", "academy_arena_league_seasons"]],
        );
        assert.deepEqual(rlsFlags.rows, [
          {
            relname: "academy_arena_league_enrollments",
            relrowsecurity: true,
            relforcerowsecurity: true,
          },
          {
            relname: "academy_arena_league_seasons",
            relrowsecurity: true,
            relforcerowsecurity: true,
          },
        ]);

        const policies = await client.query<{
          tablename: string;
          policyname: string;
          qual: string | null;
          with_check: string | null;
        }>(
          `SELECT tablename, policyname, qual, with_check
             FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = ANY($1::text[])
            ORDER BY tablename, policyname`,
          [["academy_arena_league_enrollments", "academy_arena_league_seasons"]],
        );
        assert.equal(policies.rows.length, 2);
        for (const policy of policies.rows) {
          assert.match(policy.policyname, /^academy_arena_league_(enrollments|seasons)_tenant_scope$/);
          assert.match(policy.qual ?? "", /current_setting\('app\.tenant_id'/);
          assert.match(policy.qual ?? "", /current_setting\('app\.workspace_id'/);
          assert.match(policy.with_check ?? "", /current_setting\('app\.tenant_id'/);
          assert.match(policy.with_check ?? "", /current_setting\('app\.workspace_id'/);
        }

        await client.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
        await client.query(
          `GRANT SELECT, INSERT, UPDATE ON academy_arena_league_seasons, academy_arena_league_enrollments TO "${role}"`,
        );
        await client.query(`SET LOCAL ROLE "${role}"`);
        await client.query(
          "SELECT set_config('app.tenant_id',$1,true), set_config('app.workspace_id',$2,true)",
          [tenantA, workspaceA],
        );

        const visibleSeasons = await client.query<{ tenant_id: string; workspace_id: string }>(
          `SELECT tenant_id, workspace_id
             FROM academy_arena_league_seasons
            ORDER BY tenant_id, workspace_id`,
        );
        assert.deepEqual(visibleSeasons.rows, [{ tenant_id: tenantA, workspace_id: workspaceA }]);

        const visibleEnrollments = await client.query<{ tenant_id: string; workspace_id: string }>(
          `SELECT tenant_id, workspace_id
             FROM academy_arena_league_enrollments
            ORDER BY tenant_id, workspace_id`,
        );
        assert.deepEqual(visibleEnrollments.rows, [{ tenant_id: tenantA, workspace_id: workspaceA }]);

        const foreignSeason = await client.query<{ id: string }>(
          "SELECT id::text FROM academy_arena_league_seasons WHERE id = $1::uuid",
          [seasonB.id],
        );
        assert.equal(foreignSeason.rows.length, 0);

        await client.query("SAVEPOINT arena_forged_write");
        await assert.rejects(
          client.query(
            `INSERT INTO academy_arena_league_seasons
               (id, tenant_id, workspace_id, season_key, policy_version, scoring_policy_version,
                timezone, enrollment_opens_at, enrollment_closes_at, starts_at, ends_at,
                initial_balance, attempts_per_cycle, ranking_visibility, status, config_digest)
             VALUES ($1::uuid, $2, $3, $4, 'arena-league-season-v1', 'arena-league-scoring-v1',
                     'UTC', $5::timestamptz, $6::timestamptz, $7::timestamptz, $8::timestamptz,
                     100000, 3, 'opt-in', 'draft', $9)`,
            [
              randomUUID(), tenantB, workspaceB, `forged:${suffix}`,
              config.enrollmentOpensAt, config.enrollmentClosesAt, config.startsAt, config.endsAt,
              "f".repeat(64),
            ],
          ),
          /row-level security/i,
        );
        await client.query("ROLLBACK TO SAVEPOINT arena_forged_write");
        await client.query("RESET ROLE");

        const counts = await client.query<{
          tenant_id: string;
          seasons: string;
          enrollments: string;
        }>(
          `SELECT season.tenant_id,
                  COUNT(DISTINCT season.id)::text AS seasons,
                  COUNT(enrollment.id)::text AS enrollments
             FROM academy_arena_league_seasons season
             LEFT JOIN academy_arena_league_enrollments enrollment
               ON enrollment.season_id = season.id
              AND enrollment.tenant_id = season.tenant_id
              AND enrollment.workspace_id = season.workspace_id
            WHERE season.id = ANY($1::uuid[])
            GROUP BY season.tenant_id
            ORDER BY season.tenant_id`,
          [[seasonA.id, seasonB.id]],
        );
        assert.equal(counts.rows.length, 2);
        assert.deepEqual(
          counts.rows.map(({ seasons, enrollments }) => ({ seasons, enrollments })),
          [
            { seasons: "1", enrollments: "1" },
            { seasons: "1", enrollments: "1" },
          ],
        );

        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  });
});
