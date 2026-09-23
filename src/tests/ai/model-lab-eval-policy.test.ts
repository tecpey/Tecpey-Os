import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_MODEL_EVAL_METRICS,
  aiIntelligenceEvalEvidenceFromSummary,
  summarizeAiModelEvaluation,
  type AiModelEvalMetric,
} from "../../lib/ai/model-lab-eval-policy";

function quality(
  metric: Exclude<AiModelEvalMetric["metric"], "latency_p95_ms" | "cost_per_sample_usd_micros">,
  scoreBasisPoints: number,
  sampleCount = 100,
): AiModelEvalMetric {
  return {
    metric,
    status: "measured",
    sampleCount,
    scoreBasisPoints,
    measuredValue: null,
  };
}

function operational(
  metric: "latency_p95_ms" | "cost_per_sample_usd_micros",
  measuredValue: number,
  sampleCount = 100,
): AiModelEvalMetric {
  return {
    metric,
    status: "measured",
    sampleCount,
    scoreBasisPoints: null,
    measuredValue,
  };
}

function na(
  metric: "citation_coverage" | "structured_output_validity",
): AiModelEvalMetric {
  return {
    metric,
    status: "not_applicable",
    sampleCount: 0,
    scoreBasisPoints: null,
    measuredValue: null,
  };
}

function publicResearchMetrics(overrides: Partial<Record<AiModelEvalMetric["metric"], AiModelEvalMetric>> = {}) {
  const metrics: AiModelEvalMetric[] = [
    quality("factuality", 9700),
    quality("citation_coverage", 9650),
    na("structured_output_validity"),
    quality("safety_refusal_consistency", 9900),
    quality("persian_quality", 9600),
    quality("english_quality", 9800),
    operational("latency_p95_ms", 1800),
    operational("cost_per_sample_usd_micros", 4100),
  ];
  return metrics.map((metric) => overrides[metric.metric] ?? metric);
}

function base(metrics = publicResearchMetrics()) {
  return {
    taskId: "mentor_public_research" as const,
    providerId: "openai" as const,
    requestedModel: "gpt-research-pinned",
    canonicalModel: "gpt-research-pinned",
    measuredAt: "2026-09-24T00:00:00.000Z",
    datasetVersion: "mentor-public-research-2026-09",
    datasetHash: "a".repeat(64),
    evaluatorKind: "blind_pairwise" as const,
    evaluatorVersion: "tecpey-evaluator-v1",
    metrics,
  };
}

describe("Model Lab evaluation policy", () => {
  it("requires a complete eight-dimensional evaluation record", () => {
    assert.equal(publicResearchMetrics().length, AI_MODEL_EVAL_METRICS.length);
    assert.throws(
      () => summarizeAiModelEvaluation(base(publicResearchMetrics().slice(0, 7))),
      /ai_model_eval_metric_set_incomplete/,
    );
  });

  it("uses the weakest required quality dimension instead of averaging away a weakness", () => {
    const summary = summarizeAiModelEvaluation(base());
    assert.equal(summary.passed, true);
    assert.equal(summary.qualityBasisPoints, 9600);
    assert.equal(summary.sampleSize, 100);
    assert.deepEqual(summary.reasons, []);
    assert.match(summary.evidenceHash, /^[0-9a-f]{64}$/);

    const evidence = aiIntelligenceEvalEvidenceFromSummary(summary);
    assert.deepEqual(evidence, {
      taskId: "mentor_public_research",
      evalSuiteId: "mentor_public_research_v1",
      candidateProviderId: "openai",
      candidateModel: "gpt-research-pinned",
      measuredAt: "2026-09-24T00:00:00.000Z",
      sampleSize: 100,
      qualityBasisPoints: 9600,
    });
  });

  it("blocks a candidate when any required quality dimension misses the task threshold", () => {
    const summary = summarizeAiModelEvaluation(base(publicResearchMetrics({
      citation_coverage: quality("citation_coverage", 9300),
    })));
    assert.equal(summary.passed, false);
    assert.equal(summary.qualityBasisPoints, 9300);
    assert.ok(summary.reasons.includes("quality_threshold_not_met"));
    assert.equal(aiIntelligenceEvalEvidenceFromSummary(summary), null);
  });

  it("blocks insufficient samples even when scores are high", () => {
    const summary = summarizeAiModelEvaluation(base(publicResearchMetrics({
      factuality: quality("factuality", 9900, 79),
    })));
    assert.equal(summary.passed, false);
    assert.equal(summary.sampleSize, 79);
    assert.ok(summary.reasons.includes("sample_insufficient:factuality"));
    assert.ok(summary.reasons.includes("minimum_samples_not_met"));
  });

  it("requires latency and cost observations without letting them inflate quality", () => {
    const metrics = publicResearchMetrics({
      latency_p95_ms: {
        metric: "latency_p95_ms",
        status: "not_applicable",
        sampleCount: 0,
        scoreBasisPoints: null,
        measuredValue: null,
      },
    });
    const summary = summarizeAiModelEvaluation(base(metrics));
    assert.equal(summary.passed, false);
    assert.ok(summary.reasons.includes("operational_metric_missing:latency_p95_ms"));
    assert.equal(summary.qualityBasisPoints, 9600);
  });

  it("requires citation scoring only for citation-governed tasks", () => {
    const mentorSummary = summarizeAiModelEvaluation({
      ...base(),
      taskId: "mentor_coach",
      providerId: "anthropic",
      requestedModel: "claude-coach-pinned",
      canonicalModel: "claude-coach-pinned",
      metrics: [
        quality("factuality", 9800, 160),
        na("citation_coverage"),
        na("structured_output_validity"),
        quality("safety_refusal_consistency", 9900, 160),
        quality("persian_quality", 9700, 160),
        quality("english_quality", 9800, 160),
        operational("latency_p95_ms", 1500, 160),
        operational("cost_per_sample_usd_micros", 5200, 160),
      ],
    });
    assert.equal(mentorSummary.passed, true);

    assert.throws(
      () => summarizeAiModelEvaluation({
        ...base(),
        taskId: "mentor_coach",
        providerId: "anthropic",
        requestedModel: "claude-coach-pinned",
        canonicalModel: "claude-coach-pinned",
        metrics: [
          quality("factuality", 9800, 160),
          quality("citation_coverage", 9900, 160),
          na("structured_output_validity"),
          quality("safety_refusal_consistency", 9900, 160),
          quality("persian_quality", 9700, 160),
          quality("english_quality", 9800, 160),
          operational("latency_p95_ms", 1500, 160),
          operational("cost_per_sample_usd_micros", 5200, 160),
        ],
      }),
      /$^/,
    );
  });

  it("requires structured-output validity for schema-governed tasks", () => {
    const metrics: AiModelEvalMetric[] = [
      quality("factuality", 9600),
      quality("citation_coverage", 9500),
      quality("structured_output_validity", 9700),
      quality("safety_refusal_consistency", 9800),
      quality("persian_quality", 9500),
      quality("english_quality", 9600),
      operational("latency_p95_ms", 1900),
      operational("cost_per_sample_usd_micros", 3500),
    ];
    const summary = summarizeAiModelEvaluation({
      ...base(metrics),
      taskId: "growth_scan",
      providerId: "perplexity",
      requestedModel: "sonar-growth-pinned",
      canonicalModel: "sonar-growth-pinned",
    });
    assert.equal(summary.passed, true);
    assert.equal(summary.qualityBasisPoints, 9500);
  });

  it("keeps evidence hashing stable across metric input order", () => {
    const left = summarizeAiModelEvaluation(base());
    const right = summarizeAiModelEvaluation(base([...publicResearchMetrics()].reverse()));
    assert.equal(left.evidenceHash, right.evidenceHash);
  });

  it("rejects duplicate metrics rather than accepting an ambiguous grader record", () => {
    const metrics = publicResearchMetrics();
    metrics[7] = quality("factuality", 9999);
    assert.throws(
      () => summarizeAiModelEvaluation(base(metrics)),
      /ai_model_eval_metric_duplicate|ai_model_eval_metric_set_incomplete/,
    );
  });
});
