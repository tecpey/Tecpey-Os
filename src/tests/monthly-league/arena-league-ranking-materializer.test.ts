import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient, QueryResult } from "pg";
import { materializeArenaLeagueRankingSnapshotTx } from "../../lib/arena-league-ranking-materializer";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

function isScopeQuery(sql: string): boolean {
  return sql.includes("set_config('app.tenant_id'") && sql.includes("set_config('app.workspace_id'");
}

const candidate = {
  student_id: "11111111-1111-4111-8111-111111111111",
  raw_points: "240",
  trade_count: "12",
  rule_compliance_bps: "9200",
  lifetime_points: "1240",
  finalized_months: "4",
};

describe("Arena league ranking materializer", () => {
  it("writes a deterministic, ranked and finalized generic snapshot inside the caller transaction", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("WITH window_scores")) return result([candidate]);
        if (sql.includes("source_digest = $5")) return result([]);
        if (sql.includes("COALESCE(MAX(version)")) return result([{ version: 3 }]);
        return result([]);
      },
    } as unknown as PoolClient;

    const snapshot = await materializeArenaLeagueRankingSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      windowType: "monthly",
      windowKey: "2026-01",
      sourceCutoffAt: new Date("2026-01-15T12:00:00.000Z"),
    });

    assert.equal(snapshot.seasonId, null);
    assert.equal(snapshot.version, 3);
    assert.equal(snapshot.participantCount, 1);
    assert.equal(snapshot.replayed, false);
    assert.match(snapshot.sourceDigest, /^[0-9a-f]{64}$/);
    const tenantScope = calls.find(({ sql }) => isScopeQuery(sql));
    assert.deepEqual(tenantScope?.values, ["tenant-a", "workspace-a"]);
    const advisory = calls.find(({ sql }) => sql.includes("pg_advisory_xact_lock"));
    assert.deepEqual(advisory?.values, ["arena-ranking:tenant-a:workspace-a", "monthly:2026-01"]);
    const rankingInsert = calls.find(({ sql }) => sql.includes("INSERT INTO academy_arena_league_rankings"));
    const candidateRead = calls.find(({ sql }) => sql.includes("WITH window_scores"));
    assert.match(candidateRead?.sql ?? "", /snapshot\.season_id IS NULL/);
    assert.deepEqual(rankingInsert?.values?.slice(3), [
      "11111111-1111-4111-8111-111111111111", 1, 240, 12, 9200, "explorer",
      "11111111-1111-4111-8111-111111111111",
    ]);
    const snapshotInsert = calls.find(({ sql }) => sql.includes("INSERT INTO academy_arena_league_snapshots"));
    assert.ok(snapshotInsert?.sql.includes("source_digest, season_id"));
    assert.equal(snapshotInsert?.values?.at(-1), null);
    assert.ok(calls.at(-1)?.sql.includes("SET status = 'finalized'"));
  });

  it("replays an identical immutable generic snapshot without inserting a second version", async () => {
    const snapshotId = "22222222-2222-4222-8222-222222222222";
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("WITH window_scores")) return result([]);
        if (sql.includes("source_digest = $5")) return result([{ id: snapshotId, version: 7 }]);
        return result([]);
      },
    } as unknown as PoolClient;
    const snapshot = await materializeArenaLeagueRankingSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      windowType: "lifetime",
      windowKey: "all-time",
      sourceCutoffAt: new Date("2026-01-15T12:00:00.000Z"),
    });
    assert.equal(snapshot.snapshotId, snapshotId);
    assert.equal(snapshot.seasonId, null);
    assert.equal(snapshot.version, 7);
    assert.equal(snapshot.replayed, true);
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO academy_arena_league_snapshots")), false);
  });

  it("binds a finalized snapshot to one closed season and excludes non-season activity by construction", async () => {
    const seasonId = "33333333-3333-4333-8333-333333333333";
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("FROM academy_arena_league_seasons") && sql.includes("FOR KEY SHARE")) {
          return result([{
            id: seasonId,
            status: "closing",
            starts_at: "2026-01-01T00:00:00.000Z",
            ends_at: "2026-02-01T00:00:00.000Z",
            scoring_policy_version: "arena-league-scoring-v1",
          }]);
        }
        if (sql.includes("WITH window_scores")) return result([candidate]);
        if (sql.includes("source_digest = $5")) return result([]);
        if (sql.includes("COALESCE(MAX(version)")) return result([{ version: 1 }]);
        return result([]);
      },
    } as unknown as PoolClient;

    const snapshot = await materializeArenaLeagueRankingSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      windowType: "monthly",
      windowKey: "2026-01",
      sourceCutoffAt: new Date("2026-02-10T00:00:00.000Z"),
      seasonId,
    });

    assert.equal(snapshot.seasonId, seasonId);
    assert.equal(snapshot.sourceCutoffAt, "2026-02-01T00:00:00.000Z");
    const tenantScope = calls.find(({ sql }) => isScopeQuery(sql));
    assert.deepEqual(tenantScope?.values, ["tenant-a", "workspace-a"]);
    const advisory = calls.find(({ sql }) => sql.includes("pg_advisory_xact_lock"));
    assert.deepEqual(advisory?.values, [
      "arena-ranking:tenant-a:workspace-a",
      `monthly:2026-01:season:${seasonId}`,
    ]);
    const seasonLock = calls.find(({ sql, values }) =>
      sql.includes("pg_advisory_xact_lock") && values?.[0] === "arena-season:tenant-a:workspace-a");
    assert.ok(seasonLock);
    assert.deepEqual(seasonLock?.values, ["arena-season:tenant-a:workspace-a", seasonId]);
    assert.ok(calls.indexOf(seasonLock) < calls.findIndex(({ sql }) => sql.includes("WITH window_scores")));
    const candidateRead = calls.find(({ sql }) => sql.includes("WITH window_scores"));
    assert.ok(candidateRead?.sql.includes("enrollment.status = 'enrolled'"));
    assert.ok(candidateRead?.sql.includes("score.scoring_input->>'seasonId' = $8::uuid::text"));
    assert.ok(candidateRead?.sql.includes("historical_season.id::text = score.scoring_input->>'seasonId'"));
    assert.ok(candidateRead?.sql.includes("snapshot.season_id IS NOT NULL"));
    assert.equal(candidateRead?.values?.[7], seasonId);
    const snapshotInsert = calls.find(({ sql }) => sql.includes("INSERT INTO academy_arena_league_snapshots"));
    assert.equal(snapshotInsert?.values?.at(-1), seasonId);
  });

  it("fails closed when a season has not entered closing authority", async () => {
    const seasonId = "33333333-3333-4333-8333-333333333333";
    const client = {
      query: async (sql: string) => {
        if (sql.includes("FROM academy_arena_league_seasons")) {
          return result([{
            id: seasonId,
            status: "active",
            starts_at: "2026-01-01T00:00:00.000Z",
            ends_at: "2026-02-01T00:00:00.000Z",
            scoring_policy_version: "arena-league-scoring-v1",
          }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;
    await assert.rejects(
      () => materializeArenaLeagueRankingSnapshotTx(client, {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        windowType: "monthly",
        windowKey: "2026-01",
        sourceCutoffAt: new Date("2026-02-10T00:00:00.000Z"),
        seasonId,
      }),
      /arena_ranking_season_not_closed/,
    );
  });

  it("fails closed instead of rewriting a finalized snapshot with different evidence", async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes("WITH window_scores")) return result([]);
        if (sql.includes("source_digest = $5")) return result([]);
        if (sql.includes("status = 'finalized'") && sql.includes("SELECT id::text")) {
          return result([{ id: "22222222-2222-4222-8222-222222222222" }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;
    await assert.rejects(
      () => materializeArenaLeagueRankingSnapshotTx(client, {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        windowType: "yearly",
        windowKey: "2026",
        sourceCutoffAt: new Date("2026-01-15T12:00:00.000Z"),
      }),
      /arena_ranking_finalized_snapshot_conflict/,
    );
  });

  it("rejects malformed window keys before reading ranking evidence", async () => {
    const client = {
      query: async (sql: string) => {
        if (isScopeQuery(sql)) return result([]);
        throw new Error("ranking_evidence_query_must_not_run");
      },
    } as unknown as PoolClient;
    await assert.rejects(
      () => materializeArenaLeagueRankingSnapshotTx(client, {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        windowType: "monthly",
        windowKey: "2026-13",
        sourceCutoffAt: new Date("2026-01-15T12:00:00.000Z"),
      }),
      /arena_ranking_window_key_invalid/,
    );
  });

  it("rejects an empty tenant or workspace scope before reading evidence", async () => {
    const client = { query: async () => { throw new Error("query_must_not_run"); } } as unknown as PoolClient;
    await assert.rejects(
      () => materializeArenaLeagueRankingSnapshotTx(client, {
        tenantId: " ", workspaceId: "workspace-a", windowType: "lifetime",
        windowKey: "all-time", sourceCutoffAt: new Date("2026-01-15T12:00:00.000Z"),
      }),
      /arena_ranking_scope_invalid/,
    );
  });
});
