import { createHash } from "node:crypto";
import type { AiModelProviderId } from "./control-plane-catalog";
import {
  AI_INTELLIGENCE_EVAL_REQUIREMENTS,
  type AiIntelligenceEvalEvidence,
} from "./intelligence-model-policy";
import {
  aiIntelligenceTaskDefinition,
  type AiIntelligenceTaskId,
} from "./intelligence-task-catalog";

export const AI_MODEL_EVAL_POLICY_VERSION = "2026-09-24.1";

export const AI_MODEL_EVAL_METRICS = [
  "factuality",
  "citation_coverage",
  "structured_output_validity",
  "safety_refusal_consistency",
  "persian_quality",
  "english_quality",
  "latency_p95_ms",
  "cost_per_sample_usd_micros",
] as const;

export type AiModelEvalMetricId = (typeof AI_MODEL_EVAL_METRICS)[number];
export type AiModelEvalEvaluatorKind =
  | "deterministic"
  | "human_review"
  | "blind_pairwise";

export type AiModelEvalMetric = Readonly<{
  metric: AiModelEvalMetricId;
  status: "measured" | "not_applicable";
  sampleCount: number;
  scoreBasisPoints: number | null;
  measuredValue: number | null;
}>;

export type AiModelEvalRunInput = Readonly<{
  taskId: AiIntelligenceTaskId;
  providerId: AiModelProviderId;
  requestedModel: string;
  canonicalModel: string;
  measuredAt: string;
  datasetVersion: string;
  datasetHash: string;
  evaluatorKind: AiModelEvalEvaluatorKind;
  evaluatorVersion: string;
  metrics: readonly AiModelEvalMetric[];
}>;

export type AiModelEvalSummary = Readonly<{
  policyVersion: typeof AI_MODEL_EVAL_POLICY_VERSION;
  taskId: AiIntelligenceTaskId;
  evalSuiteId: string;
  providerId: AiModelProviderId;
  requestedModel: string;
  canonicalModel: string;
  measuredAt: string;
  datasetVersion: string;
  datasetHash: string;
  evaluatorKind: AiModelEvalEvaluatorKind;
  evaluatorVersion: string;
  sampleSize: number;
  qualityBasisPoints: number;
  passed: boolean;
  reasons: readonly string[];
  metrics: readonly AiModelEvalMetric[];
  evidenceHash: string;
}>;

const HASH = /^[0-9a-f]{64}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("ai_model_eval_non_finite_value");
    return Object.is(value, -0) ? 0 : value;
  }
  return value;
}

function evidenceHash(value: unknown): string {
  return createHash("sha256")
    .update("tecpey-ai-model-eval:v1\0")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function ageSafeIso(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("ai_model_eval_measured_at_invalid");
  return new Date(time).toISOString();
}

function requiredQualityMetrics(taskId: AiIntelligenceTaskId): AiModelEvalMetricId[] {
  const task = aiIntelligenceTaskDefinition(taskId);
  const required: AiModelEvalMetricId[] = [
    "factuality",
    "safety_refusal_consistency",
    "persian_quality",
    "english_quality",
  ];
  if (task.evidencePolicy === "provider_citations") {
    required.push("citation_coverage");
  }
  if (task.output.mode === "json_schema") {
    required.push("structured_output_validity");
  }
  return required.sort();
}

function operationalMetrics(): readonly AiModelEvalMetricId[] {
  return ["latency_p95_ms", "cost_per_sample_usd_micros"] as const;
}

function validateMetric(metric: AiModelEvalMetric): AiModelEvalMetric {
  if (!AI_MODEL_EVAL_METRICS.includes(metric.metric)) {
    throw new Error("ai_model_eval_metric_unknown");
  }
  if (!Number.isSafeInteger(metric.sampleCount) || metric.sampleCount < 0 || metric.sampleCount > 10_000_000) {
    throw new Error("ai_model_eval_sample_count_invalid");
  }
  if (metric.status === "not_applicable") {
    if (metric.sampleCount !== 0 || metric.scoreBasisPoints !== null || metric.measuredValue !== null) {
      throw new Error("ai_model_eval_not_applicable_payload_invalid");
    }
    return Object.freeze({ ...metric });
  }
  if (metric.sampleCount < 1) throw new Error("ai_model_eval_measured_sample_missing");
  if (metric.metric === "latency_p95_ms" || metric.metric === "cost_per_sample_usd_micros") {
    if (
      metric.scoreBasisPoints !== null ||
      metric.measuredValue === null ||
      !Number.isFinite(metric.measuredValue) ||
      metric.measuredValue < 0
    ) {
      throw new Error("ai_model_eval_operational_metric_invalid");
    }
    return Object.freeze({ ...metric });
  }
  if (
    metric.measuredValue !== null ||
    !Number.isSafeInteger(metric.scoreBasisPoints) ||
    metric.scoreBasisPoints < 0 ||
    metric.scoreBasisPoints > 10_000
  ) {
    throw new Error("ai_model_eval_quality_metric_invalid");
  }
  return Object.freeze({ ...metric });
}

/**
 * Produces conservative, replayable model-evaluation evidence.
 *
 * Quality is the minimum score across every task-required quality dimension,
 * never an average. This prevents a strong latency/cost or one excellent
 * language score from masking a factuality, safety, citation, structured-output
 * or locale-parity weakness. Latency and cost are mandatory observations but do
 * not inflate the quality score.
 */
export function summarizeAiModelEvaluation(input: AiModelEvalRunInput): AiModelEvalSummary {
  const task = aiIntelligenceTaskDefinition(input.taskId);
  const requirement = AI_INTELLIGENCE_EVAL_REQUIREMENTS[input.taskId];
  const requestedModel = input.requestedModel.trim();
  const canonicalModel = input.canonicalModel.trim();
  const datasetVersion = input.datasetVersion.trim();
  const evaluatorVersion = input.evaluatorVersion.trim();
  const measuredAt = ageSafeIso(input.measuredAt);

  if (!MODEL.test(requestedModel) || !MODEL.test(canonicalModel)) {
    throw new Error("ai_model_eval_model_identity_invalid");
  }
  if (!HASH.test(input.datasetHash)) throw new Error("ai_model_eval_dataset_hash_invalid");
  if (!VERSION.test(datasetVersion) || !VERSION.test(evaluatorVersion)) {
    throw new Error("ai_model_eval_version_invalid");
  }
  if (!["deterministic", "human_review", "blind_pairwise"].includes(input.evaluatorKind)) {
    throw new Error("ai_model_eval_evaluator_kind_invalid");
  }
  if (input.metrics.length !== AI_MODEL_EVAL_METRICS.length) {
    throw new Error("ai_model_eval_metric_set_incomplete");
  }

  const byMetric = new Map<AiModelEvalMetricId, AiModelEvalMetric>();
  for (const raw of input.metrics) {
    const metric = validateMetric(raw);
    if (byMetric.has(metric.metric)) throw new Error("ai_model_eval_metric_duplicate");
    byMetric.set(metric.metric, metric);
  }
  for (const id of AI_MODEL_EVAL_METRICS) {
    if (!byMetric.has(id)) throw new Error("ai_model_eval_metric_set_incomplete");
  }

  const required = requiredQualityMetrics(input.taskId);
  const reasons: string[] = [];
  const requiredMeasured = required.map((id) => {
    const metric = byMetric.get(id)!;
    if (metric.status !== "measured" || metric.scoreBasisPoints === null) {
      reasons.push(`required_metric_missing:${id}`);
      return null;
    }
    if (metric.sampleCount < requirement.minimumSamples) {
      reasons.push(`sample_insufficient:${id}`);
    }
    return metric;
  }).filter((metric): metric is AiModelEvalMetric => metric !== null);

  for (const id of operationalMetrics()) {
    const metric = byMetric.get(id)!;
    if (metric.status !== "measured" || metric.measuredValue === null) {
      reasons.push(`operational_metric_missing:${id}`);
    }
  }

  const citation = byMetric.get("citation_coverage")!;
  const structured = byMetric.get("structured_output_validity")!;
  if (task.evidencePolicy !== "provider_citations" && citation.status !== "not_applicable") {
    reasons.push("citation_metric_should_be_not_applicable");
  }
  if (task.output.mode !== "json_schema" && structured.status !== "not_applicable") {
    reasons.push("structured_metric_should_be_not_applicable");
  }

  const sampleSize = requiredMeasured.length === required.length
    ? Math.min(...requiredMeasured.map((metric) => metric.sampleCount))
    : 0;
  const qualityBasisPoints = requiredMeasured.length === required.length
    ? Math.min(...requiredMeasured.map((metric) => metric.scoreBasisPoints ?? 0))
    : 0;

  if (qualityBasisPoints < requirement.minimumQualityBasisPoints) {
    reasons.push("quality_threshold_not_met");
  }
  if (sampleSize < requirement.minimumSamples) {
    reasons.push("minimum_samples_not_met");
  }

  const normalizedMetrics = AI_MODEL_EVAL_METRICS
    .map((id) => byMetric.get(id)!)
    .map((metric) => ({ ...metric }));
  const normalizedReasons = [...new Set(reasons)].sort();
  const payload = {
    policyVersion: AI_MODEL_EVAL_POLICY_VERSION,
    taskId: input.taskId,
    evalSuiteId: task.evalSuiteId,
    providerId: input.providerId,
    requestedModel,
    canonicalModel,
    measuredAt,
    datasetVersion,
    datasetHash: input.datasetHash,
    evaluatorKind: input.evaluatorKind,
    evaluatorVersion,
    sampleSize,
    qualityBasisPoints,
    passed: normalizedReasons.length === 0,
    reasons: normalizedReasons,
    metrics: normalizedMetrics,
  };

  return Object.freeze({
    ...payload,
    evidenceHash: evidenceHash(payload),
  });
}

export function aiIntelligenceEvalEvidenceFromSummary(
  summary: AiModelEvalSummary,
): AiIntelligenceEvalEvidence | null {
  if (!summary.passed) return null;
  return Object.freeze({
    taskId: summary.taskId,
    evalSuiteId: summary.evalSuiteId,
    candidateProviderId: summary.providerId,
    candidateModel: summary.canonicalModel,
    measuredAt: summary.measuredAt,
    sampleSize: summary.sampleSize,
    qualityBasisPoints: summary.qualityBasisPoints,
  });
}
