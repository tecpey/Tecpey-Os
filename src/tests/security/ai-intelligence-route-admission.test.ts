import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiDataClass, AiModelProviderId } from "../../lib/ai/control-plane-catalog";
import type { AiIntelligenceEndpointId } from "../../lib/ai/intelligence-endpoint-policy";
import type {
  AiIntelligenceEvalEvidence,
  AiIntelligenceModelCapabilitySnapshot,
} from "../../lib/ai/intelligence-model-policy";
import { evaluateAiIntelligenceRouteAdmission } from "../../lib/ai/intelligence-route-admission";
import type { AiIntelligenceTaskId } from "../../lib/ai/intelligence-task-catalog";

const NOW_MS = Date.parse("2026-09-09T12:00:00.000Z");

function capability(input: {
  providerId: AiModelProviderId;
  model: string;
  dataClasses: readonly AiDataClass[];
  capabilities: readonly string[];
  tools: readonly string[];
  zeroDataRetention?: boolean;
}): AiIntelligenceModelCapabilitySnapshot {
  return {
    providerId: input.providerId,
    requestedModel: input.model,
    canonicalModel: input.model,
    observedAt: "2026-09-09T11:00:00.000Z",
    exactModelIdentity: true,
    deprecated: false,
    zeroDataRetention: input.zeroDataRetention ?? true,
    supportedDataClasses: input.dataClasses,
    capabilities: input.capabilities,
    tools: input.tools,
    cacheMode: "implicit",
  };
}

function evalEvidence(input: {
  taskId: AiIntelligenceTaskId;
  evalSuiteId: string;
  providerId: AiModelProviderId;
  model: string;
  sampleSize: number;
  qualityBasisPoints: number;
}): AiIntelligenceEvalEvidence {
  return {
    taskId: input.taskId,
    evalSuiteId: input.evalSuiteId,
    candidateProviderId: input.providerId,
    candidateModel: input.model,
    measuredAt: "2026-09-08T12:00:00.000Z",
    sampleSize: input.sampleSize,
    qualityBasisPoints: input.qualityBasisPoints,
  };
}

function growthOpenAiRoute(overrides: Partial<{
  agentId: "growth_hacker" | "coin_tool_researcher";
  dataClass: AiDataClass;
  endpointId: AiIntelligenceEndpointId;
  evalProviderId: AiModelProviderId;
}> = {}) {
  const model = "gpt-growth-eval-2026-09-01";
  return evaluateAiIntelligenceRouteAdmission({
    taskId: "growth_scan",
    agentId: overrides.agentId ?? "growth_hacker",
    dataClass: overrides.dataClass ?? "public",
    endpointId: overrides.endpointId ?? "openai_responses",
    capability: capability({
      providerId: "openai",
      model,
      dataClasses: ["public"],
      capabilities: ["text", "web_search", "citations", "structured_output"],
      tools: ["web_search"],
    }),
    evalEvidence: evalEvidence({
      taskId: "growth_scan",
      evalSuiteId: "growth_signal_precision_v1",
      providerId: overrides.evalProviderId ?? "openai",
      model,
      sampleSize: 80,
      qualityBasisPoints: 9000,
    }),
    requireZeroDataRetention: true,
    nowMs: NOW_MS,
  });
}

describe("AI intelligence unified route admission", () => {
  it("admits only when task, endpoint, provider and model evidence align", () => {
    const result = growthOpenAiRoute();
    assert.equal(result.status, "eligible");
    assert.deepEqual(result.reasons, []);
    assert.equal(result.route.providerId, "openai");
    assert.equal(result.route.endpointId, "openai_responses");
    assert.equal(result.route.dataClass, "public");
  });

  it("rejects an agent that is not authorized for the task even when its provider is allowed", () => {
    const result = growthOpenAiRoute({ agentId: "coin_tool_researcher" });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.deepEqual(result.localReasons, ["task_agent_forbidden"]);
    }
  });

  it("rejects caller data-class drift instead of evaluating a different lane", () => {
    const result = growthOpenAiRoute({ dataClass: "aggregate_deidentified" });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.deepEqual(result.localReasons, ["task_data_class_mismatch"]);
    }
  });

  it("does not combine a valid endpoint with capability evidence from another provider", () => {
    const result = growthOpenAiRoute({ endpointId: "xai_responses" });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.deepEqual(result.localReasons, ["endpoint_provider_mismatch"]);
      assert.deepEqual(result.endpointReasons, []);
      assert.deepEqual(result.modelReasons, []);
    }
  });

  it("keeps endpoint, task and model rejection evidence independently inspectable", () => {
    const model = "perplexity-public-research-eval";
    const result = evaluateAiIntelligenceRouteAdmission({
      taskId: "mentor_public_research",
      agentId: "news_x_researcher",
      dataClass: "public",
      endpointId: "perplexity_agent",
      capability: capability({
        providerId: "perplexity",
        model,
        dataClasses: ["public"],
        capabilities: ["text", "web_search", "citations"],
        tools: ["web_search"],
      }),
      evalEvidence: evalEvidence({
        taskId: "mentor_public_research",
        evalSuiteId: "mentor_public_research_v1",
        providerId: "perplexity",
        model,
        sampleSize: 80,
        qualityBasisPoints: 9400,
      }),
      requireZeroDataRetention: true,
      nowMs: NOW_MS,
    });

    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.deepEqual(result.localReasons, ["agent_provider_forbidden"]);
      assert.deepEqual(result.endpointReasons, []);
      assert.deepEqual(result.modelReasons, []);
    }
  });

  it("rejects eval evidence for a different provider even when endpoint evidence is valid", () => {
    const result = growthOpenAiRoute({ evalProviderId: "xai" });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.deepEqual(result.localReasons, []);
      assert.deepEqual(result.endpointReasons, []);
      assert.ok(result.modelReasons.includes("eval_suite_mismatch"));
    }
  });

  it("cannot weaken the agent OpenRouter zero-retention policy at admission time", () => {
    const model = "openrouter-mentor-eval";
    const result = evaluateAiIntelligenceRouteAdmission({
      taskId: "mentor_coach",
      agentId: "mentor_coach",
      dataClass: "private_user",
      endpointId: "openrouter_chat_completions",
      capability: capability({
        providerId: "openrouter",
        model,
        dataClasses: ["private_user"],
        capabilities: ["text"],
        tools: ["platform_knowledge"],
        zeroDataRetention: false,
      }),
      evalEvidence: evalEvidence({
        taskId: "mentor_coach",
        evalSuiteId: "mentor_coaching_safety_v1",
        providerId: "openrouter",
        model,
        sampleSize: 150,
        qualityBasisPoints: 9500,
      }),
      requireZeroDataRetention: false,
      nowMs: NOW_MS,
    });

    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.route.requireZeroDataRetention, true);
      assert.ok(result.modelReasons.includes("zero_retention_required"));
    }
  });
});
