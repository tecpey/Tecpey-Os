import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callMentorProvider,
  getMentorProviderCircuitState,
  resetMentorProviderCircuit,
} from "../../lib/ai/mentor-provider";
import { prepareMentorEgress } from "../../lib/ai/mentor-trust-boundary";

function successResponse(answer = "پاسخ آموزشی امن"): Response {
  return new Response(JSON.stringify({ output_text: answer }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const baseInput = {
  apiKey: "test-key",
  primaryModel: "primary-model",
  fallbackModel: "fallback-model",
  instructions: "trusted instructions",
  input: JSON.stringify({ userQuestion: "سؤال امن" }),
  timeoutMs: 2_000,
  maxOutputTokens: 400,
};

describe("AI Mentor provider execution boundary", () => {
  it("never calls a provider without a configured server key", async () => {
    resetMentorProviderCircuit();
    let called = false;
    const result = await callMentorProvider(
      { ...baseInput, apiKey: "" },
      {
        fetchImpl: async () => {
          called = true;
          return successResponse();
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "provider_disabled");
    assert.equal(called, false);
  });

  it("sends only the minimized trust-boundary payload", async () => {
    resetMentorProviderCircuit();
    const secret = `0x${"a".repeat(64)}`;
    const prepared = prepareMentorEgress({
      question: "ایمیل من trader@example.com است؛ درباره مدیریت ریسک توضیح بده",
      locale: "fa",
      curriculum: {
        termNumber: 6,
        termTitle: "مدیریت ریسک",
        knowledge: "محتوای آموزشی",
      },
      mentorContext: null,
      behavioralPersonalizationEnabled: false,
      clientHistoryPresent: true,
    });
    assert.equal(prepared.blocked, false);

    let outbound = "";
    const result = await callMentorProvider(
      {
        ...baseInput,
        instructions: prepared.instructions,
        input: prepared.input,
      },
      {
        fetchImpl: async (_url, init) => {
          outbound = String(init?.body ?? "");
          return successResponse();
        },
      },
    );
    assert.equal(result.ok, true);
    assert.doesNotMatch(outbound, /trader@example\.com/);
    assert.doesNotMatch(outbound, new RegExp(secret));
    assert.match(outbound, /\[email-redacted\]/);
    assert.match(outbound, /clientHistoryIgnored/);
  });

  it("uses at most one fallback model within the same total budget", async () => {
    resetMentorProviderCircuit();
    const models: string[] = [];
    const result = await callMentorProvider(baseInput, {
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { model: string };
        models.push(body.model);
        return models.length === 1
          ? new Response('{"error":"model unavailable"}', { status: 404 })
          : successResponse("پاسخ مدل جایگزین");
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.model, "fallback-model");
      assert.equal(result.attempts, 2);
    }
    assert.deepEqual(models, ["primary-model", "fallback-model"]);
  });

  it("does not retry an aborted request and returns a timeout outcome", async () => {
    resetMentorProviderCircuit();
    const controller = new AbortController();
    controller.abort(new DOMException("client gone", "AbortError"));
    let attempts = 0;
    const result = await callMentorProvider(
      { ...baseInput, requestSignal: controller.signal },
      {
        fetchImpl: async (_url, init) => {
          attempts += 1;
          if (init?.signal?.aborted) {
            throw new DOMException("aborted", "AbortError");
          }
          return successResponse();
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "timeout");
      assert.equal(result.attempts, 1);
    }
    assert.equal(attempts, 1);
  });

  it("opens the circuit after repeated network failures", async () => {
    resetMentorProviderCircuit();
    let fetchCalls = 0;
    const dependency = {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("network down");
      },
    };
    for (let index = 0; index < 3; index += 1) {
      const result = await callMentorProvider(baseInput, dependency);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "network_error");
    }
    assert.equal(getMentorProviderCircuitState().open, true);

    const blocked = await callMentorProvider(baseInput, dependency);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.reason, "circuit_open");
      assert.equal(blocked.attempts, 0);
    }
    assert.equal(fetchCalls, 3);
    resetMentorProviderCircuit();
  });

  it("rejects oversized or malformed provider responses", async () => {
    resetMentorProviderCircuit();
    const oversized = await callMentorProvider(baseInput, {
      fetchImpl: async () =>
        new Response("x".repeat(65_000), { status: 200 }),
    });
    assert.equal(oversized.ok, false);
    if (!oversized.ok) assert.equal(oversized.reason, "response_too_large");

    resetMentorProviderCircuit();
    const malformed = await callMentorProvider(baseInput, {
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.reason, "invalid_response");
  });
});
