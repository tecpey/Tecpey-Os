import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import {
  AI_COUNCIL_CAPABILITY,
  AI_MODEL_LAB_CAPABILITY,
  createAiCouncilSynthesisEvidence,
  createAiModelLabRunEvidence,
} from "../../lib/ai/model-lab-council-authority";
import type { AiModelLabCandidate } from "../../lib/ai/model-lab-council-policy";

const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const COUNCIL_ID = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-09-24T12:00:00.000Z");

function candidates(): readonly AiModelLabCandidate[] {
  const make = (
    providerId: "openai" | "perplexity",
    model: string,
    endpointId: "openai_responses" | "perplexity_agent",
  ): AiModelLabCandidate => ({
    endpointId,
    capability: {
      providerId,
      requestedModel: model,
      canonicalModel: model,
      observedAt: "2026-09-24T00:00:00.000Z",
      exactModelIdentity: true,
      deprecated: false,
      zeroDataRetention: true,
      supportedDataClasses: ["public"],
      capabilities: ["text", "web_search", "citations"],
      tools: ["web_search"],
      cacheMode: "none",
    },
    evalEvidence: {
      taskId: "mentor_public_research",
      evalSuiteId: "mentor_public_research_v1",
      candidateProviderId: providerId,
      candidateModel: model,
      measuredAt: "2026-09-24T01:00:00.000Z",
      sampleSize: 100,
      qualityBasisPoints: 9600,
    },
  });
  return [
    make("openai", "gpt-research-pinned", "openai_responses"),
    make("perplexity", "sonar-research-pinned", "perplexity_agent"),
  ];
}

function billingRows(capability: string, enabled: boolean) {
  return [
    {
      id: SUBSCRIPTION_ID,
      plan_key: "pro",
      plan_version: 1,
      state: "active",
      effective_at: new Date("2026-01-01T00:00:00.000Z"),
      current_period_end: new Date("2027-01-01T00:00:00.000Z"),
      cancel_at: null,
      state_version: 7,
    },
    {
      snapshot_version: 7,
      capabilities: { [capability]: enabled },
      valid_from: new Date("2026-01-01T00:00:00.000Z"),
      valid_until: new Date("2027-01-01T00:00:00.000Z"),
    },
  ];
}

function mockClient(input: {
  capability: string;
  enabled?: boolean;
  existingRun?: null | {
    id: string;
    request_hash: string;
    status: "admitted" | "blocked";
    decision_hash: string;
    candidate_count: number;
  };
  existingCouncil?: null | {
    id: string;
    request_hash: string;
    synthesis_hash: string;
  };
  ownModelLabRun?: boolean;
}) {
  const billing = billingRows(input.capability, input.enabled ?? true);
  let billingIndex = 0;
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes("FROM commerce_subscriptions")) {
        return { rows: [billing[billingIndex++]] };
      }
      if (sql.includes("FROM commerce_entitlement_snapshots")) {
        return { rows: [billing[billingIndex++]] };
      }
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM ai_model_lab_runs") && sql.includes("idempotency_key")) {
        return { rows: input.existingRun ? [input.existingRun] : [] };
      }
      if (sql.includes("INSERT INTO ai_model_lab_runs")) {
        return { rows: [{ id: RUN_ID }] };
      }
      if (sql.includes("INSERT INTO ai_model_lab_candidates")) {
        return { rows: [] };
      }
      if (sql.includes("FROM ai_model_lab_runs") && sql.includes("LIMIT 1")) {
        return { rows: input.ownModelLabRun === false ? [] : [{ id: RUN_ID }] };
      }
      if (sql.includes("FROM ai_council_syntheses")) {
        return { rows: input.existingCouncil ? [input.existingCouncil] : [] };
      }
      if (sql.includes("INSERT INTO ai_council_syntheses")) {
        return { rows: [{ id: COUNCIL_ID }] };
      }
      throw new Error(`unexpected_query:${sql}`);
    },
  } as unknown as PoolClient;
  return { client, calls };
}

describe("Model Lab runtime authority", () => {
  it("fails closed when the Pro capability is absent", async () => {
    const { client } = mockClient({
      capability: AI_MODEL_LAB_CAPABILITY,
      enabled: false,
    });
    await assert.rejects(
      createAiModelLabRunEvidence(client, {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        idempotencyKey: "model-lab-request-0001",
        taskId: "mentor_public_research",
        agentId: "coin_tool_researcher",
        dataClass: "public",
        promptDigest: "a".repeat(64),
        requireZeroDataRetention: true,
        candidates: candidates(),
        nowMs: NOW,
      }),
      /model_lab_pro_entitlement_required/,
    );
  });

  it("persists only hashed prompt authority and bounded candidate provenance", async () => {
    const { client, calls } = mockClient({
      capability: AI_MODEL_LAB_CAPABILITY,
    });
    const result = await createAiModelLabRunEvidence(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      accountId: "account-a",
      idempotencyKey: "model-lab-request-0002",
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: "b".repeat(64),
      requireZeroDataRetention: true,
      candidates: candidates(),
      nowMs: NOW,
    });

    assert.equal(result.id, RUN_ID);
    assert.equal(result.status, "admitted");
    assert.equal(result.candidateCount, 2);
    assert.equal(result.replayed, false);
    assert.match(result.requestHash, /^[0-9a-f]{64}$/);
    assert.equal(
      calls.filter(({ sql }) => sql.includes("INSERT INTO ai_model_lab_candidates")).length,
      2,
    );
    const runInsert = calls.find(({ sql }) =>
      sql.includes("INSERT INTO ai_model_lab_runs"));
    assert.ok(runInsert);
    assert.equal(runInsert?.params.includes("b".repeat(64)), true);
    assert.equal(
      calls.some(({ params }) =>
        params.some((value) =>
          typeof value === "string" && value.includes("raw prompt"))),
      false,
    );
  });

  it("rejects duplicate candidate identity before any evidence write", async () => {
    const duplicated = candidates()[0]!;
    const { client, calls } = mockClient({
      capability: AI_MODEL_LAB_CAPABILITY,
    });
    await assert.rejects(
      createAiModelLabRunEvidence(client, {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        idempotencyKey: "model-lab-request-duplicate-0001",
        taskId: "mentor_public_research",
        agentId: "coin_tool_researcher",
        dataClass: "public",
        promptDigest: "f".repeat(64),
        requireZeroDataRetention: true,
        candidates: [duplicated, duplicated],
        nowMs: NOW,
      }),
      /ai_model_lab_duplicate_candidate_identity/,
    );
    assert.equal(
      calls.some(({ sql }) => sql.includes("INSERT INTO ai_model_lab_runs")),
      false,
    );
  });

  it("replays an exact idempotent request and rejects a conflicting key reuse", async () => {
    const first = mockClient({ capability: AI_MODEL_LAB_CAPABILITY });
    const created = await createAiModelLabRunEvidence(first.client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      accountId: "account-a",
      idempotencyKey: "model-lab-request-0003",
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: "c".repeat(64),
      requireZeroDataRetention: true,
      candidates: candidates(),
      nowMs: NOW,
    });

    const replay = mockClient({
      capability: AI_MODEL_LAB_CAPABILITY,
      existingRun: {
        id: RUN_ID,
        request_hash: created.requestHash,
        status: created.status,
        decision_hash: created.decisionHash,
        candidate_count: 2,
      },
    });
    const replayed = await createAiModelLabRunEvidence(replay.client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      accountId: "account-a",
      idempotencyKey: "model-lab-request-0003",
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
      dataClass: "public",
      promptDigest: "c".repeat(64),
      requireZeroDataRetention: true,
      candidates: candidates(),
      nowMs: NOW,
    });
    assert.equal(replayed.replayed, true);

    const conflict = mockClient({
      capability: AI_MODEL_LAB_CAPABILITY,
      existingRun: {
        id: RUN_ID,
        request_hash: "f".repeat(64),
        status: "admitted",
        decision_hash: "e".repeat(64),
        candidate_count: 2,
      },
    });
    await assert.rejects(
      createAiModelLabRunEvidence(conflict.client, {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        idempotencyKey: "model-lab-request-0003",
        taskId: "mentor_public_research",
        agentId: "coin_tool_researcher",
        dataClass: "public",
        promptDigest: "c".repeat(64),
        requireZeroDataRetention: true,
        candidates: candidates(),
        nowMs: NOW,
      }),
      /ai_model_lab_idempotency_conflict/,
    );
  });
});

describe("AI Council runtime authority", () => {
  it("requires its own Pro capability and preserves disagreement evidence", async () => {
    const { client, calls } = mockClient({
      capability: AI_COUNCIL_CAPABILITY,
      ownModelLabRun: true,
    });
    const result = await createAiCouncilSynthesisEvidence(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      accountId: "account-a",
      idempotencyKey: "ai-council-request-0001",
      inputDigest: "d".repeat(64),
      modelLabRunId: RUN_ID,
      contributions: [
        {
          contributionId: "contribution.reasoning",
          role: "reasoning",
          claims: [{
            claimKey: "claim.market_direction",
            stance: "support",
            evidenceIds: ["source.1"],
          }],
        },
        {
          contributionId: "contribution.market",
          role: "market_context",
          claims: [{
            claimKey: "claim.market_direction",
            stance: "oppose",
            evidenceIds: ["source.2"],
          }],
        },
      ],
    });

    assert.equal(result.id, COUNCIL_ID);
    assert.equal(result.replayed, false);
    assert.equal(result.synthesis.agreements.length, 0);
    assert.equal(result.synthesis.disagreements.length, 1);
    const insert = calls.find(({ sql }) =>
      sql.includes("INSERT INTO ai_council_syntheses"));
    assert.ok(insert);
    assert.match(String(insert?.params[9]), /contribution\.reasoning/);
    assert.match(String(insert?.params[11]), /market_direction/);
  });

  it("rejects a Council synthesis attached to another account's Model Lab run", async () => {
    const { client } = mockClient({
      capability: AI_COUNCIL_CAPABILITY,
      ownModelLabRun: false,
    });
    await assert.rejects(
      createAiCouncilSynthesisEvidence(client, {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        idempotencyKey: "ai-council-request-0002",
        inputDigest: "e".repeat(64),
        modelLabRunId: RUN_ID,
        contributions: [
          {
            contributionId: "contribution.reasoning",
            role: "reasoning",
            claims: [],
          },
          {
            contributionId: "contribution.research",
            role: "research",
            claims: [],
          },
        ],
      }),
      /ai_council_model_lab_run_not_owned/,
    );
  });
});
