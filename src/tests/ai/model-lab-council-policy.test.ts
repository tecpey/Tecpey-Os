import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AiIntelligenceEvalEvidence,
  AiIntelligenceModelCapabilitySnapshot,
} from "../../lib/ai/intelligence-model-policy";
import type { AiIntelligenceEndpointId } from "../../lib/ai/intelligence-endpoint-policy";
import {
  deriveAiCouncilSynthesis,
  planAiModelLabComparison,
  type AiModelLabCandidate,
} from "../../lib/ai/model-lab-council-policy";

const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const PROMPT_DIGEST = "a".repeat(64);

function capability(input: {
  providerId: "openai" | "perplexity";
  model: string;
}): AiIntelligenceModelCapabilitySnapshot {
  return {
    providerId: input.providerId,
    requestedModel: input.model,
    canonicalModel: input.model,
    observedAt: "2026-09-24T00:00:00.000Z",
    exactModelIdentity: true,
    deprecated: false,
    zeroDataRetention: true,
    supportedDataClasses: ["public"],
    capabilities: ["text", "web_search", "citations"],
    tools: ["web_search"],
    cacheMode: "none",
  };
}

function evaluation(input: {
  providerId: "openai" | "perplexity";
  model: string;
  measuredAt?: string;
}): AiIntelligenceEvalEvidence {
  return {
    taskId: "mentor_public_research",
    evalSuiteId: "mentor_public_research_v1",
    candidateProviderId: input.providerId,
    candidateModel: input.model,
    measuredAt: input.measuredAt ?? "2026-09-24T01:00:00.000Z",
    sampleSize: 100,
    qualityBasisPoints: 9600,
  };
}

function candidate(input: {
  providerId: "openai" | "perplexity";
  model: string;
  endpointId: AiIntelligenceEndpointId;
  measuredAt?: string;
}): AiModelLabCandidate {
  return {
    endpointId: input.endpointId,
    capability: capability(input),
    evalEvidence: evaluation(input),
  };
}

function readyCandidates(): readonly AiModelLabCandidate[] {
  return [
    candidate({
      providerId: "openai",
      model: "gpt-research-pinned",
      endpointId: "openai_responses",
    }),
    candidate({
      providerId: "perplexity",
      model: "sonar-research-pinned",
      endpointId: "perplexity_agent",
    }),
  ];
}

describe("Model Lab policy", () => {
  it("admits two models only when the same governed task contract is satisfied", () => {
    const plan = planAiModelLabComparison({
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: PROMPT_DIGEST,
      requireZeroDataRetention: true,
      candidates: readyCandidates(),
      nowMs: NOW,
    });

    assert.equal(plan.status, "ready");
    assert.equal(plan.eligible.length, 2);
    assert.equal(plan.rejected.length, 0);
    assert.match(plan.decisionHash, /^[0-9a-f]{64}$/);
  });

  it("blocks the comparison when fewer than two candidates retain fresh eval authority", () => {
    const candidates = [
      readyCandidates()[0]!,
      candidate({
        providerId: "perplexity",
        model: "sonar-research-pinned",
        endpointId: "perplexity_agent",
        measuredAt: "2026-08-01T00:00:00.000Z",
      }),
    ];

    const plan = planAiModelLabComparison({
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: PROMPT_DIGEST,
      requireZeroDataRetention: true,
      candidates,
      nowMs: NOW,
    });

    assert.equal(plan.status, "blocked");
    assert.equal(plan.eligible.length, 1);
    assert.equal(plan.rejected.length, 1);
    assert.ok(plan.rejected[0]?.reasons.includes("eval_stale"));
    assert.ok(plan.rejected[0]?.reasons.includes("route_rejected"));
  });

  it("rejects duplicate provider, endpoint and canonical-model identities", () => {
    const first = candidate({
      providerId: "openai",
      model: "gpt-research-pinned",
      endpointId: "openai_responses",
    });
    const plan = planAiModelLabComparison({
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: PROMPT_DIGEST,
      requireZeroDataRetention: true,
      candidates: [first, first],
      nowMs: NOW,
    });

    assert.equal(plan.status, "blocked");
    assert.equal(plan.eligible.length, 0);
    assert.equal(plan.rejected.length, 2);
    assert.ok(plan.rejected.every((item) =>
      item.reasons.includes("duplicate_candidate_identity")));
  });

  it("fails closed on an invalid prompt digest rather than comparing unbound prompts", () => {
    const plan = planAiModelLabComparison({
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: "not-a-digest",
      requireZeroDataRetention: true,
      candidates: readyCandidates(),
      nowMs: NOW,
    });

    assert.equal(plan.status, "blocked");
    assert.deepEqual(plan.globalReasons, ["invalid_prompt_digest"]);
  });

  it("keeps the decision hash stable across candidate input ordering", () => {
    const candidates = readyCandidates();
    const left = planAiModelLabComparison({
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: PROMPT_DIGEST,
      requireZeroDataRetention: true,
      candidates,
      nowMs: NOW,
    });
    const right = planAiModelLabComparison({
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: PROMPT_DIGEST,
      requireZeroDataRetention: true,
      candidates: [...candidates].reverse(),
      nowMs: NOW,
    });

    assert.equal(left.decisionHash, right.decisionHash);
  });
});

describe("AI Council synthesis", () => {
  it("promotes corroborated evidence-backed claims to explicit agreement", () => {
    const result = deriveAiCouncilSynthesis([
      {
        contributionId: "contribution.reasoning",
        role: "reasoning",
        claims: [{
          claimKey: "claim.market_context",
          stance: "support",
          evidenceIds: ["source.primary.1"],
        }],
      },
      {
        contributionId: "contribution.research",
        role: "research",
        claims: [{
          claimKey: "claim.market_context",
          stance: "support",
          evidenceIds: ["source.primary.2"],
        }],
      },
    ]);

    assert.equal(result.agreements.length, 1);
    assert.equal(result.disagreements.length, 0);
    assert.equal(result.unresolved.length, 0);
    assert.deepEqual(result.agreements[0]?.roles, ["reasoning", "research"]);
    assert.match(result.synthesisHash, /^[0-9a-f]{64}$/);
  });

  it("preserves opposing roles as disagreement instead of averaging them", () => {
    const result = deriveAiCouncilSynthesis([
      {
        contributionId: "contribution.reasoning",
        role: "reasoning",
        claims: [{
          claimKey: "claim.risk_direction",
          stance: "support",
          evidenceIds: ["source.1"],
        }],
      },
      {
        contributionId: "contribution.market",
        role: "market_context",
        claims: [{
          claimKey: "claim.risk_direction",
          stance: "oppose",
          evidenceIds: ["source.2"],
        }],
      },
    ]);

    assert.equal(result.agreements.length, 0);
    assert.equal(result.disagreements.length, 1);
    assert.deepEqual(result.disagreements[0]?.supportingRoles, ["reasoning"]);
    assert.deepEqual(result.disagreements[0]?.opposingRoles, ["market_context"]);
  });

  it("keeps uncertainty and evidence gaps unresolved", () => {
    const result = deriveAiCouncilSynthesis([
      {
        contributionId: "contribution.reasoning",
        role: "reasoning",
        claims: [{
          claimKey: "claim.unverified",
          stance: "support",
          evidenceIds: [],
        }],
      },
      {
        contributionId: "contribution.research",
        role: "research",
        claims: [{
          claimKey: "claim.unverified",
          stance: "uncertain",
          evidenceIds: ["source.partial"],
        }],
      },
    ]);

    assert.equal(result.agreements.length, 0);
    assert.equal(result.disagreements.length, 0);
    assert.deepEqual(result.unresolved[0]?.reasons, [
      "evidence_missing",
      "single_role",
      "uncertain",
    ]);
  });

  it("rejects duplicate council roles before synthesis", () => {
    assert.throws(
      () => deriveAiCouncilSynthesis([
        {
          contributionId: "contribution.reasoning.1",
          role: "reasoning",
          claims: [],
        },
        {
          contributionId: "contribution.reasoning.2",
          role: "reasoning",
          claims: [],
        },
      ]),
      /ai_council_duplicate_role/,
    );
  });
});
