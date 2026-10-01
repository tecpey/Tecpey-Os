import "server-only";

import type { PoolClient } from "pg";
import {
  issueAcademyCredential,
  type AcademyCredentialType,
} from "@/lib/academy-credential-authority";
import { withTx } from "@/lib/db";
import { ACADEMY_MONTHLY_LEAGUE_MIN_PUBLIC_COHORT } from "@/lib/academy-monthly-league-policy";
import {
  ARENA_LEAGUE_RANKING_MATERIALIZER_VERSION,
  ARENA_LEAGUE_SEASON_RANKING_MATERIALIZER_VERSION,
} from "@/lib/arena-league-ranking-materializer";
import { applyArenaLeagueTenantScope } from "@/lib/arena-league-tenant-scope";
import type { ArenaLeagueTier } from "@/lib/arena-league-scoring-policy";

export const ARENA_LEAGUE_CREDENTIAL_ISSUER_VERSION =
  "arena-league-credential-issuer-v1";
export const ARENA_LEAGUE_CREDENTIAL_MIN_PARTICIPANTS = ACADEMY_MONTHLY_LEAGUE_MIN_PUBLIC_COHORT;
export const ARENA_LEAGUE_CREDENTIAL_MAX_RANK = 10;

type SnapshotRow = {
  id: string;
  season_id: string | null;
  season_key: string | null;
  window_type: "monthly" | "yearly";
  window_key: string;
  version: number;
  participant_count: number;
  source_digest: string;
  source_cutoff_at: Date | string;
  finalized_at: Date | string;
};

type RankingRow = {
  student_id: string;
  rank: number;
  points: number;
  trade_count: number;
  rule_compliance_bps: number;
  tier: ArenaLeagueTier;
};

export type ArenaLeagueCredentialIssuerResult = {
  snapshotId: string;
  windowType: "monthly" | "yearly";
  windowKey: string;
  issuedCount: number;
  replayedCount: number;
  skippedReason: "cohort_too_small" | "no_rankings" | null;
};

export type ArenaLeagueCredentialIssuanceDrainResult = {
  selectedSnapshots: number;
  issuedCount: number;
  replayedCount: number;
  skippedSnapshots: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`arena_league_credential_${name}_invalid`);
  return value;
}

function pointsToBps(points: number): number {
  if (!Number.isSafeInteger(points)) throw new Error("arena_league_credential_points_invalid");
  return Math.max(0, Math.min(10_000, points));
}

function credentialCopy(input: {
  windowType: "monthly" | "yearly";
  windowKey: string;
  rank: number;
  tier: ArenaLeagueTier;
  seasonKey?: string;
}) {
  const periodFa = input.windowType === "monthly"
    ? `ماه ${input.windowKey}`
    : `سال ${input.windowKey}`;
  const periodEn = input.windowType === "monthly"
    ? `month ${input.windowKey}`
    : `year ${input.windowKey}`;
  const contextFa = input.seasonKey ? `فصل ${input.seasonKey} در ${periodFa}` : periodFa;
  const contextEn = input.seasonKey ? `season ${input.seasonKey} in ${periodEn}` : periodEn;
  return {
    code: `arena-${input.windowType}-rank-${input.rank}`,
    titleFa: `مدال لیگ آرنا - رتبه ${input.rank}`,
    titleEn: `Arena League Medal - Rank ${input.rank}`,
    descriptionFa: `رتبه ${input.rank} لیگ آرنا در ${contextFa} با سطح ${input.tier}.`,
    descriptionEn: `Rank ${input.rank} in the Arena League for ${contextEn}, tier ${input.tier}.`,
    icon: input.rank === 1 ? "🏆" : input.rank <= 3 ? "🥇" : "🎖️",
  };
}

export async function issueArenaLeagueCredentialsForSnapshotTx(
  client: PoolClient,
  input: {
    tenantId: string;
    workspaceId: string;
    snapshotId: string;
    maxRank?: number;
  },
): Promise<ArenaLeagueCredentialIssuerResult | null> {
  if (!input.tenantId.trim() || !input.workspaceId.trim()) {
    throw new Error("arena_league_credential_scope_invalid");
  }
  if (!UUID_PATTERN.test(input.snapshotId)) {
    throw new Error("arena_league_credential_snapshot_invalid");
  }
  const maxRank = Math.min(
    ARENA_LEAGUE_CREDENTIAL_MAX_RANK,
    assertPositiveInteger(input.maxRank ?? ARENA_LEAGUE_CREDENTIAL_MAX_RANK, "max_rank"),
  );
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `arena-league-credentials:${input.tenantId}:${input.workspaceId}`,
    input.snapshotId,
  ]);
  await applyArenaLeagueTenantScope(client, input);
  const snapshotResult = await client.query<SnapshotRow>(
    `SELECT snapshot.id::text, snapshot.season_id::text, season.season_key,
            snapshot.window_type, snapshot.window_key, snapshot.version,
            snapshot.participant_count, snapshot.source_digest,
            snapshot.source_cutoff_at, snapshot.finalized_at
       FROM academy_arena_league_snapshots snapshot
       LEFT JOIN academy_arena_league_seasons season
         ON season.id = snapshot.season_id
        AND season.tenant_id = snapshot.tenant_id
        AND season.workspace_id = snapshot.workspace_id
      WHERE snapshot.id = $3::uuid AND snapshot.tenant_id = $1 AND snapshot.workspace_id = $2
        AND snapshot.status = 'finalized'
        AND snapshot.window_type IN ('monthly', 'yearly')
      LIMIT 1
      FOR SHARE OF snapshot`,
    [input.tenantId, input.workspaceId, input.snapshotId],
  );
  const snapshot = snapshotResult.rows[0];
  if (!snapshot) return null;
  if (snapshot.season_id && !snapshot.season_key) {
    throw new Error("arena_league_credential_season_scope_invalid");
  }
  if (Number(snapshot.participant_count) < ARENA_LEAGUE_CREDENTIAL_MIN_PARTICIPANTS) {
    return {
      snapshotId: snapshot.id,
      windowType: snapshot.window_type,
      windowKey: snapshot.window_key,
      issuedCount: 0,
      replayedCount: 0,
      skippedReason: "cohort_too_small",
    };
  }
  const rankings = await client.query<RankingRow>(
    `SELECT student_id::text, rank, points, trade_count, rule_compliance_bps, tier
       FROM academy_arena_league_rankings
      WHERE snapshot_id = $1::uuid
        AND tenant_id = $2
        AND workspace_id = $3
        AND rank <= $4
      ORDER BY rank ASC, student_id ASC
      FOR SHARE`,
    [snapshot.id, input.tenantId, input.workspaceId, maxRank],
  );
  if (rankings.rows.length === 0) {
    return {
      snapshotId: snapshot.id,
      windowType: snapshot.window_type,
      windowKey: snapshot.window_key,
      issuedCount: 0,
      replayedCount: 0,
      skippedReason: "no_rankings",
    };
  }

  let issuedCount = 0;
  let replayedCount = 0;
  for (const ranking of rankings.rows) {
    const copy = credentialCopy({
      windowType: snapshot.window_type,
      windowKey: snapshot.window_key,
      rank: Number(ranking.rank),
      tier: ranking.tier,
      ...(snapshot.season_key ? { seasonKey: snapshot.season_key } : {}),
    });
    const credentialType: AcademyCredentialType = "league_medal";
    const issued = await issueAcademyCredential(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      studentId: ranking.student_id,
      credentialKey: snapshot.season_id
        ? `arena-league:season:${snapshot.season_id}:${snapshot.window_type}:${snapshot.window_key}:rank:${ranking.rank}`
        : `arena-league:${snapshot.window_type}:${snapshot.window_key}:rank:${ranking.rank}`,
      credentialType,
      code: copy.code,
      titleFa: copy.titleFa,
      titleEn: copy.titleEn,
      descriptionFa: copy.descriptionFa,
      descriptionEn: copy.descriptionEn,
      icon: copy.icon,
      policyVersion: ARENA_LEAGUE_CREDENTIAL_ISSUER_VERSION,
      evidence: {
        authority: ARENA_LEAGUE_CREDENTIAL_ISSUER_VERSION,
        materializer: snapshot.season_id
          ? ARENA_LEAGUE_SEASON_RANKING_MATERIALIZER_VERSION
          : ARENA_LEAGUE_RANKING_MATERIALIZER_VERSION,
        ...(snapshot.season_id ? { seasonId: snapshot.season_id, seasonKey: snapshot.season_key } : {}),
        snapshotId: snapshot.id,
        snapshotVersion: Number(snapshot.version),
        sourceDigest: snapshot.source_digest,
        sourceCutoffAt: new Date(snapshot.source_cutoff_at).toISOString(),
        windowType: snapshot.window_type,
        windowKey: snapshot.window_key,
        rank: Number(ranking.rank),
        points: Number(ranking.points),
        tradeCount: Number(ranking.trade_count),
        ruleComplianceBps: Number(ranking.rule_compliance_bps),
        tier: ranking.tier,
      },
      issuedAt: new Date(snapshot.finalized_at).toISOString(),
      competitionId: "arena-league",
      seasonKey: snapshot.season_id
        ? `season:${snapshot.season_id}:${snapshot.window_type}:${snapshot.window_key}`
        : `${snapshot.window_type}:${snapshot.window_key}`,
      rank: Number(ranking.rank),
      pointsBps: pointsToBps(Number(ranking.points)),
    });
    if (issued.replayed) replayedCount += 1;
    else issuedCount += 1;
  }
  return {
    snapshotId: snapshot.id,
    windowType: snapshot.window_type,
    windowKey: snapshot.window_key,
    issuedCount,
    replayedCount,
    skippedReason: null,
  };
}

export async function issueArenaLeagueCredentialsForSnapshot(input: {
  tenantId: string;
  workspaceId: string;
  snapshotId: string;
  maxRank?: number;
}): Promise<ArenaLeagueCredentialIssuerResult | null> {
  const result = await withTx((client) =>
    issueArenaLeagueCredentialsForSnapshotTx(client, input));
  if (!result.enabled) throw new Error("arena_league_credential_database_unavailable");
  return result.value;
}

export async function issueDueArenaLeagueCredentialsTx(
  client: PoolClient,
  input: {
    limit?: number;
    maxRank?: number;
  } = {},
): Promise<ArenaLeagueCredentialIssuanceDrainResult> {
  const limit = Math.min(
    100,
    assertPositiveInteger(input.limit ?? 25, "limit"),
  );
  const maxRank = Math.min(
    ARENA_LEAGUE_CREDENTIAL_MAX_RANK,
    assertPositiveInteger(input.maxRank ?? ARENA_LEAGUE_CREDENTIAL_MAX_RANK, "max_rank"),
  );
  const snapshots = await client.query<{
    id: string;
    tenant_id: string;
    workspace_id: string;
  }>(
    `SELECT id::text, tenant_id, workspace_id
       FROM academy_arena_league_snapshots
      WHERE status = 'finalized'
        AND finalized_at IS NOT NULL
        AND window_type IN ('monthly', 'yearly')
        AND participant_count >= $2
        AND EXISTS (
          SELECT 1
            FROM academy_arena_league_rankings ranking
           WHERE ranking.snapshot_id = academy_arena_league_snapshots.id
             AND ranking.tenant_id = academy_arena_league_snapshots.tenant_id
             AND ranking.workspace_id = academy_arena_league_snapshots.workspace_id
             AND ranking.rank <= $3
             AND NOT EXISTS (
               SELECT 1
                 FROM academy_credential_records credential
                WHERE credential.tenant_id = academy_arena_league_snapshots.tenant_id
                  AND credential.workspace_id = academy_arena_league_snapshots.workspace_id
                  AND credential.student_id = ranking.student_id
                  AND credential.credential_key = CASE
                    WHEN academy_arena_league_snapshots.season_id IS NULL THEN
                      'arena-league:' || academy_arena_league_snapshots.window_type || ':' || academy_arena_league_snapshots.window_key || ':rank:' || ranking.rank::text
                    ELSE
                      'arena-league:season:' || academy_arena_league_snapshots.season_id::text || ':' || academy_arena_league_snapshots.window_type || ':' || academy_arena_league_snapshots.window_key || ':rank:' || ranking.rank::text
                  END
             )
        )
      ORDER BY finalized_at DESC, id DESC
      LIMIT $1`,
    [limit, ARENA_LEAGUE_CREDENTIAL_MIN_PARTICIPANTS, maxRank],
  );
  let issuedCount = 0;
  let replayedCount = 0;
  let skippedSnapshots = 0;
  for (const snapshot of snapshots.rows) {
    const issued = await issueArenaLeagueCredentialsForSnapshotTx(client, {
      tenantId: snapshot.tenant_id,
      workspaceId: snapshot.workspace_id,
      snapshotId: snapshot.id,
      maxRank,
    });
    if (!issued || issued.skippedReason) {
      skippedSnapshots += 1;
      continue;
    }
    issuedCount += issued.issuedCount;
    replayedCount += issued.replayedCount;
  }
  return {
    selectedSnapshots: snapshots.rows.length,
    issuedCount,
    replayedCount,
    skippedSnapshots,
  };
}

export async function issueDueArenaLeagueCredentials(input: {
  limit?: number;
  maxRank?: number;
} = {}): Promise<ArenaLeagueCredentialIssuanceDrainResult> {
  const result = await withTx((client) =>
    issueDueArenaLeagueCredentialsTx(client, input));
  if (!result.enabled) throw new Error("arena_league_credential_database_unavailable");
  return result.value;
}
