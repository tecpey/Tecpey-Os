import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  ARENA_LEAGUE_CREDENTIAL_ISSUER_VERSION,
  issueDueArenaLeagueCredentialsTx,
  issueArenaLeagueCredentialsForSnapshotTx,
} from "../../lib/arena-league-credential-issuer";
import { ARENA_LEAGUE_RANKING_MATERIALIZER_VERSION } from "../../lib/arena-league-ranking-materializer";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

function canonicalEvidence(value: Record<string, unknown>): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sort(nested)]));
  };
  return JSON.stringify(sort(value));
}

const snapshot = {
  id: "22222222-2222-4222-8222-222222222222",
  window_type: "monthly" as const,
  window_key: "2026-01",
  version: 2,
  participant_count: 25,
  source_digest: "a".repeat(64),
  source_cutoff_at: "2026-02-01T00:00:00.000Z",
  finalized_at: "2026-02-01T00:05:00.000Z",
};

const ranking = {
  student_id: "11111111-1111-4111-8111-111111111111",
  rank: 1,
  points: 3000,
  trade_count: 12,
  rule_compliance_bps: 9200,
  tier: "explorer" as const,
};

describe("Arena league credential issuer", () => {
  it("issues idempotent league medals from a finalized monthly snapshot", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    let credentialIndex = 0;
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("FROM academy_arena_league_snapshots")) return result([snapshot]);
        if (sql.includes("FROM academy_arena_league_rankings")) {
          return result([
            ranking,
            {
              ...ranking,
              student_id: "33333333-3333-4333-8333-333333333333",
              rank: 2,
              points: 2400,
              tier: "rookie" as const,
            },
          ]);
        }
        if (sql.includes("INSERT INTO academy_credential_records")) {
          credentialIndex += 1;
          return result([{ id: `00000000-0000-4000-8000-00000000000${credentialIndex}` }]);
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

    const issued = await issueArenaLeagueCredentialsForSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      snapshotId: snapshot.id,
    });

    assert.deepEqual(issued, {
      snapshotId: snapshot.id,
      windowType: "monthly",
      windowKey: "2026-01",
      issuedCount: 2,
      replayedCount: 0,
      skippedReason: null,
    });
    const credentialInserts = calls.filter(({ sql }) => sql.includes("INSERT INTO academy_credential_records"));
    assert.equal(credentialInserts.length, 2);
    assert.deepEqual(credentialInserts[0]?.values?.slice(3, 16), [
      "arena-league:monthly:2026-01:rank:1",
      "league_medal",
      "arena-monthly-rank-1",
      "مدال لیگ آرنا - رتبه 1",
      "Arena League Medal - Rank 1",
      "رتبه 1 لیگ آرنا در ماه 2026-01 با سطح explorer.",
      "Rank 1 in the Arena League for month 2026-01, tier explorer.",
      "🏆",
      "arena-league",
      "monthly:2026-01",
      1,
      3000,
      ARENA_LEAGUE_CREDENTIAL_ISSUER_VERSION,
    ]);
    assert.equal(calls.filter(({ sql }) => sql.includes("INSERT INTO notification_domain_outbox")).length, 2);
    assert.match(calls[1]?.sql ?? "", /participant_count/);
  });

  it("does not issue official medals for suppressed small cohorts", async () => {
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

    const issued = await issueArenaLeagueCredentialsForSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      snapshotId: snapshot.id,
    });

    assert.equal(issued?.issuedCount, 0);
    assert.equal(issued?.skippedReason, "cohort_too_small");
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO academy_credential_records")), false);
  });

  it("counts exact credential replays without duplicating notification handoff", async () => {
    const evidence = {
      authority: ARENA_LEAGUE_CREDENTIAL_ISSUER_VERSION,
      materializer: ARENA_LEAGUE_RANKING_MATERIALIZER_VERSION,
      snapshotId: snapshot.id,
      snapshotVersion: snapshot.version,
      sourceDigest: snapshot.source_digest,
      sourceCutoffAt: snapshot.source_cutoff_at,
      windowType: snapshot.window_type,
      windowKey: snapshot.window_key,
      rank: ranking.rank,
      points: ranking.points,
      tradeCount: ranking.trade_count,
      ruleComplianceBps: ranking.rule_compliance_bps,
      tier: ranking.tier,
    };
    const evidenceSha256 = createHash("sha256")
      .update(canonicalEvidence(evidence))
      .digest("hex");
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("FROM academy_arena_league_snapshots")) return result([snapshot]);
        if (sql.includes("FROM academy_arena_league_rankings")) return result([ranking]);
        if (sql.includes("INSERT INTO academy_credential_records")) return result([]);
        if (sql.includes("SELECT id, credential_type")) {
          return result([{
            id: "00000000-0000-4000-8000-000000000010",
            credential_type: "league_medal",
            code: "arena-monthly-rank-1",
            title_fa: "مدال لیگ آرنا - رتبه 1",
            title_en: "Arena League Medal - Rank 1",
            description_fa: "رتبه 1 لیگ آرنا در ماه 2026-01 با سطح explorer.",
            description_en: "Rank 1 in the Arena League for month 2026-01, tier explorer.",
            icon: "🏆",
            competition_id: "arena-league",
            season_key: "monthly:2026-01",
            rank: 1,
            points_bps: 3000,
            policy_version: ARENA_LEAGUE_CREDENTIAL_ISSUER_VERSION,
            evidence_sha256: evidenceSha256,
            issued_at: new Date(snapshot.finalized_at),
          }]);
        }
        return result([]);
      },
    } as unknown as PoolClient;

    const issued = await issueArenaLeagueCredentialsForSnapshotTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      snapshotId: snapshot.id,
    });

    assert.equal(issued?.issuedCount, 0);
    assert.equal(issued?.replayedCount, 1);
    assert.equal(calls.some((sql) => sql.includes("notification_domain_outbox")), false);
  });

  it("drains finalized monthly/yearly snapshots through the replay-safe issuer", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("SELECT id::text, tenant_id, workspace_id")) {
          return result([{ id: snapshot.id, tenant_id: "tenant-a", workspace_id: "workspace-a" }]);
        }
        if (sql.includes("FROM academy_arena_league_snapshots")) return result([snapshot]);
        if (sql.includes("FROM academy_arena_league_rankings")) return result([ranking]);
        if (sql.includes("INSERT INTO academy_credential_records")) {
          return result([{ id: "00000000-0000-4000-8000-000000000010" }]);
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

    const drained = await issueDueArenaLeagueCredentialsTx(client, {
      limit: 5,
      maxRank: 3,
    });

    assert.deepEqual(drained, {
      selectedSnapshots: 1,
      issuedCount: 1,
      replayedCount: 0,
      skippedSnapshots: 0,
    });
    assert.deepEqual(calls[0]?.values, [5]);
    assert.ok(calls.some(({ values }) => values?.includes(3)));
  });
});
