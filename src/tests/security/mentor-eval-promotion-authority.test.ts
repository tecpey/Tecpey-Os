import assert from "node:assert/strict";
import test from "node:test";
import {
  mentorEvalPromotionSummary,
  type MentorEvalRecordedMetric,
} from "@/lib/ai/mentor-eval-store";

function passingMetrics(): MentorEvalRecordedMetric[] {
  return [
    { metric: "safety_hard_gate", passRate: 1, sampleCount: 40, unit: "ratio" },
    { metric: "privacy_egress", passRate: 1, sampleCount: 30, unit: "ratio" },
    { metric: "research_citation", passRate: 1, sampleCount: 30, unit: "ratio" },
    { metric: "curriculum_grounding", passRate: 0.99, sampleCount: 100, unit: "ratio" },
    { metric: "pedagogy_helpfulness", passRate: 0.95, sampleCount: 100, unit: "ratio" },
    { metric: "locale_parity", passRate: 0.99, sampleCount: 80, unit: "ratio" },
    {
      metric: "next_item_correctness",
      baselineMeasured: true,
      sampleCount: 120,
      candidateValue: 0.76,
      baselineValue: 0.71,
      unit: "ratio",
    },
    {
      metric: "response_latency",
      baselineMeasured: true,
      sampleCount: 120,
      candidateValue: 1850,
      baselineValue: 1920,
      unit: "milliseconds",
    },
  ];
}

test("Mentor promotion passes only with the complete governed metric set", () => {
  const result = mentorEvalPromotionSummary(passingMetrics());
  assert.equal(result.releaseDecision, "pass");
  assert.equal(result.hardGateFailureCount, 0);
  assert.equal(result.metrics.length, 8);
  assert.equal(result.metrics.every((metric) => metric.passed), true);
  assert.equal(
    result.metrics.every((metric) => /^[a-f0-9]{64}$/.test(metric.resultHash)),
    true,
  );
});

test("one hard-gate regression blocks promotion without being averaged away", () => {
  const metrics = passingMetrics();
  metrics[0] = { ...metrics[0]!, passRate: 0.99 };
  const result = mentorEvalPromotionSummary(metrics);
  assert.equal(result.releaseDecision, "block");
  assert.equal(result.hardGateFailureCount, 1);
  assert.equal(
    result.metrics.find((metric) => metric.metric === "safety_hard_gate")?.passed,
    false,
  );
});

test("missing measured learning baseline blocks promotion", () => {
  const metrics = passingMetrics();
  metrics[6] = { ...metrics[6]!, baselineMeasured: false };
  const result = mentorEvalPromotionSummary(metrics);
  assert.equal(result.releaseDecision, "block");
  assert.equal(result.hardGateFailureCount, 0);
  assert.equal(
    result.metrics.find((metric) => metric.metric === "next_item_correctness")?.passed,
    false,
  );
});

test("duplicate or incomplete metric sets are rejected", () => {
  assert.throws(
    () => mentorEvalPromotionSummary(passingMetrics().slice(0, 7)),
    /mentor_eval_metric_set_incomplete/,
  );
  const duplicate = passingMetrics();
  duplicate[7] = { ...duplicate[6]! };
  assert.throws(
    () => mentorEvalPromotionSummary(duplicate),
    /mentor_eval_metric_set_invalid/,
  );
});
