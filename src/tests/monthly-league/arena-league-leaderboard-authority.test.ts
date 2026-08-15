import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient, QueryResult } from "pg";
import { loadArenaLeagueLeaderboardTx } from "../../lib/arena-league-leaderboard-authority";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

describe("Arena league leaderboard read authority", () => {
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
    let call = 0;
    const client = {
      query: async () => {
        call += 1;
        if (call === 1) return result([]);
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
