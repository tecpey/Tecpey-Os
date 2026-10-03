import "server-only";

import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { AvailableTenantPrincipalContext } from "@/lib/security/tenant-principal-context";
import type { ArenaLeagueTier } from "@/lib/arena-league-scoring-policy";
import type { ArenaLeagueWindowType } from "@/lib/arena-league-ranking-materializer";

export const ARENA_LEAGUE_LEADERBOARD_POLICY_VERSION =
  "arena-league-leaderboard-consent-v1";

export type ArenaLeagueLeaderboardEntry = {
  publicProfileId: string;
  publicStudentId: string;
  displayName: string;
  username: string;
  avatar: string;
  rank: number;
  points: number;
  tradeCount: number;
  ruleComplianceBps: number;
  tier: ArenaLeagueTier;
};

export type ArenaLeagueLeaderboard = {
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  snapshotVersion: number;
  sourceCutoffAt: string;
  generatedAt: string;
  participantCount: number;
  visibleCount: number;
  entries: ArenaLeagueLeaderboardEntry[];
  policyVersion: typeof ARENA_LEAGUE_LEADERBOARD_POLICY_VERSION;
};

export type ArenaLeagueNeighborhood = {
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  snapshotVersion: number;
  viewer: Pick<ArenaLeagueLeaderboardEntry, "rank" | "points" | "tradeCount" | "tier"> | null;
  // Only public profiles with active scoring consent can appear here.
  entries: ArenaLeagueLeaderboardEntry[];
};

type LeaderboardRow = {
  version: number;
  source_cutoff_at: Date | string;
  generated_at: Date | string;
  participant_count: number;
  public_profile_id: string;
  public_student_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar: string | null;
  rank: number;
  points: number;
  trade_count: number;
  rule_compliance_bps: number;
  tier: ArenaLeagueTier;
};

const WINDOW_KEY_PATTERN: Record<ArenaLeagueWindowType, RegExp> = {
  monthly: /^\d{4}-(0[1-9]|1[0-2])$/,
  yearly: /^\d{4}$/,
  lifetime: /^all-time$/,
};
const STUDENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertContext(context: AvailableTenantPrincipalContext): void {
  if (context.principalType !== "student" || !context.principalId ||
      !context.scopes.includes("community:profile:read")) {
    throw new Error("arena_leaderboard_context_invalid");
  }
}

export async function loadArenaLeagueNeighborhoodTx(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  studentId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  snapshotVersion: number;
}): Promise<ArenaLeagueNeighborhood | null> {
  if (!STUDENT_ID_PATTERN.test(input.studentId) ||
      !WINDOW_KEY_PATTERN[input.windowType].test(input.windowKey) ||
      !Number.isSafeInteger(input.snapshotVersion) || input.snapshotVersion < 1) {
    throw new Error("arena_leaderboard_neighborhood_input_invalid");
  }
  const selected = await client.query<{
    id: string; rank: number | null; points: number | null;
    trade_count: number | null; tier: ArenaLeagueTier | null;
  }>(
    `SELECT snapshot.id::text, ranking.rank, ranking.points, ranking.trade_count, ranking.tier
       FROM academy_arena_league_snapshots snapshot
       LEFT JOIN academy_arena_league_rankings ranking
         ON ranking.snapshot_id = snapshot.id
        AND ranking.tenant_id = snapshot.tenant_id
        AND ranking.workspace_id = snapshot.workspace_id
        AND ranking.student_id = $5::uuid
      WHERE snapshot.tenant_id = $1 AND snapshot.workspace_id = $2
        AND snapshot.window_type = $3 AND snapshot.window_key = $4
        AND snapshot.version = $6 AND snapshot.status = 'finalized'
        AND snapshot.season_id IS NULL
      LIMIT 1`,
    [input.tenantId, input.workspaceId, input.windowType, input.windowKey,
      input.studentId, input.snapshotVersion],
  );
  const own = selected.rows[0];
  if (!own) return null;
  if (own.rank === null) {
    return { windowType: input.windowType, windowKey: input.windowKey,
      snapshotVersion: input.snapshotVersion, viewer: null, entries: [] };
  }
  const near = await client.query<LeaderboardRow>(
    `WITH nearby AS (
       (SELECT ranking.student_id, ranking.rank, ranking.points, ranking.trade_count,
               ranking.rule_compliance_bps, ranking.tier,
               profile.public_profile_id, cartax.public_student_id,
               student.display_name, student.username, student.avatar
          FROM academy_arena_league_rankings ranking
          JOIN academy_public_profiles profile
            ON profile.tenant_id = ranking.tenant_id
           AND profile.workspace_id = ranking.workspace_id
           AND profile.student_id = ranking.student_id
           AND profile.visibility = 'public' AND profile.leaderboard_visible = TRUE
           AND profile.consent_version = 'community-profile-consent-v1'
           AND profile.consented_at IS NOT NULL
          JOIN academy_community_reputation_scoring_consents consent
            ON consent.public_profile_id = profile.public_profile_id
           AND consent.tenant_id = ranking.tenant_id
           AND consent.workspace_id = ranking.workspace_id
           AND consent.student_id = ranking.student_id
           AND consent.enabled = TRUE
           AND consent.consent_version = 'community-reputation-scoring-consent-v1'
           AND consent.consented_at IS NOT NULL
          JOIN academy_students student ON student.id = ranking.student_id
          LEFT JOIN academy_student_cartax cartax ON cartax.student_id = ranking.student_id
         WHERE ranking.snapshot_id = $1::uuid
           AND ranking.tenant_id = $2 AND ranking.workspace_id = $3
           AND ranking.rank < $4
         ORDER BY ranking.rank DESC LIMIT 2)
       UNION ALL
       (SELECT ranking.student_id, ranking.rank, ranking.points, ranking.trade_count,
               ranking.rule_compliance_bps, ranking.tier,
               profile.public_profile_id, cartax.public_student_id,
               student.display_name, student.username, student.avatar
          FROM academy_arena_league_rankings ranking
          JOIN academy_public_profiles profile
            ON profile.tenant_id = ranking.tenant_id
           AND profile.workspace_id = ranking.workspace_id
           AND profile.student_id = ranking.student_id
           AND profile.visibility = 'public' AND profile.leaderboard_visible = TRUE
           AND profile.consent_version = 'community-profile-consent-v1'
           AND profile.consented_at IS NOT NULL
          JOIN academy_community_reputation_scoring_consents consent
            ON consent.public_profile_id = profile.public_profile_id
           AND consent.tenant_id = ranking.tenant_id
           AND consent.workspace_id = ranking.workspace_id
           AND consent.student_id = ranking.student_id
           AND consent.enabled = TRUE
           AND consent.consent_version = 'community-reputation-scoring-consent-v1'
           AND consent.consented_at IS NOT NULL
          JOIN academy_students student ON student.id = ranking.student_id
          LEFT JOIN academy_student_cartax cartax ON cartax.student_id = ranking.student_id
         WHERE ranking.snapshot_id = $1::uuid
           AND ranking.tenant_id = $2 AND ranking.workspace_id = $3
           AND ranking.rank > $4
         ORDER BY ranking.rank ASC LIMIT 2)
     ) SELECT * FROM nearby ORDER BY rank ASC`,
    [own.id, input.tenantId, input.workspaceId, own.rank],
  );
  return {
    windowType: input.windowType, windowKey: input.windowKey,
    snapshotVersion: input.snapshotVersion,
    viewer: { rank: Number(own.rank), points: Number(own.points),
      tradeCount: Number(own.trade_count), tier: own.tier! },
    entries: near.rows.map((row) => ({
      publicProfileId: row.public_profile_id,
      publicStudentId: row.public_student_id ?? row.public_profile_id,
      displayName: row.display_name?.trim() || "TecPey Learner",
      username: row.username?.trim() || "", avatar: row.avatar?.trim() || "",
      rank: Number(row.rank), points: Number(row.points), tradeCount: Number(row.trade_count),
      ruleComplianceBps: Number(row.rule_compliance_bps), tier: row.tier,
    })),
  };
}

export async function loadArenaLeagueLeaderboardTx(client: PoolClient, input: {
  tenantId: string;
  workspaceId: string;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  limit: number;
}): Promise<ArenaLeagueLeaderboard | null> {
  if (!WINDOW_KEY_PATTERN[input.windowType].test(input.windowKey)) {
    throw new Error("arena_leaderboard_window_invalid");
  }
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new Error("arena_leaderboard_limit_invalid");
  }
  const selected = await client.query<LeaderboardRow>(
    `WITH latest AS (
       SELECT id, version, source_cutoff_at, generated_at, participant_count
         FROM academy_arena_league_snapshots
        WHERE tenant_id = $1 AND workspace_id = $2
          AND window_type = $3 AND window_key = $4 AND status = 'finalized'
          AND season_id IS NULL
        ORDER BY version DESC, finalized_at DESC, id DESC
        LIMIT 1
     )
     SELECT latest.version, latest.source_cutoff_at, latest.generated_at,
            latest.participant_count, profile.public_profile_id::text,
            cartax.public_student_id, student.display_name, student.username, student.avatar,
            ranking.rank, ranking.points, ranking.trade_count,
            ranking.rule_compliance_bps, ranking.tier
       FROM latest
       JOIN academy_arena_league_rankings ranking ON ranking.snapshot_id = latest.id
       JOIN academy_public_profiles profile
         ON profile.tenant_id = ranking.tenant_id
        AND profile.workspace_id = ranking.workspace_id
        AND profile.student_id = ranking.student_id
        AND profile.visibility = 'public'
        AND profile.leaderboard_visible = TRUE
        AND profile.consent_version = 'community-profile-consent-v1'
        AND profile.consented_at IS NOT NULL
       JOIN academy_community_reputation_scoring_consents consent
         ON consent.public_profile_id = profile.public_profile_id
        AND consent.tenant_id = ranking.tenant_id
        AND consent.workspace_id = ranking.workspace_id
        AND consent.student_id = ranking.student_id
        AND consent.enabled = TRUE
        AND consent.consent_version = 'community-reputation-scoring-consent-v1'
        AND consent.consented_at IS NOT NULL
       JOIN academy_students student ON student.id = ranking.student_id
       LEFT JOIN academy_student_cartax cartax ON cartax.student_id = ranking.student_id
      ORDER BY ranking.rank ASC
      LIMIT $5`,
    [input.tenantId, input.workspaceId, input.windowType, input.windowKey, input.limit],
  );
  const first = selected.rows[0];
  if (!first) {
    const snapshot = await client.query<Pick<LeaderboardRow,
      "version" | "source_cutoff_at" | "generated_at" | "participant_count">>(
      `SELECT version, source_cutoff_at, generated_at, participant_count
         FROM academy_arena_league_snapshots
        WHERE tenant_id = $1 AND workspace_id = $2
          AND window_type = $3 AND window_key = $4 AND status = 'finalized'
          AND season_id IS NULL
        ORDER BY version DESC, finalized_at DESC, id DESC LIMIT 1`,
      [input.tenantId, input.workspaceId, input.windowType, input.windowKey],
    );
    if (!snapshot.rows[0]) return null;
    return {
      windowType: input.windowType, windowKey: input.windowKey,
      snapshotVersion: Number(snapshot.rows[0].version),
      sourceCutoffAt: new Date(snapshot.rows[0].source_cutoff_at).toISOString(),
      generatedAt: new Date(snapshot.rows[0].generated_at).toISOString(),
      participantCount: Number(snapshot.rows[0].participant_count), visibleCount: 0,
      entries: [], policyVersion: ARENA_LEAGUE_LEADERBOARD_POLICY_VERSION,
    };
  }
  const entries = selected.rows.map((row) => ({
    publicProfileId: row.public_profile_id,
    publicStudentId: row.public_student_id ?? row.public_profile_id,
    displayName: row.display_name?.trim() || "TecPey Learner",
    username: row.username?.trim() || "",
    avatar: row.avatar?.trim() || "",
    rank: Number(row.rank), points: Number(row.points), tradeCount: Number(row.trade_count),
    ruleComplianceBps: Number(row.rule_compliance_bps), tier: row.tier,
  }));
  return {
    windowType: input.windowType, windowKey: input.windowKey,
    snapshotVersion: Number(first.version),
    sourceCutoffAt: new Date(first.source_cutoff_at).toISOString(),
    generatedAt: new Date(first.generated_at).toISOString(),
    participantCount: Number(first.participant_count), visibleCount: entries.length,
    entries, policyVersion: ARENA_LEAGUE_LEADERBOARD_POLICY_VERSION,
  };
}

export async function loadArenaLeagueLeaderboard(input: {
  context: AvailableTenantPrincipalContext;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  limit?: number;
}): Promise<{ available: true; leaderboard: ArenaLeagueLeaderboard | null } |
  { available: false; leaderboard: null }> {
  assertContext(input.context);
  try {
    const result = await withDb((client) => loadArenaLeagueLeaderboardTx(client, {
      tenantId: input.context.tenantId, workspaceId: input.context.workspaceId,
      windowType: input.windowType, windowKey: input.windowKey,
      limit: input.limit ?? 50,
    }));
    return result.enabled
      ? { available: true, leaderboard: result.value }
      : { available: false, leaderboard: null };
  } catch (error) {
    logger.error("[arena-leaderboard] load failed", {
      tenantId: input.context.tenantId, workspaceId: input.context.workspaceId,
      windowType: input.windowType, windowKey: input.windowKey, error: String(error),
    });
    return { available: false, leaderboard: null };
  }
}

export async function loadArenaLeagueNeighborhood(input: {
  context: AvailableTenantPrincipalContext;
  windowType: ArenaLeagueWindowType;
  windowKey: string;
  snapshotVersion: number;
}): Promise<{ available: true; neighborhood: ArenaLeagueNeighborhood | null } |
  { available: false; neighborhood: null }> {
  assertContext(input.context);
  try {
    const result = await withDb((client) => loadArenaLeagueNeighborhoodTx(client, {
      tenantId: input.context.tenantId, workspaceId: input.context.workspaceId,
      studentId: input.context.principalId, windowType: input.windowType,
      windowKey: input.windowKey, snapshotVersion: input.snapshotVersion,
    }));
    return result.enabled
      ? { available: true, neighborhood: result.value }
      : { available: false, neighborhood: null };
  } catch (error) {
    logger.error("[arena-leaderboard] neighborhood load failed", {
      tenantId: input.context.tenantId, workspaceId: input.context.workspaceId,
      windowType: input.windowType, windowKey: input.windowKey, error: String(error),
    });
    return { available: false, neighborhood: null };
  }
}
