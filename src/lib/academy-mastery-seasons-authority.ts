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
  const assignmentsBySeason = new Map(assignments.map((assignment) => [assignment.seasonId, assignment]));
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

async function readCompletedTerms(client: Queryable, studentId: string, locale: AcademyMasteryLocale): Promise<number> {
  const result = await client.query<{ completed_terms: number }>(
    `SELECT COALESCE(MAX(term_number), 0)::int AS completed_terms
       FROM academy_term_progress
      WHERE student_id = $1::uuid
        AND locale = $2
        AND status = 'passed'`,
    [studentId, locale],
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

export async function readAcademyMasterySeasonState(
  client: PoolClient,
  scope: AcademyMasteryTenantScope,
  studentId: string,
  locale: AcademyMasteryLocale,
): Promise<AcademyMasterySeasonState> {
  const [completedTermsFromTerms, profile, signalTags, assignments] = await Promise.all([
    readCompletedTerms(client, studentId, locale),
    readProfile(client, scope, studentId, locale),
    readWeaknessSignalTags(client, scope, studentId, locale),
    readAssignments(client, scope, studentId, locale),
  ]);
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
}): Promise<{ assignment: AcademyMasteryAssignment; state: AcademyMasterySeasonState }> {
  const seasonId = normalizeTag(input.seasonId);
  if (!seasonId || !academyMasterySeasons.some((season) => season.id === seasonId)) {
    throw new Error("mastery_season_unknown");
  }
  const state = await readAcademyMasterySeasonState(input.client, input.scope, input.studentId, input.locale);
  const recommendation = state.recommendations.find((item) => item.season.id === seasonId);
  if (!recommendation || !recommendation.eligible) {
    throw new Error("mastery_season_not_eligible");
  }
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
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
      }),
    ],
  );

  return {
    assignment: assignmentFromRow(assignmentRow),
    state: await readAcademyMasterySeasonState(input.client, input.scope, input.studentId, input.locale),
  };
}
