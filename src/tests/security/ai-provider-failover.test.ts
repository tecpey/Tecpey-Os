import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { callAiProviderWithFailover } from "../../lib/ai/provider-failover";
import { resetAiProviderCircuits } from "../../lib/ai/provider-router";

const successBody = (model: string) => JSON.stringify({
  model,
  choices: [{ message: { content: "reviewed public result" } }],
  citations: [{ url: "https://example.com/source" }],
  usage: { prompt_tokens: 4, completion_tokens: 3 },
});

const base = {
  agentId: "coin_tool_researcher" as const,
  primary: {
    providerId: "perplexity" as const,
    apiKey: "primary-key",
    model: "primary-model",
  },
  openRouter: {
    apiKey: "openrouter-key",
    paidModel: "vendor/paid-model",
    freeFallbackEnabled: true,
    creditFloorUsdMicros: 1_000_000,
  },
  dataClass: "public" as const,
  criticality: "noncritical" as const,
  externalEffect: false,
  instructions: "trusted",
  input: "public research",
  timeoutMs: 20_000,
};

beforeEach(() => resetAiProviderCircuits());

describe("AI provider budget failover", () => {
  it("executes the deterministic candidate plan and fails over across providers", async () => {
    const urls: string[] = [];
    const result = await callAiProviderWithFailover({
      agentId: "mentor_coach",
      primary: {
        providerId: "openai",
        apiKey: "legacy-primary-key",
        model: "legacy-model",
      },
      dataClass: "private_user",
      criticality: "standard",
      externalEffect: false,
      approvalSatisfied: true,
      authorizedSpendUsdMicros: 500_000,
      instructions: "trusted",
      input: "private mentor input",
      timeoutMs: 20_000,
      routeCandidates: [
        {
          providerId: "openai",
          apiKey: "openai-key",
          model: "gpt-route",
          priority: 1,
          enabled: true,
          health: "healthy",
          estimatedMaxCostUsdMicros: 200_000,
          expectedLatencyMs: 500,
          zeroDataRetention: true,
          free: false,
          supportedDataClasses: ["private_user"],
        },
        {
          providerId: "anthropic",
          apiKey: "anthropic-key",
          model: "claude-route",
          priority: 2,
          enabled: true,
          health: "healthy",
          estimatedMaxCostUsdMicros: 250_000,
          expectedLatencyMs: 600,
          zeroDataRetention: true,
          free: false,
          supportedDataClasses: ["private_user"],
        },
      ],
    }, {
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).includes("api.openai.com")) {
          return new Response("{}", { status: 429 });
        }
        return new Response(JSON.stringify({
          model: "claude-route",
          content: [{ type: "text", text: "safe mentor response" }],
          usage: { input_tokens: 3, output_tokens: 4 },
        }), { status: 200 });
      },
    });
    assert.equal(result.result.ok, true);
    assert.equal(result.result.providerId, "anthropic");
    assert.equal(result.routeMode, "alternate");
    assert.equal(result.fallbackAttempted, true);
    assert.equal(result.primaryFailureReason, "rate_limited");
    assert.equal(result.candidateCount, 2);
    assert.match(result.decisionHash ?? "", /^[0-9a-f]{64}$/);
    assert.deepEqual(urls, [
      "https://api.openai.com/v1/responses",
      "https://api.anthropic.com/v1/messages",
    ]);
  });

  it("blocks a planned private free route before provider egress", async () => {
    let called = false;
    const result = await callAiProviderWithFailover({
      agentId: "mentor_coach",
      primary: { providerId: "openai", apiKey: "legacy", model: "legacy" },
      dataClass: "private_user",
      criticality: "standard",
      externalEffect: false,
      approvalSatisfied: true,
      authorizedSpendUsdMicros: 500_000,
      instructions: "trusted",
      input: "private mentor input",
      routeCandidates: [{
        providerId: "openrouter",
        apiKey: "openrouter-key",
        model: "openrouter/free",
        priority: 1,
        enabled: true,
        health: "healthy",
        estimatedMaxCostUsdMicros: 0,
        expectedLatencyMs: 500,
        zeroDataRetention: true,
        free: true,
        supportedDataClasses: ["private_user"],
      }],
    }, {
      fetchImpl: async () => {
        called = true;
        throw new Error("blocked route reached provider");
      },
    });
    assert.equal(result.result.ok, false);
    assert.equal(result.result.attempts, 0);
    assert.equal(result.routeMode, "blocked");
    assert.equal(called, false);
  });

  it("blocks a planned paid OpenRouter route when credit authority is unknown", async () => {
    const urls: string[] = [];
    const result = await callAiProviderWithFailover({
      ...base,
      openRouter: null,
      authorizedSpendUsdMicros: 500_000,
      approvalSatisfied: true,
      routeCandidates: [{
        providerId: "openrouter",
        apiKey: "openrouter-key",
        model: "vendor/paid-model",
        priority: 1,
        enabled: true,
        health: "healthy",
        estimatedMaxCostUsdMicros: 200_000,
        expectedLatencyMs: 500,
        zeroDataRetention: true,
        free: false,
        supportedDataClasses: ["public"],
      }],
    }, {
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).endsWith("/api/v1/key")) {
          return new Response("{}", { status: 503 });
        }
        throw new Error("unknown credit authority reached a paid model");
      },
    });
    assert.equal(result.result.ok, false);
    assert.equal(result.routeMode, "blocked");
    assert.equal(result.result.attempts, 0);
    assert.equal(result.openRouterKeyStatus?.ok, false);
    assert.deepEqual(urls, ["https://openrouter.ai/api/v1/key"]);
  });

  it("keeps a successful primary route and never probes OpenRouter", async () => {
    const urls: string[] = [];
    const result = await callAiProviderWithFailover(base, {
      fetchImpl: async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify({
          output_text: "primary result",
          citations: [{ url: "https://example.com/primary" }],
        }), { status: 200 });
      },
    });
    assert.equal(result.result.ok, true);
    assert.equal(result.routeMode, "primary");
    assert.equal(result.fallbackAttempted, false);
    assert.deepEqual(urls, ["https://api.perplexity.ai/v1/agent"]);
  });

  it("switches from an exhausted primary to a paid OpenRouter model", async () => {
    const models: string[] = [];
    const result = await callAiProviderWithFailover(base, {
      fetchImpl: async (url, init) => {
        if (String(url).includes("api.perplexity.ai")) {
          return new Response("{}", { status: 402 });
        }
        if (String(url).endsWith("/api/v1/key")) {
          return new Response(JSON.stringify({
            data: { limit: 20, limit_remaining: 10, usage_monthly: 10, is_free_tier: false },
          }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body)) as { model: string };
        models.push(body.model);
        return new Response(successBody(body.model), { status: 200 });
      },
    });
    assert.equal(result.result.ok, true);
    assert.equal(result.routeMode, "openrouter_paid");
    assert.equal(result.primaryFailureReason, "quota_exhausted");
    assert.deepEqual(models, ["vendor/paid-model"]);
  });

  it("uses openrouter/free only for a public, noncritical, no-effect workload", async () => {
    const models: string[] = [];
    const result = await callAiProviderWithFailover(base, {
      fetchImpl: async (url, init) => {
        if (String(url).includes("api.perplexity.ai")) {
          return new Response("{}", { status: 429 });
        }
        if (String(url).endsWith("/api/v1/key")) {
          return new Response(JSON.stringify({
            data: { limit: 20, limit_remaining: 0, usage_monthly: 20, is_free_tier: false },
          }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body)) as { model: string; provider: unknown };
        models.push(body.model);
        assert.deepEqual(body.provider, { zdr: true, data_collection: "deny" });
        return new Response(successBody(body.model), { status: 200 });
      },
    });
    assert.equal(result.result.ok, true);
    assert.equal(result.routeMode, "openrouter_free");
    assert.deepEqual(models, ["openrouter/free"]);
  });

  it("fails closed on unknown paid credit and uses only the governed free route", async () => {
    const models: string[] = [];
    const result = await callAiProviderWithFailover(base, {
      fetchImpl: async (url, init) => {
        if (String(url).includes("api.perplexity.ai")) {
          return new Response("{}", { status: 429 });
        }
        if (String(url).endsWith("/api/v1/key")) {
          return new Response("{}", { status: 503 });
        }
        const body = JSON.parse(String(init?.body)) as { model: string };
        models.push(body.model);
        return new Response(successBody(body.model), { status: 200 });
      },
    });
    assert.equal(result.result.ok, true);
    assert.equal(result.routeMode, "openrouter_free");
    assert.equal(result.openRouterKeyStatus?.ok, false);
    assert.deepEqual(models, ["openrouter/free"]);
  });

  it("does not authorize paid fallback when the remaining balance is unknown", async () => {
    const models: string[] = [];
    const result = await callAiProviderWithFailover(base, {
      fetchImpl: async (url, init) => {
        if (String(url).includes("api.perplexity.ai")) {
          return new Response("{}", { status: 402 });
        }
        if (String(url).endsWith("/api/v1/key")) {
          return new Response(JSON.stringify({
            data: { limit: null, limit_remaining: null, usage_monthly: 0, is_free_tier: false },
          }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body)) as { model: string };
        models.push(body.model);
        return new Response(successBody(body.model), { status: 200 });
      },
    });
    assert.equal(result.result.ok, true);
    assert.equal(result.routeMode, "openrouter_free");
    assert.deepEqual(models, ["openrouter/free"]);
  });

  it("keeps sensitive workloads on the failed primary when paid credit authority is unavailable", async () => {
    const urls: string[] = [];
    const result = await callAiProviderWithFailover({
      ...base,
      agentId: "mentor_coach",
      primary: { ...base.primary, providerId: "openai" },
      dataClass: "private_user",
      criticality: "standard",
    }, {
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).includes("api.openai.com")) return new Response("{}", { status: 402 });
        if (String(url).endsWith("/api/v1/key")) return new Response("{}", { status: 503 });
        throw new Error("unknown paid authority reached an OpenRouter model endpoint");
      },
    });
    assert.equal(result.result.ok, false);
    assert.equal(result.routeMode, "primary");
    assert.equal(result.fallbackAttempted, false);
    assert.equal(urls.some((url) => url.endsWith("/chat/completions")), false);
  });

  it("degrades a paid OpenRouter primary model to its free router after quota exhaustion", async () => {
    const models: string[] = [];
    const result = await callAiProviderWithFailover({
      ...base,
      primary: {
        providerId: "openrouter",
        apiKey: "openrouter-key",
        model: "vendor/paid-model",
      },
    }, {
      fetchImpl: async (url, init) => {
        if (String(url).endsWith("/api/v1/key")) {
          return new Response(JSON.stringify({
            data: { limit: 20, limit_remaining: 0, usage_monthly: 20, is_free_tier: false },
          }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body)) as { model: string };
        models.push(body.model);
        return body.model === "vendor/paid-model"
          ? new Response("{}", { status: 402 })
          : new Response(successBody(body.model), { status: 200 });
      },
    });
    assert.equal(result.result.ok, true);
    assert.equal(result.routeMode, "openrouter_free");
    assert.equal(result.primaryFailureReason, "quota_exhausted");
    assert.deepEqual(models, ["vendor/paid-model", "openrouter/free"]);
  });

  it("never sends private Mentor data to the free router", async () => {
    const urls: string[] = [];
    const result = await callAiProviderWithFailover({
      ...base,
      agentId: "mentor_coach",
      primary: { ...base.primary, providerId: "openai" },
      dataClass: "private_user",
      criticality: "standard",
    }, {
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).includes("api.openai.com")) return new Response("{}", { status: 402 });
        if (String(url).endsWith("/api/v1/key")) {
          return new Response(JSON.stringify({
            data: { limit: 5, limit_remaining: 0, usage_monthly: 5, is_free_tier: false },
          }), { status: 200 });
        }
        throw new Error("private payload reached OpenRouter model endpoint");
      },
    });
    assert.equal(result.result.ok, false);
    assert.equal(result.routeMode, "primary");
    assert.equal(urls.some((url) => url.endsWith("/chat/completions")), false);
  });

  it("never uses a free model for an external-effect workflow", async () => {
    let modelCall = false;
    const result = await callAiProviderWithFailover({ ...base, externalEffect: true }, {
      fetchImpl: async (url) => {
        if (String(url).includes("api.perplexity.ai")) return new Response("{}", { status: 402 });
        if (String(url).endsWith("/api/v1/key")) {
          return new Response(JSON.stringify({
            data: { limit: 1, limit_remaining: 0, usage_monthly: 1, is_free_tier: false },
          }), { status: 200 });
        }
        modelCall = true;
        return new Response(successBody("unexpected"), { status: 200 });
      },
    });
    assert.equal(result.result.ok, false);
    assert.equal(modelCall, false);
  });
});
