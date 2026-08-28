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

function providerCapabilities(providerId: AiModelProviderId): readonly string[] {
  return AI_PROVIDER_CATALOG.find((provider) => provider.id === providerId)?.capabilities ?? [];
}

function decisionHash(value: unknown): string {
  return createHash("sha256")
    .update("tecpey-enterprise-ai-route:v2\0")
    .update(JSON.stringify(value))
    .digest("hex");
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

  for (const candidate of input.candidates.slice(0, 20)) {
    const reasons: AiRouteRejectionCode[] = [];
    try {
      assertAiAgentProviderAllowed(input.agentId, candidate.providerId);
    } catch {
      reasons.push("provider_forbidden");
    }
    if (!candidate.enabled) reasons.push("candidate_disabled");
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
    } else {
      eligible.push(candidate);
    }
  }

  eligible.sort((left, right) =>
    score(left) - score(right) ||
    left.providerId.localeCompare(right.providerId) ||
    left.model.localeCompare(right.model),
  );
  rejected.sort((left, right) =>
    left.providerId.localeCompare(right.providerId) ||
    left.model.localeCompare(right.model),
  );
  const selected = eligible[0] ?? null;
  const evidence = {
    policy: "tecpey-enterprise-ai-routing-v2",
    agentId: input.agentId,
    dataClass: input.dataClass,
    criticality: input.criticality,
    externalEffect: input.externalEffect,
    approvalSatisfied: input.approvalSatisfied,
    requiredCapabilities,
    maxRequestCostUsdMicros: input.maxRequestCostUsdMicros,
    monthlyBudgetRemainingUsdMicros: input.monthlyBudgetRemainingUsdMicros,
    selected: selected
      ? { providerId: selected.providerId, model: selected.model }
      : null,
    rejected,
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
