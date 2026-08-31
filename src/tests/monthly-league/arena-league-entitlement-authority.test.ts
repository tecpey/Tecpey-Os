import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  grantArenaProEntitlementsForSnapshotTx,
  grantDueArenaProEntitlementsTx,
  loadActiveArenaProEntitlementTx,
} from "../../lib/arena-league-entitlement-authority";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

const snapshot = {
  id: "22222222-2222-4222-8222-222222222222",
  window_type: "monthly" as const,
  window_key: "2026-01",
  version: 2,
  participant_count: 25,
  source_digest: "a".repeat(64),
  finalized_at: "2026-02-01T00:05:00.000Z",
};

describe("Arena league entitlement authority", () => {
  it("fails closed and writes no automatic grant for any league rank", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("FROM academy_arena_league_snapshots")) return result([snapshot]);
        throw new Error("unexpected query after recognition-only gate");
      },
    } as unknown as PoolClient;

    const outcome = await grantArenaProEntitlementsForSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      snapshotId: snapshot.id,
      clock: new Date("2026-02-10T00:00:00.000Z"),
    });

    assert.deepEqual(outcome, {
      snapshotId: snapshot.id,
      windowType: "monthly",
      windowKey: "2026-01",
      grantedCount: 0,
      replayedCount: 0,
      skippedReason: "no_eligible_rankings",
      grants: [],
    });
    assert.equal(calls.some((sql) => sql.includes("academy_arena_entitlement_grants")), false);
  });

  it("disables the automatic entitlement drain without touching the database", async () => {
    const client = {
      query: async () => {
        throw new Error("automatic entitlement drain must not query");
      },
    } as unknown as PoolClient;
    assert.deepEqual(await grantDueArenaProEntitlementsTx(client), {
      selectedSnapshots: 0,
      grantedCount: 0,
      replayedCount: 0,
      skippedSnapshots: 0,
    });
  });

  it("preserves read access to previously issued active grants", async () => {
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        assert.match(sql, /starts_at <= \$4::timestamptz/);
        assert.deepEqual(values, [
          "tenant-a",
          "workspace-a",
          "11111111-1111-4111-8111-111111111111",
          "2026-02-15T00:00:00.000Z",
        ]);
        return result([{
          expires_at: "2026-05-09T00:05:00.000Z",
          source_snapshot_id: snapshot.id,
        }]);
      },
    } as unknown as PoolClient;

    assert.deepEqual(await loadActiveArenaProEntitlementTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      studentId: "11111111-1111-4111-8111-111111111111",
      at: new Date("2026-02-15T00:00:00.000Z"),
    }), {
      active: true,
      expiresAt: "2026-05-09T00:05:00.000Z",
      sourceSnapshotId: snapshot.id,
    });
  });
});
