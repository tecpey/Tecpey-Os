import { createHash, randomUUID } from "node:crypto";
import type { AiModelProviderId } from "@/lib/ai/control-plane-catalog";
import {
  MENTOR_EVAL_CONTRACT_VERSION,
  MENTOR_EVAL_RELEASE_GATES,
  mentorEvalReleaseDecision,
  type MentorEvalMetric,
  type MentorEvalMetricResult,
} from "@/lib/ai/mentor-eval-contract";
import { MENTOR_EVIDENCE_POLICY_VERSION } from "@/lib/ai/mentor-evidence-policy";
import { withAiTenantTransaction } from "@/lib/ai/database-authority";

export type MentorEvalRecordedMetric = Readonly<{
  metric: MentorEvalMetric;
  passRate?: number;
  baselineMeasured?: boolean;
  sampleCount: number;
  candidateValue?: number;
  baselineValue?: number;
  unit: "ratio" | "milliseconds" | "count";
}>;

export type MentorEvalPromotionEvidenceInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  candidateSha: string;
  candidateTree: string;
  providerId: AiModelProviderId;
  requestedModel: string;
  actualModel: string;
  promptHash: string;
  trustPolicyVersion: string;
  datasetVersion: string;
  datasetHash: string;
  evaluatorVersion: string;
  baselineRunId?: string | null;
  metrics: readonly MentorEvalRecordedMetric[];
}>;

export type MentorEvalPromotionEvidence = Readonly<{
  runId: string;
  candidateSha: string;
  candidateTree: string;
  releaseDecision: "pass" | "block";
  hardGateFailureCount: number;
  evidenceHash: string;
  createdAt: string;
}>;

const SHA_PATTERN = /^[a-f0-9]{40,64}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function finiteNonNegative(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("mentor_eval_metric_value_invalid");
  }
  return value;
}

function boundedSampleCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000_000) {
    throw new Error("mentor_eval_sample_count_invalid");
  }
  return value;
}

function canonicalMetric(metric: MentorEvalRecordedMetric) {
  const passRate = metric.passRate === undefined
    ? null
    : finiteNonNegative(metric.passRate);
  if (passRate !== null && passRate > 1) {
    throw new Error("mentor_eval_pass_rate_invalid");
  }
  return {
    metric: metric.metric,
    passRate,
    baselineMeasured: metric.baselineMeasured === true,
    sampleCount: boundedSampleCount(metric.sampleCount),
    candidateValue: finiteNonNegative(metric.candidateValue),
    baselineValue: finiteNonNegative(metric.baselineValue),
    unit: metric.unit,
  } as const;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertBoundedText(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`mentor_eval_${label}_invalid`);
  }
  return normalized;
}

function releaseMetrics(
  metrics: readonly ReturnType<typeof canonicalMetric>[],
): MentorEvalMetricResult[] {
  return metrics.map((metric) => ({
    metric: metric.metric,
    ...(metric.passRate === null ? {} : { passRate: metric.passRate }),
    baselineMeasured: metric.baselineMeasured,
    ...(metric.candidateValue === null ? {} : { candidateValue: metric.candidateValue }),
    ...(metric.baselineValue === null ? {} : { baselineValue: metric.baselineValue }),
  }));
}

function validateMetricSet(metrics: readonly MentorEvalRecordedMetric[]) {
  const canonical = metrics.map(canonicalMetric);
  const expected = new Set(MENTOR_EVAL_RELEASE_GATES.map((gate) => gate.metric));
  const seen = new Set<MentorEvalMetric>();
  for (const metric of canonical) {
    if (!expected.has(metric.metric) || seen.has(metric.metric)) {
      throw new Error("mentor_eval_metric_set_invalid");
    }
    seen.add(metric.metric);
  }
  if (seen.size !== expected.size) {
    throw new Error("mentor_eval_metric_set_incomplete");
  }
  return canonical;
}

function gateFor(metric: MentorEvalMetric) {
  const gate = MENTOR_EVAL_RELEASE_GATES.find((candidate) =>
    candidate.metric === metric
  );
  if (!gate) throw new Error("mentor_eval_gate_missing");
  return gate;
}

function expectedMetricUnit(
  metric: MentorEvalMetric,
): MentorEvalRecordedMetric["unit"] {
  return metric === "response_latency" ? "milliseconds" : "ratio";
}

function metricPassed(
  metric: ReturnType<typeof canonicalMetric>,
): boolean {
  const gate = gateFor(metric.metric);
  if (gate.requiresMeasuredBaseline) {
    if (
      metric.baselineMeasured !== true ||
      metric.candidateValue === null ||
      metric.baselineValue === null
    ) {
      return false;
    }
    if (
      gate.baselineComparison === "at_least" &&
      metric.candidateValue < metric.baselineValue
    ) {
      return false;
    }
    if (
      gate.baselineComparison === "at_most" &&
      metric.candidateValue > metric.baselineValue
    ) {
      return false;
    }
  }
  if (
    gate.minimumPassRate !== undefined &&
    (metric.passRate === null || metric.passRate < gate.minimumPassRate)
  ) {
    return false;
  }
  return true;
}

export function mentorEvalPromotionSummary(
  inputMetrics: readonly MentorEvalRecordedMetric[],
): Readonly<{
  releaseDecision: "pass" | "block";
  hardGateFailureCount: number;
  metrics: readonly (ReturnType<typeof canonicalMetric> & Readonly<{
    hardGate: boolean;
    minimumPassRate: number | null;
    passed: boolean;
    resultHash: string;
  }>)[];
}> {
  const metrics = validateMetricSet(inputMetrics)
    .sort((left, right) => left.metric.localeCompare(right.metric));
  for (const metric of metrics) {
    const gate = gateFor(metric.metric);
    if (metric.unit !== expectedMetricUnit(metric.metric)) {
      throw new Error("mentor_eval_metric_unit_invalid");
    }
    if (
      gate.requiresMeasuredBaseline &&
      metric.baselineMeasured === true &&
      (metric.candidateValue === null || metric.baselineValue === null)
    ) {
      throw new Error("mentor_eval_baseline_measurement_missing");
    }
  }
  const decision = mentorEvalReleaseDecision(releaseMetrics(metrics));
  const releaseDecision = decision.pass ? "pass" : "block";
  const hardGateFailureCount = metrics.filter((metric) => {
    const gate = gateFor(metric.metric);
    return gate.hardGate && !metricPassed(metric);
  }).length;
  const canonicalMetrics = metrics.map((metric) => {
    const gate = gateFor(metric.metric);
    const result = {
      ...metric,
      hardGate: gate.hardGate,
      minimumPassRate: gate.minimumPassRate ?? null,
      passed: metricPassed(metric),
    };
    return { ...result, resultHash: sha256(result) };
  });
  return {
    releaseDecision,
    hardGateFailureCount,
    metrics: canonicalMetrics,
  };
}

export async function recordMentorEvalPromotionEvidence(
  input: MentorEvalPromotionEvidenceInput,
): Promise<{ enabled: false; value: null } | {
  enabled: true;
  value: MentorEvalPromotionEvidence;
}> {
  if (!SHA_PATTERN.test(input.candidateSha) || !SHA_PATTERN.test(input.candidateTree)) {
    throw new Error("mentor_eval_candidate_identity_invalid");
  }
  if (!HASH_PATTERN.test(input.promptHash) || !HASH_PATTERN.test(input.datasetHash)) {
    throw new Error("mentor_eval_content_hash_invalid");
  }

  const summary = mentorEvalPromotionSummary(input.metrics);
  const requiresBaseline = summary.metrics.some((metric) => {
    const gate = gateFor(metric.metric);
    return gate.requiresMeasuredBaseline && metric.baselineMeasured === true;
  });
  if (requiresBaseline && !input.baselineRunId) {
    throw new Error("mentor_eval_baseline_run_required");
  }
  const {
    releaseDecision,
    hardGateFailureCount,
    metrics: canonicalMetrics,
  } = summary;

  const requestedModel = assertBoundedText(input.requestedModel, "requested_model", 160);
  const actualModel = assertBoundedText(input.actualModel, "actual_model", 160);
  const trustPolicyVersion = assertBoundedText(
    input.trustPolicyVersion,
    "trust_policy_version",
    80,
  );
  const datasetVersion = assertBoundedText(input.datasetVersion, "dataset_version", 120);
  const evaluatorVersion = assertBoundedText(
    input.evaluatorVersion,
    "evaluator_version",
    120,
  );
  const runId = randomUUID();

  const evidencePayload = {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    candidateSha: input.candidateSha,
    candidateTree: input.candidateTree,
    providerId: input.providerId,
    requestedModel,
    actualModel,
    promptHash: input.promptHash,
    trustPolicyVersion,
    evidencePolicyVersion: MENTOR_EVIDENCE_POLICY_VERSION,
    evalContractVersion: MENTOR_EVAL_CONTRACT_VERSION,
    datasetVersion,
    datasetHash: input.datasetHash,
    evaluatorVersion,
    baselineRunId: input.baselineRunId ?? null,
    releaseDecision,
    hardGateFailureCount,
    metrics: canonicalMetrics,
  };
  const evidenceHash = sha256(evidencePayload);

  return withAiTenantTransaction(input, async (client) => {
    await client.query(
      `INSERT INTO ai_mentor_eval_runs
        (id, tenant_id, workspace_id, candidate_sha, candidate_tree,
         provider_id, requested_model, actual_model, prompt_hash,
         trust_policy_version, evidence_policy_version, eval_contract_version,
         dataset_version, dataset_hash, evaluator_version, baseline_run_id,
         release_decision, hard_gate_failure_count, evidence_hash)
       VALUES
        ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16::uuid, $17, $18, $19)`,
      [
        runId,
        input.tenantId,
        input.workspaceId,
        input.candidateSha,
        input.candidateTree,
        input.providerId,
        requestedModel,
        actualModel,
        input.promptHash,
        trustPolicyVersion,
        MENTOR_EVIDENCE_POLICY_VERSION,
        MENTOR_EVAL_CONTRACT_VERSION,
        datasetVersion,
        input.datasetHash,
        evaluatorVersion,
        input.baselineRunId ?? null,
        releaseDecision,
        hardGateFailureCount,
        evidenceHash,
      ],
    );

    for (const metric of canonicalMetrics) {
      await client.query(
        `INSERT INTO ai_mentor_eval_metric_results
          (tenant_id, workspace_id, run_id, metric, hard_gate, pass_rate,
           minimum_pass_rate, baseline_measured, sample_count, candidate_value,
           baseline_value, unit, passed, result_hash)
         VALUES
          ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          input.tenantId,
          input.workspaceId,
          runId,
          metric.metric,
          metric.hardGate,
          metric.passRate,
          metric.minimumPassRate,
          metric.baselineMeasured,
          metric.sampleCount,
          metric.candidateValue,
          metric.baselineValue,
          metric.unit,
          metric.passed,
          metric.resultHash,
        ],
      );
    }

    const row = await client.query<{ created_at: Date }>(
      "SELECT created_at FROM ai_mentor_eval_runs WHERE id = $1::uuid",
      [runId],
    );
    return {
      runId,
      candidateSha: input.candidateSha,
      candidateTree: input.candidateTree,
      releaseDecision,
      hardGateFailureCount,
      evidenceHash,
      createdAt: row.rows[0]!.created_at.toISOString(),
    } satisfies MentorEvalPromotionEvidence;
  });
}

export async function latestMentorEvalPromotionEvidence(input: {
  tenantId: string;
  workspaceId: string;
  candidateSha: string;
}): Promise<{ enabled: false; value: null } | {
  enabled: true;
  value: MentorEvalPromotionEvidence | null;
}> {
  if (!SHA_PATTERN.test(input.candidateSha)) {
    throw new Error("mentor_eval_candidate_identity_invalid");
  }
  return withAiTenantTransaction(input, async (client) => {
    const result = await client.query<{
      id: string;
      candidate_sha: string;
      candidate_tree: string;
      release_decision: "pass" | "block";
      hard_gate_failure_count: number;
      evidence_hash: string;
      created_at: Date;
    }>(
      `SELECT id, candidate_sha, candidate_tree, release_decision,
              hard_gate_failure_count, evidence_hash, created_at
         FROM ai_mentor_eval_runs
        WHERE tenant_id = $1 AND workspace_id = $2 AND candidate_sha = $3
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [input.tenantId, input.workspaceId, input.candidateSha],
    );
    const row = result.rows[0];
    return row
      ? {
          runId: row.id,
          candidateSha: row.candidate_sha,
          candidateTree: row.candidate_tree,
          releaseDecision: row.release_decision,
          hardGateFailureCount: Number(row.hard_gate_failure_count),
          evidenceHash: row.evidence_hash,
          createdAt: row.created_at.toISOString(),
        }
      : null;
  });
}
