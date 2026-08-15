import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient, QueryResult } from "pg";
import { materializeArenaLeagueRankingSnapshotTx } from "../../lib/arena-league-ranking-materializer";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

describe("Arena league ranking materializer", () => {
  it("writes a deterministic, ranked and finalized snapshot inside the caller transaction", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("WITH window_scores")) return result([{
          student_id: "11111111-1111-4111-8111-111111111111",
          raw_points: "240",
          trade_count: "12",
          rule_compliance_bps: "9200",
          lifetime_points: "1240",
          finalized_months: "4",
        }]);
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

    assert.equal(snapshot.version, 3);
    assert.equal(snapshot.participantCount, 1);
    assert.equal(snapshot.replayed, false);
    assert.match(snapshot.sourceDigest, /^[0-9a-f]{64}$/);
    assert.ok(calls[0].sql.includes("pg_advisory_xact_lock"));
    const rankingInsert = calls.find(({ sql }) => sql.includes("INSERT INTO academy_arena_league_rankings"));
    assert.deepEqual(rankingInsert?.values?.slice(3), [
      "11111111-1111-4111-8111-111111111111", 1, 240, 12, 9200, "explorer",
      "11111111-1111-4111-8111-111111111111",
    ]);
    assert.ok(calls.at(-1)?.sql.includes("SET status = 'finalized'"));
  });

  it("replays an identical immutable snapshot without inserting a second version", async () => {
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
    assert.equal(snapshot.version, 7);
    assert.equal(snapshot.replayed, true);
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO academy_arena_league_snapshots")), false);
  });

  it("rejects malformed window keys before reading ranking evidence", async () => {
    const client = { query: async () => { throw new Error("query_must_not_run"); } } as unknown as PoolClient;
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
