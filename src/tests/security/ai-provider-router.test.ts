import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  callAiProvider,
  inspectOpenRouterKey,
  resetAiProviderCircuits,
  safeAiSourceUrl,
  testXApiConnector,
} from "../../lib/ai/provider-router";

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

function responseBody(provider: "responses" | "anthropic") {
  return provider === "anthropic"
    ? { content: [{ type: "text", text: "review complete" }], usage: { input_tokens: 3, output_tokens: 2 } }
    : {
        output_text: "source-grounded draft",
        citations: [{ url: "https://example.com/source", title: "Primary source" }],
        usage: { input_tokens: 4, output_tokens: 3 },
      };
}

beforeEach(() => resetAiProviderCircuits());

describe("multi-provider AI router", () => {
  it("uses OpenRouter Chat Completions with ZDR, data-collection denial and approved server tools", async () => {
    const captures: Captured[] = [];
    const result = await callAiProvider({
      providerId: "openrouter",
      agentId: "coin_tool_researcher",
      apiKey: "openrouter-test-key",
      model: "vendor/research-model",
      instructions: "trusted",
      input: "public query",
      dataClass: "public",
      requireZeroDataRetention: true,
    }, {
      fetchImpl: async (url, init) => {
        captures.push({
          url: String(url),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        });
        return new Response(JSON.stringify({
          model: "vendor/actual-model",
          choices: [{ message: { content: "source-grounded result" } }],
          annotations: [{ url: "https://example.com/openrouter-source", title: "Source" }],
          usage: { prompt_tokens: 5, completion_tokens: 4, cost: 0.000012 },
        }), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    const captured = captures[0];
    assert.ok(captured);
    assert.equal(captured.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(captured.headers.get("authorization"), "Bearer openrouter-test-key");
    assert.equal(captured.headers.get("http-referer"), "https://tecpey.ir");
    assert.deepEqual(captured.body.provider, { zdr: true, data_collection: "deny" });
    assert.deepEqual(captured.body.tools, [{ type: "openrouter:web_search" }]);
    if (result.ok) {
      assert.equal(result.model, "vendor/actual-model");
      assert.equal(result.requestedModel, "vendor/research-model");
      assert.equal(result.costUsdMicros, 12);
      assert.deepEqual(result.sources, [{
        url: "https://example.com/openrouter-source",
        title: "Source",
      }]);
    }
  });

  it("never attaches billable server tools to the OpenRouter free route", async () => {
    let body: Record<string, unknown> = {};
    const result = await callAiProvider({
      providerId: "openrouter",
      agentId: "coin_tool_researcher",
      apiKey: "openrouter-test-key",
      model: "openrouter/free",
      instructions: "trusted",
      input: "public query",
      dataClass: "public",
    }, {
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          model: "free-vendor/model",
          choices: [{ message: { content: "free result" } }],
        }), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    assert.equal("tools" in body, false);
  });

  it("classifies provider quota and rate-limit responses for failover", async () => {
    for (const [status, reason] of [[402, "quota_exhausted"], [429, "rate_limited"]] as const) {
      const result = await callAiProvider({
        providerId: "openrouter",
        agentId: "coin_tool_researcher",
        apiKey: "test-key",
        model: "vendor/model",
        instructions: "trusted",
        input: "public query",
      }, {
        fetchImpl: async () => new Response("{}", { status }),
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, reason);
    }
  });

  it("attributes a model fallback to the model that actually handled the request", async () => {
    let calls = 0;
    const result = await callAiProvider({
      providerId: "openai",
      agentId: "mentor_coach",
      apiKey: "test-key",
      model: "primary-model",
      fallbackModel: "fallback-model",
      instructions: "trusted",
      input: "educational question",
    }, {
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response("{}", { status: 400 })
          : new Response(JSON.stringify({ output_text: "fallback result" }), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    if (result.ok) {
      assert.equal(result.model, "fallback-model");
      assert.equal(result.requestedModel, "fallback-model");
      assert.equal(result.attempts, 2);
    }
  });

  it("recovers OpenRouter free routing from a transient 429 with Retry-After and bounded jitter", async () => {
    let clock = 1_000;
    let calls = 0;
    const delays: number[] = [];
    const result = await callAiProvider({
      providerId: "openrouter",
      agentId: "coin_tool_researcher",
      apiKey: "test-key",
      model: "openrouter/free",
      instructions: "trusted",
      input: "public query",
      timeoutMs: 12_000,
    }, {
      now: () => clock,
      random: () => 0,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
        clock += milliseconds;
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("{}", {
            status: 429,
            headers: { "Retry-After": "0.5" },
          });
        }
        return new Response(JSON.stringify({
          model: "free-vendor/recovered-model",
          choices: [{ message: { content: "recovered" } }],
        }), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(delays, [500]);
    assert.equal(calls, 2);
    if (result.ok) {
      assert.equal(result.attempts, 2);
      assert.equal(result.model, "free-vendor/recovered-model");
      assert.equal(result.requestedModel, "openrouter/free");
    }
  });

  it("caps OpenRouter free retries and reports the final safe rate-limit reason", async () => {
    let clock = 1_000;
    let calls = 0;
    const result = await callAiProvider({
      providerId: "openrouter",
      agentId: "coin_tool_researcher",
      apiKey: "test-key",
      model: "openrouter/free",
      instructions: "trusted",
      input: "public query",
      timeoutMs: 12_000,
    }, {
      now: () => clock,
      random: () => 0,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 429 });
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 3);
    if (!result.ok) {
      assert.equal(result.reason, "rate_limited");
      assert.equal(result.status, 429);
      assert.equal(result.attempts, 3);
    }
  });

  it("does not retry before a Retry-After value that exceeds the request deadline", async () => {
    let calls = 0;
    let sleeps = 0;
    const result = await callAiProvider({
      providerId: "openrouter",
      agentId: "coin_tool_researcher",
      apiKey: "test-key",
      model: "openrouter/free",
      instructions: "trusted",
      input: "public query",
      timeoutMs: 12_000,
    }, {
      now: () => 1_000,
      random: () => 0,
      sleep: async () => {
        sleeps += 1;
      },
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
    assert.equal(sleeps, 0);
    if (!result.ok) {
      assert.equal(result.reason, "rate_limited");
      assert.equal(result.attempts, 1);
    }
  });

  it("reselects the OpenRouter free route when a reasoning model returns no final content", async () => {
    let calls = 0;
    const result = await callAiProvider({
      providerId: "openrouter",
      agentId: "coin_tool_researcher",
      apiKey: "test-key",
      model: "openrouter/free",
      instructions: "trusted",
      input: "public query",
    }, {
      random: () => 0,
      sleep: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify(calls === 1
          ? { choices: [{ message: { reasoning: "budget consumed" } }] }
          : {
              model: "free-vendor/final-answer-model",
              choices: [{ message: { content: "usable final answer" } }],
            }), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    if (result.ok) {
      assert.equal(result.attempts, 2);
      assert.equal(result.model, "free-vendor/final-answer-model");
    }
  });

  it("reads bounded OpenRouter key limits without exposing the credential", async () => {
    let authorization = "";
    const result = await inspectOpenRouterKey({ apiKey: "openrouter-key" }, {
      now: () => Date.parse("2026-08-28T00:00:00.000Z"),
      fetchImpl: async (url, init) => {
        assert.equal(String(url), "https://openrouter.ai/api/v1/key");
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify({
          data: {
            limit: 25,
            limit_remaining: 7.5,
            usage_monthly: 17.5,
            is_free_tier: false,
          },
        }), { status: 200 });
      },
    });
    assert.equal(authorization, "Bearer openrouter-key");
    assert.deepEqual(result, {
      ok: true,
      limitUsdMicros: 25_000_000,
      limitRemainingUsdMicros: 7_500_000,
      usageMonthlyUsdMicros: 17_500_000,
      isFreeTier: false,
      checkedAt: "2026-08-28T00:00:00.000Z",
    });
  });

  it("treats malformed OpenRouter key payloads as invalid provider responses", async () => {
    const result = await inspectOpenRouterKey({ apiKey: "openrouter-key" }, {
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid_response" });
  });

  it("stops oversized provider streams before buffering the full response", async () => {
    let pulls = 0;
    let cancelled = false;
    const result = await callAiProvider({
      providerId: "openai",
      agentId: "coin_tool_researcher",
      apiKey: "openai-test-key",
      model: "test-model",
      instructions: "trusted",
      input: "public query",
    }, {
      fetchImpl: async () => new Response(new ReadableStream({
        pull(controller) {
          pulls += 1;
          if (pulls === 1) controller.enqueue(new Uint8Array(200_000));
          else if (pulls === 2) controller.enqueue(new Uint8Array(100_000));
          else {
            controller.enqueue(new Uint8Array(1));
            controller.close();
          }
        },
        cancel() {
          cancelled = true;
        },
      }, { highWaterMark: 0 }), { status: 200 }),
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "response_too_large");
    assert.equal(cancelled, true);
    assert.equal(pulls, 2, "the reader must not request another chunk after crossing the byte cap");
  });

  it("accepts a valid provider response exactly at the byte boundary", async () => {
    const prefix = '{"output_text":"';
    const suffix = '"}';
    const payload = `${prefix}${"x".repeat(256_000 - prefix.length - suffix.length)}${suffix}`;
    assert.equal(Buffer.byteLength(payload), 256_000);

    const result = await callAiProvider({
      providerId: "openai",
      agentId: "coin_tool_researcher",
      apiKey: "openai-test-key",
      model: "test-model",
      instructions: "trusted",
      input: "public query",
    }, {
      fetchImpl: async () => new Response(payload, { status: 200 }),
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.text.length, 256_000 - prefix.length - suffix.length);
    }
  });

  it("fails closed when a provider body stream errors after headers", async () => {
    const result = await callAiProvider({
      providerId: "openai",
      agentId: "coin_tool_researcher",
      apiKey: "openai-test-key",
      model: "test-model",
      instructions: "trusted",
      input: "public query",
    }, {
      fetchImpl: async () => new Response(new ReadableStream({
        start(controller) {
          controller.error(new Error("upstream stream reset"));
        },
      }), { status: 200 }),
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_response");
  });

  it("keeps the deadline active through a stalled body and cancels its reader", async () => {
    let clockReads = 0;
    let readerCancelled = false;
    const result = await callAiProvider({
      providerId: "openai",
      agentId: "coin_tool_researcher",
      apiKey: "openai-test-key",
      model: "test-model",
      instructions: "trusted",
      input: "public query",
      timeoutMs: 2_000,
      circuitScope: "deadline-body-test",
    }, {
      now: () => clockReads++ === 0 ? 0 : 1_990,
      fetchImpl: async () => new Response(new ReadableStream({
        start() {
          // Headers resolve, while the body deliberately never emits or closes.
        },
        cancel() {
          readerCancelled = true;
        },
      }), { status: 200 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "timeout");
    assert.equal(readerCancelled, true);
  });

  it("cancels a stalled body after caller abort without poisoning the circuit", async () => {
    const circuitScope = "caller-cancel-body-test";
    const base = {
      providerId: "openai" as const,
      agentId: "mentor_coach" as const,
      apiKey: "test-key",
      model: "test-model",
      instructions: "trusted",
      input: "safe educational question",
      circuitScope,
    };

    for (let index = 0; index < 3; index += 1) {
      const controller = new AbortController();
      let readerCancelled = false;
      const result = await callAiProvider({
        ...base,
        requestSignal: controller.signal,
      }, {
        fetchImpl: async () => {
          setTimeout(() => controller.abort(new DOMException("caller left", "AbortError")), 1);
          return new Response(new ReadableStream({
            start() {
              // Keep the body pending until the caller cancellation reaches the reader.
            },
            cancel() {
              readerCancelled = true;
            },
          }), { status: 200 });
        },
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "cancelled");
      assert.equal(readerCancelled, true);
    }

    let healthyCalls = 0;
    const healthy = await callAiProvider(base, {
      fetchImpl: async () => {
        healthyCalls += 1;
        return new Response(JSON.stringify({ output_text: "healthy" }), { status: 200 });
      },
    });
    assert.equal(healthy.ok, true);
    assert.equal(healthyCalls, 1);
  });

  it("uses the OpenAI Responses endpoint with storage disabled and catalog tools", async () => {
    const captures: Captured[] = [];
    const result = await callAiProvider({
      providerId: "openai",
      agentId: "coin_tool_researcher",
      apiKey: "openai-test-key",
      model: "test-model",
      instructions: "trusted",
      input: "public query",
    }, {
      fetchImpl: async (url, init) => {
        captures.push({
          url: String(url),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        });
        return new Response(JSON.stringify(responseBody("responses")), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    const captured = captures[0];
    assert.ok(captured);
    assert.equal(captured.url, "https://api.openai.com/v1/responses");
    assert.equal(captured.headers.get("authorization"), "Bearer openai-test-key");
    assert.equal(captured.body.store, false);
    assert.deepEqual(captured.body.tools, [{ type: "web_search" }]);
    if (result.ok) assert.deepEqual(result.sources, [{ url: "https://example.com/source", title: "Primary source" }]);
  });

  it("removes credential-shaped URL material from citation evidence", async () => {
    const result = await callAiProvider({
      providerId: "openai",
      agentId: "coin_tool_researcher",
      apiKey: "openai-test-key",
      model: "test-model",
      instructions: "trusted",
      input: "public query",
    }, {
      fetchImpl: async () => new Response(JSON.stringify({
        output_text: "source-grounded draft",
        citations: [{
          url: "https://reader:password@example.com/report?topic=btc&api_key=secret&signature=signed#private",
          title: "Primary source",
        }],
      }), { status: 200 }),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.sources, [{
        url: "https://example.com/report?topic=btc",
        title: "Primary source",
      }]);
    }
  });

  it("removes Azure, AWS, Google and CloudFront signed-query credentials", () => {
    assert.equal(
      safeAiSourceUrl("https://example.com/report?sp=section&st=state&topic=btc"),
      "https://example.com/report?sp=section&st=state&topic=btc",
    );
    assert.equal(
      safeAiSourceUrl(
        "https://blob.example/report?topic=btc&sp=r&se=2030-01-01&sv=2024-01-01&sig=AZURE_SECRET",
      ),
      "https://blob.example/report?topic=btc",
    );
    assert.equal(
      safeAiSourceUrl(
        "https://s3.example/report?topic=eth&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AWS_SECRET&X-Amz-Date=20260829T000000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=AWS_SIGNATURE",
      ),
      "https://s3.example/report?topic=eth",
    );
    assert.equal(
      safeAiSourceUrl(
        "https://storage.example/report?topic=sol&X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=GOOGLE_SECRET&X-Goog-Date=20260829T000000Z&X-Goog-Expires=300&X-Goog-SignedHeaders=host&X-Goog-Signature=GOOGLE_SIGNATURE",
      ),
      "https://storage.example/report?topic=sol",
    );
    assert.equal(
      safeAiSourceUrl(
        "https://cdn.example/report?topic=ada&Policy=POLICY_SECRET&Signature=CF_SIGNATURE&Key-Pair-Id=KEY_ID&Expires=1900000000",
      ),
      "https://cdn.example/report?topic=ada",
    );
  });

  it("uses xAI Responses with only x_search and web_search", async () => {
    const captures: Captured[] = [];
    const result = await callAiProvider({
      providerId: "xai",
      agentId: "news_x_researcher",
      apiKey: "xai-test-key",
      model: "grok-test",
      instructions: "trusted",
      input: "public X query",
    }, {
      fetchImpl: async (url, init) => {
        captures.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(responseBody("responses")), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    const captured = captures[0];
    assert.ok(captured);
    assert.equal(captured.url, "https://api.x.ai/v1/responses");
    assert.equal(captured.body.store, false);
    assert.deepEqual(captured.body.tools, [{ type: "x_search" }, { type: "web_search" }]);
  });

  it("uses Perplexity Agent API with web search and storage disabled", async () => {
    const captures: Captured[] = [];
    const result = await callAiProvider({
      providerId: "perplexity",
      agentId: "coin_tool_researcher",
      apiKey: "perplexity-test-key",
      model: "research-test",
      instructions: "trusted",
      input: "public web query",
    }, {
      fetchImpl: async (url, init) => {
        captures.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(responseBody("responses")), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    const captured = captures[0];
    assert.ok(captured);
    assert.equal(captured.url, "https://api.perplexity.ai/v1/agent");
    assert.equal(captured.body.store, false);
    assert.deepEqual(captured.body.tools, [{ type: "web_search" }]);
  });

  it("uses Anthropic Messages headers and the approved web-search tool shape", async () => {
    const captures: Captured[] = [];
    const result = await callAiProvider({
      providerId: "anthropic",
      agentId: "knowledge_curator",
      apiKey: "anthropic-test-key",
      model: "claude-test",
      instructions: "trusted",
      input: "approved candidate",
    }, {
      fetchImpl: async (url, init) => {
        captures.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(responseBody("anthropic")), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    const captured = captures[0];
    assert.ok(captured);
    assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
    assert.equal(captured.headers.get("x-api-key"), "anthropic-test-key");
    assert.equal(captured.headers.get("anthropic-version"), "2023-06-01");
    assert.deepEqual(captured.body.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]);
    assert.equal("store" in captured.body, false);
  });

  it("cannot grant a forbidden provider or add tools during a connectivity test", async () => {
    await assert.rejects(
      callAiProvider({
        providerId: "openai",
        agentId: "news_x_researcher",
        apiKey: "test-key",
        model: "test-model",
        instructions: "trusted",
        input: "query",
      }),
      /ai_agent_provider_forbidden/,
    );

    let body: Record<string, unknown> = {};
    const result = await callAiProvider({
      providerId: "xai",
      agentId: "news_x_researcher",
      apiKey: "test-key",
      model: "test-model",
      instructions: "trusted",
      input: "connectivity",
      toolsEnabled: false,
    }, {
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(responseBody("responses")), { status: 200 });
      },
    });
    assert.equal(result.ok, true);
    assert.equal("tools" in body, false);
  });

  it("tests the X connector through one fixed public endpoint", async () => {
    let url = "";
    let authorization = "";
    const passed = await testXApiConnector("x-bearer", {
      fetchImpl: async (input, init) => {
        url = String(input);
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify({ data: { id: "783214" } }), { status: 200 });
      },
    });
    assert.equal(passed, true);
    assert.equal(url, "https://api.x.com/2/users/by/username/X?user.fields=id");
    assert.equal(authorization, "Bearer x-bearer");
  });

  it("keeps provider circuit failures isolated by trusted tenant and workspace scope", async () => {
    let failingFetchCalls = 0;
    const failing = {
      fetchImpl: async () => {
        failingFetchCalls += 1;
        throw new Error("tenant A provider network failure");
      },
    };
    const base = {
      providerId: "openai" as const,
      agentId: "mentor_coach" as const,
      apiKey: "test-key",
      model: "test-model",
      instructions: "trusted",
      input: "safe educational question",
      circuitScope: "tenant-a:workspace-a",
    };
    for (let index = 0; index < 3; index += 1) {
      const failed = await callAiProvider(base, failing);
      assert.equal(failed.ok, false);
      if (!failed.ok) assert.equal(failed.reason, "network_error");
    }
    const blocked = await callAiProvider(base, failing);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.reason, "circuit_open");
    assert.equal(failingFetchCalls, 3);

    const independent = await callAiProvider({
      ...base,
      circuitScope: "tenant-b:workspace-b",
    }, {
      fetchImpl: async () =>
        new Response(JSON.stringify(responseBody("responses")), { status: 200 }),
    });
    assert.equal(independent.ok, true);
  });

  it("does not open the circuit for permanent HTTP rejections or exhausted quota", async () => {
    const base = {
      providerId: "openai" as const,
      agentId: "mentor_coach" as const,
      apiKey: "test-key",
      model: "test-model",
      instructions: "trusted",
      input: "safe educational question",
      circuitScope: "permanent-http-test",
    };
    for (const status of [400, 401, 403, 402, 404]) {
      const rejected = await callAiProvider(base, {
        fetchImpl: async () => new Response("{}", { status }),
      });
      assert.equal(rejected.ok, false);
      if (!rejected.ok) {
        assert.equal(
          rejected.reason,
          status === 402 ? "quota_exhausted" : "provider_rejected",
        );
      }
    }

    let healthyCalls = 0;
    const healthy = await callAiProvider(base, {
      fetchImpl: async () => {
        healthyCalls += 1;
        return new Response(JSON.stringify({ output_text: "healthy" }), { status: 200 });
      },
    });
    assert.equal(healthy.ok, true);
    assert.equal(healthyCalls, 1);
  });

  it("does not promote an unrelated echoed URL to citation evidence", async () => {
    const result = await callAiProvider({
      providerId: "openai",
      agentId: "coin_tool_researcher",
      apiKey: "test-key",
      model: "test-model",
      instructions: "trusted",
      input: "public research",
    }, {
      fetchImpl: async () => new Response(JSON.stringify({
        output_text: "Draft without source evidence",
        echo: { url: "https://example.com/not-a-citation" },
      }), { status: 200 }),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.sources, []);
  });
});
