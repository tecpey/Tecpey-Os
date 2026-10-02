import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient, QueryResult } from "pg";
import {
  loadArenaLeagueLeaderboardTx, loadArenaLeagueNeighborhoodTx,
} from "../../lib/arena-league-leaderboard-authority";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

describe("Arena league leaderboard read authority", () => {
  it("reads a private viewer rank by server identity and bounds public neighbors on both sides", async () => {
    const snapshotId = "11111111-1111-4111-8111-111111111111";
    const studentId = "22222222-2222-4222-8222-222222222222";
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (calls.length === 1) return result([{
          id: snapshotId, rank: 25, points: 300, trade_count: 8, tier: "explorer",
        }]);
        return result([{
          public_profile_id: "33333333-3333-4333-8333-333333333333",
          public_student_id: "TP-PUBLIC-1", display_name: "Public Neighbor",
          username: "neighbor", avatar: "", rank: 26, points: 290,
          trade_count: 7, rule_compliance_bps: 9500, tier: "explorer",
        }]);
      },
    } as unknown as PoolClient;
    const neighborhood = await loadArenaLeagueNeighborhoodTx(client, {
      tenantId: "tenant-a", workspaceId: "workspace-a", studentId,
      windowType: "monthly", windowKey: "2026-08", snapshotVersion: 4,
    });
    assert.equal(neighborhood?.viewer?.rank, 25);
    assert.equal(neighborhood?.entries[0].rank, 26);
    assert.equal("studentId" in (neighborhood?.entries[0] ?? {}), false);
    assert.deepEqual(calls[0].values,
      ["tenant-a", "workspace-a", "monthly", "2026-08", studentId, 4]);
    assert.deepEqual(calls[1].values, [snapshotId, "tenant-a", "workspace-a", 25]);
    assert.match(calls[1].sql, /ORDER BY ranking\.rank DESC LIMIT 2/);
    assert.match(calls[1].sql, /ORDER BY ranking\.rank ASC LIMIT 2/);
    assert.equal((calls[1].sql.match(/consent\.enabled = TRUE/g) ?? []).length, 2);
  });

  it("does not query neighbors when the viewer did not participate", async () => {
    let queries = 0;
    const client = { query: async () => {
      queries += 1;
      return result([{ id: "11111111-1111-4111-8111-111111111111",
        rank: null, points: null, trade_count: null, tier: null }]);
    } } as unknown as PoolClient;
    const neighborhood = await loadArenaLeagueNeighborhoodTx(client, {
      tenantId: "tenant-a", workspaceId: "workspace-a",
      studentId: "22222222-2222-4222-8222-222222222222",
      windowType: "yearly", windowKey: "2026", snapshotVersion: 2,
    });
    assert.equal(queries, 1);
    assert.deepEqual(neighborhood?.viewer, null);
    assert.deepEqual(neighborhood?.entries, []);
  });

  it("binds the latest snapshot, rankings, public profile and scoring consent to one tenant/workspace", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return result([{
          version: 4,
          source_cutoff_at: "2026-08-15T10:00:00.000Z",
          generated_at: "2026-08-15T10:01:00.000Z",
          participant_count: 29,
          public_profile_id: "22222222-2222-4222-8222-222222222222",
          public_student_id: "TP-LEARNER-1",
          display_name: "Learner One",
          username: "learner_one",
          avatar: "",
          rank: 2,
          points: 480,
          trade_count: 14,
          rule_compliance_bps: 9400,
          tier: "analyst",
        }]);
      },
    } as unknown as PoolClient;

    const leaderboard = await loadArenaLeagueLeaderboardTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      windowType: "monthly",
      windowKey: "2026-08",
      limit: 25,
    });

    assert.equal(leaderboard?.visibleCount, 1);
    assert.equal(leaderboard?.participantCount, 29);
    assert.equal(leaderboard?.entries[0]?.publicStudentId, "TP-LEARNER-1");
    assert.equal("studentId" in (leaderboard?.entries[0] ?? {}), false);
    assert.deepEqual(calls[0]?.values, ["tenant-a", "workspace-a", "monthly", "2026-08", 25]);
    assert.match(calls[0]?.sql ?? "", /AND season_id IS NULL/);
    for (const required of [
      "tenant_id = $1 AND workspace_id = $2",
      "profile.tenant_id = ranking.tenant_id",
      "profile.workspace_id = ranking.workspace_id",
      "profile.leaderboard_visible = TRUE",
      "consent.tenant_id = ranking.tenant_id",
      "consent.workspace_id = ranking.workspace_id",
      "consent.enabled = TRUE",
    ]) {
      assert.ok(calls[0]?.sql.includes(required), `missing boundary: ${required}`);
    }
  });

  it("returns an empty consented view without inventing entries when a finalized snapshot exists", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (calls.length === 1) return result([]);
        return result([{
          version: 2,
          source_cutoff_at: "2026-08-15T10:00:00.000Z",
          generated_at: "2026-08-15T10:01:00.000Z",
          participant_count: 12,
        }]);
      },
    } as unknown as PoolClient;

    const leaderboard = await loadArenaLeagueLeaderboardTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      windowType: "yearly",
      windowKey: "2026",
      limit: 50,
    });

    assert.equal(leaderboard?.participantCount, 12);
    assert.equal(leaderboard?.visibleCount, 0);
    assert.deepEqual(leaderboard?.entries, []);
    assert.equal(calls.length, 2);
    assert.match(calls[1], /AND season_id IS NULL/);
  });

  it("rejects invalid windows and unbounded limits before querying", async () => {
    const client = { query: async () => { throw new Error("query_must_not_run"); } } as unknown as PoolClient;
    await assert.rejects(() => loadArenaLeagueLeaderboardTx(client, {
      tenantId: "tenant-a", workspaceId: "workspace-a", windowType: "monthly",
      windowKey: "2026-13", limit: 50,
    }), /arena_leaderboard_window_invalid/);
    await assert.rejects(() => loadArenaLeagueLeaderboardTx(client, {
      tenantId: "tenant-a", workspaceId: "workspace-a", windowType: "lifetime",
      windowKey: "all-time", limit: 101,
    }), /arena_leaderboard_limit_invalid/);
  });
});
