import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_INTELLIGENCE_ENDPOINT_PROFILES,
  evaluateAiIntelligenceEndpointEligibility,
  validateAiIntelligenceEndpointProfiles,
} from "../../lib/ai/intelligence-endpoint-policy";

describe("AI intelligence endpoint compatibility", () => {
  it("keeps the endpoint registry deterministic and internally valid", () => {
    assert.doesNotThrow(() => validateAiIntelligenceEndpointProfiles());
    assert.equal(
      new Set(AI_INTELLIGENCE_ENDPOINT_PROFILES.map((profile) => profile.id)).size,
      AI_INTELLIGENCE_ENDPOINT_PROFILES.length,
    );
  });

  it("admits verified structured-search routes for growth_scan", () => {
    for (const endpointId of [
      "openai_responses",
      "xai_responses",
      "perplexity_agent",
    ] as const) {
      const result = evaluateAiIntelligenceEndpointEligibility({
        taskId: "growth_scan",
        endpointId,
      });
      assert.equal(result.status, "eligible", `${endpointId} should be eligible`);
    }
  });

  it("fails closed when a structured-search combination is not yet verified", () => {
    const result = evaluateAiIntelligenceEndpointEligibility({
      taskId: "growth_scan",
      endpointId: "anthropic_messages",
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.deepEqual(result.reasons, ["endpoint_combination_unverified"]);
    }
  });

  it("does not silently downgrade strict JSON tasks on OpenRouter", () => {
    const result = evaluateAiIntelligenceEndpointEligibility({
      taskId: "news_translate",
      endpointId: "openrouter_chat_completions",
    });
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.ok(result.reasons.includes("endpoint_structured_output_missing"));
    }
  });

  it("allows text-only mentor coaching without requiring search/schema support", () => {
    const result = evaluateAiIntelligenceEndpointEligibility({
      taskId: "mentor_coach",
      endpointId: "openai_responses",
    });
    assert.equal(result.status, "eligible");
  });
});
