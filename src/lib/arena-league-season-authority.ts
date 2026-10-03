import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import {
  ARENA_LEAGUE_RANKING_VISIBILITY,
  assertArenaLeagueSeasonTransition,
  canActivateArenaLeagueSeason,
  canCloseArenaLeagueSeason,
  canEnrollInArenaLeagueSeason,
  canFinalizeArenaLeagueSeason,
  canOpenArenaLeagueEnrollment,
  digestArenaLeagueSeasonConfig,
  normalizeArenaLeagueSeasonConfig,
  type ArenaLeagueSeasonConfig,
  type ArenaLeagueSeasonConfigInput,
  type ArenaLeagueSeasonLifecycle,
} from "@/lib/arena-league-season-policy";
import { applyArenaLeagueTenantScope } from "@/lib/arena-league-tenant-scope";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,79}$/;

export type ArenaLeagueSeasonScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

export type ArenaLeagueSeasonRecord = Readonly<{
  id: string;
  tenantId: string;
  workspaceId: string;
  config: ArenaLeagueSeasonConfig;
  configDigest: string;
  lifecycle: ArenaLeagueSeasonLifecycle;
  createdAt: string;
  enrollmentOpenedAt: string | null;
  activatedAt: string | null;
  closingStartedAt: string | null;
  finalizedAt: string | null;
}>;

export type ArenaLeagueEnrollmentRecord = Readonly<{
  id: string;
  seasonId: string;
  tenantId: string;
  workspaceId: string;
  studentId: string;
  status: "enrolled" | "withdrawn" | "disqualified";
  enrolledAt: string;
  statusUpdatedAt: string;
  reasonCode: string | null;
}>;

type SeasonRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  season_key: string;
  policy_version: string;
  scoring_policy_version: string;
  timezone: string;
  enrollment_opens_at: string;
  enrollment_closes_at: string;
  starts_at: string;
  ends_at: string;
  initial_balance: string;
  attempts_per_cycle: number;
  ranking_visibility: string;
  status: ArenaLeagueSeasonLifecycle;
  config_digest: string;
  created_at: string;
  enrollment_opened_at: string | null;
  activated_at: string | null;
  closing_started_at: string | null;
  finalized_at: string | null;
};

type EnrollmentRow = {
  id: string;
  season_id: string;
  tenant_id: string;
  workspace_id: string;
  student_id: string;
  status: "enrolled" | "withdrawn" | "disqualified";
  enrolled_at: string;
  status_updated_at: string;
  reason_code: string | null;
};

function validateScope(scope: ArenaLeagueSeasonScope): void {
  if (!scope.tenantId.trim() || !scope.workspaceId.trim()) {
    throw new Error("arena_season_scope_invalid");
  }
}

function validateUuid(value: string, name: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`arena_season_${name}_invalid`);
}

function seasonConfigFromRow(row: SeasonRow): ArenaLeagueSeasonConfig {
  const config = normalizeArenaLeagueSeasonConfig({
    seasonKey: row.season_key,
    timeZone: row.timezone,
    enrollmentOpensAt: new Date(row.enrollment_opens_at).toISOString(),
    enrollmentClosesAt: new Date(row.enrollment_closes_at).toISOString(),
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    scoringPolicyVersion: row.scoring_policy_version,
    initialBalance: row.initial_balance,
    attemptsPerCycle: Number(row.attempts_per_cycle),
  });
  if (row.policy_version !== config.policyVersion || row.ranking_visibility !== ARENA_LEAGUE_RANKING_VISIBILITY) {
    throw new Error("arena_season_persisted_policy_invalid");
  }
  return config;
}

function mapSeason(row: SeasonRow): ArenaLeagueSeasonRecord {
  const config = seasonConfigFromRow(row);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    config,
    configDigest: row.config_digest,
    lifecycle: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    enrollmentOpenedAt: row.enrollment_opened_at ? new Date(row.enrollment_opened_at).toISOString() : null,
    activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null,
    closingStartedAt: row.closing_started_at ? new Date(row.closing_started_at).toISOString() : null,
    finalizedAt: row.finalized_at ? new Date(row.finalized_at).toISOString() : null,
  };
}

function mapEnrollment(row: EnrollmentRow): ArenaLeagueEnrollmentRecord {
  return {
    id: row.id,
    seasonId: row.season_id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    studentId: row.student_id,
    status: row.status,
    enrolledAt: new Date(row.enrolled_at).toISOString(),
    statusUpdatedAt: new Date(row.status_updated_at).toISOString(),
    reasonCode: row.reason_code,
  };
}

async function lockSeason(client: PoolClient, scope: ArenaLeagueSeasonScope, seasonId: string): Promise<SeasonRow> {
  validateScope(scope);
  await applyArenaLeagueTenantScope(client, scope);
  validateUuid(seasonId, "id");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `arena-season:${scope.tenantId}:${scope.workspaceId}`,
    seasonId,
  ]);
  const result = await client.query<SeasonRow>(
    `SELECT id::text, tenant_id, workspace_id, season_key, policy_version,
            scoring_policy_version, timezone,
            enrollment_opens_at::text, enrollment_closes_at::text,
            starts_at::text, ends_at::text, initial_balance::text,
            attempts_per_cycle, ranking_visibility, status, config_digest,
            created_at::text, enrollment_opened_at::text, activated_at::text,
            closing_started_at::text, finalized_at::text
       FROM academy_arena_league_seasons
      WHERE id = $1::uuid AND tenant_id = $2 AND workspace_id = $3
      FOR UPDATE`,
    [seasonId, scope.tenantId, scope.workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("arena_season_not_found");
  return row;
}

export async function createArenaLeagueSeasonTx(
  client: PoolClient,
  scope: ArenaLeagueSeasonScope,
  input: ArenaLeagueSeasonConfigInput,
): Promise<ArenaLeagueSeasonRecord> {
  validateScope(scope);
  await applyArenaLeagueTenantScope(client, scope);
  const config = normalizeArenaLeagueSeasonConfig(input);
  const digest = digestArenaLeagueSeasonConfig(input);
  const id = randomUUID();
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `arena-season-key:${scope.tenantId}:${scope.workspaceId}`,
    config.seasonKey,
  ]);
  const result = await client.query<SeasonRow>(
    `INSERT INTO academy_arena_league_seasons
       (id, tenant_id, workspace_id, season_key, policy_version, scoring_policy_version,
        timezone, enrollment_opens_at, enrollment_closes_at, starts_at, ends_at,
        initial_balance, attempts_per_cycle, ranking_visibility, status, config_digest)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz,
             $10::timestamptz, $11::timestamptz, $12::numeric, $13, $14, 'draft', $15)
     RETURNING id::text, tenant_id, workspace_id, season_key, policy_version,
       scoring_policy_version, timezone, enrollment_opens_at::text,
       enrollment_closes_at::text, starts_at::text, ends_at::text, initial_balance::text,
       attempts_per_cycle, ranking_visibility, status, config_digest, created_at::text,
       enrollment_opened_at::text, activated_at::text, closing_started_at::text, finalized_at::text`,
    [id, scope.tenantId, scope.workspaceId, config.seasonKey, config.policyVersion,
      config.scoringPolicyVersion, config.timeZone, config.enrollmentOpensAt,
      config.enrollmentClosesAt, config.startsAt, config.endsAt, config.initialBalance,
      config.attemptsPerCycle, config.rankingVisibility, digest],
  );
  return mapSeason(result.rows[0]);
}

export async function createArenaLeagueSeason(
  scope: ArenaLeagueSeasonScope,
  input: ArenaLeagueSeasonConfigInput,
): Promise<ArenaLeagueSeasonRecord> {
  const result = await withTx((client) => createArenaLeagueSeasonTx(client, scope, input));
  if (!result.enabled) throw new Error("arena_season_database_unavailable");
  return result.value;
}

function transitionAllowedAt(row: SeasonRow, to: ArenaLeagueSeasonLifecycle, at: string): boolean {
  const config = seasonConfigFromRow(row);
  const input = { lifecycle: row.status, config, at };
  switch (to) {
    case "enrollment": return canOpenArenaLeagueEnrollment(input);
    case "active": return canActivateArenaLeagueSeason(input);
    case "closing": return canCloseArenaLeagueSeason(input);
    case "finalized": return canFinalizeArenaLeagueSeason(input);
    case "draft": return false;
  }
}

export async function transitionArenaLeagueSeasonTx(
  client: PoolClient,
  scope: ArenaLeagueSeasonScope,
  seasonId: string,
  to: ArenaLeagueSeasonLifecycle,
  at: string,
): Promise<ArenaLeagueSeasonRecord> {
  const current = await lockSeason(client, scope, seasonId);
  assertArenaLeagueSeasonTransition(current.status, to);
  if (!transitionAllowedAt(current, to, at)) {
    throw new Error(`arena_season_transition_time_invalid:${current.status}:${to}`);
  }

  const timestampColumn =
    to === "enrollment" ? "enrollment_opened_at" :
    to === "active" ? "activated_at" :
    to === "closing" ? "closing_started_at" :
    to === "finalized" ? "finalized_at" : null;
  if (!timestampColumn) throw new Error("arena_season_transition_target_invalid");

  const result = await client.query<SeasonRow>(
    `UPDATE academy_arena_league_seasons
        SET status = $4, ${timestampColumn} = $5::timestamptz
      WHERE id = $1::uuid AND tenant_id = $2 AND workspace_id = $3 AND status = $6
      RETURNING id::text, tenant_id, workspace_id, season_key, policy_version,
        scoring_policy_version, timezone, enrollment_opens_at::text,
        enrollment_closes_at::text, starts_at::text, ends_at::text, initial_balance::text,
        attempts_per_cycle, ranking_visibility, status, config_digest, created_at::text,
        enrollment_opened_at::text, activated_at::text, closing_started_at::text, finalized_at::text`,
    [seasonId, scope.tenantId, scope.workspaceId, to, at, current.status],
  );
  const row = result.rows[0];
  if (!row) throw new Error("arena_season_transition_conflict");
  return mapSeason(row);
}

export async function transitionArenaLeagueSeason(
  scope: ArenaLeagueSeasonScope,
  seasonId: string,
  to: ArenaLeagueSeasonLifecycle,
  at: string,
): Promise<ArenaLeagueSeasonRecord> {
  const result = await withTx((client) => transitionArenaLeagueSeasonTx(client, scope, seasonId, to, at));
  if (!result.enabled) throw new Error("arena_season_database_unavailable");
  return result.value;
}

export async function enrollArenaLeagueSeasonTx(
  client: PoolClient,
  scope: ArenaLeagueSeasonScope,
  input: { seasonId: string; studentId: string; enrolledAt: string },
): Promise<ArenaLeagueEnrollmentRecord> {
  validateUuid(input.studentId, "student_id");
  const season = await lockSeason(client, scope, input.seasonId);
  const config = seasonConfigFromRow(season);
  if (!canEnrollInArenaLeagueSeason({ lifecycle: season.status, config, at: input.enrolledAt })) {
    throw new Error("arena_season_enrollment_window_closed");
  }
  const result = await client.query<EnrollmentRow>(
    `INSERT INTO academy_arena_league_enrollments
       (id, season_id, tenant_id, workspace_id, principal_type, principal_id,
        student_id, status, enrolled_at, status_updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, 'student', $5::uuid::text, $5::uuid,
             'enrolled', $6::timestamptz, $6::timestamptz)
     RETURNING id::text, season_id::text, tenant_id, workspace_id, student_id::text,
       status, enrolled_at::text, status_updated_at::text, reason_code`,
    [randomUUID(), input.seasonId, scope.tenantId, scope.workspaceId,
      input.studentId, input.enrolledAt],
  );
  return mapEnrollment(result.rows[0]);
}

export async function changeArenaLeagueEnrollmentStatusTx(
  client: PoolClient,
  scope: ArenaLeagueSeasonScope,
  input: {
    seasonId: string;
    studentId: string;
    status: "withdrawn" | "disqualified";
    reasonCode: string;
  },
): Promise<ArenaLeagueEnrollmentRecord> {
  validateScope(scope);
  await applyArenaLeagueTenantScope(client, scope);
  validateUuid(input.seasonId, "id");
  validateUuid(input.studentId, "student_id");
  if (!REASON_PATTERN.test(input.reasonCode)) throw new Error("arena_season_enrollment_reason_invalid");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `arena-enrollment:${scope.tenantId}:${scope.workspaceId}:${input.seasonId}`,
    input.studentId,
  ]);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    `arena-season:${scope.tenantId}:${scope.workspaceId}`, input.seasonId,
  ]);
  const season = await client.query<{ status: ArenaLeagueSeasonLifecycle }>(
    `SELECT status FROM academy_arena_league_seasons
      WHERE id = $1::uuid AND tenant_id = $2 AND workspace_id = $3 FOR SHARE`,
    [input.seasonId, scope.tenantId, scope.workspaceId],
  );
  if (!season.rows[0]) throw new Error("arena_season_not_found");
  if (season.rows[0].status === "finalized") {
    throw new Error("arena_season_enrollment_season_finalized");
  }
  const finalized = await client.query<{ id: string }>(
    `SELECT id::text FROM academy_arena_league_snapshots
      WHERE tenant_id = $1 AND workspace_id = $2 AND season_id = $3::uuid
        AND status = 'finalized' LIMIT 1`,
    [scope.tenantId, scope.workspaceId, input.seasonId],
  );
  if (finalized.rows[0]) throw new Error("arena_season_enrollment_snapshot_finalized");
  const result = await client.query<EnrollmentRow>(
    `UPDATE academy_arena_league_enrollments
        SET status = $5, reason_code = $6
      WHERE season_id = $1::uuid AND tenant_id = $2 AND workspace_id = $3
        AND student_id = $4::uuid AND status = 'enrolled'
      RETURNING id::text, season_id::text, tenant_id, workspace_id, student_id::text,
        status, enrolled_at::text, status_updated_at::text, reason_code`,
    [input.seasonId, scope.tenantId, scope.workspaceId, input.studentId,
      input.status, input.reasonCode],
  );
  const row = result.rows[0];
  if (!row) throw new Error("arena_season_enrollment_transition_conflict");
  return mapEnrollment(row);
}
