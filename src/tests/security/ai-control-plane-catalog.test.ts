import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_AGENT_CATALOG,
  AI_PROVIDER_CATALOG,
  AI_WORKFLOW_CATALOG,
  aiToolsForAgent,
  assertAiAgentProviderAllowed,
  validateAiCatalog,
} from "../../lib/ai/control-plane-catalog";
import {
  AI_INTELLIGENCE_TASK_CATALOG,
  aiIntelligenceTaskDefinition,
  validateAiIntelligenceTaskCatalog,
} from "../../lib/ai/intelligence-task-catalog";
import {
  AI_INTELLIGENCE_EVAL_REQUIREMENTS,
  evaluateAiIntelligenceModelEligibility,
  type AiIntelligenceModelCapabilitySnapshot,
} from "../../lib/ai/intelligence-model-policy";

describe("AI control-plane catalog", () => {
  it("keeps publication, private data and knowledge promotion fail-closed", () => {
    assert.doesNotThrow(() => validateAiCatalog());
    assert.equal(AI_AGENT_CATALOG.every((agent) => agent.mayPublish === false), true);
    assert.deepEqual(
      AI_AGENT_CATALOG.filter((agent) => agent.mayReceivePrivateUserData).map((agent) => agent.id),
      ["mentor_coach"],
    );
    const curator = AI_AGENT_CATALOG.find((agent) => agent.id === "knowledge_curator");
    assert.equal(curator?.approvalMode, "before_knowledge_promotion");
    assert.ok(curator?.forbiddenActions.includes("knowledge_auto_verify"));
  });

  it("distinguishes the X data connector from model providers", () => {
    const xConnector = AI_PROVIDER_CATALOG.find((provider) => provider.id === "x_api");
    const grok = AI_PROVIDER_CATALOG.find((provider) => provider.id === "xai");
    assert.equal(xConnector?.kind, "data_connector");
    assert.equal(xConnector?.fixedEndpointHost, "api.x.com");
    assert.equal(grok?.kind, "model");
    assert.equal(grok?.fixedEndpointHost, "api.x.ai");
    assert.equal(AI_AGENT_CATALOG.some((agent) =>
      (agent.allowedProviders as readonly string[]).includes("x_api")), false);
  });

  it("allows OpenRouter while keeping free routing public and non-sensitive", () => {
    const openRouter = AI_PROVIDER_CATALOG.find(
      (provider) => provider.id === "openrouter",
    );
    assert.equal(openRouter?.kind, "model");
    assert.equal(openRouter?.fixedEndpointHost, "openrouter.ai");
    const freeAgents = AI_AGENT_CATALOG.filter(
      (agent) => agent.openRouterFallback.freeAllowed,
    );
    assert.deepEqual(
      freeAgents.map((agent) => agent.id),
      ["news_x_researcher", "coin_tool_researcher"],
    );
    assert.equal(
      freeAgents.every(
        (agent) =>
          agent.openRouterFallback.allowedDataClasses.length === 1 &&
          agent.openRouterFallback.allowedDataClasses[0] === "public" &&
          !agent.mayReceivePrivateUserData,
      ),
      true,
    );
  });

  it("derives tools only from the immutable agent/provider intersection", () => {
    assert.deepEqual(aiToolsForAgent("news_x_researcher", "xai"), ["x_search", "web_search"]);
    assert.deepEqual(aiToolsForAgent("coin_tool_researcher", "perplexity"), ["web_search"]);
    assert.deepEqual(aiToolsForAgent("mentor_coach", "openai"), []);
    assert.ok(
      AI_AGENT_CATALOG.find((agent) => agent.id === "mentor_coach")?.allowedTools.includes("platform_knowledge"),
    );
    assert.throws(
      () => assertAiAgentProviderAllowed("news_x_researcher", "openai"),
      /ai_agent_provider_forbidden/,
    );
  });

  it("requires a human stage for every workflow with an external effect", () => {
    for (const workflow of AI_WORKFLOW_CATALOG) {
      if (workflow.externalEffect === "none") continue;
      assert.ok(
        workflow.stages.some((stage) => stage.startsWith("human_")),
        `${workflow.id} must retain a human authority stage`,
      );
    }
  });

  it("defines public Mentor research as a no-effect workflow with explicit isolation guards", () => {
    const workflow = AI_WORKFLOW_CATALOG.find(
      (item) => item.id === "mentor_public_research",
    );
    assert.equal(workflow?.externalEffect, "none");
    assert.ok(workflow?.stages.includes("private_context_exclusion"));
    assert.ok(workflow?.stages.includes("citation_and_output_safety_guard"));
    assert.ok(workflow?.stages.includes("thread_persistence_and_evidence"));
  });
});

describe("AI intelligence task catalog", () => {
  it("is complete, deterministic and never grants an AI task an external effect", () => {
    assert.doesNotThrow(() => validateAiIntelligenceTaskCatalog());
    assert.equal(
      AI_INTELLIGENCE_TASK_CATALOG.every((task) => task.externalEffect === false),
      true,
    );
    assert.equal(
      new Set(AI_INTELLIGENCE_TASK_CATALOG.map((task) => task.id)).size,
      AI_INTELLIGENCE_TASK_CATALOG.length,
    );
  });

  it("keeps provider-cited research public and tool-grounded", () => {
    const citedTasks = AI_INTELLIGENCE_TASK_CATALOG.filter(
      (task) => task.evidencePolicy === "provider_citations",
    );
    assert.ok(citedTasks.length > 0);
    assert.equal(
      citedTasks.every(
        (task) =>
          task.dataClass === "public" &&
          task.requiredCapabilities.includes("citations") &&
          task.requiredTools.length > 0,
      ),
      true,
    );
  });

  it("keeps private Mentor coaching single-agent and grounded only in verified knowledge", () => {
    const mentor = aiIntelligenceTaskDefinition("mentor_coach");
    assert.equal(mentor.dataClass, "private_user");
    assert.deepEqual(mentor.allowedAgents, ["mentor_coach"]);
    assert.equal(mentor.multiAgent, "forbidden");
    assert.equal(mentor.evidencePolicy, "verified_knowledge");
    assert.equal(mentor.knowledgeRead, "verified_only");
    assert.equal(mentor.knowledgeWrite, "none");
  });

  it("forbids multi-agent execution for recurring high-frequency intelligence tasks", () => {
    const frequent = AI_INTELLIGENCE_TASK_CATALOG.filter(
      (task) => task.minimumScheduleMinutes !== null && task.minimumScheduleMinutes <= 15,
    );
    assert.ok(frequent.length > 0);
    assert.equal(frequent.every((task) => task.multiAgent === "forbidden"), true);
  });

  it("requires schema output for every task that can create a knowledge candidate", () => {
    const writers = AI_INTELLIGENCE_TASK_CATALOG.filter(
      (task) => task.knowledgeWrite === "candidate_only",
    );
    assert.ok(writers.length > 0);
    assert.equal(
      writers.every(
        (task) =>
          task.output.mode === "json_schema" &&
          Boolean(task.output.schemaId) &&
          task.requiredCapabilities.includes("structured_output"),
      ),
      true,
    );
  });

  it("encodes the incident-safe News retry and provider-call ceilings", () => {
    const translation = aiIntelligenceTaskDefinition("news_translate");
    assert.equal(translation.modelTier, "economy");
    assert.equal(translation.retry.class, "transient_bounded");
    assert.equal(translation.retry.minBackoffSeconds, 120);
    assert.equal(translation.retry.maxExecutions, 3);
    assert.equal(translation.retry.maxProviderAttemptsPerExecution, 2);
    assert.equal(translation.output.mode, "json_schema");
  });
});

describe("AI intelligence model eligibility", () => {
  const nowMs = Date.parse("2026-09-09T12:00:00.000Z");
  const baseCapability: AiIntelligenceModelCapabilitySnapshot = {
    providerId: "openai",
    requestedModel: "example-model-2026-09-01",
    canonicalModel: "example-model-2026-09-01",
    observedAt: "2026-09-08T12:00:00.000Z",
    exactModelIdentity: true,
    deprecated: false,
    zeroDataRetention: true,
    supportedDataClasses: ["public", "approved_platform_content", "private_user"],
    capabilities: ["text", "structured_output"],
    tools: [],
    cacheMode: "implicit",
  };

  it("admits only a fresh exact model with matching task eval evidence", () => {
    const requirement = AI_INTELLIGENCE_EVAL_REQUIREMENTS.news_translate;
    const result = evaluateAiIntelligenceModelEligibility({
      taskId: "news_translate",
      capability: baseCapability,
      evalEvidence: {
        taskId: "news_translate",
        evalSuiteId: "news_translation_fa_v1",
        candidateProviderId: "openai",
        candidateModel: baseCapability.canonicalModel,
        measuredAt: "2026-09-08T12:00:00.000Z",
        sampleSize: requirement.minimumSamples,
        qualityBasisPoints: requirement.minimumQualityBasisPoints,
      },
      requireZeroDataRetention: true,
      nowMs,
    });
    assert.equal(result.status, "eligible");
  });

  it("rejects aliases, stale evidence, insufficient evals and missing capabilities before routing", () => {
    const result = evaluateAiIntelligenceModelEligibility({
      taskId: "growth_scan",
      capability: {
        ...baseCapability,
        requestedModel: "latest",
        canonicalModel: "example-search-model",
        observedAt: "2026-07-01T00:00:00.000Z",
        exactModelIdentity: false,
        zeroDataRetention: false,
        supportedDataClasses: ["public"],
        capabilities: ["text", "web_search"],
        tools: [],
      },
      evalEvidence: {
        taskId: "growth_scan",
        evalSuiteId: "growth_signal_precision_v1",
        candidateProviderId: "openai",
        candidateModel: "different-model",
        measuredAt: "2026-07-01T00:00:00.000Z",
        sampleSize: 2,
        qualityBasisPoints: 100,
      },
      requireZeroDataRetention: true,
      nowMs,
    });
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") return;
    assert.ok(result.reasons.includes("model_identity_unpinned"));
    assert.ok(result.reasons.includes("capability_snapshot_stale"));
    assert.ok(result.reasons.includes("zero_retention_required"));
    assert.ok(result.reasons.includes("capability_missing"));
    assert.ok(result.reasons.includes("tool_missing"));
    assert.ok(result.reasons.includes("eval_suite_mismatch"));
    assert.ok(result.reasons.includes("eval_stale"));
    assert.ok(result.reasons.includes("eval_sample_insufficient"));
    assert.ok(result.reasons.includes("eval_threshold_not_met"));
  });

  it("rejects deprecated candidates even when their eval score is high", () => {
    const requirement = AI_INTELLIGENCE_EVAL_REQUIREMENTS.news_translate;
    const result = evaluateAiIntelligenceModelEligibility({
      taskId: "news_translate",
      capability: { ...baseCapability, deprecated: true },
      evalEvidence: {
        taskId: "news_translate",
        evalSuiteId: "news_translation_fa_v1",
        candidateProviderId: "openai",
        candidateModel: baseCapability.canonicalModel,
        measuredAt: "2026-09-08T12:00:00.000Z",
        sampleSize: requirement.minimumSamples,
        qualityBasisPoints: 10_000,
      },
      requireZeroDataRetention: true,
      nowMs,
    });
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") return;
    assert.ok(result.reasons.includes("model_deprecated"));
  });
});
