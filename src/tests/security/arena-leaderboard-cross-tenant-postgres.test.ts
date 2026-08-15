import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { loadArenaLeagueLeaderboardTx } from "../../lib/arena-league-leaderboard-authority";
import { materializeArenaLeagueRankingSnapshotTx } from "../../lib/arena-league-ranking-materializer";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try { return await callback(client); } finally { client.release(); }
}

async function seedTenantRanking(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
}): Promise<string> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`, [input.tenantId],
  );
  await client.query(
    `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`,
    [input.workspaceId, input.tenantId],
  );
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, source)
     VALUES ($1, $2, 'student', $3, 'arena_leaderboard_cross_tenant_test')`,
    [input.tenantId, input.workspaceId, input.studentId],
  );
  const profile = await client.query<{ public_profile_id: string }>(
    `INSERT INTO academy_public_profiles
       (student_id, tenant_id, workspace_id, principal_type, public_profile_id,
        visibility, leaderboard_visible, journal_sharing_enabled,
        instructor_review_consent, challenge_participation, study_group_discovery,
        revision, consent_version, consented_at, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, 'student', gen_random_uuid(), 'public', TRUE,
       FALSE, FALSE, FALSE, FALSE, 1, 'community-profile-consent-v1', NOW(), NOW(), NOW())
     RETURNING public_profile_id::text`,
    [input.studentId, input.tenantId, input.workspaceId],
  );
  await client.query(
    `UPDATE academy_community_reputation_scoring_consents
        SET enabled = TRUE, revision = 1,
            consent_version = 'community-reputation-scoring-consent-v1',
            consented_at = NOW(), updated_at = NOW()
      WHERE public_profile_id = $1::uuid`, [profile.rows[0].public_profile_id],
  );
  return profile.rows[0].public_profile_id;
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

describe("Arena leaderboard cross-tenant PostgreSQL authority", () => {
  // End-to-end proof covers academy_arena_trade_score_ledger aggregation into
  // academy_arena_league_snapshots and consent-filtered reads from
  // academy_arena_league_rankings without trusting a browser-supplied scope.
  it("never exposes the same principal's foreign-workspace ranking", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const suffix = randomUUID();
    const studentId = randomUUID();
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO academy_students (id, locale, display_name, username)
           VALUES ($1::uuid, 'fa', 'Arena Isolation Student', $2)`,
          [studentId, `arena_${suffix.replaceAll("-", "").slice(0, 18)}`],
        );
        await client.query("DELETE FROM academy_public_profiles WHERE student_id = $1::uuid", [studentId]);
        await client.query(
          `DELETE FROM platform_principal_bindings
            WHERE principal_type = 'student' AND principal_id = $1`, [studentId],
        );
        const tenantA = `arena-board-a-${suffix}`;
        const tenantB = `arena-board-b-${suffix}`;
        const workspaceA = `workspace-a-${suffix}`;
        const workspaceB = `workspace-b-${suffix}`;
        const profileA = await seedTenantRanking(client, {
          tenantId: tenantA, workspaceId: workspaceA, studentId,
        });
        const profileB = await seedTenantRanking(client, {
          tenantId: tenantB, workspaceId: workspaceB, studentId,
        });
        await client.query("DELETE FROM academy_trading_arena_accounts WHERE student_id = $1::uuid", [studentId]);
        const cycleId = randomUUID();
        const attemptId = randomUUID();
        await client.query(
          `INSERT INTO academy_trading_arena_accounts (student_id, cycle_id)
           VALUES ($1::uuid, $2::uuid)`, [studentId, cycleId],
        );
        await client.query(
          `INSERT INTO academy_trading_arena_attempts
             (id, student_id, cycle_id, attempt_number, status)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'active')`,
          [attemptId, studentId, cycleId],
        );
        for (const score of [
          { tenantId: tenantA, workspaceId: workspaceA, points: 31, tradeId: "trade-tenant-a" },
          { tenantId: tenantB, workspaceId: workspaceB, points: 99, tradeId: "trade-tenant-b" },
        ]) {
          await client.query(
            `INSERT INTO academy_arena_trade_score_ledger
               (id, tenant_id, workspace_id, principal_id, student_id, attempt_id,
                closed_trade_id, policy_version, instrument_kind, scored_at,
                trade_number_for_day, total_points, participation_points, process_points,
                outcome_points, penalty_points, positive_multiplier_bps,
                penalty_multiplier_bps, scoring_input, scoring_reasons, source_digest)
             VALUES (gen_random_uuid(), $1, $2, $3::text, $8::uuid, $4::uuid, $5,
               'arena-league-scoring-v1', 'spot', '2026-01-10T12:00:00.000Z',
               1, $6, 10, 21, 0, 0, 10000, 10000,
               jsonb_build_object('ruleComplianceBps', 9000), '[]'::jsonb, $7)`,
            [score.tenantId, score.workspaceId, studentId, attemptId, score.tradeId,
              score.points, score.tenantId === tenantA ? "a".repeat(64) : "b".repeat(64),
              studentId],
          );
        }
        await materializeArenaLeagueRankingSnapshotTx(client, {
          tenantId: tenantA, workspaceId: workspaceA,
          windowType: "lifetime", windowKey: "all-time",
          sourceCutoffAt: new Date("2026-01-15T12:00:00.000Z"),
        });
        const boardA = await loadArenaLeagueLeaderboardTx(client, {
          tenantId: tenantA, workspaceId: workspaceA,
          windowType: "lifetime", windowKey: "all-time", limit: 50,
        });
        assert.equal(boardA?.entries.length, 1);
        assert.equal(boardA?.entries[0].publicProfileId, profileA);
        assert.equal(boardA?.entries[0].points, 31);
        assert.notEqual(boardA?.entries[0].publicProfileId, profileB);
        assert.equal(JSON.stringify(boardA).includes(tenantB), false);
        assert.equal(JSON.stringify(boardA).includes(workspaceB), false);
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  });
});
