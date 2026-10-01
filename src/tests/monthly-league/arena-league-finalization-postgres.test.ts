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

type Fixture = {
  tenantId: string; workspaceId: string; seasonId: string;
  studentId: string; attemptId: string; snapshotId: string;
};

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

async function fixture(lifecycle: "enrollment" | "closing" = "closing"): Promise<Fixture> {
  const suffix = randomUUID();
  const result = {
    tenantId: `arena-finalization-${suffix}`,
    workspaceId: `workspace-${suffix}`,
    studentId: randomUUID(),
    attemptId: randomUUID(),
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
      const cycleId = randomUUID();
      await client.query(
        `INSERT INTO academy_trading_arena_accounts (student_id, cycle_id)
         VALUES ($1::uuid, $2::uuid)`, [result.studentId, cycleId],
      );
      await client.query(
        `INSERT INTO academy_trading_arena_attempts
           (id, student_id, cycle_id, attempt_number, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'active')`,
        [result.attemptId, result.studentId, cycleId],
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
      if (lifecycle === "closing") {
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
      }
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

async function insertEnrollment(client: PoolClient, input: Fixture): Promise<void> {
  await client.query(
    `INSERT INTO academy_arena_league_enrollments
       (id, season_id, tenant_id, workspace_id, principal_type, principal_id,
        student_id, status, enrolled_at, status_updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, 'student', $5::uuid::text, $5::uuid,
             'enrolled', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    [randomUUID(), input.seasonId, input.tenantId, input.workspaceId, input.studentId],
  );
}

async function activateSeason(client: PoolClient, input: Fixture): Promise<void> {
  await client.query(
    `UPDATE academy_arena_league_seasons
        SET status = 'active', activated_at = '2026-01-02T00:00:00Z'
      WHERE id = $1::uuid`, [input.seasonId],
  );
}

async function insertSeasonScore(client: PoolClient, input: Fixture): Promise<void> {
  await client.query(
    `INSERT INTO academy_arena_trade_score_ledger
       (id, tenant_id, workspace_id, principal_id, student_id, attempt_id,
        closed_trade_id, policy_version, instrument_kind, scored_at,
        trade_number_for_day, total_points, participation_points, process_points,
        outcome_points, penalty_points, positive_multiplier_bps,
        penalty_multiplier_bps, scoring_input, scoring_reasons, source_digest)
     VALUES (gen_random_uuid(), $1, $2, $3::text, $3::uuid, $4::uuid, $5,
             'arena-league-scoring-v1', 'spot', '2026-01-10T12:00:00Z',
             1, 31, 10, 21, 0, 0, 10000, 10000,
             jsonb_build_object('ruleComplianceBps', 9000, 'seasonId', $6::uuid::text),
             '[]'::jsonb, $7)`,
    [input.tenantId, input.workspaceId, input.studentId, input.attemptId,
      `score-${input.snapshotId}`, input.seasonId, "b".repeat(64)],
  );
}

async function genericFixture(): Promise<Fixture> {
  const input = await fixture("enrollment");
  const client = await pool!.connect();
  try {
    await transaction(client, async () => {
      await scope(client, input);
      await client.query(
        `INSERT INTO academy_arena_league_snapshots
           (id, tenant_id, workspace_id, window_type, window_key, status,
            version, source_cutoff_at, participant_count, source_digest)
         VALUES ($1::uuid, $2, $3, 'monthly', '2026-01', 'provisional',
                 1, '2026-01-15T00:00:00Z', 0, $4)`,
        [input.snapshotId, input.tenantId, input.workspaceId, "c".repeat(64)],
      );
    });
  } finally {
    client.release();
  }
  return input;
}

async function insertGenericScore(client: PoolClient, input: Fixture, scoredAt = "2026-01-10T12:00:00Z"): Promise<void> {
  await client.query(
    `INSERT INTO academy_arena_trade_score_ledger
       (id, tenant_id, workspace_id, principal_id, student_id, attempt_id,
        closed_trade_id, policy_version, instrument_kind, scored_at,
        trade_number_for_day, total_points, participation_points, process_points,
        outcome_points, penalty_points, positive_multiplier_bps,
        penalty_multiplier_bps, scoring_input, scoring_reasons, source_digest)
     VALUES (gen_random_uuid(), $1, $2, $3::text, $3::uuid, $4::uuid, $5,
             'arena-league-scoring-v1', 'spot', $6::timestamptz,
             1, 31, 10, 21, 0, 0, 10000, 10000,
             jsonb_build_object('ruleComplianceBps', 9000),
             '[]'::jsonb, $7)`,
    [input.tenantId, input.workspaceId, input.studentId, input.attemptId,
      `generic-${randomUUID()}`, scoredAt, "d".repeat(64)],
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
  it("rejects an old generic score after raw SQL snapshot finalization wins the race", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await genericFixture();
    const finalizer = await pool!.connect();
    const scorer = await pool!.connect();
    try {
      await finalizer.query("BEGIN");
      await scorer.query("BEGIN");
      await scope(finalizer, input);
      await scope(scorer, input);
      await scorer.query("SET LOCAL statement_timeout = '10000ms'");
      const finalizerPid = (await finalizer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const scorerPid = (await scorer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await finalize(finalizer, input);
      const insertion = insertGenericScore(scorer, input).then(
        () => ({ succeeded: true }), (error: unknown) => ({ succeeded: false, error }),
      );
      await waitUntilBlocked(scorerPid, finalizerPid);
      await finalizer.query("COMMIT");
      const outcome = await insertion;
      assert.equal(outcome.succeeded, false);
      assert.match(String("error" in outcome ? outcome.error : ""), /generic score snapshot finalized/);
      await scorer.query("ROLLBACK");
    } finally {
      await finalizer.query("ROLLBACK").catch(() => {});
      await scorer.query("ROLLBACK").catch(() => {});
      finalizer.release();
      scorer.release();
    }
  });

  it("waits for a generic score before raw SQL snapshot finalization", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await genericFixture();
    const scorer = await pool!.connect();
    const finalizer = await pool!.connect();
    try {
      await scorer.query("BEGIN");
      await finalizer.query("BEGIN");
      await scope(scorer, input);
      await scope(finalizer, input);
      await finalizer.query("SET LOCAL statement_timeout = '10000ms'");
      const scorerPid = (await scorer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const finalizerPid = (await finalizer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await insertGenericScore(scorer, input);
      const finalization = finalize(finalizer, input).then(
        () => ({ succeeded: true }), (error: unknown) => ({ succeeded: false, error }),
      );
      await waitUntilBlocked(finalizerPid, scorerPid);
      await scorer.query("COMMIT");
      const outcome = await finalization;
      assert.equal(outcome.succeeded, true, String("error" in outcome ? outcome.error : ""));
      await finalizer.query("COMMIT");
      await transaction(finalizer, async () => {
        await scope(finalizer, input);
        const scores = await finalizer.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM academy_arena_trade_score_ledger
            WHERE tenant_id = $1 AND workspace_id = $2 AND attempt_id = $3::uuid`,
          [input.tenantId, input.workspaceId, input.attemptId],
        );
        assert.equal(scores.rows[0].count, "1");
      });
    } finally {
      await scorer.query("ROLLBACK").catch(() => {});
      await finalizer.query("ROLLBACK").catch(() => {});
      scorer.release();
      finalizer.release();
    }
  });

  it("permits a later score outside the finalized generic snapshot cutoff", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await genericFixture();
    const client = await pool!.connect();
    try {
      await transaction(client, async () => {
        await scope(client, input);
        await finalize(client, input);
        await insertGenericScore(client, input, "2026-01-16T12:00:00Z");
      });
    } finally {
      client.release();
    }
  });

  it("rejects late season score evidence after the ranking snapshot commits", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await fixture();
    const ranker = await pool!.connect();
    const scorer = await pool!.connect();
    try {
      await ranker.query("BEGIN");
      await scorer.query("BEGIN");
      await scope(ranker, input);
      await scope(scorer, input);
      await scorer.query("SET LOCAL statement_timeout = '10000ms'");
      const rankerPid = (await ranker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const scorerPid = (await scorer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await ranker.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        `arena-season:${input.tenantId}:${input.workspaceId}`, input.seasonId,
      ]);
      const insertion = insertSeasonScore(scorer, input).then(
        () => ({ succeeded: true }), (error: unknown) => ({ succeeded: false, error }),
      );
      await waitUntilBlocked(scorerPid, rankerPid);
      await finalize(ranker, input);
      await ranker.query("COMMIT");
      const outcome = await insertion;
      assert.equal(outcome.succeeded, false);
      assert.match(String("error" in outcome ? outcome.error : ""), /season score snapshot finalized/);
      await scorer.query("ROLLBACK");
      await transaction(ranker, async () => {
        await scope(ranker, input);
        const scores = await ranker.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM academy_arena_trade_score_ledger
            WHERE tenant_id = $1 AND workspace_id = $2 AND attempt_id = $3::uuid`,
          [input.tenantId, input.workspaceId, input.attemptId],
        );
        assert.equal(scores.rows[0].count, "0");
      });
    } finally {
      await ranker.query("ROLLBACK").catch(() => {});
      await scorer.query("ROLLBACK").catch(() => {});
      ranker.release();
      scorer.release();
    }
  });

  it("waits for a committed season score before snapshot finalization", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await fixture();
    const scorer = await pool!.connect();
    const finalizer = await pool!.connect();
    try {
      await scorer.query("BEGIN");
      await finalizer.query("BEGIN");
      await scope(scorer, input);
      await scope(finalizer, input);
      await finalizer.query("SET LOCAL statement_timeout = '10000ms'");
      const scorerPid = (await scorer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const finalizerPid = (await finalizer.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await insertSeasonScore(scorer, input);
      const finalization = finalize(finalizer, input).then(
        () => ({ succeeded: true }), (error: unknown) => ({ succeeded: false, error }),
      );
      await waitUntilBlocked(finalizerPid, scorerPid);
      await scorer.query("COMMIT");
      const outcome = await finalization;
      assert.equal(outcome.succeeded, true, String("error" in outcome ? outcome.error : ""));
      await finalizer.query("COMMIT");
      await transaction(scorer, async () => {
        await scope(scorer, input);
        const scores = await scorer.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM academy_arena_trade_score_ledger
            WHERE tenant_id = $1 AND workspace_id = $2 AND attempt_id = $3::uuid`,
          [input.tenantId, input.workspaceId, input.attemptId],
        );
        assert.equal(scores.rows[0].count, "1");
      });
    } finally {
      await scorer.query("ROLLBACK").catch(() => {});
      await finalizer.query("ROLLBACK").catch(() => {});
      scorer.release();
      finalizer.release();
    }
  });

  it("rejects direct enrollment SQL after a concurrent season activation commits", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await fixture("enrollment");
    const activator = await pool!.connect();
    const enrollee = await pool!.connect();
    try {
      await activator.query("BEGIN");
      await enrollee.query("BEGIN");
      await scope(activator, input);
      await scope(enrollee, input);
      await enrollee.query("SET LOCAL statement_timeout = '10000ms'");
      const activatorPid = (await activator.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const enrolleePid = (await enrollee.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await activateSeason(activator, input);
      const insertion = insertEnrollment(enrollee, input).then(
        () => ({ succeeded: true }), (error: unknown) => ({ succeeded: false, error }),
      );
      await waitUntilBlocked(enrolleePid, activatorPid);
      await activator.query("COMMIT");
      const outcome = await insertion;
      assert.equal(outcome.succeeded, false);
      assert.match(String("error" in outcome ? outcome.error : ""), /season is not accepting enrollment/);
      await enrollee.query("ROLLBACK");
      await transaction(activator, async () => {
        await scope(activator, input);
        const enrolled = await activator.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM academy_arena_league_enrollments
            WHERE season_id = $1::uuid`, [input.seasonId],
        );
        assert.equal(enrolled.rows[0].count, "0");
      });
    } finally {
      await activator.query("ROLLBACK").catch(() => {});
      await enrollee.query("ROLLBACK").catch(() => {});
      activator.release();
      enrollee.release();
    }
  });

  it("waits for a committed enrollment before activating the season", {
    skip: !configured, timeout: 30_000,
  }, async () => {
    const input = await fixture("enrollment");
    const enrollee = await pool!.connect();
    const activator = await pool!.connect();
    try {
      await enrollee.query("BEGIN");
      await activator.query("BEGIN");
      await scope(enrollee, input);
      await scope(activator, input);
      await activator.query("SET LOCAL statement_timeout = '10000ms'");
      const enrolleePid = (await enrollee.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const activatorPid = (await activator.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await insertEnrollment(enrollee, input);
      const activation = activateSeason(activator, input).then(
        () => ({ succeeded: true }), (error: unknown) => ({ succeeded: false, error }),
      );
      await waitUntilBlocked(activatorPid, enrolleePid);
      await enrollee.query("COMMIT");
      const outcome = await activation;
      assert.equal(outcome.succeeded, true, String("error" in outcome ? outcome.error : ""));
      await activator.query("COMMIT");
      await transaction(enrollee, async () => {
        await scope(enrollee, input);
        const enrolled = await enrollee.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM academy_arena_league_enrollments
            WHERE season_id = $1::uuid AND status = 'enrolled'`, [input.seasonId],
        );
        assert.equal(enrolled.rows[0].count, "1");
      });
    } finally {
      await enrollee.query("ROLLBACK").catch(() => {});
      await activator.query("ROLLBACK").catch(() => {});
      enrollee.release();
      activator.release();
    }
  });

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
