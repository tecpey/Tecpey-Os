import {
  aiAgentDefinition,
  type AiAgentId,
  type AiDataClass,
} from "./control-plane-catalog";

export const AI_INTELLIGENCE_TASK_IDS = [
  "news_translate",
  "news_validate",
  "growth_scan",
  "growth_deep_research",
  "knowledge_curate",
  "mentor_coach",
  "mentor_public_research",
  "content_review",
  "executive_synthesis",
] as const;

export type AiIntelligenceTaskId = (typeof AI_INTELLIGENCE_TASK_IDS)[number];

export type AiIntelligenceModelTier =
  | "economy"
  | "balanced"
  | "frontier"
  | "search_native";

export type AiIntelligenceRouteObjective =
  | "quality_per_dollar"
  | "quality"
  | "latency"
  | "research_depth";

export type AiIntelligenceCachePolicy =
  | "none"
  | "stable_prefix"
  | "session_prefix";

export type AiIntelligenceEvidencePolicy =
  | "none"
  | "input_bound"
  | "provider_citations"
  | "verified_knowledge";

export type AiIntelligenceOutputProtocol = Readonly<{
  mode: "text" | "json_schema";
  schemaId: string | null;
}>;

export type AiIntelligenceRetryPolicy = Readonly<{
  class: "none" | "transient_bounded";
  maxExecutions: number;
  minBackoffSeconds: number;
  maxProviderAttemptsPerExecution: number;
}>;

export type AiIntelligenceTaskDefinition = Readonly<{
  id: AiIntelligenceTaskId;
  allowedAgents: readonly AiAgentId[];
  dataClass: AiDataClass;
  criticality: "noncritical" | "standard" | "critical";
  externalEffect: false;
  providerExecution: "optional" | "required";
  modelTier: AiIntelligenceModelTier;
  routeObjective: AiIntelligenceRouteObjective;
  requiredCapabilities: readonly string[];
  requiredTools: readonly string[];
  evidencePolicy: AiIntelligenceEvidencePolicy;
  output: AiIntelligenceOutputProtocol;
  cachePolicy: AiIntelligenceCachePolicy;
  retry: AiIntelligenceRetryPolicy;
  knowledgeRead: "none" | "verified_only";
  knowledgeWrite: "none" | "candidate_only";
  multiAgent: "forbidden" | "eligible";
  minimumScheduleMinutes: number | null;
  evalSuiteId: string;
}>;

const jsonOutput = (schemaId: string): AiIntelligenceOutputProtocol => ({
  mode: "json_schema",
  schemaId,
});

const textOutput: AiIntelligenceOutputProtocol = {
  mode: "text",
  schemaId: null,
};

const transientRetry = (
  maxExecutions: number,
  minBackoffSeconds: number,
  maxProviderAttemptsPerExecution: number,
): AiIntelligenceRetryPolicy => ({
  class: "transient_bounded",
  maxExecutions,
  minBackoffSeconds,
  maxProviderAttemptsPerExecution,
});

const noRetry: AiIntelligenceRetryPolicy = {
  class: "none",
  maxExecutions: 1,
  minBackoffSeconds: 0,
  maxProviderAttemptsPerExecution: 1,
};

export const AI_INTELLIGENCE_TASK_CATALOG = [
  {
    id: "news_translate",
    allowedAgents: ["content_reviewer"],
    dataClass: "public",
    criticality: "standard",
    externalEffect: false,
    providerExecution: "required",
    modelTier: "economy",
    routeObjective: "quality_per_dollar",
    requiredCapabilities: ["text", "structured_output"],
    requiredTools: [],
    evidencePolicy: "input_bound",
    output: jsonOutput("news_translation_v1"),
    cachePolicy: "stable_prefix",
    retry: transientRetry(3, 120, 2),
    knowledgeRead: "none",
    knowledgeWrite: "none",
    multiAgent: "forbidden",
    minimumScheduleMinutes: 2,
    evalSuiteId: "news_translation_fa_v1",
  },
  {
    id: "news_validate",
    allowedAgents: ["content_reviewer", "risk_compliance_reviewer"],
    dataClass: "public",
    criticality: "standard",
    externalEffect: false,
    providerExecution: "optional",
    modelTier: "economy",
    routeObjective: "quality_per_dollar",
    requiredCapabilities: ["text", "structured_output"],
    requiredTools: [],
    evidencePolicy: "input_bound",
    output: jsonOutput("news_validation_v1"),
    cachePolicy: "stable_prefix",
    retry: noRetry,
    knowledgeRead: "none",
    knowledgeWrite: "none",
    multiAgent: "forbidden",
    minimumScheduleMinutes: 2,
    evalSuiteId: "news_validation_v1",
  },
  {
    id: "growth_scan",
    allowedAgents: ["growth_hacker"],
    dataClass: "public",
    criticality: "noncritical",
    externalEffect: false,
    providerExecution: "required",
    modelTier: "search_native",
    routeObjective: "quality_per_dollar",
    requiredCapabilities: ["text", "web_search", "citations", "structured_output"],
    requiredTools: ["web_search"],
    evidencePolicy: "provider_citations",
    output: jsonOutput("growth_signal_batch_v1"),
    cachePolicy: "stable_prefix",
    retry: transientRetry(2, 300, 1),
    knowledgeRead: "none",
    knowledgeWrite: "none",
    multiAgent: "forbidden",
    minimumScheduleMinutes: 15,
    evalSuiteId: "growth_signal_precision_v1",
  },
  {
    id: "growth_deep_research",
    allowedAgents: ["growth_hacker", "news_x_researcher", "coin_tool_researcher"],
    dataClass: "public",
    criticality: "standard",
    externalEffect: false,
    providerExecution: "required",
    modelTier: "search_native",
    routeObjective: "research_depth",
    requiredCapabilities: ["text", "web_search", "citations", "structured_output"],
    requiredTools: ["web_search"],
    evidencePolicy: "provider_citations",
    output: jsonOutput("growth_research_dossier_v1"),
    cachePolicy: "stable_prefix",
    retry: transientRetry(2, 900, 1),
    knowledgeRead: "verified_only",
    knowledgeWrite: "candidate_only",
    multiAgent: "eligible",
    minimumScheduleMinutes: 60,
    evalSuiteId: "growth_deep_research_v1",
  },
  {
    id: "knowledge_curate",
    allowedAgents: ["knowledge_curator", "risk_compliance_reviewer"],
    dataClass: "approved_platform_content",
    criticality: "standard",
    externalEffect: false,
    providerExecution: "required",
    modelTier: "balanced",
    routeObjective: "quality",
    requiredCapabilities: ["text", "structured_output"],
    requiredTools: [],
    evidencePolicy: "input_bound",
    output: jsonOutput("knowledge_candidate_v1"),
    cachePolicy: "stable_prefix",
    retry: transientRetry(2, 300, 1),
    knowledgeRead: "verified_only",
    knowledgeWrite: "candidate_only",
    multiAgent: "forbidden",
    minimumScheduleMinutes: null,
    evalSuiteId: "knowledge_grounding_v1",
  },
  {
    id: "mentor_coach",
    allowedAgents: ["mentor_coach"],
    dataClass: "private_user",
    criticality: "standard",
    externalEffect: false,
    providerExecution: "optional",
    modelTier: "balanced",
    routeObjective: "quality_per_dollar",
    requiredCapabilities: ["text"],
    requiredTools: ["platform_knowledge"],
    evidencePolicy: "verified_knowledge",
    output: textOutput,
    cachePolicy: "session_prefix",
    retry: transientRetry(2, 2, 1),
    knowledgeRead: "verified_only",
    knowledgeWrite: "none",
    multiAgent: "forbidden",
    minimumScheduleMinutes: null,
    evalSuiteId: "mentor_coaching_safety_v1",
  },
  {
    id: "mentor_public_research",
    allowedAgents: ["news_x_researcher", "coin_tool_researcher"],
    dataClass: "public",
    criticality: "standard",
    externalEffect: false,
    providerExecution: "required",
    modelTier: "search_native",
    routeObjective: "quality",
    requiredCapabilities: ["text", "web_search", "citations"],
    requiredTools: ["web_search"],
    evidencePolicy: "provider_citations",
    output: textOutput,
    cachePolicy: "stable_prefix",
    retry: transientRetry(2, 2, 1),
    knowledgeRead: "verified_only",
    knowledgeWrite: "none",
    multiAgent: "forbidden",
    minimumScheduleMinutes: null,
    evalSuiteId: "mentor_public_research_v1",
  },
  {
    id: "content_review",
    allowedAgents: ["content_reviewer", "risk_compliance_reviewer"],
    dataClass: "approved_platform_content",
    criticality: "standard",
    externalEffect: false,
    providerExecution: "required",
    modelTier: "balanced",
    routeObjective: "quality",
    requiredCapabilities: ["text", "structured_output"],
    requiredTools: [],
    evidencePolicy: "input_bound",
    output: jsonOutput("content_review_v1"),
    cachePolicy: "stable_prefix",
    retry: transientRetry(2, 120, 1),
    knowledgeRead: "verified_only",
    knowledgeWrite: "none",
    multiAgent: "forbidden",
    minimumScheduleMinutes: null,
    evalSuiteId: "content_editorial_quality_v1",
  },
  {
    id: "executive_synthesis",
    allowedAgents: ["executive_briefing", "risk_compliance_reviewer"],
    dataClass: "restricted_admin",
    criticality: "critical",
    externalEffect: false,
    providerExecution: "required",
    modelTier: "frontier",
    routeObjective: "quality",
    requiredCapabilities: ["text", "structured_output"],
    requiredTools: [],
    evidencePolicy: "input_bound",
    output: jsonOutput("executive_synthesis_v1"),
    cachePolicy: "stable_prefix",
    retry: transientRetry(2, 300, 1),
    knowledgeRead: "verified_only",
    knowledgeWrite: "none",
    multiAgent: "eligible",
    minimumScheduleMinutes: null,
    evalSuiteId: "executive_synthesis_v1",
  },
] as const satisfies readonly AiIntelligenceTaskDefinition[];

const TASKS_BY_ID = new Map<AiIntelligenceTaskId, AiIntelligenceTaskDefinition>(
  AI_INTELLIGENCE_TASK_CATALOG.map((task) => [task.id, task]),
);

export function aiIntelligenceTaskDefinition(
  taskId: AiIntelligenceTaskId,
): AiIntelligenceTaskDefinition {
  const task = TASKS_BY_ID.get(taskId);
  if (!task) throw new Error(`ai_intelligence_task_unknown:${taskId}`);
  return task;
}

function validIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9_]{2,80}$/.test(value);
}

export function validateAiIntelligenceTaskCatalog(
  catalog: readonly AiIntelligenceTaskDefinition[] = AI_INTELLIGENCE_TASK_CATALOG,
): void {
  const ids = new Set<string>();
  for (const task of catalog) {
    if (!validIdentifier(task.id) || ids.has(task.id)) {
      throw new Error(`ai_intelligence_task_identity_invalid:${task.id}`);
    }
    ids.add(task.id);

    if (task.allowedAgents.length === 0 || new Set(task.allowedAgents).size !== task.allowedAgents.length) {
      throw new Error(`ai_intelligence_task_agents_invalid:${task.id}`);
    }
    for (const agentId of task.allowedAgents) {
      const agent = aiAgentDefinition(agentId);
      if (task.dataClass === "private_user" && !agent.mayReceivePrivateUserData) {
        throw new Error(`ai_intelligence_task_private_agent_forbidden:${task.id}:${agentId}`);
      }
      for (const tool of task.requiredTools) {
        if (!agent.allowedTools.includes(tool)) {
          throw new Error(`ai_intelligence_task_tool_forbidden:${task.id}:${agentId}:${tool}`);
        }
      }
    }

    if (new Set(task.requiredCapabilities).size !== task.requiredCapabilities.length) {
      throw new Error(`ai_intelligence_task_capabilities_invalid:${task.id}`);
    }
    if (new Set(task.requiredTools).size !== task.requiredTools.length) {
      throw new Error(`ai_intelligence_task_tools_invalid:${task.id}`);
    }
    if (
      task.evidencePolicy === "provider_citations" &&
      (!task.requiredCapabilities.includes("citations") || task.requiredTools.length === 0)
    ) {
      throw new Error(`ai_intelligence_task_provider_citations_invalid:${task.id}`);
    }
    if (
      task.evidencePolicy === "verified_knowledge" &&
      task.knowledgeRead !== "verified_only"
    ) {
      throw new Error(`ai_intelligence_task_verified_knowledge_invalid:${task.id}`);
    }

    if (task.output.mode === "json_schema") {
      if (!task.output.schemaId || !validIdentifier(task.output.schemaId)) {
        throw new Error(`ai_intelligence_task_schema_invalid:${task.id}`);
      }
      if (!task.requiredCapabilities.includes("structured_output")) {
        throw new Error(`ai_intelligence_task_structured_capability_missing:${task.id}`);
      }
    } else if (task.output.schemaId !== null) {
      throw new Error(`ai_intelligence_task_text_schema_forbidden:${task.id}`);
    }

    if (
      !Number.isSafeInteger(task.retry.maxExecutions) ||
      task.retry.maxExecutions < 1 ||
      task.retry.maxExecutions > 5 ||
      !Number.isSafeInteger(task.retry.minBackoffSeconds) ||
      task.retry.minBackoffSeconds < 0 ||
      !Number.isSafeInteger(task.retry.maxProviderAttemptsPerExecution) ||
      task.retry.maxProviderAttemptsPerExecution < 1 ||
      task.retry.maxProviderAttemptsPerExecution > 3
    ) {
      throw new Error(`ai_intelligence_task_retry_invalid:${task.id}`);
    }
    if (
      task.retry.class === "none" &&
      (task.retry.maxExecutions !== 1 ||
        task.retry.minBackoffSeconds !== 0 ||
        task.retry.maxProviderAttemptsPerExecution !== 1)
    ) {
      throw new Error(`ai_intelligence_task_retry_none_invalid:${task.id}`);
    }

    if (
      task.minimumScheduleMinutes !== null &&
      (!Number.isSafeInteger(task.minimumScheduleMinutes) || task.minimumScheduleMinutes < 1)
    ) {
      throw new Error(`ai_intelligence_task_schedule_invalid:${task.id}`);
    }
    if (task.multiAgent === "eligible" && task.dataClass === "private_user") {
      throw new Error(`ai_intelligence_task_private_multi_agent_forbidden:${task.id}`);
    }
    if (task.knowledgeWrite === "candidate_only" && task.output.mode !== "json_schema") {
      throw new Error(`ai_intelligence_task_knowledge_schema_required:${task.id}`);
    }
    if (!validIdentifier(task.evalSuiteId)) {
      throw new Error(`ai_intelligence_task_eval_invalid:${task.id}`);
    }
  }

  if (ids.size !== AI_INTELLIGENCE_TASK_IDS.length) {
    throw new Error("ai_intelligence_task_catalog_incomplete");
  }
  for (const taskId of AI_INTELLIGENCE_TASK_IDS) {
    if (!ids.has(taskId)) throw new Error(`ai_intelligence_task_missing:${taskId}`);
  }
}

validateAiIntelligenceTaskCatalog();
