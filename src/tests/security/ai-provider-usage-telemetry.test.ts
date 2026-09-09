import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeAiProviderUsageTelemetry } from "../../lib/ai/provider-usage-telemetry";

describe("AI provider usage telemetry", () => {
  it("normalizes OpenAI-compatible cached token evidence without inventing cost", () => {
    const telemetry = normalizeAiProviderUsageTelemetry({
      providerId: "openai",
      inputText: "input",
      outputText: "output",
      response: {
        usage: {
          input_tokens: 120,
          output_tokens: 30,
          input_tokens_details: { cached_tokens: 80 },
          output_tokens_details: { reasoning_tokens: 4 },
        },
      },
    });
    assert.equal(telemetry.inputTokens, 120);
    assert.equal(telemetry.outputTokens, 30);
    assert.equal(telemetry.cachedInputTokens, 80);
    assert.equal(telemetry.cacheReadInputTokens, 80);
    assert.equal(telemetry.cacheCreationInputTokens, null);
    assert.equal(telemetry.reasoningTokens, 4);
    assert.equal(telemetry.costUsdMicros, null);
    assert.equal(telemetry.costSource, null);
  });

  it("converts xAI integer cost ticks to micro-dollars exactly", () => {
    const telemetry = normalizeAiProviderUsageTelemetry({
      providerId: "xai",
      inputText: "input",
      outputText: "output",
      response: {
        usage: {
          input_tokens: 125,
          output_tokens: 48,
          input_tokens_details: { cached_tokens: 98 },
          num_server_side_tools_used: 2,
          cost_in_usd_ticks: 37_756_000,
        },
      },
    });
    assert.equal(telemetry.cachedInputTokens, 98);
    assert.equal(telemetry.serverToolInvocations, 2);
    assert.equal(telemetry.costUsdMicros, 3_776);
    assert.equal(telemetry.costSource, "usage.cost_in_usd_ticks");
  });

  it("normalizes Perplexity cache creation/read, tool calls and USD breakdown cost", () => {
    const telemetry = normalizeAiProviderUsageTelemetry({
      providerId: "perplexity",
      inputText: "input",
      outputText: "output",
      response: {
        usage: {
          input_tokens: 12_088,
          output_tokens: 2_743,
          input_tokens_details: {
            cache_creation_input_tokens: 120,
            cache_read_input_tokens: 4_736,
            cached_tokens: 4_736,
          },
          cost: {
            currency: "USD",
            input_cost: 0.00919,
            output_cost: 0.02743,
            tool_calls_cost: 0.0055,
            total_cost: 0.04271,
          },
          tool_calls_details: {
            fetch_url: { invocation: 1 },
            search_web: { invocation: 2 },
          },
        },
      },
    });
    assert.equal(telemetry.cacheCreationInputTokens, 120);
    assert.equal(telemetry.cacheReadInputTokens, 4_736);
    assert.equal(telemetry.serverToolInvocations, 3);
    assert.equal(telemetry.costUsdMicros, 42_710);
    assert.equal(telemetry.costSource, "usage.cost.total_cost");
  });

  it("normalizes Anthropic cache counters without treating absent cost as zero", () => {
    const telemetry = normalizeAiProviderUsageTelemetry({
      providerId: "anthropic",
      inputText: "input",
      outputText: "output",
      response: {
        usage: {
          input_tokens: 105,
          output_tokens: 6039,
          cache_read_input_tokens: 7123,
          cache_creation_input_tokens: 7345,
          server_tool_use: { web_search_requests: 1 },
        },
      },
    });
    assert.equal(telemetry.cacheReadInputTokens, 7_123);
    assert.equal(telemetry.cacheCreationInputTokens, 7_345);
    assert.equal(telemetry.cachedInputTokens, null);
    assert.equal(telemetry.serverToolInvocations, 1);
    assert.equal(telemetry.costUsdMicros, null);
  });

  it("marks token estimates explicitly when provider usage is absent", () => {
    const telemetry = normalizeAiProviderUsageTelemetry({
      providerId: "openrouter",
      inputText: "abcdefghij",
      outputText: "abcdef",
      response: {},
    });
    assert.equal(telemetry.inputTokenSource, "estimated");
    assert.equal(telemetry.outputTokenSource, "estimated");
    assert.equal(telemetry.cachedInputTokens, null);
    assert.equal(telemetry.serverToolInvocations, null);
    assert.equal(telemetry.costUsdMicros, null);
  });
});
