import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  callAiProvider,
  resetAiProviderCircuits,
} from "../../lib/ai/provider-router";

beforeEach(() => resetAiProviderCircuits());

describe("AI provider router telemetry authority", () => {
  it("rejects a forbidden provider-agent pair before any provider request", async () => {
    let calls = 0;
    await assert.rejects(callAiProvider({
      providerId: "xai", agentId: "coin_tool_researcher",
      apiKey: "xai-test-key", model: "grok-test-model",
      instructions: "public research", input: "public query", dataClass: "public",
    }, {
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}");
      },
    }), /ai_agent_provider_forbidden:coin_tool_researcher:xai/);
    assert.equal(calls, 0);
  });

  it("projects legacy usage fields from the canonical normalized telemetry object", async () => {
    const result = await callAiProvider({
      providerId: "xai",
      agentId: "news_x_researcher",
      apiKey: "xai-test-key",
      model: "grok-test-model",
      instructions: "trusted public research",
      input: "public query",
      dataClass: "public",
    }, {
      fetchImpl: async () => new Response(JSON.stringify({
        model: "grok-test-model-2026-09-09",
        output_text: "source-grounded result",
        usage: {
          input_tokens: 125,
          output_tokens: 48,
          input_tokens_details: { cached_tokens: 98 },
          output_tokens_details: { reasoning_tokens: 11 },
          num_server_side_tools_used: 2,
          cost_in_usd_ticks: 37_756_000,
        },
      }), { status: 200 }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.usage.providerId, "xai");
    assert.equal(result.usage.inputTokens, 125);
    assert.equal(result.usage.outputTokens, 48);
    assert.equal(result.usage.inputTokenSource, "provider");
    assert.equal(result.usage.outputTokenSource, "provider");
    assert.equal(result.usage.cachedInputTokens, 98);
    assert.equal(result.usage.cacheReadInputTokens, 98);
    assert.equal(result.usage.cacheCreationInputTokens, null);
    assert.equal(result.usage.reasoningTokens, 11);
    assert.equal(result.usage.serverToolInvocations, 2);
    assert.equal(result.usage.costUsdMicros, 3_776);
    assert.equal(result.usage.costSource, "usage.cost_in_usd_ticks");

    assert.equal(result.inputTokens, result.usage.inputTokens);
    assert.equal(result.outputTokens, result.usage.outputTokens);
    assert.equal(result.costUsdMicros, result.usage.costUsdMicros);
    assert.equal(result.model, "grok-test-model-2026-09-09");
    assert.equal(result.requestedModel, "grok-test-model");
  });

  it("preserves explicit estimated-token provenance when a provider omits usage", async () => {
    const result = await callAiProvider({
      providerId: "openai",
      agentId: "coin_tool_researcher",
      apiKey: "openai-test-key",
      model: "test-model",
      instructions: "trusted",
      input: "abcdefghij",
      dataClass: "public",
    }, {
      fetchImpl: async () => new Response(JSON.stringify({
        output_text: "abcdef",
      }), { status: 200 }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.usage.inputTokenSource, "estimated");
    assert.equal(result.usage.outputTokenSource, "estimated");
    assert.equal(result.usage.costUsdMicros, null);
    assert.equal(result.usage.costSource, null);
    assert.equal(result.inputTokens, result.usage.inputTokens);
    assert.equal(result.outputTokens, result.usage.outputTokens);
    assert.equal(result.costUsdMicros, null);
  });
});
