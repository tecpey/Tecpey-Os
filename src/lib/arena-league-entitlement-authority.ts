import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  academyMonthlyLeagueRewardProposal,
  ACADEMY_MONTHLY_LEAGUE_MIN_PUBLIC_COHORT,
  ACADEMY_MONTHLY_LEAGUE_POLICY_VERSION,
} from "@/lib/academy-monthly-league-policy";
import { withTx } from "@/lib/db";
import { enqueueNotificationDomainEvent } from "@/lib/notifications/domain-outbox";

export const ARENA_LEAGUE_ENTITLEMENT_POLICY_VERSION =
  "arena-league-entitlement-v1";
export const ARENA_LEAGUE_ENTITLEMENT_APPEAL_WINDOW_DAYS = 7;
export const ARENA_LEAGUE_ENTITLEMENT_MAX_RANK = 10;

type SnapshotRow = {
  id: string;
  window_type: "monthly" | "yearly";
  window_key: string;
  version: number;
  participant_count: number;
  source_digest: string;
  finalized_at: Date | string;
};

type RankingRow = {
  student_id: string;
  rank: number;
  points: number;
  trade_count: number;
  rule_compliance_bps: number;
  tier: string;
};

type GrantReplayRow = {
  id: string;
  student_id: string;
  source_rank: number;
  grant_days: number;
  starts_at: Date | string;
  expires_at: Date | string;
  policy_version: string;
  evidence_sha256: string;
  cash_pool_share_bps: number;
  cash_disposition: string;
};

export type ArenaProEntitlementGrant = {
  grantId: string;
  studentId: string;
  rank: number;
  grantDays: number;
  startsAt: string;
  expiresAt: string;
  replayed: boolean;
};

export type ArenaLeagueEntitlementResult = {
  snapshotId: string;
  windowType: "monthly" | "yearly";
  windowKey: string;
  grantedCount: number;
  replayedCount: number;
  skippedReason: "appeal_window_open" | "cohort_too_small" | "no_eligible_rankings" | null;
  grants: ArenaProEntitlementGrant[];
};

export type ActiveArenaProEntitlement = {
  active: boolean;
  expiresAt: string | null;
  sourceSnapshotId: string | null;
};

export type ArenaLeagueEntitlementDrainResult = {
  selectedSnapshots: number;
  grantedCount: number;
  replayedCount: number;
  skippedSnapshots: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60_000).toISOString();
}

function replayMatches(row: GrantReplayRow, expected: {
  studentId: string;
  rank: number;
  grantDays: number;
  startsAt: string;
  expiresAt: string;
  evidenceSha256: string;
  cashPoolShareBps: number;
  cashDisposition: string;
}): boolean {
  return row.student_id === expected.studentId
    && Number(row.source_rank) === expected.rank
    && Number(row.grant_days) === expected.grantDays
    && new Date(row.starts_at).toISOString() === expected.startsAt
    && new Date(row.expires_at).toISOString() === expected.expiresAt
    && row.policy_version === ARENA_LEAGUE_ENTITLEMENT_POLICY_VERSION
    && row.evidence_sha256 === expected.evidenceSha256
    && Number(row.cash_pool_share_bps) === expected.cashPoolShareBps
    && row.cash_disposition === expected.cashDisposition;
}

export async function grantArenaProEntitlementsForSnapshotTx(
  client: PoolClient,
  input: {
    tenantId: string;
    workspaceId: string;
    snapshotId: string;
    clock?: Date;
  },
): Promise<ArenaLeagueEntitlementResult | null> {
  if (!input.tenantId.trim() || !input.workspaceId.trim()) {
    throw new Error("arena_entitlement_scope_invalid");
  }
  if (!UUID_PATTERN.test(input.snapshotId)) {
    throw new Error("arena_entitlement_snapshot_invalid");
  }
  const clock = input.clock ?? new Date();
  if (!Number.isFinite(clock.getTime())) throw new Error("arena_entitlement_clock_invalid");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `arena-entitlements:${input.tenantId}:${input.workspaceId}`,
    input.snapshotId,
  ]);
  const snapshotResult = await client.query<SnapshotRow>(
    `SELECT id::text, window_type, window_key, version, participant_count,
            source_digest, finalized_at
       FROM academy_arena_league_snapshots
      WHERE id = $3::uuid AND tenant_id = $1 AND workspace_id = $2
        AND status = 'finalized'
        AND window_type IN ('monthly', 'yearly')
      LIMIT 1
      FOR SHARE`,
    [input.tenantId, input.workspaceId, input.snapshotId],
  );
  const snapshot = snapshotResult.rows[0];
  if (!snapshot) return null;
  if (Number(snapshot.participant_count) < ACADEMY_MONTHLY_LEAGUE_MIN_PUBLIC_COHORT) {
    return {
      snapshotId: snapshot.id,
      windowType: snapshot.window_type,
      windowKey: snapshot.window_key,
      grantedCount: 0,
      replayedCount: 0,
      skippedReason: "cohort_too_small",
      grants: [],
    };
  }
  const finalizedAt = new Date(snapshot.finalized_at);
  const startsAt = addDays(finalizedAt, ARENA_LEAGUE_ENTITLEMENT_APPEAL_WINDOW_DAYS);
  if (Date.parse(startsAt) > clock.getTime()) {
    return {
      snapshotId: snapshot.id,
      windowType: snapshot.window_type,
      windowKey: snapshot.window_key,
      grantedCount: 0,
      replayedCount: 0,
      skippedReason: "appeal_window_open",
      grants: [],
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
    [snapshot.id, input.tenantId, input.workspaceId, ARENA_LEAGUE_ENTITLEMENT_MAX_RANK],
  );
  const grants: ArenaProEntitlementGrant[] = [];
  for (const ranking of rankings.rows) {
    const proposal = academyMonthlyLeagueRewardProposal(Number(ranking.rank));
    if (proposal.arenaProDays === 0) continue;
    const expiresAt = addDays(new Date(startsAt), proposal.arenaProDays);
    const evidence = {
      authority: ARENA_LEAGUE_ENTITLEMENT_POLICY_VERSION,
      rewardPolicy: ACADEMY_MONTHLY_LEAGUE_POLICY_VERSION,
      sourceType: "arena_league_snapshot",
      snapshotId: snapshot.id,
      snapshotVersion: Number(snapshot.version),
      sourceDigest: snapshot.source_digest,
      windowType: snapshot.window_type,
      windowKey: snapshot.window_key,
      rank: Number(ranking.rank),
      points: Number(ranking.points),
      tradeCount: Number(ranking.trade_count),
      ruleComplianceBps: Number(ranking.rule_compliance_bps),
      tier: ranking.tier,
      arenaProDays: proposal.arenaProDays,
      cashPoolShareBps: proposal.cashPoolShareBps,
      cashDisposition: proposal.cashDisposition,
      cashExecutionEnabled: false,
      appealWindowDays: ARENA_LEAGUE_ENTITLEMENT_APPEAL_WINDOW_DAYS,
    };
    const evidenceJson = canonicalEvidence(evidence);
    const evidenceSha256 = createHash("sha256").update(evidenceJson).digest("hex");
    const idempotencyKey = `arena-pro:${snapshot.id}:${ranking.student_id}`;
    const inserted = await client.query<GrantReplayRow>(
      `INSERT INTO academy_arena_entitlement_grants
         (tenant_id, workspace_id, principal_id, student_id, entitlement_type,
          source_type, source_snapshot_id, source_window_type, source_window_key,
          source_rank, grant_days, starts_at, expires_at, policy_version,
          evidence_sha256, evidence, cash_pool_share_bps, cash_disposition,
          idempotency_key)
       VALUES ($1, $2, $3, $3::uuid, 'arena_pro', 'arena_league_snapshot',
               $4::uuid, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz,
               $11, $12, $13::jsonb, $14, $15, $16)
       ON CONFLICT (tenant_id, workspace_id, idempotency_key) DO NOTHING
       RETURNING id::text, student_id::text, source_rank, grant_days,
                 starts_at, expires_at, policy_version, evidence_sha256,
                 cash_pool_share_bps, cash_disposition`,
      [input.tenantId, input.workspaceId, ranking.student_id, snapshot.id,
        snapshot.window_type, snapshot.window_key, ranking.rank,
        proposal.arenaProDays, startsAt, expiresAt,
        ARENA_LEAGUE_ENTITLEMENT_POLICY_VERSION, evidenceSha256, evidenceJson,
        proposal.cashPoolShareBps, proposal.cashDisposition, idempotencyKey],
    );
    const row = inserted.rows[0];
    if (row) {
      const principal = await client.query<{ id: string; locale: "fa" | "en" }>(
        `SELECT id, locale FROM platform_principals
          WHERE tenant_id = $1 AND student_id = $2::uuid
            AND status = 'active'
          LIMIT 1 FOR SHARE`,
        [input.tenantId, row.student_id],
      );
      if (!principal.rows[0]) throw new Error("arena_entitlement_principal_not_found");
      await enqueueNotificationDomainEvent(client, {
        id: `arena-pro-entitlement:${row.id}`,
        tenantId: input.tenantId,
        principalId: principal.rows[0].id,
        occurredAt: new Date(row.starts_at).toISOString(),
        locale: principal.rows[0].locale,
        version: 1,
        type: "academy.arena_pro_entitlement_granted",
        payload: {
          grantId: row.id,
          sourceSnapshotId: snapshot.id,
          windowType: snapshot.window_type,
          windowKey: snapshot.window_key,
          rank: Number(row.source_rank),
          grantDays: Number(row.grant_days),
          startsAt: new Date(row.starts_at).toISOString(),
          expiresAt: new Date(row.expires_at).toISOString(),
        },
      });
      grants.push({
        grantId: row.id,
        studentId: row.student_id,
        rank: Number(row.source_rank),
        grantDays: Number(row.grant_days),
        startsAt: new Date(row.starts_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        replayed: false,
      });
      continue;
    }
    const existing = await client.query<GrantReplayRow>(
      `SELECT id::text, student_id::text, source_rank, grant_days, starts_at,
              expires_at, policy_version, evidence_sha256, cash_pool_share_bps,
              cash_disposition
         FROM academy_arena_entitlement_grants
        WHERE tenant_id = $1 AND workspace_id = $2 AND idempotency_key = $3
        FOR SHARE`,
      [input.tenantId, input.workspaceId, idempotencyKey],
    );
    const replay = existing.rows[0];
    if (!replay) throw new Error("arena_entitlement_replay_missing");
    if (!replayMatches(replay, {
      studentId: ranking.student_id,
      rank: Number(ranking.rank),
      grantDays: proposal.arenaProDays,
      startsAt,
      expiresAt,
      evidenceSha256,
      cashPoolShareBps: proposal.cashPoolShareBps,
      cashDisposition: proposal.cashDisposition,
    })) {
      throw new Error("arena_entitlement_identity_conflict");
    }
    grants.push({
      grantId: replay.id,
      studentId: replay.student_id,
      rank: Number(replay.source_rank),
      grantDays: Number(replay.grant_days),
      startsAt: new Date(replay.starts_at).toISOString(),
      expiresAt: new Date(replay.expires_at).toISOString(),
      replayed: true,
    });
  }
  return {
    snapshotId: snapshot.id,
    windowType: snapshot.window_type,
    windowKey: snapshot.window_key,
    grantedCount: grants.filter((grant) => !grant.replayed).length,
    replayedCount: grants.filter((grant) => grant.replayed).length,
    skippedReason: grants.length === 0 ? "no_eligible_rankings" : null,
    grants,
  };
}

export async function grantArenaProEntitlementsForSnapshot(input: {
  tenantId: string;
  workspaceId: string;
  snapshotId: string;
}): Promise<ArenaLeagueEntitlementResult | null> {
  const result = await withTx((client) =>
    grantArenaProEntitlementsForSnapshotTx(client, input));
  if (!result.enabled) throw new Error("arena_entitlement_database_unavailable");
  return result.value;
}

export async function grantDueArenaProEntitlementsTx(
  client: PoolClient,
  input: {
    limit?: number;
    clock?: Date;
  } = {},
): Promise<ArenaLeagueEntitlementDrainResult> {
  const limit = input.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("arena_entitlement_limit_invalid");
  }
  const clock = input.clock ?? new Date();
  if (!Number.isFinite(clock.getTime())) throw new Error("arena_entitlement_clock_invalid");
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
        AND participant_count >= $4
        AND finalized_at + ($2::integer * INTERVAL '1 day') <= $3::timestamptz
        AND EXISTS (
          SELECT 1
            FROM academy_arena_league_rankings ranking
           WHERE ranking.snapshot_id = academy_arena_league_snapshots.id
             AND ranking.tenant_id = academy_arena_league_snapshots.tenant_id
             AND ranking.workspace_id = academy_arena_league_snapshots.workspace_id
             AND ranking.rank <= $5
             AND NOT EXISTS (
               SELECT 1
                 FROM academy_arena_entitlement_grants grant_row
                WHERE grant_row.tenant_id = academy_arena_league_snapshots.tenant_id
                  AND grant_row.workspace_id = academy_arena_league_snapshots.workspace_id
                  AND grant_row.idempotency_key = 'arena-pro:' || academy_arena_league_snapshots.id::text || ':' || ranking.student_id::text
             )
        )
      ORDER BY finalized_at DESC, id DESC
      LIMIT $1`,
    [
      limit,
      ARENA_LEAGUE_ENTITLEMENT_APPEAL_WINDOW_DAYS,
      clock.toISOString(),
      ACADEMY_MONTHLY_LEAGUE_MIN_PUBLIC_COHORT,
      ARENA_LEAGUE_ENTITLEMENT_MAX_RANK,
    ],
  );
  let grantedCount = 0;
  let replayedCount = 0;
  let skippedSnapshots = 0;
  for (const snapshot of snapshots.rows) {
    const result = await grantArenaProEntitlementsForSnapshotTx(client, {
      tenantId: snapshot.tenant_id,
      workspaceId: snapshot.workspace_id,
      snapshotId: snapshot.id,
      clock,
    });
    if (!result || result.skippedReason) {
      skippedSnapshots += 1;
      continue;
    }
    grantedCount += result.grantedCount;
    replayedCount += result.replayedCount;
  }
  return {
    selectedSnapshots: snapshots.rows.length,
    grantedCount,
    replayedCount,
    skippedSnapshots,
  };
}

export async function grantDueArenaProEntitlements(input: {
  limit?: number;
} = {}): Promise<ArenaLeagueEntitlementDrainResult> {
  const result = await withTx((client) =>
    grantDueArenaProEntitlementsTx(client, input));
  if (!result.enabled) throw new Error("arena_entitlement_database_unavailable");
  return result.value;
}

export async function loadActiveArenaProEntitlementTx(
  client: PoolClient,
  input: {
    tenantId: string;
    workspaceId: string;
    studentId: string;
    at?: Date;
  },
): Promise<ActiveArenaProEntitlement> {
  const at = input.at ?? new Date();
  if (!UUID_PATTERN.test(input.studentId) || !Number.isFinite(at.getTime())) {
    throw new Error("arena_entitlement_lookup_invalid");
  }
  const result = await client.query<{
    expires_at: Date | string;
    source_snapshot_id: string;
  }>(
    `SELECT expires_at, source_snapshot_id::text
       FROM academy_arena_entitlement_grants
      WHERE tenant_id = $1 AND workspace_id = $2 AND student_id = $3::uuid
        AND entitlement_type = 'arena_pro'
        AND starts_at <= $4::timestamptz
        AND expires_at > $4::timestamptz
      ORDER BY expires_at DESC, granted_at DESC
      LIMIT 1`,
    [input.tenantId, input.workspaceId, input.studentId, at.toISOString()],
  );
  const row = result.rows[0];
  return row
    ? {
        active: true,
        expiresAt: new Date(row.expires_at).toISOString(),
        sourceSnapshotId: row.source_snapshot_id,
      }
    : { active: false, expiresAt: null, sourceSnapshotId: null };
}
