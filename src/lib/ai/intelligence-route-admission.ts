import {
  aiAgentDefinition,
  type AiAgentId,
  type AiDataClass,
  type AiModelProviderId,
} from "./control-plane-catalog";
import {
  evaluateAiIntelligenceEndpointEligibility,
  type AiIntelligenceEndpointEligibility,
  type AiIntelligenceEndpointId,
  type AiIntelligenceEndpointRejectionCode,
} from "./intelligence-endpoint-policy";
import {
  evaluateAiIntelligenceModelEligibility,
  type AiIntelligenceEvalEvidence,
  type AiIntelligenceModelCapabilitySnapshot,
  type AiIntelligenceModelEligibility,
  type AiIntelligenceModelRejectionCode,
} from "./intelligence-model-policy";
import {
  aiIntelligenceTaskDefinition,
  type AiIntelligenceTaskId,
} from "./intelligence-task-catalog";

export const AI_INTELLIGENCE_ROUTE_REJECTION_CODES = [
  "task_agent_forbidden",
  "task_data_class_mismatch",
  "agent_provider_forbidden",
  "endpoint_provider_mismatch",
] as const;

export type AiIntelligenceRouteLocalRejectionCode =
  (typeof AI_INTELLIGENCE_ROUTE_REJECTION_CODES)[number];

export type AiIntelligenceRouteRejectionCode =
  | AiIntelligenceRouteLocalRejectionCode
  | AiIntelligenceEndpointRejectionCode
  | AiIntelligenceModelRejectionCode;

export type AiIntelligenceRouteIdentity = Readonly<{
  taskId: AiIntelligenceTaskId;
  agentId: AiAgentId;
  dataClass: AiDataClass;
  providerId: AiModelProviderId;
  endpointId: AiIntelligenceEndpointId;
  requestedModel: string;
  canonicalModel: string;
  requireZeroDataRetention: boolean;
}>;

export type AiIntelligenceRouteAdmission =
  | Readonly<{
      status: "eligible";
      reasons: readonly [];
      localReasons: readonly [];
      endpointReasons: readonly [];
      modelReasons: readonly [];
      route: AiIntelligenceRouteIdentity;
      endpointEligibility: Extract<AiIntelligenceEndpointEligibility, { status: "eligible" }>;
      modelEligibility: Extract<AiIntelligenceModelEligibility, { status: "eligible" }>;
    }>
  | Readonly<{
      status: "rejected";
      reasons: readonly AiIntelligenceRouteRejectionCode[];
      localReasons: readonly AiIntelligenceRouteLocalRejectionCode[];
      endpointReasons: readonly AiIntelligenceEndpointRejectionCode[];
      modelReasons: readonly AiIntelligenceModelRejectionCode[];
      route: AiIntelligenceRouteIdentity;
      endpointEligibility: AiIntelligenceEndpointEligibility;
      modelEligibility: AiIntelligenceModelEligibility;
    }>;

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

export function evaluateAiIntelligenceRouteAdmission(input: {
  taskId: AiIntelligenceTaskId;
  agentId: AiAgentId;
  dataClass: AiDataClass;
  endpointId: AiIntelligenceEndpointId;
  capability: AiIntelligenceModelCapabilitySnapshot;
  evalEvidence: AiIntelligenceEvalEvidence | null;
  requireZeroDataRetention: boolean;
  nowMs?: number;
  maximumCapabilityAgeDays?: number;
}): AiIntelligenceRouteAdmission {
  const task = aiIntelligenceTaskDefinition(input.taskId);
  const agent = aiAgentDefinition(input.agentId);
  const endpointEligibility = evaluateAiIntelligenceEndpointEligibility({
    taskId: input.taskId,
    endpointId: input.endpointId,
  });

  const endpoint = endpointEligibility.endpoint;
  const localReasons: AiIntelligenceRouteLocalRejectionCode[] = [];

  if (!task.allowedAgents.includes(input.agentId)) {
    localReasons.push("task_agent_forbidden");
  }
  if (input.dataClass !== task.dataClass) {
    localReasons.push("task_data_class_mismatch");
  }
  if (!agent.allowedProviders.includes(input.capability.providerId)) {
    localReasons.push("agent_provider_forbidden");
  }
  if (endpoint.providerId !== input.capability.providerId) {
    localReasons.push("endpoint_provider_mismatch");
  }

  const requireZeroDataRetention =
    input.requireZeroDataRetention ||
    (input.capability.providerId === "openrouter" &&
      agent.openRouterFallback.requireZeroDataRetention);

  const modelEligibility = evaluateAiIntelligenceModelEligibility({
    taskId: input.taskId,
    capability: input.capability,
    evalEvidence: input.evalEvidence,
    requireZeroDataRetention,
    nowMs: input.nowMs,
    maximumCapabilityAgeDays: input.maximumCapabilityAgeDays,
  });

  const endpointReasons = endpointEligibility.status === "rejected"
    ? endpointEligibility.reasons
    : [];
  const modelReasons = modelEligibility.status === "rejected"
    ? modelEligibility.reasons
    : [];
  const normalizedLocalReasons = uniqueSorted(localReasons);
  const reasons = uniqueSorted<AiIntelligenceRouteRejectionCode>([
    ...normalizedLocalReasons,
    ...endpointReasons,
    ...modelReasons,
  ]);

  const route: AiIntelligenceRouteIdentity = Object.freeze({
    taskId: input.taskId,
    agentId: input.agentId,
    dataClass: input.dataClass,
    providerId: input.capability.providerId,
    endpointId: input.endpointId,
    requestedModel: input.capability.requestedModel,
    canonicalModel: input.capability.canonicalModel,
    requireZeroDataRetention,
  });

  if (
    reasons.length === 0 &&
    endpointEligibility.status === "eligible" &&
    modelEligibility.status === "eligible"
  ) {
    return Object.freeze({
      status: "eligible",
      reasons: [] as const,
      localReasons: [] as const,
      endpointReasons: [] as const,
      modelReasons: [] as const,
      route,
      endpointEligibility,
      modelEligibility,
    });
  }

  return Object.freeze({
    status: "rejected",
    reasons,
    localReasons: normalizedLocalReasons,
    endpointReasons,
    modelReasons,
    route,
    endpointEligibility,
    modelEligibility,
  });
}
