import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import {
  rankArenaLeagueCandidates,
  type ArenaRankingCandidate,
  type ArenaRankedCandidate,
} from "@/lib/arena-league-ranking-policy";

export const ARENA_LEAGUE_RANKING_MATERIALIZER_VERSION =
  "arena-league-ranking-materializer-v1";

export type ArenaLeagueWindowType = "monthly" | "yearly" | "lifetime";

type CandidateRow = {
  student_id: string;
  raw_points: string;
  trade_count: string;
  rule_compliance_bps: string;
  lifetime_points: string;
  finalized_months: string;
};

export type ArenaLeagueRankingSnapshotResult = {
  snapshotId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  version: number;
  participantCount: number;
  sourceDigest: string;
  sourceCutoffAt: string;
  replayed: boolean;
};

const KEY_PATTERN: Record<ArenaLeagueWindowType, RegExp> = {
  monthly: /^\d{4}-(0[1-9]|1[0-2])$/,
  yearly: /^\d{4}$/,
  lifetime: /^all-time$/,
};

function safeInteger(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`arena_ranking_${name}_invalid`);
  return number;
}

function normalizeCutoff(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("arena_ranking_cutoff_invalid");
  }
  const now = Date.now();
  if (value.getTime() > now + 60_000) throw new Error("arena_ranking_cutoff_in_future");
  return new Date(value.getTime());
}

function windowBounds(windowType: ArenaLeagueWindowType, windowKey: string): {
  start: string;
  end: string;
} {
  if (!KEY_PATTERN[windowType].test(windowKey)) throw new Error("arena_ranking_window_key_invalid");
  if (windowType === "lifetime") {
    return { start: "1970-01-01T00:00:00.000Z", end: "9999-12-31T23:59:59.999Z" };
  }
  if (windowType === "yearly") {
    const year = Number(windowKey);
    return {
      start: `${windowKey}-01-01T00:00:00.000Z`,
      end: `${year + 1}-01-01T00:00:00.000Z`,
    };
  }
  const [year, month] = windowKey.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${windowKey}-01T00:00:00.000Z`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000Z`,
  };
}

function sourceDigest(input: {
  tenantId: string;
  workspaceId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  cutoff: string;
  ranked: readonly ArenaRankedCandidate[];
}): string {
  return createHash("sha256").update(JSON.stringify({
    authority: ARENA_LEAGUE_RANKING_MATERIALIZER_VERSION,
    ...input,
    ranked: input.ranked.map(({ studentId, rawPoints, tradeCount, ruleComplianceBps,
      lifetimePoints, finalizedMonths, points, rank, tier }) => ({
      studentId, rawPoints, tradeCount, ruleComplianceBps, lifetimePoints,
      finalizedMonths, points, rank, tier,
    })),
  })).digest("hex");
}

async function readCandidates(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  cutoff: Date;
  start: string;
  end: string;
}): Promise<ArenaRankingCandidate[]> {
  const result = await client.query<CandidateRow>(
    `WITH window_scores AS (
       SELECT score.student_id,
              SUM(score.total_points)::bigint AS raw_points,
              COUNT(*)::bigint AS trade_count,
              ROUND(AVG((score.scoring_input->>'ruleComplianceBps')::integer))::bigint
                AS rule_compliance_bps
         FROM academy_arena_trade_score_ledger score
         JOIN platform_principal_bindings binding
           ON binding.tenant_id = score.tenant_id
          AND binding.workspace_id = score.workspace_id
          AND binding.principal_type = score.principal_type
          AND binding.principal_id = score.principal_id
          AND binding.status = 'active'
        WHERE score.tenant_id = $1
          AND score.workspace_id = $2
          AND score.scored_at >= $3::timestamptz
          AND score.scored_at < LEAST($4::timestamptz, $5::timestamptz)
        GROUP BY score.student_id
     ), lifetime AS (
       SELECT student_id, SUM(total_points)::bigint AS lifetime_points
         FROM academy_arena_trade_score_ledger
        WHERE tenant_id = $1 AND workspace_id = $2 AND scored_at < $5::timestamptz
        GROUP BY student_id
     ), finalized AS (
       SELECT ranking.student_id, COUNT(DISTINCT snapshot.window_key)::bigint AS finalized_months
         FROM academy_arena_league_rankings ranking
         JOIN academy_arena_league_snapshots snapshot ON snapshot.id = ranking.snapshot_id
        WHERE snapshot.tenant_id = $1
          AND snapshot.workspace_id = $2
          AND snapshot.window_type = 'monthly'
          AND snapshot.status = 'finalized'
          AND snapshot.source_cutoff_at <= $5::timestamptz
          AND ($6::text <> 'monthly' OR snapshot.window_key < $7::text)
        GROUP BY ranking.student_id
     )
     SELECT window_scores.student_id::text,
            window_scores.raw_points::text,
            window_scores.trade_count::text,
            window_scores.rule_compliance_bps::text,
            COALESCE(lifetime.lifetime_points, 0)::text AS lifetime_points,
            COALESCE(finalized.finalized_months, 0)::text AS finalized_months
       FROM window_scores
       LEFT JOIN lifetime USING (student_id)
       LEFT JOIN finalized USING (student_id)
      ORDER BY window_scores.student_id`,
    [input.tenantId, input.workspaceId, input.start, input.end,
      input.cutoff.toISOString(), input.windowType, input.windowKey],
  );
  return result.rows.map((row) => ({
    studentId: row.student_id,
    rawPoints: safeInteger(row.raw_points, "raw_points"),
    tradeCount: safeInteger(row.trade_count, "trade_count"),
    ruleComplianceBps: safeInteger(row.rule_compliance_bps, "rule_compliance_bps"),
    lifetimePoints: safeInteger(row.lifetime_points, "lifetime_points"),
    finalizedMonths: safeInteger(row.finalized_months, "finalized_months"),
  }));
}

export async function materializeArenaLeagueRankingSnapshotTx(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  sourceCutoffAt: Date;
}): Promise<ArenaLeagueRankingSnapshotResult> {
  if (!input.tenantId.trim() || !input.workspaceId.trim()) {
    throw new Error("arena_ranking_scope_invalid");
  }
  const cutoff = normalizeCutoff(input.sourceCutoffAt);
  const bounds = windowBounds(input.windowType, input.windowKey);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `arena-ranking:${input.tenantId}:${input.workspaceId}`,
    `${input.windowType}:${input.windowKey}`,
  ]);
  const candidates = await readCandidates(client, { ...input, cutoff, ...bounds });
  const ranked = rankArenaLeagueCandidates(candidates, input.windowType);
  const cutoffIso = cutoff.toISOString();
  const digest = sourceDigest({ ...input, cutoff: cutoffIso, ranked });
  const replay = await client.query<{ id: string; version: number }>(
    `SELECT id::text, version
       FROM academy_arena_league_snapshots
      WHERE tenant_id = $1 AND workspace_id = $2 AND window_type = $3
        AND window_key = $4 AND status = 'finalized' AND source_digest = $5
      ORDER BY version DESC LIMIT 1`,
    [input.tenantId, input.workspaceId, input.windowType, input.windowKey, digest],
  );
  if (replay.rows[0]) return {
    snapshotId: replay.rows[0].id,
    windowType: input.windowType,
    windowKey: input.windowKey,
    version: Number(replay.rows[0].version),
    participantCount: ranked.length,
    sourceDigest: digest,
    sourceCutoffAt: cutoffIso,
    replayed: true,
  };
  const versionResult = await client.query<{ version: number }>(
    `SELECT COALESCE(MAX(version), 0)::integer + 1 AS version
       FROM academy_arena_league_snapshots
      WHERE tenant_id = $1 AND workspace_id = $2 AND window_type = $3 AND window_key = $4`,
    [input.tenantId, input.workspaceId, input.windowType, input.windowKey],
  );
  const version = Number(versionResult.rows[0]?.version ?? 1);
  const snapshotId = randomUUID();
  await client.query(
    `INSERT INTO academy_arena_league_snapshots
       (id, tenant_id, workspace_id, window_type, window_key, status, version,
        source_cutoff_at, participant_count, source_digest)
     VALUES ($1::uuid, $2, $3, $4, $5, 'provisional', $6, $7::timestamptz, $8, $9)`,
    [snapshotId, input.tenantId, input.workspaceId, input.windowType, input.windowKey,
      version, cutoffIso, ranked.length, digest],
  );
  for (const row of ranked) {
    await client.query(
      `INSERT INTO academy_arena_league_rankings
         (snapshot_id, tenant_id, workspace_id, principal_id, student_id, rank,
          points, trade_count, rule_compliance_bps, tier)
       VALUES ($1::uuid, $2, $3, $4, $4::uuid, $5, $6, $7, $8, $9)`,
      [snapshotId, input.tenantId, input.workspaceId, row.studentId, row.rank,
        row.points, row.tradeCount, row.ruleComplianceBps, row.tier],
    );
  }
  await client.query(
    `UPDATE academy_arena_league_snapshots
        SET status = 'finalized', finalized_at = NOW()
      WHERE id = $1::uuid AND status = 'provisional'`,
    [snapshotId],
  );
  return { snapshotId, windowType: input.windowType, windowKey: input.windowKey,
    version, participantCount: ranked.length, sourceDigest: digest,
    sourceCutoffAt: cutoffIso, replayed: false };
}

export async function materializeArenaLeagueRankingSnapshot(input: {
  tenantId: string;
  workspaceId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  sourceCutoffAt: Date;
}): Promise<ArenaLeagueRankingSnapshotResult> {
  if (!input.tenantId.trim() || !input.workspaceId.trim()) {
    throw new Error("arena_ranking_scope_invalid");
  }
  const result = await withTx((client) =>
    materializeArenaLeagueRankingSnapshotTx(client, input));
  if (!result.enabled) throw new Error("arena_ranking_database_unavailable");
  return result.value;
}
