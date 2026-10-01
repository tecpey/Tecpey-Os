import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import {
  rankArenaLeagueCandidates,
  type ArenaRankingCandidate,
  type ArenaRankedCandidate,
} from "@/lib/arena-league-ranking-policy";
import { ARENA_LEAGUE_SCORING_POLICY_VERSION } from "@/lib/arena-league-scoring-policy";
import { applyArenaLeagueTenantScope } from "@/lib/arena-league-tenant-scope";

export const ARENA_LEAGUE_RANKING_MATERIALIZER_VERSION =
  "arena-league-ranking-materializer-v1";
export const ARENA_LEAGUE_SEASON_RANKING_MATERIALIZER_VERSION =
  "arena-league-season-ranking-materializer-v1";

export type ArenaLeagueWindowType = "monthly" | "yearly" | "lifetime";

type CandidateRow = {
  student_id: string;
  raw_points: string;
  trade_count: string;
  rule_compliance_bps: string;
  lifetime_points: string;
  finalized_months: string;
};

type ArenaLeagueSeasonRow = {
  id: string;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  scoring_policy_version: string;
};

type RankingMaterializationInput = {
  tenantId: string;
  workspaceId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  sourceCutoffAt: Date;
  seasonId?: string | null;
};

export type ArenaLeagueRankingSnapshotResult = {
  snapshotId: string;
  seasonId: string | null;
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeSeasonId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) throw new Error("arena_ranking_season_id_invalid");
  return normalized.toLowerCase();
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

function maxIso(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function minIso(left: string, right: string): string {
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function sourceDigest(input: {
  tenantId: string;
  workspaceId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  seasonId: string | null;
  cutoff: string;
  ranked: readonly ArenaRankedCandidate[];
}): string {
  return createHash("sha256").update(JSON.stringify({
    authority: input.seasonId
      ? ARENA_LEAGUE_SEASON_RANKING_MATERIALIZER_VERSION
      : ARENA_LEAGUE_RANKING_MATERIALIZER_VERSION,
    ...input,
    ranked: input.ranked.map(({ studentId, rawPoints, tradeCount, ruleComplianceBps,
      lifetimePoints, finalizedMonths, points, rank, tier }) => ({
      studentId, rawPoints, tradeCount, ruleComplianceBps, lifetimePoints,
      finalizedMonths, points, rank, tier,
    })),
  })).digest("hex");
}

function mapCandidates(rows: CandidateRow[]): ArenaRankingCandidate[] {
  return rows.map((row) => ({
    studentId: row.student_id,
    rawPoints: safeInteger(row.raw_points, "raw_points"),
    tradeCount: safeInteger(row.trade_count, "trade_count"),
    ruleComplianceBps: safeInteger(row.rule_compliance_bps, "rule_compliance_bps"),
    lifetimePoints: safeInteger(row.lifetime_points, "lifetime_points"),
    finalizedMonths: safeInteger(row.finalized_months, "finalized_months"),
  }));
}

async function readGenericCandidates(client: PoolClient, input: {
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
  return mapCandidates(result.rows);
}

async function readSeasonCandidates(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  cutoff: Date;
  start: string;
  end: string;
  seasonId: string;
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
         JOIN academy_arena_league_enrollments enrollment
           ON enrollment.season_id = $8::uuid
          AND enrollment.tenant_id = score.tenant_id
          AND enrollment.workspace_id = score.workspace_id
          AND enrollment.student_id = score.student_id
          AND enrollment.status = 'enrolled'
        WHERE score.tenant_id = $1
          AND score.workspace_id = $2
          AND score.scored_at >= $3::timestamptz
          AND score.scored_at < LEAST($4::timestamptz, $5::timestamptz)
          AND score.scoring_input->>'seasonId' = $8::uuid::text
        GROUP BY score.student_id
     ), lifetime AS (
       SELECT score.student_id, SUM(score.total_points)::bigint AS lifetime_points
         FROM academy_arena_trade_score_ledger score
         JOIN academy_arena_league_seasons historical_season
           ON historical_season.id::text = score.scoring_input->>'seasonId'
          AND historical_season.tenant_id = score.tenant_id
          AND historical_season.workspace_id = score.workspace_id
         JOIN academy_arena_league_enrollments historical_enrollment
           ON historical_enrollment.season_id = historical_season.id
          AND historical_enrollment.tenant_id = score.tenant_id
          AND historical_enrollment.workspace_id = score.workspace_id
          AND historical_enrollment.student_id = score.student_id
          AND historical_enrollment.status = 'enrolled'
        WHERE score.tenant_id = $1
          AND score.workspace_id = $2
          AND score.scored_at < $5::timestamptz
        GROUP BY score.student_id
     ), finalized AS (
       SELECT ranking.student_id, COUNT(DISTINCT snapshot.window_key)::bigint AS finalized_months
         FROM academy_arena_league_rankings ranking
         JOIN academy_arena_league_snapshots snapshot ON snapshot.id = ranking.snapshot_id
        WHERE snapshot.tenant_id = $1
          AND snapshot.workspace_id = $2
          AND snapshot.season_id IS NOT NULL
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
      input.cutoff.toISOString(), input.windowType, input.windowKey, input.seasonId],
  );
  return mapCandidates(result.rows);
}

async function loadSeasonScope(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  seasonId: string;
  requestedCutoff: Date;
  bounds: { start: string; end: string };
}): Promise<{ cutoff: Date; start: string; end: string }> {
  const result = await client.query<ArenaLeagueSeasonRow>(
    `SELECT id::text, status, starts_at, ends_at, scoring_policy_version
       FROM academy_arena_league_seasons
      WHERE tenant_id = $1 AND workspace_id = $2 AND id = $3::uuid
      FOR KEY SHARE`,
    [input.tenantId, input.workspaceId, input.seasonId],
  );
  const season = result.rows[0];
  if (!season) throw new Error("arena_ranking_season_not_found");
  if (season.scoring_policy_version !== ARENA_LEAGUE_SCORING_POLICY_VERSION) {
    throw new Error("arena_ranking_season_scoring_policy_unsupported");
  }
  if (season.status !== "closing" && season.status !== "finalized") {
    throw new Error("arena_ranking_season_not_closed");
  }
  const seasonStart = new Date(season.starts_at).toISOString();
  const seasonEnd = new Date(season.ends_at).toISOString();
  if (input.requestedCutoff.getTime() < new Date(seasonEnd).getTime()) {
    throw new Error("arena_ranking_season_cutoff_before_end");
  }
  const start = maxIso(input.bounds.start, seasonStart);
  const end = minIso(input.bounds.end, seasonEnd);
  if (new Date(start).getTime() >= new Date(end).getTime()) {
    throw new Error("arena_ranking_season_window_mismatch");
  }
  return { cutoff: new Date(seasonEnd), start, end };
}

export async function materializeArenaLeagueRankingSnapshotTx(
  client: PoolClient,
  input: RankingMaterializationInput,
): Promise<ArenaLeagueRankingSnapshotResult> {
  if (!input.tenantId.trim() || !input.workspaceId.trim()) {
    throw new Error("arena_ranking_scope_invalid");
  }
  await applyArenaLeagueTenantScope(client, input);
  const requestedCutoff = normalizeCutoff(input.sourceCutoffAt);
  const seasonId = normalizeSeasonId(input.seasonId);
  const window = windowBounds(input.windowType, input.windowKey);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `arena-ranking:${input.tenantId}:${input.workspaceId}`,
    seasonId
      ? `${input.windowType}:${input.windowKey}:season:${seasonId}`
      : `${input.windowType}:${input.windowKey}`,
  ]);
  if (seasonId) {
    // Serialize enrollment transitions with the read of eligible candidates
    // and the immutable snapshot finalization in this same transaction.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      `arena-season:${input.tenantId}:${input.workspaceId}`, seasonId,
    ]);
  }

  const scope = seasonId
    ? await loadSeasonScope(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      seasonId,
      requestedCutoff,
      bounds: window,
    })
    : { cutoff: requestedCutoff, ...window };

  const candidates = seasonId
    ? await readSeasonCandidates(client, { ...input, seasonId, ...scope })
    : await readGenericCandidates(client, { ...input, ...scope });
  const ranked = rankArenaLeagueCandidates(candidates, input.windowType);
  const cutoffIso = scope.cutoff.toISOString();
  const digest = sourceDigest({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    windowType: input.windowType,
    windowKey: input.windowKey,
    seasonId,
    cutoff: cutoffIso,
    ranked,
  });

  const replay = await client.query<{ id: string; version: number }>(
    `SELECT id::text, version
       FROM academy_arena_league_snapshots
      WHERE tenant_id = $1 AND workspace_id = $2 AND window_type = $3
        AND window_key = $4 AND status = 'finalized' AND source_digest = $5
        AND (($6::uuid IS NULL AND season_id IS NULL) OR season_id = $6::uuid)
      ORDER BY version DESC LIMIT 1`,
    [input.tenantId, input.workspaceId, input.windowType, input.windowKey, digest, seasonId],
  );
  if (replay.rows[0]) return {
    snapshotId: replay.rows[0].id,
    seasonId,
    windowType: input.windowType,
    windowKey: input.windowKey,
    version: Number(replay.rows[0].version),
    participantCount: ranked.length,
    sourceDigest: digest,
    sourceCutoffAt: cutoffIso,
    replayed: true,
  };

  const conflictingFinalized = await client.query<{ id: string }>(
    `SELECT id::text
       FROM academy_arena_league_snapshots
      WHERE tenant_id = $1 AND workspace_id = $2 AND window_type = $3
        AND window_key = $4 AND status = 'finalized'
        AND (($5::uuid IS NULL AND season_id IS NULL) OR season_id = $5::uuid)
      ORDER BY version DESC LIMIT 1`,
    [input.tenantId, input.workspaceId, input.windowType, input.windowKey, seasonId],
  );
  if (conflictingFinalized.rows[0]) {
    throw new Error("arena_ranking_finalized_snapshot_conflict");
  }

  const versionResult = await client.query<{ version: number }>(
    `SELECT COALESCE(MAX(version), 0)::integer + 1 AS version
       FROM academy_arena_league_snapshots
      WHERE tenant_id = $1 AND workspace_id = $2 AND window_type = $3 AND window_key = $4
        AND (($5::uuid IS NULL AND season_id IS NULL) OR season_id = $5::uuid)`,
    [input.tenantId, input.workspaceId, input.windowType, input.windowKey, seasonId],
  );
  const version = Number(versionResult.rows[0]?.version ?? 1);
  const snapshotId = randomUUID();
  await client.query(
    `INSERT INTO academy_arena_league_snapshots
       (id, tenant_id, workspace_id, window_type, window_key, status, version,
        source_cutoff_at, participant_count, source_digest, season_id)
     VALUES ($1::uuid, $2, $3, $4, $5, 'provisional', $6, $7::timestamptz, $8, $9, $10::uuid)`,
    [snapshotId, input.tenantId, input.workspaceId, input.windowType, input.windowKey,
      version, cutoffIso, ranked.length, digest, seasonId],
  );
  for (const row of ranked) {
    await client.query(
      `INSERT INTO academy_arena_league_rankings
         (snapshot_id, tenant_id, workspace_id, principal_id, student_id, rank,
          points, trade_count, rule_compliance_bps, tier)
       VALUES ($1::uuid, $2, $3, $4::text, $10::uuid, $5, $6, $7, $8, $9)`,
      [snapshotId, input.tenantId, input.workspaceId, row.studentId, row.rank,
        row.points, row.tradeCount, row.ruleComplianceBps, row.tier, row.studentId],
    );
  }
  await client.query(
    `UPDATE academy_arena_league_snapshots
        SET status = 'finalized', finalized_at = NOW()
      WHERE id = $1::uuid AND status = 'provisional'`,
    [snapshotId],
  );
  return {
    snapshotId,
    seasonId,
    windowType: input.windowType,
    windowKey: input.windowKey,
    version,
    participantCount: ranked.length,
    sourceDigest: digest,
    sourceCutoffAt: cutoffIso,
    replayed: false,
  };
}

export async function materializeArenaLeagueRankingSnapshot(
  input: RankingMaterializationInput,
): Promise<ArenaLeagueRankingSnapshotResult> {
  if (!input.tenantId.trim() || !input.workspaceId.trim()) {
    throw new Error("arena_ranking_scope_invalid");
  }
  const result = await withTx((client) =>
    materializeArenaLeagueRankingSnapshotTx(client, input));
  if (!result.enabled) throw new Error("arena_ranking_database_unavailable");
  return result.value;
}
