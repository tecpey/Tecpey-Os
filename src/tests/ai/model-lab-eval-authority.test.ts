import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient } from "pg";
import {
  readGovernedModelLabEvidenceSet,
  recordAiModelCapabilitySnapshot,
  recordAiModelEvaluationEvidence,
} from "../../lib/ai/model-lab-eval-authority";
import type { AiModelEvalMetric } from "../../lib/ai/model-lab-eval-policy";

function evaluationMetrics(): AiModelEvalMetric[] {
  return [
    { metric: "factuality", status: "measured", sampleCount: 100, scoreBasisPoints: 9700, measuredValue: null },
    { metric: "citation_coverage", status: "measured", sampleCount: 100, scoreBasisPoints: 9600, measuredValue: null },
    { metric: "structured_output_validity", status: "not_applicable", sampleCount: 0, scoreBasisPoints: null, measuredValue: null },
    { metric: "safety_refusal_consistency", status: "measured", sampleCount: 100, scoreBasisPoints: 9900, measuredValue: null },
    { metric: "persian_quality", status: "measured", sampleCount: 100, scoreBasisPoints: 9500, measuredValue: null },
    { metric: "english_quality", status: "measured", sampleCount: 100, scoreBasisPoints: 9800, measuredValue: null },
    { metric: "latency_p95_ms", status: "measured", sampleCount: 100, scoreBasisPoints: null, measuredValue: 1800 },
    { metric: "cost_per_sample_usd_micros", status: "measured", sampleCount: 100, scoreBasisPoints: null, measuredValue: 4200 },
  ];
}

describe("Model evaluation application authority", () => {
  it("records a bounded capability snapshot and replays by evidence hash", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    let insertCount = 0;
    const client = {
      async query(sql: string, params: readonly unknown[] = []) {
        calls.push({ sql, params });
        if (sql.includes("INSERT INTO ai_model_capability_snapshots")) {
          insertCount += 1;
          return { rows: insertCount === 1 ? [{ id: "11111111-1111-4111-8111-111111111111" }] : [] };
        }
        if (sql.includes("SELECT id FROM ai_model_capability_snapshots")) {
          return { rows: [{ id: "11111111-1111-4111-8111-111111111111" }] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as unknown as PoolClient;
    const input = {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      capability: {
        providerId: "openai" as const,
        requestedModel: "gpt-research-pinned",
        canonicalModel: "gpt-research-pinned",
        observedAt: "2026-09-24T00:00:00.000Z",
        exactModelIdentity: true,
        deprecated: false,
        zeroDataRetention: true,
        supportedDataClasses: ["public" as const],
        capabilities: ["text", "web_search", "citations"],
        tools: ["web_search"],
        cacheMode: "none" as const,
      },
    };
    const created = await recordAiModelCapabilitySnapshot(client, input);
    const replayed = await recordAiModelCapabilitySnapshot(client, input);
    assert.equal(created.replayed, false);
    assert.equal(replayed.replayed, true);
    assert.equal(created.evidenceHash, replayed.evidenceHash);
    assert.match(created.evidenceHash, /^[0-9a-f]{64}$/);
    assert.equal(
      calls.some(({ params }) =>
        params.some((value) => typeof value === "string" && value.includes("raw prompt"))),
      false,
    );
  });

  it("persists one immutable eval summary plus exactly eight normalized metrics", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const client = {
      async query(sql: string, params: readonly unknown[] = []) {
        calls.push({ sql, params });
        if (sql.includes("INSERT INTO ai_model_eval_runs")) {
          return { rows: [{ id: "22222222-2222-4222-8222-222222222222" }] };
        }
        if (sql.includes("INSERT INTO ai_model_eval_metric_results")) {
          return { rows: [] };
        }
        throw new Error(`unexpected_query:${sql}`);
      },
    } as unknown as PoolClient;

    const result = await recordAiModelEvaluationEvidence(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      evaluation: {
        taskId: "mentor_public_research",
        providerId: "openai",
        requestedModel: "gpt-research-pinned",
        canonicalModel: "gpt-research-pinned",
        measuredAt: "2026-09-24T00:00:00.000Z",
        datasetVersion: "mentor-public-research-2026-09",
        datasetHash: "a".repeat(64),
        evaluatorKind: "blind_pairwise",
        evaluatorVersion: "tecpey-evaluator-v1",
        metrics: evaluationMetrics(),
      },
    });

    assert.equal(result.replayed, false);
    assert.equal(result.summary.passed, true);
    assert.equal(result.summary.qualityBasisPoints, 9500);
    assert.equal(
      calls.filter(({ sql }) => sql.includes("INSERT INTO ai_model_eval_metric_results")).length,
      8,
    );
    assert.equal(
      calls.some(({ params }) =>
        params.some((value) =>
          typeof value === "string" && /private transcript|raw model output/i.test(value))),
      false,
    );
  });

  it("resolves only configured route evidence and preserves missing eval as unavailable", async () => {
    const client = {
      async query(sql: string) {
        assert.match(sql, /ai_agent_route_candidates/);
        assert.match(sql, /provider\.last_test_status='passed'/);
        assert.match(sql, /eval\.passed=TRUE/);
        assert.match(sql, /eval\.policy_version=\$5/);
        assert.match(sql, /COUNT\(DISTINCT metric\.metric\)=8/);
        return {
          rows: [
            {
              provider_id: "openai",
              model: "gpt-research-pinned",
              capability_id: "11111111-1111-4111-8111-111111111111",
              requested_model: "gpt-research-pinned",
              canonical_model: "gpt-research-pinned",
              observed_at: new Date("2026-09-24T00:00:00.000Z"),
              exact_model_identity: true,
              deprecated: false,
              zero_data_retention: true,
              supported_data_classes: ["public"],
              capabilities: ["text", "web_search", "citations"],
              tools: ["web_search"],
              cache_mode: "none",
              eval_id: "22222222-2222-4222-8222-222222222222",
              eval_suite_id: "mentor_public_research_v1",
              measured_at: new Date("2026-09-24T01:00:00.000Z"),
              sample_size: 100,
              quality_basis_points: 9600,
            },
            {
              provider_id: "perplexity",
              model: "sonar-research-pinned",
              capability_id: "33333333-3333-4333-8333-333333333333",
              requested_model: "sonar-research-pinned",
              canonical_model: "sonar-research-pinned",
              observed_at: new Date("2026-09-24T00:00:00.000Z"),
              exact_model_identity: true,
              deprecated: false,
              zero_data_retention: true,
              supported_data_classes: ["public"],
              capabilities: ["text", "web_search", "citations"],
              tools: ["web_search"],
              cache_mode: "none",
              eval_id: null,
              eval_suite_id: null,
              measured_at: null,
              sample_size: null,
              quality_basis_points: null,
            },
          ],
        };
      },
    } as unknown as PoolClient;

    const evidence = await readGovernedModelLabEvidenceSet(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
    });
    assert.equal(evidence.candidates.length, 2);
    assert.equal(evidence.candidates[0]?.evalEvidence?.qualityBasisPoints, 9600);
    assert.equal(evidence.candidates[1]?.evalEvidence, null);
    assert.deepEqual(evidence.unavailable, [{
      providerId: "perplexity",
      requestedModel: "sonar-research-pinned",
      reason: "evaluation_missing",
    }]);
  });

  it("does not synthesize a candidate when capability authority is absent", async () => {
    const client = {
      async query() {
        return {
          rows: [{
            provider_id: "openai",
            model: "gpt-unobserved",
            capability_id: null,
            requested_model: null,
            canonical_model: null,
            observed_at: null,
            exact_model_identity: null,
            deprecated: null,
            zero_data_retention: null,
            supported_data_classes: null,
            capabilities: null,
            tools: null,
            cache_mode: null,
            eval_id: null,
            eval_suite_id: null,
            measured_at: null,
            sample_size: null,
            quality_basis_points: null,
          }],
        };
      },
    } as unknown as PoolClient;
    const evidence = await readGovernedModelLabEvidenceSet(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      taskId: "mentor_public_research",
      agentId: "coin_tool_researcher",
    });
    assert.deepEqual(evidence.candidates, []);
    assert.equal(evidence.unavailable[0]?.reason, "capability_snapshot_missing");
  });
});
