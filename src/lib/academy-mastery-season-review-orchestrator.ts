import type { PoolClient } from "pg";
import {
  ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
  reviewGeneratedAcademyMasterySeasonDraft,
  type AcademyGeneratedMasterySeasonDraft,
  type AcademyMasterySeasonDraftReview,
} from "@/lib/academy-mastery-season-generation";
import type { AcademyMasteryLocale, AcademyMasteryTenantScope } from "@/lib/academy-mastery-seasons-authority";
import { requireCLevelApprovalTx, type CLevelApprovalEvidence } from "@/lib/c-level-control-authority";

export const ACADEMY_MASTERY_REVIEW_DECISIONS = [
  "reject",
  "request_changes",
  "approve_for_catalog",
  "publish",
] as const;

export type AcademyMasteryReviewDecision = typeof ACADEMY_MASTERY_REVIEW_DECISIONS[number];

export type AcademyMasteryGenerationDraftStatus =
  | "draft"
  | "rejected"
  | "review_ready"
  | "approved"
  | "published"
  | "archived";

export type AcademyMasteryGenerationDraftSummary = {
  id: string;
  tenantId: string;
  workspaceId: string;
  locale: AcademyMasteryLocale;
  seasonId: string;
  status: AcademyMasteryGenerationDraftStatus;
  generatedBy: "mentor_ai" | "system" | "human";
  modelName: string | null;
  policyVersion: string;
  sourceCount: number;
  questionCount: number;
  advancedObjectiveCount: number;
  reviewSummary: Record<string, unknown>;
  generatedAt: string;
  updatedAt: string;
};

export type AcademyMasteryReviewDecisionResult = {
  draft: AcademyMasteryGenerationDraftSummary;
  reviewId: string;
  previousStatus: AcademyMasteryGenerationDraftStatus;
  nextStatus: AcademyMasteryGenerationDraftStatus;
  catalogVersion?: number;
  cLevelApproval?: CLevelApprovalEvidence | null;
};

export type AcademyMasteryMentorGovernanceEvidence = {
  policyScore: number;
  personalizationCoverage: number;
  trustedNewsSourceCount: number;
  academyWeaknessSignalCount: number;
  arenaRiskSignalCount: number;
  forbiddenSignalCount: number;
  maxSourceAgeMinutes: number;
  sampledForHumanQa?: boolean;
  humanEscalationReason?: string | null;
};

type Queryable = Pick<PoolClient, "query">;

const TENANT_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const WORKSPACE_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MENTOR_MIN_POLICY_SCORE = 90;
const MENTOR_MIN_PERSONALIZATION_COVERAGE = 60;
const MENTOR_MAX_SOURCE_AGE_MINUTES = 1_440;

function text(value: unknown, max = 2_000): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

function statusFromRow(value: unknown): AcademyMasteryGenerationDraftStatus {
  const status = text(value, 40);
  if (
    status === "draft" ||
    status === "rejected" ||
    status === "review_ready" ||
    status === "approved" ||
    status === "published" ||
    status === "archived"
  ) {
    return status;
  }
  return "draft";
}

function generatedByFromRow(value: unknown): "mentor_ai" | "system" | "human" {
  const generatedBy = text(value, 40);
  return generatedBy === "system" || generatedBy === "human" ? generatedBy : "mentor_ai";
}

function reviewSummary(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function draftFromRow(row: Record<string, unknown>): AcademyMasteryGenerationDraftSummary {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    locale: row.locale === "en" ? "en" : "fa",
    seasonId: String(row.season_id),
    status: statusFromRow(row.status),
    generatedBy: generatedByFromRow(row.generated_by),
    modelName: row.model_name ? String(row.model_name) : null,
    policyVersion: String(row.policy_version),
    sourceCount: Number(row.source_count) || 0,
    questionCount: Number(row.question_count) || 0,
    advancedObjectiveCount: Number(row.advanced_objective_count) || 0,
    reviewSummary: reviewSummary(row.review_summary),
    generatedAt: new Date(String(row.generated_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function normalizeAcademyMasteryTenantScope(input: {
  tenantId: unknown;
  workspaceId: unknown;
}): AcademyMasteryTenantScope | null {
  const tenantId = text(input.tenantId, 80);
  const workspaceId = text(input.workspaceId, 80);
  if (!TENANT_PATTERN.test(tenantId) || !WORKSPACE_PATTERN.test(workspaceId)) return null;
  return { tenantId, workspaceId };
}

export function parseAcademyMasteryReviewDecision(value: unknown): AcademyMasteryReviewDecision | null {
  const decision = text(value, 40);
  return (ACADEMY_MASTERY_REVIEW_DECISIONS as readonly string[]).includes(decision)
    ? decision as AcademyMasteryReviewDecision
    : null;
}

export function nextAcademyMasteryDraftStatus(input: {
  currentStatus: AcademyMasteryGenerationDraftStatus;
  decision: AcademyMasteryReviewDecision;
}): AcademyMasteryGenerationDraftStatus {
  if (input.decision === "reject") return "rejected";
  if (input.decision === "request_changes") return "draft";
  if (input.decision === "approve_for_catalog") return "approved";
  return "published";
}

export function assertAcademyMasteryReviewDecisionAllowed(input: {
  currentStatus: AcademyMasteryGenerationDraftStatus;
  decision: AcademyMasteryReviewDecision;
}): void {
  if (input.currentStatus === "published") throw new Error("draft_already_published");
  if (input.currentStatus === "archived") throw new Error("draft_archived");
  if (input.decision === "approve_for_catalog" && input.currentStatus !== "review_ready") {
    throw new Error("draft_not_review_ready");
  }
  if (input.decision === "publish" && input.currentStatus !== "approved") {
    throw new Error("draft_not_approved_for_publish");
  }
}

function boundedInteger(value: unknown, min: number, max: number): number {
  const integer = Math.floor(Number(value));
  if (!Number.isFinite(integer)) return min;
  return Math.max(min, Math.min(max, integer));
}

function mentorGovernanceEvidence(value: unknown): AcademyMasteryMentorGovernanceEvidence {
  const evidence = reviewSummary(value);
  const normalized: AcademyMasteryMentorGovernanceEvidence = {
    policyScore: boundedInteger(evidence.policyScore, 0, 100),
    personalizationCoverage: boundedInteger(evidence.personalizationCoverage, 0, 100),
    trustedNewsSourceCount: boundedInteger(evidence.trustedNewsSourceCount, 0, 30),
    academyWeaknessSignalCount: boundedInteger(evidence.academyWeaknessSignalCount, 0, 200),
    arenaRiskSignalCount: boundedInteger(evidence.arenaRiskSignalCount, 0, 200),
    forbiddenSignalCount: boundedInteger(evidence.forbiddenSignalCount, 0, 200),
    maxSourceAgeMinutes: boundedInteger(evidence.maxSourceAgeMinutes, 0, 100_000),
    sampledForHumanQa: evidence.sampledForHumanQa === true,
    humanEscalationReason: evidence.humanEscalationReason ? text(evidence.humanEscalationReason, 300) : null,
  };
  if (normalized.policyScore < MENTOR_MIN_POLICY_SCORE) throw new Error("mentor_policy_score_too_low");
  if (normalized.personalizationCoverage < MENTOR_MIN_PERSONALIZATION_COVERAGE) {
    throw new Error("mentor_personalization_coverage_too_low");
  }
  if (normalized.trustedNewsSourceCount < 1) throw new Error("mentor_news_evidence_missing");
  if (normalized.academyWeaknessSignalCount + normalized.arenaRiskSignalCount < 1) {
    throw new Error("mentor_personalization_signal_missing");
  }
  if (normalized.forbiddenSignalCount !== 0) throw new Error("mentor_forbidden_signal_present");
  if (normalized.maxSourceAgeMinutes > MENTOR_MAX_SOURCE_AGE_MINUTES) throw new Error("mentor_news_evidence_stale");
  return normalized;
}

function reviewSummaryFor(review: AcademyMasterySeasonDraftReview): Record<string, unknown> {
  return {
    policyVersion: review.policyVersion,
    status: review.status,
    publishCapability: review.publishCapability,
    sourceCount: review.sourceCount,
    questionCount: review.questionCount,
    advancedObjectiveCount: review.advancedObjectiveCount,
    violations: review.violations,
  };
}

function draftPayloadFor(draft: AcademyGeneratedMasterySeasonDraft): Record<string, unknown> {
  return {
    ...draft as unknown as Record<string, unknown>,
    publishCapability: "mentor_governed_automation",
  };
}

function generatedDraftPayload(value: unknown): AcademyGeneratedMasterySeasonDraft {
  return reviewSummary(value) as unknown as AcademyGeneratedMasterySeasonDraft;
}

function catalogMissions(draft: AcademyGeneratedMasterySeasonDraft): unknown[] {
  return Array.isArray(draft.missions)
    ? draft.missions.map((mission) => ({
        id: mission.id,
        titleFa: mission.titleFa,
        titleEn: mission.titleEn,
        methodFa: mission.methodFa,
        methodEn: mission.methodEn,
        estimatedMinutes: mission.estimatedMinutes,
        questions: mission.questions,
      }))
    : [];
}

export async function listAcademyMasteryGenerationDrafts(
  client: Queryable,
  input: {
    scope: AcademyMasteryTenantScope;
    status?: AcademyMasteryGenerationDraftStatus | "all";
    limit?: number;
  },
): Promise<AcademyMasteryGenerationDraftSummary[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit) || 50)));
  const status = input.status && input.status !== "all" ? input.status : null;
  const result = await client.query<Record<string, unknown>>(
    `SELECT id::text, tenant_id, workspace_id, locale, season_id, status, generated_by,
            model_name, policy_version, source_count, question_count,
            advanced_objective_count, review_summary, generated_at, updated_at
       FROM academy_mastery_season_generation_drafts
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND ($3::text IS NULL OR status = $3)
      ORDER BY updated_at DESC, generated_at DESC
      LIMIT $4`,
    [input.scope.tenantId, input.scope.workspaceId, status, limit],
  );
  return result.rows.map(draftFromRow);
}

export async function submitAcademyMasteryGenerationDraft(
  client: Queryable,
  input: {
    scope: AcademyMasteryTenantScope;
    locale: AcademyMasteryLocale;
    draft: AcademyGeneratedMasterySeasonDraft;
  },
): Promise<{
  draft: AcademyMasteryGenerationDraftSummary;
  review: AcademyMasterySeasonDraftReview;
}> {
  const review = reviewGeneratedAcademyMasterySeasonDraft(input.draft);
  const payload = draftPayloadFor(input.draft);
  const result = await client.query<Record<string, unknown>>(
    `INSERT INTO academy_mastery_season_generation_drafts
       (tenant_id, workspace_id, locale, season_id, status, generated_by, model_name,
        policy_version, source_count, question_count, advanced_objective_count,
        draft_payload, review_summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
     RETURNING id::text, tenant_id, workspace_id, locale, season_id, status, generated_by,
               model_name, policy_version, source_count, question_count,
               advanced_objective_count, review_summary, generated_at, updated_at`,
    [
      input.scope.tenantId,
      input.scope.workspaceId,
      input.locale,
      text(input.draft.id, 100),
      review.status,
      ["mentor_ai", "system", "human"].includes(input.draft.generatedBy)
        ? input.draft.generatedBy
        : "mentor_ai",
      text(input.draft.modelName, 120) || null,
      ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
      review.sourceCount,
      review.questionCount,
      review.advancedObjectiveCount,
      JSON.stringify(payload),
      JSON.stringify(reviewSummaryFor(review)),
    ],
  );
  return {
    draft: draftFromRow(result.rows[0]),
    review,
  };
}

export async function decideAcademyMasteryGenerationDraft(
  client: Queryable,
  input: {
    scope: AcademyMasteryTenantScope;
    draftId: string;
    decision: AcademyMasteryReviewDecision;
    reviewerId: string;
    reviewerType?: "mentor_ai";
    decisionNotes: string;
    mentorGovernance?: AcademyMasteryMentorGovernanceEvidence;
    cLevelApprovalRequestId?: string | null;
  },
): Promise<AcademyMasteryReviewDecisionResult> {
  const draftId = text(input.draftId, 80);
  if (!UUID_PATTERN.test(draftId)) throw new Error("draft_id_invalid");
  const reviewerId = text(input.reviewerId, 160);
  if (reviewerId.length < 3) throw new Error("reviewer_id_invalid");
  const decisionNotes = text(input.decisionNotes, 2_000);
  if (decisionNotes.length < 20) throw new Error("decision_notes_too_short");
  const reviewerType = "mentor_ai";

  const selected = await client.query<Record<string, unknown>>(
    `SELECT id::text, tenant_id, workspace_id, locale, season_id, status, generated_by,
            model_name, policy_version, source_count, question_count,
            advanced_objective_count, review_summary, draft_payload, generated_at, updated_at
       FROM academy_mastery_season_generation_drafts
      WHERE id = $1::uuid
        AND tenant_id = $2
        AND workspace_id = $3
      FOR UPDATE`,
    [draftId, input.scope.tenantId, input.scope.workspaceId],
  );
  const current = selected.rows[0];
  if (!current) throw new Error("draft_not_found");

  const previousStatus = statusFromRow(current.status);
  assertAcademyMasteryReviewDecisionAllowed({ currentStatus: previousStatus, decision: input.decision });
  const nextStatus = nextAcademyMasteryDraftStatus({
    currentStatus: previousStatus,
    decision: input.decision,
  });
  const publishReview = input.decision === "publish"
    ? reviewGeneratedAcademyMasterySeasonDraft(current.draft_payload)
    : null;
  if (publishReview && publishReview.status !== "approved") {
    throw new Error("draft_validation_failed");
  }
  const governance = input.decision === "publish" && reviewerType === "mentor_ai"
    ? mentorGovernanceEvidence(input.mentorGovernance)
    : null;
  const cLevelApproval = input.decision === "publish"
    ? await requireCLevelApprovalTx(client, {
        tenantId: input.scope.tenantId,
        workspaceId: input.scope.workspaceId,
        action: "academy_mastery.publish",
        resourceType: "academy_mastery_season_generation_draft",
        resourceId: draftId,
        approvalRequestId: input.cLevelApprovalRequestId,
      })
    : null;
  const decidedAt = new Date().toISOString();

  const review = await client.query<{ id: string }>(
    `INSERT INTO academy_mastery_season_generation_reviews
       (draft_id, tenant_id, workspace_id, decision, reviewer_type, reviewer_id,
        policy_version, decision_notes, evidence)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id::text`,
    [
      draftId,
      input.scope.tenantId,
      input.scope.workspaceId,
      input.decision,
      reviewerType,
      reviewerId,
      ACADEMY_MASTERY_SEASON_GENERATION_POLICY_VERSION,
      decisionNotes,
      JSON.stringify({
        previousStatus,
        nextStatus,
        sourceCount: Number(current.source_count) || 0,
        questionCount: Number(current.question_count) || 0,
        advancedObjectiveCount: Number(current.advanced_objective_count) || 0,
        mentorGovernance: governance,
        cLevelApproval,
      }),
    ],
  );
  const reviewId = String(review.rows[0]?.id ?? "");
  let catalogVersion: number | undefined;

  if (input.decision === "publish") {
    const payload = generatedDraftPayload(current.draft_payload);
    const catalog = await client.query<{ catalog_version: number }>(
      `INSERT INTO academy_mastery_season_catalog
         (season_id, kind, title_fa, title_en, summary_fa, summary_en,
          recommended_after_term, signal_tags, missions, active,
          catalog_authority, published_draft_id, publication_review_id, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, TRUE,
               $10, $11::uuid, $12::bigint, NOW())
       ON CONFLICT (season_id) DO UPDATE
          SET kind = EXCLUDED.kind,
              title_fa = EXCLUDED.title_fa,
              title_en = EXCLUDED.title_en,
              summary_fa = EXCLUDED.summary_fa,
              summary_en = EXCLUDED.summary_en,
              recommended_after_term = EXCLUDED.recommended_after_term,
              signal_tags = EXCLUDED.signal_tags,
              missions = EXCLUDED.missions,
              active = TRUE,
              catalog_authority = EXCLUDED.catalog_authority,
              published_draft_id = EXCLUDED.published_draft_id,
              publication_review_id = EXCLUDED.publication_review_id,
              published_at = NOW(),
              catalog_version = academy_mastery_season_catalog.catalog_version + 1,
              updated_at = NOW()
       RETURNING catalog_version`,
      [
        payload.id,
        payload.kind,
        payload.titleFa,
        payload.titleEn,
        payload.summaryFa,
        payload.summaryEn,
        payload.recommendedAfterTerm,
        JSON.stringify(payload.signalTags),
        JSON.stringify(catalogMissions(payload)),
        "mentor_governed_generated_v1",
        draftId,
        reviewId,
      ],
    );
    catalogVersion = Number(catalog.rows[0]?.catalog_version || 1);
  }

  const updated = await client.query<Record<string, unknown>>(
    `UPDATE academy_mastery_season_generation_drafts
        SET status = $4,
            review_summary = review_summary || $5::jsonb,
            source_count = COALESCE($6::smallint, source_count),
            question_count = COALESCE($7::smallint, question_count),
            advanced_objective_count = COALESCE($8::smallint, advanced_objective_count),
            updated_at = NOW()
      WHERE id = $1::uuid
        AND tenant_id = $2
        AND workspace_id = $3
      RETURNING id::text, tenant_id, workspace_id, locale, season_id, status, generated_by,
                model_name, policy_version, source_count, question_count,
                advanced_objective_count, review_summary, generated_at, updated_at`,
    [
      draftId,
      input.scope.tenantId,
      input.scope.workspaceId,
      nextStatus,
      JSON.stringify({
        lastDecision: input.decision,
        lastDecisionAt: decidedAt,
        lastReviewerType: reviewerType,
        lastReviewerId: reviewerId,
        lastReviewId: reviewId,
        previousStatus,
        nextStatus,
        catalogVersion,
        mentorGovernance: governance,
        cLevelApproval,
        publishValidationStatus: publishReview?.status ?? null,
      }),
      publishReview?.sourceCount ?? null,
      publishReview?.questionCount ?? null,
      publishReview?.advancedObjectiveCount ?? null,
    ],
  );

  return {
    draft: draftFromRow(updated.rows[0]),
    reviewId,
    previousStatus,
    nextStatus,
    catalogVersion,
    cLevelApproval,
  };
}
