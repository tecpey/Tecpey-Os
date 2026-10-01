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

type Fixture = { tenantId: string; workspaceId: string; seasonId: string; studentId: string; snapshotId: string };

async function transaction<T>(client: PoolClient, callback: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const value = await callback();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function scope(client: PoolClient, fixture: Pick<Fixture, "tenantId" | "workspaceId">): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true), set_config('app.workspace_id', $2, true)",
    [fixture.tenantId, fixture.workspaceId]);
}

async function fixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const result = {
    tenantId: `arena-finalization-${suffix}`,
    workspaceId: `workspace-${suffix}`,
    studentId: randomUUID(),
    snapshotId: randomUUID(),
  };
  const client = await pool!.connect();
  try {
    const seasonId = await transaction(client, async () => {
      await client.query(
        `INSERT INTO academy_students (id, locale, display_name, username)
         VALUES ($1::uuid, 'fa', 'Arena finalization fixture', $2)`,
        [result.studentId, `arena_final_${suffix.replaceAll("-", "").slice(0, 16)}`],
      );
      await client.query(
        `INSERT INTO platform_tenants (id, slug, display_name, plan, products)
         VALUES ($1, $1, $1, 'enterprise', '{}'::text[])`, [result.tenantId],
      );
      await client.query(
        `INSERT INTO platform_workspaces (id, tenant_id, slug, display_name, products, settings)
         VALUES ($1, $2, $1, $1, '{}'::text[], '{}'::jsonb)`, [result.workspaceId, result.tenantId],
      );
      await client.query(
        `INSERT INTO platform_principal_bindings
           (tenant_id, workspace_id, principal_type, principal_id, source)
         VALUES ($1, $2, 'student', $3, 'arena_finalization_postgres_test')`,
        [result.tenantId, result.workspaceId, result.studentId],
      );
      const authority = { tenantId: result.tenantId, workspaceId: result.workspaceId };
      const config = {
        seasonKey: "league:2026-01", timeZone: "UTC",
        enrollmentOpensAt: "2026-01-01T00:00:00.000Z",
        enrollmentClosesAt: "2026-01-02T00:00:00.000Z",
        startsAt: "2026-01-02T00:00:00.000Z",
        endsAt: "2026-02-01T00:00:00.000Z",
        scoringPolicyVersion: "arena-league-scoring-v1",
        initialBalance: "100000", attemptsPerCycle: 3,
      } as const;
      const season = await createArenaLeagueSeasonTx(client, authority, config);
      await transitionArenaLeagueSeasonTx(client, authority, season.id, "enrollment", config.enrollmentOpensAt);
      await enrollArenaLeagueSeasonTx(client, authority, {
        seasonId: season.id, studentId: result.studentId, enrolledAt: config.enrollmentOpensAt,
      });
      await transitionArenaLeagueSeasonTx(client, authority, season.id, "active", config.startsAt);
      await transitionArenaLeagueSeasonTx(client, authority, season.id, "closing", config.endsAt);
      await client.query(
        `INSERT INTO academy_arena_league_snapshots
           (id, tenant_id, workspace_id, season_id, window_type, window_key, status,
            version, source_cutoff_at, participant_count, source_digest)
         VALUES ($1::uuid, $2, $3, $4::uuid, 'monthly', '2026-01', 'provisional',
                 1, '2026-02-01T00:00:00Z', 0, $5)`,
        [result.snapshotId, result.tenantId, result.workspaceId, season.id, "a".repeat(64)],
      );
      return season.id;
    });
    return { ...result, seasonId };
  } finally {
    client.release();
  }
}

async function finalize(client: PoolClient, input: Fixture): Promise<void> {
  await client.query(
    `UPDATE academy_arena_league_snapshots
        SET status = 'finalized', finalized_at = NOW()
      WHERE id = $1::uuid`, [input.snapshotId],
  );
}

async function waitUntilBlocked(waiterPid: number, blockerPid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool!.query<{ blocked_by: number[] }>(
      "SELECT pg_blocking_pids($1) AS blocked_by", [waiterPid],
    );
    if (result.rows[0]?.blocked_by.includes(blockerPid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("arena_finalization_concurrency_did_not_block");
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
  const client = await pool.connect();
  try { await applyDatabaseMigrationsWithLock(client); } finally { client.release(); }
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Arena league finalization PostgreSQL boundary", () => {
  it("rejects a long-lived transaction snapshot that could miss concurrent finalization", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await fixture();
    const client = await pool!.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await scope(client, input);
      await assert.rejects(
        client.query(
          `UPDATE academy_arena_league_enrollments
              SET status = 'withdrawn', reason_code = 'voluntary_withdrawal'
            WHERE season_id = $1::uuid AND student_id = $2::uuid`,
          [input.seasonId, input.studentId],
        ),
        /arena league enrollment transition requires read committed/,
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("blocks direct SQL enrollment mutation behind ranking and rejects it after finalization", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await fixture();
    const ranker = await pool!.connect();
    const updater = await pool!.connect();
    try {
      await ranker.query("BEGIN");
      await updater.query("BEGIN");
      await scope(ranker, input);
      await scope(updater, input);
      await updater.query("SET LOCAL statement_timeout = '10000ms'");
      const rankerPid = (await ranker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const updaterPid = (await updater.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await ranker.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        `arena-season:${input.tenantId}:${input.workspaceId}`, input.seasonId,
      ]);

      const update = updater.query(
        `UPDATE academy_arena_league_enrollments
            SET status = 'disqualified', reason_code = 'rule_violation'
          WHERE season_id = $1::uuid AND student_id = $2::uuid`,
        [input.seasonId, input.studentId],
      ).then(() => ({ succeeded: true }), (error: unknown) => ({ succeeded: false, error }));
      await waitUntilBlocked(updaterPid, rankerPid);
      await finalize(ranker, input);
      await ranker.query("COMMIT");
      const outcome = await update;
      assert.equal(outcome.succeeded, false);
      assert.match(String("error" in outcome ? outcome.error : ""), /arena league enrollment snapshot is finalized/);
      await updater.query("ROLLBACK");

      await transaction(ranker, async () => {
        await scope(ranker, input);
        const enrollment = await ranker.query<{ status: string }>(
          `SELECT status FROM academy_arena_league_enrollments
            WHERE season_id = $1::uuid AND student_id = $2::uuid`,
          [input.seasonId, input.studentId],
        );
        assert.equal(enrollment.rows[0].status, "enrolled");
      });
    } finally {
      await ranker.query("ROLLBACK").catch(() => {});
      await updater.query("ROLLBACK").catch(() => {});
      ranker.release();
      updater.release();
    }
  });

  it("serializes direct SQL snapshot finalization after a committed enrollment change", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await fixture();
    const updater = await pool!.connect();
    const finalizer = await pool!.connect();
    try {
      await updater.query("BEGIN");
      await finalizer.query("BEGIN");
      await scope(updater, input);
      await scope(finalizer, input);
      await finalizer.query("SET LOCAL statement_timeout = '10000ms'");
      const updaterPid = (await updater.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const finalizerPid = (await finalizer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await updater.query(
        `UPDATE academy_arena_league_enrollments
            SET status = 'withdrawn', reason_code = 'voluntary_withdrawal'
          WHERE season_id = $1::uuid AND student_id = $2::uuid`,
        [input.seasonId, input.studentId],
      );
      const finalization = finalize(finalizer, input).then(
        () => ({ succeeded: true }), (error: unknown) => ({ succeeded: false, error }),
      );
      await waitUntilBlocked(finalizerPid, updaterPid);
      await updater.query("COMMIT");
      const outcome = await finalization;
      assert.equal(outcome.succeeded, true, String("error" in outcome ? outcome.error : ""));
      await finalizer.query("COMMIT");
      await transaction(updater, async () => {
        await scope(updater, input);
        const status = await updater.query<{ status: string }>(
          `SELECT status FROM academy_arena_league_enrollments
            WHERE season_id = $1::uuid AND student_id = $2::uuid`,
          [input.seasonId, input.studentId],
        );
        assert.equal(status.rows[0].status, "withdrawn");
      });
    } finally {
      await updater.query("ROLLBACK").catch(() => {});
      await finalizer.query("ROLLBACK").catch(() => {});
      updater.release();
      finalizer.release();
    }
  });
});
