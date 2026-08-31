import type { PoolClient } from "pg";
import {
  academyMasterySeasons,
  scoreAcademyMasterySeasonRecommendations,
  type AcademyMasterySeason,
  type AcademyMasterySeasonRecommendation,
  type LearnerMasterySignals,
} from "@/data/academyMasterySeasons";

export type AcademyMasteryLocale = "fa" | "en";

export type AcademyMasteryAssignment = {
  id: string;
  seasonId: string;
  status: "recommended" | "active" | "completed" | "dismissed" | "expired";
  recommendationScore: number;
  sourceSignals: string[];
  assignedBy: string;
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type AcademyMasterySeasonState = {
  locale: AcademyMasteryLocale;
  completedTerms: number;
  rankingConsent: boolean;
  progressCoreLevel: number;
  signals: LearnerMasterySignals;
  recommendations: Array<{
    season: AcademyMasterySeason;
    score: number;
    matchingSignals: string[];
    eligible: boolean;
    assignment: AcademyMasteryAssignment | null;
  }>;
  assignments: AcademyMasteryAssignment[];
  catalogAuthority: "code-catalog-v1";
  profileAuthority: "server_mastery_v1";
};

type Queryable = Pick<PoolClient, "query">;

const MAX_TAGS = 80;
const ASSIGNMENT_STATUSES = new Set<AcademyMasteryAssignment["status"]>([
  "recommended",
  "active",
  "completed",
  "dismissed",
  "expired",
]);

export type AcademyMasteryTenantScope = {
  tenantId: string;
  workspaceId: string;
};

export function parseAcademyMasteryLocale(value: unknown): AcademyMasteryLocale {
  return value === "en" ? "en" : "fa";
}

function normalizeTag(value: unknown): string | null {
  const tag = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return /^[a-z0-9][a-z0-9._-]{1,79}$/.test(tag) ? tag : null;
}

function normalizeTags(value: unknown): string[] {
  const input = Array.isArray(value) ? value : [];
  return [...new Set(input.map(normalizeTag).filter((item): item is string => Boolean(item)))]
    .slice(0, MAX_TAGS);
}

function assignmentFromRow(row: Record<string, unknown>): AcademyMasteryAssignment {
  return {
    id: String(row.id),
    seasonId: String(row.season_id),
    status: row.status as AcademyMasteryAssignment["status"],
    recommendationScore: Number(row.recommendation_score) || 0,
    sourceSignals: normalizeTags(row.source_signals),
    assignedBy: String(row.assigned_by || "server_mastery_v1"),
    assignedAt: new Date(String(row.assigned_at)).toISOString(),
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function assignmentFromSnapshot(value: unknown): AcademyMasteryAssignment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const seasonId = normalizeTag(row.seasonId);
  const status = String(row.status ?? "") as AcademyMasteryAssignment["status"];
  const id = String(row.id ?? "").trim();
  const assignedAt = String(row.assignedAt ?? "").trim();
  const updatedAt = String(row.updatedAt ?? "").trim();
  if (!id || !seasonId || !ASSIGNMENT_STATUSES.has(status) || !assignedAt || !updatedAt) {
    return null;
  }
  return {
    id,
    seasonId,
    status,
    recommendationScore: Number(row.recommendationScore) || 0,
    sourceSignals: normalizeTags(row.sourceSignals),
    assignedBy: String(row.assignedBy || "server_mastery_v1"),
    assignedAt,
    startedAt: row.startedAt ? String(row.startedAt) : null,
    completedAt: row.completedAt ? String(row.completedAt) : null,
    updatedAt,
  };
}

function scoreCap(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeIdempotencyKey(value: string | null | undefined): string | null {
  const key = String(value ?? "").trim();
  if (key.length < 8) return null;
  return key.slice(0, 160);
}

function progressCoreLevel(completedTerms: number, assignments: AcademyMasteryAssignment[]): number {
  const termScore = Math.round((Math.max(0, Math.min(7, completedTerms)) / 7) * 70);
  const completedSeasonScore = Math.min(
    20,
    assignments.filter((assignment) => assignment.status === "completed").length * 4,
  );
  const activeSeasonScore = assignments.some((assignment) => assignment.status === "active") ? 5 : 0;
  return scoreCap(termScore + completedSeasonScore + activeSeasonScore);
}

export function buildAcademyMasterySeasonState(input: {
  locale: AcademyMasteryLocale;
  completedTerms: number;
  profileTags?: Partial<Omit<LearnerMasterySignals, "completedTerms">>;
  rankingConsent?: boolean;
  assignments?: AcademyMasteryAssignment[];
  limit?: number;
}): AcademyMasterySeasonState {
  const completedTerms = Math.max(0, Math.min(7, Math.floor(Number(input.completedTerms) || 0)));
  const signals: LearnerMasterySignals = {
    completedTerms,
    weakConceptTags: normalizeTags(input.profileTags?.weakConceptTags),
    arenaRiskFlags: normalizeTags(input.profileTags?.arenaRiskFlags),
    mentorTopicTags: normalizeTags(input.profileTags?.mentorTopicTags),
    marketInterestTags: normalizeTags(input.profileTags?.marketInterestTags),
  };
  const assignments = input.assignments ?? [];
  const assignmentsBySeason = new Map<string, AcademyMasteryAssignment>();
  for (const assignment of assignments) {
    // readAssignments is newest-first. Keep the first row for a season so a
    // historical completed/expired assignment cannot shadow its current run.
    if (!assignmentsBySeason.has(assignment.seasonId)) {
      assignmentsBySeason.set(assignment.seasonId, assignment);
    }
  }
  const recommendations = scoreAcademyMasterySeasonRecommendations(signals)
    .slice(0, Math.max(1, input.limit ?? academyMasterySeasons.length))
    .map((recommendation: AcademyMasterySeasonRecommendation) => ({
      season: recommendation.season,
      score: scoreCap(recommendation.score),
      matchingSignals: recommendation.matchingSignals,
      eligible: recommendation.eligible,
      assignment: assignmentsBySeason.get(recommendation.season.id) ?? null,
    }));

  return {
    locale: input.locale,
    completedTerms,
    rankingConsent: Boolean(input.rankingConsent),
    progressCoreLevel: progressCoreLevel(completedTerms, assignments),
    signals,
    recommendations,
    assignments,
    catalogAuthority: "code-catalog-v1",
    profileAuthority: "server_mastery_v1",
  };
}

async function readCompletedTerms(
  client: Queryable,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  locale: AcademyMasteryLocale,
): Promise<number> {
  const result = await client.query<{ completed_terms: number }>(
    `SELECT COUNT(DISTINCT term_number)::int AS completed_terms
       FROM academy_term_progress
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND student_id = $3::uuid
        AND locale = $4
        AND status = 'passed'
        AND term_number BETWEEN 1 AND 7`,
    [scope.tenantId, scope.workspaceId, studentId, locale],
  );
  return Number(result.rows[0]?.completed_terms || 0);
}

async function readProfile(
  client: Queryable,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  locale: AcademyMasteryLocale,
) {
  const result = await client.query<Record<string, unknown>>(
    `SELECT completed_terms, weak_concept_tags, arena_risk_flags, mentor_topic_tags,
            market_interest_tags, ranking_consent, progress_core_level
       FROM academy_student_mastery_profiles
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND student_id = $3::uuid
        AND locale = $4
      LIMIT 1`,
    [scope.tenantId, scope.workspaceId, studentId, locale],
  );
  return result.rows[0] ?? null;
}

async function readWeaknessSignalTags(
  client: Queryable,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  locale: AcademyMasteryLocale,
) {
  const result = await client.query<{ source_type: string; concept_tag: string; strength: number }>(
    `SELECT source_type, concept_tag, strength
       FROM academy_mastery_weakness_signals
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND student_id = $3::uuid
        AND locale = $4
        AND observed_at >= NOW() - INTERVAL '120 days'
      ORDER BY ABS(strength) DESC, observed_at DESC, id DESC
      LIMIT 80`,
    [scope.tenantId, scope.workspaceId, studentId, locale],
  );
  const weakConceptTags: string[] = [];
  const arenaRiskFlags: string[] = [];
  const mentorTopicTags: string[] = [];
  const marketInterestTags: string[] = [];
  for (const row of result.rows) {
    if (Number(row.strength) >= 0) continue;
    if (row.source_type === "arena") arenaRiskFlags.push(row.concept_tag);
    else if (row.source_type === "mentor") mentorTopicTags.push(row.concept_tag);
    else if (row.source_type === "market") marketInterestTags.push(row.concept_tag);
    else weakConceptTags.push(row.concept_tag);
  }
  return {
    weakConceptTags,
    arenaRiskFlags,
    mentorTopicTags,
    marketInterestTags,
  };
}

async function readAssignments(
  client: Queryable,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  locale: AcademyMasteryLocale,
) {
  const result = await client.query<Record<string, unknown>>(
    `SELECT id::text, season_id, status, recommendation_score, source_signals,
            assigned_by, assigned_at, started_at, completed_at, updated_at
       FROM academy_mastery_season_assignments
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND student_id = $3::uuid
        AND locale = $4
      ORDER BY updated_at DESC, assigned_at DESC
      LIMIT 30`,
    [scope.tenantId, scope.workspaceId, studentId, locale],
  );
  return result.rows.map(assignmentFromRow);
}

async function readActivationReplay(
  client: Queryable,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  locale: AcademyMasteryLocale,
  idempotencyKey: string,
): Promise<AcademyMasteryAssignment | null> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT e.payload->'result'->'assignment' AS replay_assignment,
            a.id::text, a.season_id, a.status, a.recommendation_score, a.source_signals,
            a.assigned_by, a.assigned_at, a.started_at, a.completed_at, a.updated_at
       FROM academy_mastery_season_progress_events e
       JOIN academy_mastery_season_assignments a
         ON a.id = e.assignment_id
        AND a.tenant_id = e.tenant_id
        AND a.workspace_id = e.workspace_id
        AND a.student_id = e.student_id
        AND a.locale = e.locale
      WHERE e.tenant_id = $1
        AND e.workspace_id = $2
        AND e.student_id = $3::uuid
        AND e.locale = $4
        AND e.event_type = 'started'
        AND e.idempotency_key = $5
      ORDER BY e.id ASC
      LIMIT 1`,
    [scope.tenantId, scope.workspaceId, studentId, locale, idempotencyKey],
  );
  const row = result.rows[0];
  if (!row) return null;
  return assignmentFromSnapshot(row.replay_assignment) ?? assignmentFromRow(row);
}

export async function readAcademyMasterySeasonState(
  client: PoolClient,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  locale: AcademyMasteryLocale,
): Promise<AcademyMasterySeasonState> {
  // All four reads share one pooled client, which pg serializes; issuing them
  // through Promise.all only produced a pg@9 concurrent-query deprecation.
  const completedTermsFromTerms = await readCompletedTerms(client, scope, studentId, locale);
  const profile = await readProfile(client, scope, studentId, locale);
  const signalTags = await readWeaknessSignalTags(client, scope, studentId, locale);
  const assignments = await readAssignments(client, scope, studentId, locale);
  const completedTerms = Math.max(
    completedTermsFromTerms,
    Number(profile?.completed_terms || 0),
  );
  return buildAcademyMasterySeasonState({
    locale,
    completedTerms,
    rankingConsent: Boolean(profile?.ranking_consent),
    profileTags: {
      weakConceptTags: [
        ...normalizeTags(profile?.weak_concept_tags),
        ...normalizeTags(signalTags.weakConceptTags),
      ],
      arenaRiskFlags: [
        ...normalizeTags(profile?.arena_risk_flags),
        ...normalizeTags(signalTags.arenaRiskFlags),
      ],
      mentorTopicTags: [
        ...normalizeTags(profile?.mentor_topic_tags),
        ...normalizeTags(signalTags.mentorTopicTags),
      ],
      marketInterestTags: [
        ...normalizeTags(profile?.market_interest_tags),
        ...normalizeTags(signalTags.marketInterestTags),
      ],
    },
    assignments,
  });
}

export async function activateAcademyMasterySeason(input: {
  client: PoolClient;
  scope: AcademyMasteryTenantScope;
  studentId: string;
  locale: AcademyMasteryLocale;
  seasonId: string;
  idempotencyKey?: string | null;
}): Promise<{
  assignment: AcademyMasteryAssignment;
  state: AcademyMasterySeasonState;
  changed: boolean;
}> {
  const seasonId = normalizeTag(input.seasonId);
  if (!seasonId || !academyMasterySeasons.some((season) => season.id === seasonId)) {
    throw new Error("mastery_season_unknown");
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new Error("mastery_idempotency_key_required");
  }
  const replayAssignment = await readActivationReplay(
    input.client,
    input.scope,
    input.studentId,
    input.locale,
    idempotencyKey,
  );
  if (replayAssignment) {
    if (replayAssignment.seasonId !== seasonId) {
      throw new Error("mastery_idempotency_key_conflict");
    }
    return {
      assignment: replayAssignment,
      state: await readAcademyMasterySeasonState(
        input.client,
        input.scope,
        input.studentId,
        input.locale,
      ),
      changed: false,
    };
  }

  const passedCoreTerms = await readCompletedTerms(
    input.client,
    input.scope,
    input.studentId,
    input.locale,
  );
  if (passedCoreTerms !== 7) {
    throw new Error("mastery_core_terms_incomplete");
  }
  const state = await readAcademyMasterySeasonState(input.client, input.scope, input.studentId, input.locale);
  const recommendation = state.recommendations.find((item) => item.season.id === seasonId);
  if (!recommendation || !recommendation.eligible) {
    throw new Error("mastery_season_not_eligible");
  }
  if (recommendation.assignment?.status === "active") {
    return {
      assignment: recommendation.assignment,
      state,
      changed: false,
    };
  }
  if (recommendation.season.kind === "cohort-league" && !state.rankingConsent) {
    throw new Error("mastery_ranking_consent_required");
  }

  const open = await input.client.query<Record<string, unknown>>(
    `UPDATE academy_mastery_season_assignments
        SET status = 'active',
            recommendation_score = GREATEST(recommendation_score, $6),
            source_signals = $7::jsonb,
            assigned_by = 'student',
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND student_id = $3::uuid
        AND locale = $4
        AND season_id = $5
        AND status IN ('recommended', 'active')
      RETURNING id::text, season_id, status, recommendation_score, source_signals,
                assigned_by, assigned_at, started_at, completed_at, updated_at`,
    [
      input.scope.tenantId,
      input.scope.workspaceId,
      input.studentId,
      input.locale,
      seasonId,
      scoreCap(recommendation.score),
      JSON.stringify(recommendation.matchingSignals),
    ],
  );
  const assignmentRow = open.rows[0] ?? (await input.client.query<Record<string, unknown>>(
    `INSERT INTO academy_mastery_season_assignments
       (tenant_id, workspace_id, student_id, locale, season_id, status, recommendation_score, source_signals,
        assigned_by, started_at)
     VALUES ($1, $2, $3::uuid, $4, $5, 'active', $6, $7::jsonb, 'student', NOW())
     RETURNING id::text, season_id, status, recommendation_score, source_signals,
               assigned_by, assigned_at, started_at, completed_at, updated_at`,
    [
      input.scope.tenantId,
      input.scope.workspaceId,
      input.studentId,
      input.locale,
      seasonId,
      scoreCap(recommendation.score),
      JSON.stringify(recommendation.matchingSignals),
    ],
  )).rows[0];
  const assignment = assignmentFromRow(assignmentRow);

  await input.client.query(
    `INSERT INTO academy_mastery_season_progress_events
       (assignment_id, tenant_id, workspace_id, student_id, locale, event_type, idempotency_key, payload)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5, 'started', $6, $7::jsonb)
     ON CONFLICT (assignment_id, event_type, idempotency_key)
       WHERE idempotency_key IS NOT NULL
     DO NOTHING`,
    [
      assignmentRow.id,
      input.scope.tenantId,
      input.scope.workspaceId,
      input.studentId,
      input.locale,
      idempotencyKey,
      JSON.stringify({
        idempotencyKey,
        authority: "server_mastery_v1",
        command: {
          locale: input.locale,
          seasonId,
        },
        result: {
          assignment,
        },
      }),
    ],
  );

  return {
    assignment,
    state: await readAcademyMasterySeasonState(input.client, input.scope, input.studentId, input.locale),
    changed: true,
  };
}
