import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  ARENA_LEAGUE_ENTITLEMENT_APPEAL_WINDOW_DAYS,
  ARENA_LEAGUE_ENTITLEMENT_POLICY_VERSION,
  grantDueArenaProEntitlementsTx,
  grantArenaProEntitlementsForSnapshotTx,
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

const rankOne = {
  student_id: "11111111-1111-4111-8111-111111111111",
  rank: 1,
  points: 3000,
  trade_count: 12,
  rule_compliance_bps: 9200,
  tier: "explorer",
};

describe("Arena league entitlement authority", () => {
  it("grants Arena Pro only after the appeal window using deterministic expiry evidence", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("FROM academy_arena_league_snapshots")) return result([snapshot]);
        if (sql.includes("FROM academy_arena_league_rankings")) {
          return result([
            rankOne,
            {
              ...rankOne,
              student_id: "33333333-3333-4333-8333-333333333333",
              rank: 10,
              points: 700,
              tier: "rookie",
            },
          ]);
        }
        if (sql.includes("INSERT INTO academy_arena_entitlement_grants")) {
          return result([{
            id: "00000000-0000-4000-8000-000000000010",
            student_id: values?.[2],
            source_rank: values?.[6],
            grant_days: values?.[7],
            starts_at: values?.[8],
            expires_at: values?.[9],
            policy_version: values?.[10],
            evidence_sha256: values?.[11],
            cash_pool_share_bps: values?.[13],
            cash_disposition: values?.[14],
          }]);
        }
        if (sql.includes("SELECT id, locale FROM platform_principals")) {
          return result([{ id: "00000000-0000-4000-8000-000000000030", locale: "fa" }]);
        }
        if (sql.includes("INSERT INTO notification_domain_outbox")) {
          return result([{ id: "00000000-0000-4000-8000-000000000040" }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;

    const granted = await grantArenaProEntitlementsForSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      snapshotId: snapshot.id,
      clock: new Date("2026-02-08T00:05:01.000Z"),
    });

    assert.equal(granted?.grantedCount, 2);
    assert.equal(granted?.replayedCount, 0);
    assert.equal(granted?.skippedReason, null);
    assert.deepEqual(granted?.grants.map(({ rank, grantDays }) => ({ rank, grantDays })), [
      { rank: 1, grantDays: 90 },
      { rank: 10, grantDays: 30 },
    ]);
    const insert = calls.find(({ sql }) => sql.includes("INSERT INTO academy_arena_entitlement_grants"));
    assert.equal(insert?.values?.[8], "2026-02-08T00:05:00.000Z");
    assert.equal(insert?.values?.[9], "2026-05-09T00:05:00.000Z");
    assert.equal(insert?.values?.[10], ARENA_LEAGUE_ENTITLEMENT_POLICY_VERSION);
    assert.equal(insert?.values?.[13], 5000);
    assert.equal(insert?.values?.[14], "c_level_compliance_approval_required");
    const evidence = JSON.parse(String(insert?.values?.[12]));
    assert.equal(evidence.cashExecutionEnabled, false);
    assert.equal(evidence.appealWindowDays, ARENA_LEAGUE_ENTITLEMENT_APPEAL_WINDOW_DAYS);
    assert.ok(calls.some(({ sql, values }) =>
      sql.includes("INSERT INTO notification_domain_outbox") &&
      values?.[2] === "academy.arena_pro_entitlement_granted"));
  });

  it("does not grant while the appeal window is still open", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("FROM academy_arena_league_snapshots")) return result([snapshot]);
        return result([]);
      },
    } as unknown as PoolClient;

    const granted = await grantArenaProEntitlementsForSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      snapshotId: snapshot.id,
      clock: new Date("2026-02-07T23:59:59.000Z"),
    });

    assert.equal(granted?.skippedReason, "appeal_window_open");
    assert.equal(calls.some((sql) => sql.includes("academy_arena_entitlement_grants")), false);
  });

  it("does not grant Arena Pro for suppressed small cohorts", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("FROM academy_arena_league_snapshots")) {
          return result([{ ...snapshot, participant_count: 24 }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;

    const granted = await grantArenaProEntitlementsForSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      snapshotId: snapshot.id,
      clock: new Date("2026-02-10T00:00:00.000Z"),
    });

    assert.equal(granted?.grantedCount, 0);
    assert.equal(granted?.skippedReason, "cohort_too_small");
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO academy_arena_entitlement_grants")), false);
  });

  it("replays exact grants without changing cash disposition or expiry", async () => {
    let replayRow: Record<string, unknown> | null = null;
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("FROM academy_arena_league_snapshots")) return result([snapshot]);
        if (sql.includes("FROM academy_arena_league_rankings")) return result([rankOne]);
        if (sql.includes("INSERT INTO academy_arena_entitlement_grants")) {
          replayRow = {
            id: "00000000-0000-4000-8000-000000000010",
            student_id: values?.[2],
            source_rank: values?.[6],
            grant_days: values?.[7],
            starts_at: values?.[8],
            expires_at: values?.[9],
            policy_version: values?.[10],
            evidence_sha256: values?.[11],
            cash_pool_share_bps: values?.[13],
            cash_disposition: values?.[14],
          };
          return result([]);
        }
        if (sql.includes("FROM academy_arena_entitlement_grants")) return result([replayRow!]);
        return result([]);
      },
    } as unknown as PoolClient;

    const granted = await grantArenaProEntitlementsForSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      snapshotId: snapshot.id,
      clock: new Date("2026-02-10T00:00:00.000Z"),
    });

    assert.equal(granted?.grantedCount, 0);
    assert.equal(granted?.replayedCount, 1);
    assert.equal(granted?.grants[0]?.replayed, true);
  });

  it("looks up only active Arena Pro grants at the requested time", async () => {
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

  it("drains due finalized snapshots after the appeal window", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("SELECT id::text, tenant_id, workspace_id")) {
          return result([{ id: snapshot.id, tenant_id: "tenant-a", workspace_id: "workspace-a" }]);
        }
        if (sql.includes("FROM academy_arena_league_snapshots")) return result([snapshot]);
        if (sql.includes("FROM academy_arena_league_rankings")) return result([rankOne]);
        if (sql.includes("INSERT INTO academy_arena_entitlement_grants")) {
          return result([{
            id: "00000000-0000-4000-8000-000000000010",
            student_id: values?.[2],
            source_rank: values?.[6],
            grant_days: values?.[7],
            starts_at: values?.[8],
            expires_at: values?.[9],
            policy_version: values?.[10],
            evidence_sha256: values?.[11],
            cash_pool_share_bps: values?.[13],
            cash_disposition: values?.[14],
          }]);
        }
        if (sql.includes("SELECT id, locale FROM platform_principals")) {
          return result([{ id: "00000000-0000-4000-8000-000000000030", locale: "fa" }]);
        }
        if (sql.includes("INSERT INTO notification_domain_outbox")) {
          return result([{ id: "00000000-0000-4000-8000-000000000040" }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;

    const drained = await grantDueArenaProEntitlementsTx(client, {
      limit: 5,
      clock: new Date("2026-02-10T00:00:00.000Z"),
    });

    assert.deepEqual(drained, {
      selectedSnapshots: 1,
      grantedCount: 1,
      replayedCount: 0,
      skippedSnapshots: 0,
    });
    assert.deepEqual(calls[0]?.values, [
      5,
      ARENA_LEAGUE_ENTITLEMENT_APPEAL_WINDOW_DAYS,
      "2026-02-10T00:00:00.000Z",
      25,
      10,
    ]);
    assert.match(calls[0]?.sql ?? "", /NOT EXISTS \(\s*SELECT 1\s+FROM academy_arena_entitlement_grants/);
  });
});
