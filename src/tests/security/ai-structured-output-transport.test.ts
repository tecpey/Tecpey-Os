import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aiProviderSupportsStructuredOutput,
  createStructuredOutputFetch,
} from "../../lib/ai/structured-output-transport";

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    score: { type: "number" },
  },
  required: ["title", "score"],
  additionalProperties: false,
} as const;

type Capture = {
  url: string;
  body: Record<string, unknown>;
};

function capturingTransport(captures: Capture[]): typeof fetch {
  return async (input, init) => {
    captures.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
}

describe("AI structured output transport", () => {
  it("advertises only provider adapters with an implemented strict schema mapping", () => {
    assert.equal(aiProviderSupportsStructuredOutput("openai"), true);
    assert.equal(aiProviderSupportsStructuredOutput("anthropic"), true);
    assert.equal(aiProviderSupportsStructuredOutput("xai"), true);
    assert.equal(aiProviderSupportsStructuredOutput("perplexity"), true);
    assert.equal(aiProviderSupportsStructuredOutput("openrouter"), false);
  });

  it("injects OpenAI Responses structured output at text.format", async () => {
    const captures: Capture[] = [];
    const transport = createStructuredOutputFetch(
      { name: "growth_signal", schema },
      capturingTransport(captures),
    );
    await transport("https://api.openai.com/v1/responses", {
      method: "POST",
      body: JSON.stringify({ model: "test", input: "query", store: false }),
    });
    assert.deepEqual(captures[0]?.body.text, {
      format: {
        type: "json_schema",
        name: "growth_signal",
        schema,
        strict: true,
      },
    });
  });

  it("injects xAI Responses structured output at text.format without dropping existing text settings", async () => {
    const captures: Capture[] = [];
    const transport = createStructuredOutputFetch(
      { name: "growth_signal", schema },
      capturingTransport(captures),
    );
    await transport("https://api.x.ai/v1/responses", {
      method: "POST",
      body: JSON.stringify({
        model: "test",
        input: "query",
        text: { verbosity: "low" },
      }),
    });
    assert.deepEqual(captures[0]?.body.text, {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "growth_signal",
        schema,
        strict: true,
      },
    });
  });

  it("injects Anthropic JSON output at output_config.format", async () => {
    const captures: Capture[] = [];
    const transport = createStructuredOutputFetch(
      { name: "content_review", schema },
      capturingTransport(captures),
    );
    await transport("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ model: "test", messages: [] }),
    });
    assert.deepEqual(captures[0]?.body.output_config, {
      format: {
        type: "json_schema",
        schema,
      },
    });
  });

  it("injects Perplexity Agent JSON output at response_format.json_schema", async () => {
    const captures: Capture[] = [];
    const transport = createStructuredOutputFetch(
      { name: "growth_signal", schema },
      capturingTransport(captures),
    );
    await transport("https://api.perplexity.ai/v1/agent", {
      method: "POST",
      body: JSON.stringify({ model: "test", input: "query" }),
    });
    assert.deepEqual(captures[0]?.body.response_format, {
      type: "json_schema",
      json_schema: {
        name: "growth_signal",
        schema,
      },
    });
  });

  it("fails before network egress for an unsupported OpenRouter structured route", async () => {
    let networkCalls = 0;
    const transport = createStructuredOutputFetch(
      { name: "growth_signal", schema },
      async () => {
        networkCalls += 1;
        return new Response("{}", { status: 200 });
      },
    );
    await assert.rejects(
      () => transport("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "vendor/model", messages: [] }),
      }),
      /ai_structured_output_provider_unsupported:openrouter/,
    );
    assert.equal(networkCalls, 0);
  });

  it("fails before network egress for invalid names, non-object schemas and oversized schemas", () => {
    assert.throws(
      () => createStructuredOutputFetch({ name: "bad name", schema }),
      /ai_structured_output_name_invalid/,
    );
    assert.throws(
      () => createStructuredOutputFetch({
        name: "valid_name",
        schema: [] as unknown as Record<string, unknown>,
      }),
      /ai_structured_output_schema_invalid/,
    );
    assert.throws(
      () => createStructuredOutputFetch({
        name: "valid_name",
        schema: {
          type: "object",
          properties: {
            payload: { type: "string", description: "x".repeat(40_000) },
          },
        },
      }),
      /ai_structured_output_schema_too_large/,
    );
  });
});
