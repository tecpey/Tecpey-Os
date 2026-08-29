import { createHash } from "node:crypto";
import {
  AI_PROVIDER_CATALOG,
  aiAgentDefinition,
  assertAiAgentProviderAllowed,
  type AiAgentId,
  type AiDataClass,
  type AiModelProviderId,
} from "./control-plane-catalog";

export type AiRouteCandidateHealth = "healthy" | "degraded" | "unknown" | "unavailable";

export type AiEnterpriseRouteCandidate = Readonly<{
  providerId: AiModelProviderId;
  model: string;
  priority: number;
  enabled: boolean;
  health: AiRouteCandidateHealth;
  estimatedMaxCostUsdMicros: number;
  expectedLatencyMs: number;
  zeroDataRetention: boolean;
  free: boolean;
  supportedDataClasses: readonly AiDataClass[];
}>;

export type AiRouteRejectionCode =
  | "provider_forbidden"
  | "candidate_disabled"
  | "provider_unavailable"
  | "provider_health_unknown"
  | "data_class_forbidden"
  | "zero_retention_required"
  | "capability_missing"
  | "citation_capability_missing"
  | "free_route_forbidden"
  | "approval_required"
  | "duplicate_candidate"
  | "invalid_candidate_attributes"
  | "paid_cost_estimate_required"
  | "request_cost_cap_exceeded"
  | "monthly_budget_exhausted";

export type AiEnterpriseRouteDecision =
  | {
      status: "selected";
      selected: AiEnterpriseRouteCandidate;
      eligible: AiEnterpriseRouteCandidate[];
      rejected: Array<{
        providerId: AiModelProviderId;
        model: string;
        reasons: AiRouteRejectionCode[];
      }>;
      decisionHash: string;
    }
  | {
      status: "blocked";
      selected: null;
      eligible: [];
      rejected: Array<{
        providerId: AiModelProviderId;
        model: string;
        reasons: AiRouteRejectionCode[];
      }>;
      decisionHash: string;
    };

const HEALTH_SCORE: Readonly<Record<AiRouteCandidateHealth, number>> = {
  healthy: 0,
  degraded: 10_000,
  unknown: 100_000,
  unavailable: 1_000_000,
};
const OPENROUTER_FREE_MODEL_PATTERN = /(?:^openrouter\/free$|:free$)/i;

function providerCapabilities(providerId: AiModelProviderId): readonly string[] {
  return AI_PROVIDER_CATALOG.find((provider) => provider.id === providerId)?.capabilities ?? [];
}

function decisionHash(value: unknown): string {
  return createHash("sha256")
    .update("tecpey-enterprise-ai-route:v3\0")
    .update(JSON.stringify(value))
    .digest("hex");
}

function canonicalNumber(value: number): number | string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  return Object.is(value, -0) ? 0 : value;
}

function canonicalCandidate(candidate: AiEnterpriseRouteCandidate) {
  return {
    providerId: candidate.providerId,
    model: candidate.model,
    priority: canonicalNumber(candidate.priority),
    enabled: candidate.enabled,
    health: candidate.health,
    estimatedMaxCostUsdMicros: canonicalNumber(candidate.estimatedMaxCostUsdMicros),
    expectedLatencyMs: canonicalNumber(candidate.expectedLatencyMs),
    zeroDataRetention: candidate.zeroDataRetention,
    free: candidate.free,
    supportedDataClasses: [...new Set(candidate.supportedDataClasses)].sort(),
  };
}

function canonicalCandidateKey(candidate: AiEnterpriseRouteCandidate): string {
  return JSON.stringify(canonicalCandidate(candidate));
}

function score(candidate: AiEnterpriseRouteCandidate): number {
  const boundedPriority = Math.max(0, Math.min(1_000, Math.trunc(candidate.priority)));
  const boundedCost = Math.max(
    0,
    Math.min(100_000, Math.ceil(candidate.estimatedMaxCostUsdMicros / 10_000)),
  );
  const boundedLatency = Math.max(
    0,
    Math.min(30_000, Math.trunc(candidate.expectedLatencyMs)),
  );
  return boundedPriority * 1_000_000 + HEALTH_SCORE[candidate.health] + boundedCost + boundedLatency;
}

/**
 * Produces a deterministic, secret-free routing decision. Unknown health is
 * fail-closed for critical work. Free routes are an independent policy lane,
 * never a cheaper substitute for sensitive or effectful workloads.
 */
export function planEnterpriseAiRoute(input: {
  agentId: AiAgentId;
  dataClass: AiDataClass;
  criticality: "noncritical" | "standard" | "critical";
  externalEffect: boolean;
  approvalSatisfied: boolean;
  requiredCapabilities?: readonly string[];
  maxRequestCostUsdMicros: number;
  monthlyBudgetRemainingUsdMicros: number;
  candidates: readonly AiEnterpriseRouteCandidate[];
}): AiEnterpriseRouteDecision {
  const definition = aiAgentDefinition(input.agentId);
  const requiredCapabilities = [...new Set(input.requiredCapabilities ?? [])].sort();
  const rejected: AiEnterpriseRouteDecision["rejected"] = [];
  const eligible: AiEnterpriseRouteCandidate[] = [];
  const evaluated: Array<{
    candidate: ReturnType<typeof canonicalCandidate>;
    outcome: "eligible" | "rejected";
    reasons: AiRouteRejectionCode[];
  }> = [];
  const identityCounts = new Map<string, number>();
  for (const candidate of input.candidates) {
    const identity = `${candidate.providerId}\0${candidate.model}`;
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
  }

  for (const candidate of input.candidates) {
    const reasons: AiRouteRejectionCode[] = [];
    const modelDeclaresFree = candidate.providerId === "openrouter" &&
      OPENROUTER_FREE_MODEL_PATTERN.test(candidate.model.trim());
    try {
      assertAiAgentProviderAllowed(input.agentId, candidate.providerId);
    } catch {
      reasons.push("provider_forbidden");
    }
    if (!candidate.enabled) reasons.push("candidate_disabled");
    if ((identityCounts.get(`${candidate.providerId}\0${candidate.model}`) ?? 0) > 1) {
      reasons.push("duplicate_candidate");
    }
    if (
      !Number.isSafeInteger(candidate.priority) ||
      candidate.priority < 0 ||
      !Number.isSafeInteger(candidate.expectedLatencyMs) ||
      candidate.expectedLatencyMs <= 0 ||
      (candidate.free && candidate.estimatedMaxCostUsdMicros !== 0) ||
      candidate.free !== modelDeclaresFree
    ) {
      reasons.push("invalid_candidate_attributes");
    }
    if (candidate.health === "unavailable") reasons.push("provider_unavailable");
    if (candidate.health === "unknown" && input.criticality === "critical") {
      reasons.push("provider_health_unknown");
    }
    if (!candidate.supportedDataClasses.includes(input.dataClass)) {
      reasons.push("data_class_forbidden");
    }
    if (input.dataClass === "private_user" && !definition.mayReceivePrivateUserData) {
      reasons.push("data_class_forbidden");
    }
    if (!candidate.zeroDataRetention) reasons.push("zero_retention_required");
    const capabilities = providerCapabilities(candidate.providerId);
    if (requiredCapabilities.some((capability) => !capabilities.includes(capability))) {
      reasons.push("capability_missing");
    }
    if (
      definition.citationsRequired &&
      !capabilities.includes("citations") &&
      !capabilities.includes("web_search")
    ) {
      reasons.push("citation_capability_missing");
    }
    if (
      candidate.free &&
      (input.dataClass !== "public" ||
        input.criticality !== "noncritical" ||
        input.externalEffect ||
        !definition.openRouterFallback.freeAllowed)
    ) {
      reasons.push("free_route_forbidden");
    }
    if (input.externalEffect && !input.approvalSatisfied) {
      reasons.push("approval_required");
    }
    if (
      !candidate.free &&
      (!Number.isSafeInteger(candidate.estimatedMaxCostUsdMicros) ||
        candidate.estimatedMaxCostUsdMicros <= 0)
    ) {
      reasons.push("paid_cost_estimate_required");
    }
    if (candidate.estimatedMaxCostUsdMicros > input.maxRequestCostUsdMicros) {
      reasons.push("request_cost_cap_exceeded");
    }
    if (candidate.estimatedMaxCostUsdMicros > input.monthlyBudgetRemainingUsdMicros) {
      reasons.push("monthly_budget_exhausted");
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    if (uniqueReasons.length) {
      rejected.push({
        providerId: candidate.providerId,
        model: candidate.model,
        reasons: uniqueReasons,
      });
      evaluated.push({
        candidate: canonicalCandidate(candidate),
        outcome: "rejected",
        reasons: uniqueReasons,
      });
    } else {
      eligible.push(candidate);
      evaluated.push({
        candidate: canonicalCandidate(candidate),
        outcome: "eligible",
        reasons: [],
      });
    }
  }

  eligible.sort((left, right) =>
    score(left) - score(right) ||
    left.providerId.localeCompare(right.providerId) ||
    left.model.localeCompare(right.model) ||
    canonicalCandidateKey(left).localeCompare(canonicalCandidateKey(right)),
  );
  rejected.sort((left, right) =>
    left.providerId.localeCompare(right.providerId) ||
    left.model.localeCompare(right.model),
  );
  evaluated.sort((left, right) =>
    left.candidate.providerId.localeCompare(right.candidate.providerId) ||
    left.candidate.model.localeCompare(right.candidate.model) ||
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  const selected = eligible[0] ?? null;
  const evidence = {
    policy: "tecpey-enterprise-ai-routing-v3",
    agentId: input.agentId,
    dataClass: input.dataClass,
    criticality: input.criticality,
    externalEffect: input.externalEffect,
    approvalSatisfied: input.approvalSatisfied,
    requiredCapabilities,
    maxRequestCostUsdMicros: input.maxRequestCostUsdMicros,
    monthlyBudgetRemainingUsdMicros: input.monthlyBudgetRemainingUsdMicros,
    selected: selected
      ? canonicalCandidate(selected)
      : null,
    candidates: evaluated,
  };
  if (!selected) {
    return {
      status: "blocked",
      selected: null,
      eligible: [],
      rejected,
      decisionHash: decisionHash(evidence),
    };
  }
  return {
    status: "selected",
    selected,
    eligible,
    rejected,
    decisionHash: decisionHash(evidence),
  };
}
