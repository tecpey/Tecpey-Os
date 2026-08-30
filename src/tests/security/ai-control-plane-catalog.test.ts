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
