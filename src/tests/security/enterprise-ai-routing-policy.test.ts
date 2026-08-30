import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  planEnterpriseAiRoute,
  type AiEnterpriseRouteCandidate,
} from "../../lib/ai/enterprise-routing-policy";

function candidate(
  overrides: Partial<AiEnterpriseRouteCandidate> = {},
): AiEnterpriseRouteCandidate {
  return {
    providerId: "openai",
    model: "gpt-test",
    priority: 10,
    enabled: true,
    health: "healthy",
    estimatedMaxCostUsdMicros: 100_000,
    expectedLatencyMs: 500,
    zeroDataRetention: true,
    free: false,
    supportedDataClasses: ["public", "approved_platform_content", "private_user"],
    ...overrides,
  };
}

const base = {
  agentId: "mentor_coach" as const,
  dataClass: "private_user" as const,
  criticality: "standard" as const,
  externalEffect: false,
  approvalSatisfied: false,
  maxRequestCostUsdMicros: 1_000_000,
  monthlyBudgetRemainingUsdMicros: 5_000_000,
};

describe("enterprise AI routing policy", () => {
  it("selects deterministically by operator priority before cost and latency", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      candidates: [
        candidate({ providerId: "anthropic", model: "claude-fast", priority: 20, expectedLatencyMs: 100 }),
        candidate({ providerId: "openai", model: "gpt-primary", priority: 10, expectedLatencyMs: 2_000 }),
      ],
    });
    assert.equal(decision.status, "selected");
    assert.equal(decision.selected?.model, "gpt-primary");
    assert.match(decision.decisionHash, /^[0-9a-f]{64}$/);
  });

  it("removes providers outside the agent allowlist before ranking", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      candidates: [candidate({ providerId: "xai", model: "grok-forbidden", priority: 1 })],
    });
    assert.equal(decision.status, "blocked");
    assert.deepEqual(decision.rejected[0]?.reasons, ["provider_forbidden"]);
  });

  it("fails closed on unknown health for critical workloads", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      criticality: "critical",
      candidates: [candidate({ health: "unknown" })],
    });
    assert.equal(decision.status, "blocked");
    assert.ok(decision.rejected[0]?.reasons.includes("provider_health_unknown"));
  });

  it("never sends private, critical or effectful work through a free route", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      candidates: [
        candidate({
          providerId: "openrouter",
          model: "openrouter/free",
          free: true,
          supportedDataClasses: ["public", "private_user"],
        }),
      ],
    });
    assert.equal(decision.status, "blocked");
    assert.ok(decision.rejected[0]?.reasons.includes("free_route_forbidden"));
  });

  it("requires trusted approval before any external effect", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      dataClass: "approved_platform_content",
      externalEffect: true,
      candidates: [candidate()],
    });
    assert.equal(decision.status, "blocked");
    assert.ok(decision.rejected[0]?.reasons.includes("approval_required"));
  });

  it("rejects routes that exceed either per-call or remaining monthly authority", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      maxRequestCostUsdMicros: 90_000,
      monthlyBudgetRemainingUsdMicros: 80_000,
      candidates: [candidate({ estimatedMaxCostUsdMicros: 100_000 })],
    });
    assert.equal(decision.status, "blocked");
    assert.deepEqual(decision.rejected[0]?.reasons, [
      "monthly_budget_exhausted",
      "request_cost_cap_exceeded",
    ]);
  });

  it("fails closed when a paid candidate has no positive worst-case estimate", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      candidates: [candidate({ estimatedMaxCostUsdMicros: 0 })],
    });
    assert.equal(decision.status, "blocked");
    assert.deepEqual(decision.rejected[0]?.reasons, ["paid_cost_estimate_required"]);
  });

  it("rejects malformed ranking attributes instead of scoring non-finite values", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      candidates: [candidate({ priority: Number.NaN })],
    });
    assert.equal(decision.status, "blocked");
    assert.ok(decision.rejected[0]?.reasons.includes("invalid_candidate_attributes"));
    assert.match(decision.decisionHash, /^[0-9a-f]{64}$/);
  });

  it("rejects a free declaration that does not match the OpenRouter model", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      candidates: [candidate({
        providerId: "openrouter",
        model: "vendor/paid-model",
        free: true,
        estimatedMaxCostUsdMicros: 0,
      })],
    });
    assert.equal(decision.status, "blocked");
    assert.ok(decision.rejected[0]?.reasons.includes("invalid_candidate_attributes"));
  });

  it("rejects duplicate provider-model identities before runtime binding", () => {
    const decision = planEnterpriseAiRoute({
      ...base,
      candidates: [candidate(), candidate({ priority: 20 })],
    });
    assert.equal(decision.status, "blocked");
    assert.equal(decision.rejected.length, 2);
    assert.ok(decision.rejected.every(({ reasons }) =>
      reasons.includes("duplicate_candidate")));
  });

  it("keeps the evidence hash stable across candidate input order", () => {
    const first = candidate({
      model: "gpt-a",
      priority: 10,
      supportedDataClasses: ["private_user", "public", "approved_platform_content"],
    });
    const second = candidate({ providerId: "anthropic", model: "claude-b", priority: 20 });
    const left = planEnterpriseAiRoute({ ...base, candidates: [first, second] });
    const right = planEnterpriseAiRoute({
      ...base,
      candidates: [
        second,
        { ...first, supportedDataClasses: [...first.supportedDataClasses].reverse() },
      ],
    });
    assert.equal(left.decisionHash, right.decisionHash);
  });

  it("binds material attributes of both eligible and rejected candidates", () => {
    const selected = candidate({ model: "gpt-selected", priority: 1 });
    const rejected = candidate({
      providerId: "anthropic",
      model: "claude-disabled",
      priority: 2,
      enabled: false,
    });
    const baseline = planEnterpriseAiRoute({
      ...base,
      candidates: [selected, rejected],
    });
    const selectedCostChanged = planEnterpriseAiRoute({
      ...base,
      candidates: [
        { ...selected, estimatedMaxCostUsdMicros: 100_001 },
        rejected,
      ],
    });
    const rejectedHealthChanged = planEnterpriseAiRoute({
      ...base,
      candidates: [selected, { ...rejected, health: "degraded" }],
    });
    assert.notEqual(baseline.decisionHash, selectedCostChanged.decisionHash);
    assert.notEqual(baseline.decisionHash, rejectedHealthChanged.decisionHash);
  });

  it("binds every evaluated candidate beyond the former twenty-route window", () => {
    const candidates = Array.from({ length: 21 }, (_, index) => candidate({
      model: `gpt-${index}`,
      priority: index,
    }));
    const baseline = planEnterpriseAiRoute({ ...base, candidates });
    const changed = planEnterpriseAiRoute({
      ...base,
      candidates: candidates.map((item, index) => index === 20
        ? { ...item, expectedLatencyMs: item.expectedLatencyMs + 1 }
        : item),
    });
    assert.notEqual(baseline.decisionHash, changed.decisionHash);
  });
});
