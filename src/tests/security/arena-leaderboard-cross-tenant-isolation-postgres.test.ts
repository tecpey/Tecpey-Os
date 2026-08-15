import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { loadArenaLeagueLeaderboardTx } from "../../lib/arena-league-leaderboard-authority";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

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

async function seedRankedPrincipal(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
  snapshotId: string;
  profileId: string;
  displayName: string;
  points: number;
}): Promise<void> {
  await client.query(
    `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
     VALUES ($1, $1, $2, 'enterprise', '{}'::text[])`,
    [input.tenantId, input.displayName],
  );
  await client.query(
    `INSERT INTO platform_workspaces
       (id, tenant_id, slug, display_name, products, settings)
     VALUES ($1, $2, $1, $3, '{}'::text[], '{}'::jsonb)`,
    [input.workspaceId, input.tenantId, input.displayName],
  );
  await client.query(
    `INSERT INTO academy_students (id, locale, display_name, username)
     VALUES ($1::uuid, 'fa', $2, $3)`,
    [input.studentId, input.displayName,
      `u_${input.studentId.replaceAll("-", "").slice(0, 18)}`],
  );
  await client.query("DELETE FROM academy_public_profiles WHERE student_id = $1::uuid", [
    input.studentId,
  ]);
  await client.query(
    `DELETE FROM platform_principal_bindings
      WHERE principal_type = 'student' AND principal_id = $1`,
    [input.studentId],
  );
  await client.query(
    `INSERT INTO platform_principal_bindings
       (tenant_id, workspace_id, principal_type, principal_id, source)
     VALUES ($1, $2, 'student', $3, 'arena_leaderboard_isolation_test')`,
    [input.tenantId, input.workspaceId, input.studentId],
  );
  await client.query(
    `INSERT INTO academy_public_profiles
       (student_id, tenant_id, workspace_id, principal_type, public_profile_id,
        visibility, leaderboard_visible, journal_sharing_enabled,
        instructor_review_consent, challenge_participation, study_group_discovery,
        revision, consent_version, consented_at, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, 'student', $4::uuid, 'public', TRUE, FALSE,
             FALSE, FALSE, FALSE, 1, 'community-profile-consent-v1', NOW(), NOW(), NOW())`,
    [input.studentId, input.tenantId, input.workspaceId, input.profileId],
  );
  await client.query(
    `INSERT INTO academy_community_reputation_scoring_consents
       (public_profile_id, tenant_id, workspace_id, principal_type, principal_id,
        student_id, enabled, revision, consent_version, consented_at)
     VALUES ($1::uuid, $2, $3, 'student', $4::text, $4::uuid, TRUE, 1,
             'community-reputation-scoring-consent-v1', NOW())`,
    [input.profileId, input.tenantId, input.workspaceId, input.studentId],
  );
  await client.query(
    `INSERT INTO academy_arena_league_snapshots
       (id, tenant_id, workspace_id, window_type, window_key, status, version,
        source_cutoff_at, participant_count, source_digest)
     VALUES ($1::uuid, $2, $3, 'monthly', '2026-08', 'provisional', 1,
             '2026-08-15T00:00:00Z', 1, $4)`,
    [input.snapshotId, input.tenantId, input.workspaceId,
      input.studentId.replaceAll("-", "").padEnd(64, "a")],
  );
  await client.query(
    `INSERT INTO academy_arena_league_rankings
       (snapshot_id, tenant_id, workspace_id, principal_id, student_id, rank,
        points, trade_count, rule_compliance_bps, tier)
     VALUES ($1::uuid, $2, $3, $4, $4::uuid, 1, $5, 10, 9000, 'analyst')`,
    [input.snapshotId, input.tenantId, input.workspaceId, input.studentId, input.points],
  );
  await client.query(
    `UPDATE academy_arena_league_snapshots
        SET status = 'finalized', finalized_at = NOW()
      WHERE id = $1::uuid`,
    [input.snapshotId],
  );
}

describe("Arena leaderboard PostgreSQL tenant isolation", () => {
  it("never returns tenant B ranking or identity while reading tenant A", {
    skip: !configured,
    timeout: 30_000,
  }, async () => {
    const client = await pool!.connect();
    await client.query("BEGIN");
    try {
      const tenantA = `arena-board-a-${randomUUID()}`;
      const tenantB = `arena-board-b-${randomUUID()}`;
      const workspaceA = `workspace-a-${randomUUID()}`;
      const workspaceB = `workspace-b-${randomUUID()}`;
      const studentA = randomUUID();
      const studentB = randomUUID();
      await seedRankedPrincipal(client, {
        tenantId: tenantA, workspaceId: workspaceA, studentId: studentA,
        snapshotId: randomUUID(), profileId: randomUUID(), displayName: "Tenant A Learner",
        points: 410,
      });
      await seedRankedPrincipal(client, {
        tenantId: tenantB, workspaceId: workspaceB, studentId: studentB,
        snapshotId: randomUUID(), profileId: randomUUID(), displayName: "Tenant B Learner",
        points: 990,
      });

      const boardA = await loadArenaLeagueLeaderboardTx(client, {
        tenantId: tenantA,
        workspaceId: workspaceA,
        windowType: "monthly",
        windowKey: "2026-08",
        limit: 50,
      });

      assert.equal(boardA?.participantCount, 1);
      assert.equal(boardA?.visibleCount, 1);
      assert.deepEqual(boardA?.entries.map((entry) => entry.displayName), ["Tenant A Learner"]);
      assert.equal(JSON.stringify(boardA).includes("Tenant B Learner"), false);
      assert.equal(JSON.stringify(boardA).includes(studentA), false);
      assert.equal(JSON.stringify(boardA).includes(studentB), false);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
