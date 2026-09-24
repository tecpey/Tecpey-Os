import { createHash } from "node:crypto";
import type {
  AiAgentId,
  AiDataClass,
  AiModelProviderId,
} from "./control-plane-catalog";
import type { AiIntelligenceEndpointId } from "./intelligence-endpoint-policy";
import type {
  AiIntelligenceEvalEvidence,
  AiIntelligenceModelCapabilitySnapshot,
} from "./intelligence-model-policy";
import {
  evaluateAiIntelligenceRouteAdmission,
  type AiIntelligenceRouteAdmission,
  type AiIntelligenceRouteRejectionCode,
} from "./intelligence-route-admission";
import {
  aiIntelligenceTaskDefinition,
  type AiIntelligenceTaskId,
} from "./intelligence-task-catalog";

export const AI_MODEL_LAB_POLICY_VERSION = "2026-09-24.1";
export const AI_MODEL_LAB_MIN_CANDIDATES = 2;
export const AI_MODEL_LAB_MAX_CANDIDATES = 6;

export type AiModelLabCandidate = Readonly<{
  endpointId: AiIntelligenceEndpointId;
  capability: AiIntelligenceModelCapabilitySnapshot;
  evalEvidence: AiIntelligenceEvalEvidence | null;
}>;

export const AI_MODEL_LAB_REJECTION_CODES = [
  "invalid_candidate_count",
  "invalid_prompt_digest",
  "duplicate_candidate_identity",
  "route_rejected",
] as const;

export type AiModelLabRejectionCode =
  (typeof AI_MODEL_LAB_REJECTION_CODES)[number];

export type AiModelLabCandidateDecision = Readonly<{
  providerId: AiModelProviderId;
  requestedModel: string;
  canonicalModel: string;
  endpointId: AiIntelligenceEndpointId;
  status: "eligible" | "rejected";
  reasons: readonly (AiModelLabRejectionCode | AiIntelligenceRouteRejectionCode)[];
  admission: AiIntelligenceRouteAdmission;
}>;

export type AiModelLabPlan = Readonly<{
  status: "ready" | "blocked";
  taskId: AiIntelligenceTaskId;
  agentId: AiAgentId;
  dataClass: AiDataClass;
  promptDigest: string;
  eligible: readonly AiModelLabCandidateDecision[];
  rejected: readonly AiModelLabCandidateDecision[];
  globalReasons: readonly AiModelLabRejectionCode[];
  decisionHash: string;
}>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("ai_model_lab_non_finite_policy_value");
  }
  return value;
}

function policyHash(value: unknown): string {
  return createHash("sha256")
    .update("tecpey-ai-model-lab:v1\0")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function candidateIdentity(candidate: AiModelLabCandidate): string {
  return [
    candidate.capability.providerId,
    candidate.endpointId,
    candidate.capability.canonicalModel.trim().toLowerCase(),
  ].join("\0");
}

function decisionIdentity(decision: AiModelLabCandidateDecision): string {
  return [
    decision.providerId,
    decision.endpointId,
    decision.canonicalModel.trim().toLowerCase(),
  ].join("\0");
}

/**
 * Plans a fair Model Lab comparison without executing a provider call.
 *
 * Every candidate is evaluated against the same task, agent, data class,
 * prompt digest, ZDR requirement and time horizon. A model that lacks exact
 * identity, fresh capability/eval evidence, the required tool combination or
 * provider/agent authority remains visible as rejected rather than silently
 * degrading to a different comparison contract.
 */
export function planAiModelLabComparison(input: {
  taskId: AiIntelligenceTaskId;
  agentId: AiAgentId;
  dataClass: AiDataClass;
  promptDigest: string;
  requireZeroDataRetention: boolean;
  candidates: readonly AiModelLabCandidate[];
  nowMs?: number;
  maximumCapabilityAgeDays?: number;
}): AiModelLabPlan {
  const task = aiIntelligenceTaskDefinition(input.taskId);
  const promptDigest = input.promptDigest.trim().toLowerCase();
  const globalReasons: AiModelLabRejectionCode[] = [];

  if (
    input.candidates.length < AI_MODEL_LAB_MIN_CANDIDATES ||
    input.candidates.length > AI_MODEL_LAB_MAX_CANDIDATES
  ) {
    globalReasons.push("invalid_candidate_count");
  }
  if (!SHA256_PATTERN.test(promptDigest)) {
    globalReasons.push("invalid_prompt_digest");
  }

  const counts = new Map<string, number>();
  for (const candidate of input.candidates) {
    const identity = candidateIdentity(candidate);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }

  const decisions: AiModelLabCandidateDecision[] = input.candidates.map((candidate) => {
    const admission = evaluateAiIntelligenceRouteAdmission({
      taskId: input.taskId,
      agentId: input.agentId,
      dataClass: input.dataClass,
      endpointId: candidate.endpointId,
      capability: candidate.capability,
      evalEvidence: candidate.evalEvidence,
      requireZeroDataRetention: input.requireZeroDataRetention,
      nowMs: input.nowMs,
      maximumCapabilityAgeDays: input.maximumCapabilityAgeDays,
    });

    const reasons: Array<AiModelLabRejectionCode | AiIntelligenceRouteRejectionCode> = [];
    if ((counts.get(candidateIdentity(candidate)) ?? 0) > 1) {
      reasons.push("duplicate_candidate_identity");
    }
    if (admission.status === "rejected") {
      reasons.push("route_rejected", ...admission.reasons);
    }

    return Object.freeze({
      providerId: candidate.capability.providerId,
      requestedModel: candidate.capability.requestedModel,
      canonicalModel: candidate.capability.canonicalModel,
      endpointId: candidate.endpointId,
      status: reasons.length === 0 ? "eligible" as const : "rejected" as const,
      reasons: [...new Set(reasons)].sort(),
      admission,
    });
  });

  decisions.sort((left, right) => decisionIdentity(left).localeCompare(decisionIdentity(right)));

  const eligible = decisions.filter((decision) => decision.status === "eligible");
  const rejected = decisions.filter((decision) => decision.status === "rejected");
  const normalizedGlobalReasons = [...new Set(globalReasons)].sort();

  const evidence = {
    policyVersion: AI_MODEL_LAB_POLICY_VERSION,
    taskId: input.taskId,
    agentId: input.agentId,
    dataClass: input.dataClass,
    taskDataClass: task.dataClass,
    promptDigest,
    requireZeroDataRetention: input.requireZeroDataRetention,
    globalReasons: normalizedGlobalReasons,
    candidates: decisions.map((decision) => ({
      providerId: decision.providerId,
      endpointId: decision.endpointId,
      requestedModel: decision.requestedModel,
      canonicalModel: decision.canonicalModel,
      status: decision.status,
      reasons: decision.reasons,
      route: decision.admission.route,
    })),
  };

  return Object.freeze({
    status:
      normalizedGlobalReasons.length === 0 &&
      input.dataClass === task.dataClass &&
      eligible.length >= AI_MODEL_LAB_MIN_CANDIDATES
        ? "ready"
        : "blocked",
    taskId: input.taskId,
    agentId: input.agentId,
    dataClass: input.dataClass,
    promptDigest,
    eligible,
    rejected,
    globalReasons: normalizedGlobalReasons,
    decisionHash: policyHash(evidence),
  });
}

export const AI_COUNCIL_ROLE_IDS = [
  "reasoning",
  "research",
  "social_narrative",
  "market_context",
  "tutor",
] as const;

export type AiCouncilRoleId = (typeof AI_COUNCIL_ROLE_IDS)[number];
export type AiCouncilStance = "support" | "oppose" | "uncertain";

export type AiCouncilClaim = Readonly<{
  claimKey: string;
  stance: AiCouncilStance;
  evidenceIds: readonly string[];
}>;

export type AiCouncilContribution = Readonly<{
  contributionId: string;
  role: AiCouncilRoleId;
  claims: readonly AiCouncilClaim[];
}>;

export type AiCouncilAgreement = Readonly<{
  claimKey: string;
  stance: Exclude<AiCouncilStance, "uncertain">;
  roles: readonly AiCouncilRoleId[];
  evidenceIds: readonly string[];
}>;

export type AiCouncilDisagreement = Readonly<{
  claimKey: string;
  supportingRoles: readonly AiCouncilRoleId[];
  opposingRoles: readonly AiCouncilRoleId[];
  uncertainRoles: readonly AiCouncilRoleId[];
  evidenceIds: readonly string[];
}>;

export type AiCouncilUnresolvedReason =
  | "single_role"
  | "uncertain"
  | "evidence_missing";

export type AiCouncilUnresolved = Readonly<{
  claimKey: string;
  reasons: readonly AiCouncilUnresolvedReason[];
  roles: readonly AiCouncilRoleId[];
  evidenceIds: readonly string[];
}>;

export type AiCouncilSynthesis = Readonly<{
  agreements: readonly AiCouncilAgreement[];
  disagreements: readonly AiCouncilDisagreement[];
  unresolved: readonly AiCouncilUnresolved[];
  synthesisHash: string;
}>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,179}$/;

function assertCouncilIdentifier(value: string, label: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`ai_council_${label}_invalid`);
  }
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

/**
 * Derives council agreement/disagreement mechanically from structured role
 * claims. Confidence values are intentionally not averaged: opposing roles
 * stay visible, uncertainty remains unresolved and evidence-free assertions
 * are never promoted to consensus.
 */
export function deriveAiCouncilSynthesis(
  contributions: readonly AiCouncilContribution[],
): AiCouncilSynthesis {
  if (contributions.length < 2 || contributions.length > AI_COUNCIL_ROLE_IDS.length) {
    throw new Error("ai_council_contribution_count_invalid");
  }

  const contributionIds = new Set<string>();
  const roles = new Set<AiCouncilRoleId>();
  const byClaim = new Map<
    string,
    Array<{ role: AiCouncilRoleId; stance: AiCouncilStance; evidenceIds: readonly string[] }>
  >();

  for (const contribution of contributions) {
    assertCouncilIdentifier(contribution.contributionId, "contribution_id");
    if (contributionIds.has(contribution.contributionId)) {
      throw new Error("ai_council_duplicate_contribution");
    }
    if (roles.has(contribution.role)) {
      throw new Error("ai_council_duplicate_role");
    }
    contributionIds.add(contribution.contributionId);
    roles.add(contribution.role);

    const seenClaims = new Set<string>();
    for (const claim of contribution.claims) {
      assertCouncilIdentifier(claim.claimKey, "claim_key");
      if (seenClaims.has(claim.claimKey)) {
        throw new Error("ai_council_duplicate_claim_in_role");
      }
      seenClaims.add(claim.claimKey);
      for (const evidenceId of claim.evidenceIds) {
        assertCouncilIdentifier(evidenceId, "evidence_id");
      }
      const current = byClaim.get(claim.claimKey) ?? [];
      current.push({
        role: contribution.role,
        stance: claim.stance,
        evidenceIds: sortedUnique(claim.evidenceIds),
      });
      byClaim.set(claim.claimKey, current);
    }
  }

  const agreements: AiCouncilAgreement[] = [];
  const disagreements: AiCouncilDisagreement[] = [];
  const unresolved: AiCouncilUnresolved[] = [];

  for (const [claimKey, entries] of [...byClaim.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const supportingRoles = sortedUnique(
      entries.filter((entry) => entry.stance === "support").map((entry) => entry.role),
    );
    const opposingRoles = sortedUnique(
      entries.filter((entry) => entry.stance === "oppose").map((entry) => entry.role),
    );
    const uncertainRoles = sortedUnique(
      entries.filter((entry) => entry.stance === "uncertain").map((entry) => entry.role),
    );
    const evidenceIds = sortedUnique(entries.flatMap((entry) => [...entry.evidenceIds]));
    const hasEvidenceGap = entries.some(
      (entry) => entry.stance !== "uncertain" && entry.evidenceIds.length === 0,
    );

    if (supportingRoles.length > 0 && opposingRoles.length > 0) {
      disagreements.push({
        claimKey,
        supportingRoles,
        opposingRoles,
        uncertainRoles,
        evidenceIds,
      });
      continue;
    }

    const decisiveRoles = supportingRoles.length > 0 ? supportingRoles : opposingRoles;
    const decisiveStance: Exclude<AiCouncilStance, "uncertain"> | null =
      supportingRoles.length > 0 ? "support" : opposingRoles.length > 0 ? "oppose" : null;

    if (
      decisiveStance &&
      decisiveRoles.length >= 2 &&
      uncertainRoles.length === 0 &&
      !hasEvidenceGap
    ) {
      agreements.push({
        claimKey,
        stance: decisiveStance,
        roles: decisiveRoles,
        evidenceIds,
      });
      continue;
    }

    const reasons: AiCouncilUnresolvedReason[] = [];
    if (entries.length === 1 || decisiveRoles.length < 2) reasons.push("single_role");
    if (uncertainRoles.length > 0 || decisiveStance === null) reasons.push("uncertain");
    if (hasEvidenceGap) reasons.push("evidence_missing");
    unresolved.push({
      claimKey,
      reasons: sortedUnique(reasons),
      roles: sortedUnique(entries.map((entry) => entry.role)),
      evidenceIds,
    });
  }

  const normalized = {
    agreements,
    disagreements,
    unresolved,
  };
  return Object.freeze({
    ...normalized,
    synthesisHash: createHash("sha256")
      .update("tecpey-ai-council-synthesis:v1\0")
      .update(JSON.stringify(canonicalize(normalized)))
      .digest("hex"),
  });
}
