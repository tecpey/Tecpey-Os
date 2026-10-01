import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import { changeArenaLeagueEnrollmentStatusTx } from "@/lib/arena-league-season-authority";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a" };
const seasonId = "33333333-3333-4333-8333-333333333333";
const studentId = "11111111-1111-4111-8111-111111111111";

describe("Arena enrollment and ranking finalization", () => {
  it("serializes a terminal enrollment transition with the season snapshot", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("FROM academy_arena_league_seasons")) return { rows: [{ status: "closing" }] };
        if (sql.includes("FROM academy_arena_league_snapshots")) return { rows: [] };
        if (sql.includes("UPDATE academy_arena_league_enrollments")) return { rows: [{
          id: "22222222-2222-4222-8222-222222222222",
          season_id: seasonId, tenant_id: scope.tenantId, workspace_id: scope.workspaceId,
          student_id: studentId, status: "withdrawn", reason_code: "student_request",
          enrolled_at: "2026-01-01T00:00:00.000Z",
          status_updated_at: "2026-02-01T00:00:00.000Z",
        }] };
        return { rows: [] };
      },
    } as unknown as PoolClient;
    const result = await changeArenaLeagueEnrollmentStatusTx(client, scope,
      { seasonId, studentId, status: "withdrawn", reasonCode: "student_request" });
    assert.equal(result.status, "withdrawn");
    const seasonLock = calls.findIndex(({ sql, params }) =>
      sql.includes("pg_advisory_xact_lock") && params[0] === "arena-season:tenant-a:workspace-a");
    const seasonRead = calls.findIndex(({ sql }) => sql.includes("FROM academy_arena_league_seasons"));
    const finalizedRead = calls.findIndex(({ sql }) => sql.includes("FROM academy_arena_league_snapshots"));
    const update = calls.findIndex(({ sql }) => sql.includes("UPDATE academy_arena_league_enrollments"));
    assert.ok(seasonLock >= 0 && seasonRead > seasonLock && finalizedRead > seasonRead && update > finalizedRead);
  });

  it("refuses to change an enrollment after its season snapshot is final", async () => {
    let updated = false;
    const client = {
      query: async (sql: string) => {
        if (sql.includes("FROM academy_arena_league_seasons")) return { rows: [{ status: "closing" }] };
        if (sql.includes("FROM academy_arena_league_snapshots")) return { rows: [{ id: seasonId }] };
        if (sql.includes("UPDATE academy_arena_league_enrollments")) updated = true;
        return { rows: [] };
      },
    } as unknown as PoolClient;
    await assert.rejects(changeArenaLeagueEnrollmentStatusTx(client, scope,
      { seasonId, studentId, status: "disqualified", reasonCode: "reviewed_abuse" }),
    /arena_season_enrollment_snapshot_finalized/);
    assert.equal(updated, false);
  });

  it("refuses a transition after the season lifecycle is final even without a snapshot", async () => {
    let readSnapshots = false;
    const client = {
      query: async (sql: string) => {
        if (sql.includes("FROM academy_arena_league_seasons")) return { rows: [{ status: "finalized" }] };
        if (sql.includes("FROM academy_arena_league_snapshots")) readSnapshots = true;
        return { rows: [] };
      },
    } as unknown as PoolClient;
    await assert.rejects(changeArenaLeagueEnrollmentStatusTx(client, scope,
      { seasonId, studentId, status: "disqualified", reasonCode: "reviewed_abuse" }),
    /arena_season_enrollment_season_finalized/);
    assert.equal(readSnapshots, false);
  });
});
