import type {
  AiDataClass,
  AiModelProviderId,
} from "./control-plane-catalog";
import {
  aiIntelligenceTaskDefinition,
  type AiIntelligenceTaskId,
} from "./intelligence-task-catalog";

export const AI_INTELLIGENCE_MODEL_REJECTION_CODES = [
  "model_deprecated",
  "model_identity_unpinned",
  "capability_snapshot_stale",
  "data_class_unsupported",
  "zero_retention_required",
  "capability_missing",
  "tool_missing",
  "eval_missing",
  "eval_suite_mismatch",
  "eval_stale",
  "eval_sample_insufficient",
  "eval_threshold_not_met",
] as const;

export type AiIntelligenceModelRejectionCode =
  (typeof AI_INTELLIGENCE_MODEL_REJECTION_CODES)[number];

export type AiIntelligenceModelCapabilitySnapshot = Readonly<{
  providerId: AiModelProviderId;
  requestedModel: string;
  canonicalModel: string;
  observedAt: string;
  exactModelIdentity: boolean;
  deprecated: boolean;
  zeroDataRetention: boolean;
  supportedDataClasses: readonly AiDataClass[];
  capabilities: readonly string[];
  tools: readonly string[];
  cacheMode: "none" | "implicit" | "explicit" | "provider_specific";
}>;

export type AiIntelligenceEvalEvidence = Readonly<{
  taskId: AiIntelligenceTaskId;
  evalSuiteId: string;
  candidateProviderId: AiModelProviderId;
  candidateModel: string;
  measuredAt: string;
  sampleSize: number;
  qualityBasisPoints: number;
}>;

export type AiIntelligenceEvalRequirement = Readonly<{
  minimumSamples: number;
  minimumQualityBasisPoints: number;
  maximumAgeDays: number;
}>;

export const AI_INTELLIGENCE_EVAL_REQUIREMENTS = Object.freeze({
  news_translate: { minimumSamples: 100, minimumQualityBasisPoints: 9800, maximumAgeDays: 30 },
  news_validate: { minimumSamples: 100, minimumQualityBasisPoints: 9900, maximumAgeDays: 30 },
  growth_scan: { minimumSamples: 80, minimumQualityBasisPoints: 9000, maximumAgeDays: 14 },
  growth_deep_research: { minimumSamples: 40, minimumQualityBasisPoints: 9200, maximumAgeDays: 30 },
  knowledge_curate: { minimumSamples: 80, minimumQualityBasisPoints: 9700, maximumAgeDays: 30 },
  mentor_coach: { minimumSamples: 150, minimumQualityBasisPoints: 9500, maximumAgeDays: 30 },
  mentor_public_research: { minimumSamples: 80, minimumQualityBasisPoints: 9400, maximumAgeDays: 14 },
  content_review: { minimumSamples: 100, minimumQualityBasisPoints: 9500, maximumAgeDays: 30 },
  executive_synthesis: { minimumSamples: 40, minimumQualityBasisPoints: 9500, maximumAgeDays: 30 },
} as const satisfies Readonly<Record<AiIntelligenceTaskId, AiIntelligenceEvalRequirement>>);

export type AiIntelligenceModelEligibility =
  | Readonly<{
      status: "eligible";
      reasons: readonly [];
      capabilityAgeDays: number;
      evalAgeDays: number;
      qualityBasisPoints: number;
    }>
  | Readonly<{
      status: "rejected";
      reasons: readonly AiIntelligenceModelRejectionCode[];
      capabilityAgeDays: number | null;
      evalAgeDays: number | null;
      qualityBasisPoints: number | null;
    }>;

function ageDays(value: string, nowMs: number): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > nowMs + 5 * 60_000) return null;
  return Math.max(0, (nowMs - parsed) / 86_400_000);
}

function normalizedIdentity(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

export function evaluateAiIntelligenceModelEligibility(input: {
  taskId: AiIntelligenceTaskId;
  capability: AiIntelligenceModelCapabilitySnapshot;
  evalEvidence: AiIntelligenceEvalEvidence | null;
  requireZeroDataRetention: boolean;
  nowMs?: number;
  maximumCapabilityAgeDays?: number;
}): AiIntelligenceModelEligibility {
  const task = aiIntelligenceTaskDefinition(input.taskId);
  const requirement = AI_INTELLIGENCE_EVAL_REQUIREMENTS[input.taskId];
  const nowMs = input.nowMs ?? Date.now();
  const maximumCapabilityAgeDays = Number.isFinite(input.maximumCapabilityAgeDays)
    ? Math.max(1, Math.min(90, Math.trunc(input.maximumCapabilityAgeDays ?? 14)))
    : 14;
  const capabilityAgeDays = ageDays(input.capability.observedAt, nowMs);
  const reasons: AiIntelligenceModelRejectionCode[] = [];

  if (input.capability.deprecated) reasons.push("model_deprecated");
  if (!input.capability.exactModelIdentity) reasons.push("model_identity_unpinned");
  if (capabilityAgeDays === null || capabilityAgeDays > maximumCapabilityAgeDays) {
    reasons.push("capability_snapshot_stale");
  }
  if (!input.capability.supportedDataClasses.includes(task.dataClass)) {
    reasons.push("data_class_unsupported");
  }
  if (input.requireZeroDataRetention && !input.capability.zeroDataRetention) {
    reasons.push("zero_retention_required");
  }
  for (const capability of task.requiredCapabilities) {
    if (!input.capability.capabilities.includes(capability)) reasons.push("capability_missing");
  }
  for (const tool of task.requiredTools) {
    if (!input.capability.tools.includes(tool)) reasons.push("tool_missing");
  }

  const evalEvidence = input.evalEvidence;
  const evalAgeDays = evalEvidence ? ageDays(evalEvidence.measuredAt, nowMs) : null;
  if (!evalEvidence) {
    reasons.push("eval_missing");
  } else {
    if (
      evalEvidence.taskId !== task.id ||
      evalEvidence.evalSuiteId !== task.evalSuiteId ||
      evalEvidence.candidateProviderId !== input.capability.providerId ||
      normalizedIdentity(evalEvidence.candidateModel) !== normalizedIdentity(input.capability.canonicalModel)
    ) {
      reasons.push("eval_suite_mismatch");
    }
    if (evalAgeDays === null || evalAgeDays > requirement.maximumAgeDays) {
      reasons.push("eval_stale");
    }
    if (!Number.isSafeInteger(evalEvidence.sampleSize) || evalEvidence.sampleSize < requirement.minimumSamples) {
      reasons.push("eval_sample_insufficient");
    }
    if (
      !Number.isSafeInteger(evalEvidence.qualityBasisPoints) ||
      evalEvidence.qualityBasisPoints < requirement.minimumQualityBasisPoints ||
      evalEvidence.qualityBasisPoints > 10_000
    ) {
      reasons.push("eval_threshold_not_met");
    }
  }

  const normalizedReasons = uniqueSorted(reasons);
  if (normalizedReasons.length > 0) {
    return {
      status: "rejected",
      reasons: normalizedReasons,
      capabilityAgeDays,
      evalAgeDays,
      qualityBasisPoints: evalEvidence?.qualityBasisPoints ?? null,
    };
  }

  return {
    status: "eligible",
    reasons: [],
    capabilityAgeDays: capabilityAgeDays ?? 0,
    evalAgeDays: evalAgeDays ?? 0,
    qualityBasisPoints: evalEvidence?.qualityBasisPoints ?? 0,
  };
}
