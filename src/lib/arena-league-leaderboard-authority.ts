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

function assertContext(context: AvailableTenantPrincipalContext): void {
  if (context.principalType !== "student" || !context.principalId ||
      !context.scopes.includes("community:profile:read")) {
    throw new Error("arena_leaderboard_context_invalid");
  }
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
