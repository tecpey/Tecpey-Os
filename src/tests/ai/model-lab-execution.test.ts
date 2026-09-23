import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  executeAiModelLabRun,
  modelLabComparisonInputDigest,
  type AiModelLabExecutionDependencies,
} from "../../lib/ai/model-lab-execution";
import { resetAiProviderCircuits } from "../../lib/ai/provider-router";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_A = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_B = "33333333-3333-4333-8333-333333333333";
const ATTEMPT_A = "44444444-4444-4444-8444-444444444444";
const ATTEMPT_B = "55555555-5555-4555-8555-555555555555";
const RESERVATION_A = "66666666-6666-4666-8666-666666666666";
const RESERVATION_B = "77777777-7777-4777-8777-777777777777";
const INSTRUCTIONS = "Return a source-grounded comparison.";
const INPUT = "Compare the public evidence for this test.";
const DIGEST = modelLabComparisonInputDigest(INSTRUCTIONS, INPUT);

const limits = {
  dailyRequests: 100,
  dailyTokens: 100_000,
  maxInputTokens: 10_000,
  maxOutputTokens: 2_000,
  maxRequestCostUsdMicros: 100_000,
  monthlyBudgetUsdMicros: 1_000_000,
};

function baseDependencies(): AiModelLabExecutionDependencies {
  const candidates = [
    {
      candidateId: CANDIDATE_A,
      providerId: "openai" as const,
      endpointId: "openai_responses" as const,
      requestedModel: "model-a",
      canonicalModel: "model-a",
    },
    {
      candidateId: CANDIDATE_B,
      providerId: "openai" as const,
      endpointId: "openai_responses" as const,
      requestedModel: "model-b",
      canonicalModel: "model-b",
    },
  ];
  return {
    loadDescriptor: async () => ({
      status: "ready" as const,
      descriptor: {
        runId: RUN_ID,
        taskId: "mentor_public_research",
        agentId: "coin_tool_researcher",
        dataClass: "public",
        promptDigest: DIGEST,
        candidates,
      },
    }),
    resolveRuntime: async () => ({
      status: "configured" as const,
      config: {
        agentId: "coin_tool_researcher",
        providerId: "openai",
        apiKey: "server-owned-primary-key",
        model: "model-a",
        fallbackModel: null,
        limits,
        approvalMode: "before_publish",
        configurationSource: "managed",
        openRouterFallback: null,
        routeCandidates: candidates.map((candidate, index) => ({
          providerId: candidate.providerId,
          model: candidate.requestedModel,
          priority: index + 1,
          enabled: true,
          estimatedMaxCostUsdMicros: 50_000,
          expectedLatencyMs: 500,
          zeroDataRetention: true,
          free: false,
          supportedDataClasses: ["public" as const],
          revision: 1,
          updatedAt: "2026-09-24T00:00:00.000Z",
          providerReady: true,
          health: "healthy" as const,
          apiKey: `server-owned-key-${index + 1}`,
        })),
      },
    }),
    prepare: async ({ descriptor, routes, maxOutputTokens }) => ({
      status: "prepared" as const,
      prepared: {
        runId: descriptor.runId,
        taskId: descriptor.taskId,
        agentId: descriptor.agentId,
        dataClass: descriptor.dataClass,
        promptDigest: descriptor.promptDigest,
        maxOutputTokens,
        candidates: routes.map((route, index) => ({
          ...route,
          attemptId: index === 0 ? ATTEMPT_A : ATTEMPT_B,
          reservationId: index === 0 ? RESERVATION_A : RESERVATION_B,
          reservedUsdMicros: route.worstCaseUsdMicros,
        })),
      },
    }),
    markEgress: async () => ({ ok: true as const, replayed: false }),
    finalize: async (request) => ({
      candidateId: request.prepared.candidateId,
      providerId: request.prepared.providerId,
      requestedModel: request.prepared.requestedModel,
      actualModel: request.actualModel,
      modelIdentityVerified: request.modelIdentityVerified,
      status: request.status,
      failureReason: request.failureReason,
      outputHash: request.outputHash,
      sourceCount: request.sources.length,
      chargedCostUsdMicros:
        request.providerResult.ok && request.providerResult.costUsdMicros !== null
          ? request.providerResult.costUsdMicros
          : request.egressMarked
            ? request.prepared.reservedUsdMicros
            : 0,
      reconciliationRequired:
        request.egressMarked &&
        (!request.providerResult.ok || request.providerResult.costUsdMicros === null),
    }),
  };
}

beforeEach(() => {
  resetAiProviderCircuits();
});

describe("Model Lab execution", () => {
  it("sends the exact same input once to every candidate and returns verified outputs", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let marks = 0;
    const dependencies = baseDependencies();
    const result = await executeAiModelLabRun(
      {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        runId: RUN_ID,
        instructions: INSTRUCTIONS,
        input: INPUT,
      },
      {
        ...dependencies,
        markEgress: async () => {
          marks += 1;
          return { ok: true, replayed: false };
        },
        providerRouter: {
          fetchImpl: async (_url, init) => {
            const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
            bodies.push(body);
            const model = String(body.model);
            return new Response(
              JSON.stringify({
                model,
                output_text: `answer from ${model}`,
                citations: [{
                  url: "https://example.com/report?token=secret&section=1",
                  title: "Report",
                }],
                usage: { input_tokens: 20, output_tokens: 8, cost: 0.002 },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          },
        },
      },
    );

    assert.equal(result.status, "completed");
    if (result.status !== "completed") return;
    assert.equal(marks, 2);
    assert.equal(bodies.length, 2);
    assert.deepEqual(
      bodies.map((body) => body.input),
      [INPUT, INPUT],
    );
    assert.deepEqual(
      bodies.map((body) => body.instructions),
      [INSTRUCTIONS, INSTRUCTIONS],
    );
    assert.ok(result.results.every((item) => item.modelIdentityVerified));
    assert.ok(result.results.every((item) => item.text?.startsWith("answer from ")));
    assert.ok(result.results.every((item) => /^[0-9a-f]{64}$/.test(item.outputHash ?? "")));
    assert.ok(result.results.every((item) => item.sources[0]?.url === "https://example.com/report?section=1"));
  });

  it("fails closed when the provider omits the served model identity", async () => {
    const result = await executeAiModelLabRun(
      {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        runId: RUN_ID,
        instructions: INSTRUCTIONS,
        input: INPUT,
      },
      {
        ...baseDependencies(),
        providerRouter: {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                output_text: "answer without model identity",
                usage: { input_tokens: 10, output_tokens: 4, cost: 0.001 },
              }),
              { status: 200 },
            ),
        },
      },
    );

    assert.equal(result.status, "incomplete");
    if (result.status !== "incomplete") return;
    assert.ok(result.results.every((item) => item.status === "failed"));
    assert.ok(result.results.every((item) => item.failureReason === "invalid_response"));
    assert.ok(result.results.every((item) => item.text === null));
  });

  it("rejects a successful response served by a different model", async () => {
    const result = await executeAiModelLabRun(
      {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        runId: RUN_ID,
        instructions: INSTRUCTIONS,
        input: INPUT,
      },
      {
        ...baseDependencies(),
        providerRouter: {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                model: "unexpected-model",
                output_text: "content must not enter comparison",
                usage: { input_tokens: 10, output_tokens: 4, cost: 0.001 },
              }),
              { status: 200 },
            ),
        },
      },
    );

    assert.equal(result.status, "incomplete");
    if (result.status !== "incomplete") return;
    assert.ok(result.results.every((item) => item.status === "authority_failed"));
    assert.ok(result.results.every((item) => item.failureReason === "model_identity_mismatch"));
    assert.ok(result.results.every((item) => item.text === null));
    assert.ok(result.results.every((item) => item.outputHash === null));
  });

  it("prevents the network call when immutable egress marking fails", async () => {
    let networkCalls = 0;
    const result = await executeAiModelLabRun(
      {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        runId: RUN_ID,
        instructions: INSTRUCTIONS,
        input: INPUT,
      },
      {
        ...baseDependencies(),
        markEgress: async () => ({ ok: false, reason: "entitlement_revoked" }),
        providerRouter: {
          fetchImpl: async () => {
            networkCalls += 1;
            throw new Error("network call must not happen");
          },
        },
      },
    );

    assert.equal(networkCalls, 0);
    assert.equal(result.status, "incomplete");
    if (result.status !== "incomplete") return;
    assert.ok(result.results.every((item) => item.status === "authority_failed"));
    assert.ok(result.results.every((item) => item.failureReason === "entitlement_revoked"));
    assert.ok(result.results.every((item) => item.chargedCostUsdMicros === 0));
  });

  it("does not mark egress when the provider circuit is already open", async () => {
    let marks = 0;
    let now = 1_000;
    const failingFetch: typeof fetch = async () => {
      throw new Error("provider offline");
    };
    for (let index = 0; index < 3; index += 1) {
      const { callAiProvider } = await import("../../lib/ai/provider-router");
      await callAiProvider(
        {
          providerId: "openai",
          agentId: "coin_tool_researcher",
          apiKey: "key",
          model: "model-a",
          instructions: INSTRUCTIONS,
          input: INPUT,
          circuitScope: "tenant-a:workspace-a:model-lab:openai:model-a",
          disableRetries: true,
        },
        { fetchImpl: failingFetch, now: () => now++ },
      );
    }

    const result = await executeAiModelLabRun(
      {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        runId: RUN_ID,
        instructions: INSTRUCTIONS,
        input: INPUT,
      },
      {
        ...baseDependencies(),
        markEgress: async () => {
          marks += 1;
          return { ok: true, replayed: false };
        },
        providerRouter: {
          fetchImpl: async () => {
            throw new Error("first candidate circuit is open");
          },
          now: () => now,
        },
      },
    );

    assert.equal(result.status, "incomplete");
    if (result.status !== "incomplete") return;
    const modelA = result.results.find((item) => item.requestedModel === "model-a");
    assert.equal(modelA?.failureReason, "circuit_open");
    assert.equal(modelA?.chargedCostUsdMicros, 0);
    assert.ok(marks <= 1, "the open-circuit candidate must not consume an egress mark");
  });

  it("never auto-replays persisted external attempts", async () => {
    let runtimeResolutions = 0;
    const result = await executeAiModelLabRun(
      {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        accountId: "account-a",
        runId: RUN_ID,
        instructions: INSTRUCTIONS,
        input: INPUT,
      },
      {
        ...baseDependencies(),
        loadDescriptor: async () => ({
          status: "reconciliation_required",
          runId: RUN_ID,
          results: [],
        }),
        resolveRuntime: async (...args) => {
          runtimeResolutions += 1;
          return baseDependencies().resolveRuntime!(...args);
        },
      },
    );
    assert.deepEqual(result, {
      status: "reconciliation_required",
      runId: RUN_ID,
      results: [],
    });
    assert.equal(runtimeResolutions, 0);
  });
});
