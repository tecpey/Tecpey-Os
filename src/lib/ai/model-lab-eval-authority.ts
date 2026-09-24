import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  AiAgentId,
  AiDataClass,
  AiModelProviderId,
} from "./control-plane-catalog";
import {
  type AiIntelligenceEvalEvidence,
  type AiIntelligenceModelCapabilitySnapshot,
} from "./intelligence-model-policy";
import type { AiIntelligenceEndpointId } from "./intelligence-endpoint-policy";
import type { AiIntelligenceTaskId } from "./intelligence-task-catalog";
import type { AiModelLabCandidate } from "./model-lab-council-policy";
import {
  AI_MODEL_EVAL_POLICY_VERSION,
  summarizeAiModelEvaluation,
  type AiModelEvalRunInput,
  type AiModelEvalSummary,
} from "./model-lab-eval-policy";

type EvalScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

export type GovernedModelLabEvidenceSet = Readonly<{
  candidates: readonly AiModelLabCandidate[];
  unavailable: readonly Readonly<{
    providerId: AiModelProviderId;
    requestedModel: string;
    reason:
      | "capability_snapshot_missing"
      | "capability_snapshot_invalid"
      | "evaluation_missing"
      | "evaluation_invalid";
  }>[];
}>;

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const DATA_CLASSES = new Set<AiDataClass>([
  "public",
  "aggregate_deidentified",
  "approved_platform_content",
  "private_user",
  "restricted_admin",
]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("ai_model_eval_authority_non_finite_value");
  }
  return value;
}

function hash(namespace: string, value: unknown): string {
  return createHash("sha256")
    .update(`tecpey-ai-model-eval-authority:${namespace}:v1\0`)
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function assertScope(scope: EvalScope): void {
  if (!scope.tenantId || !scope.workspaceId) {
    throw new Error("ai_model_eval_scope_invalid");
  }
}

function boundedUniqueStrings(
  values: readonly string[],
  label: string,
  maximum: number,
): string[] {
  if (values.length > maximum) throw new Error(`ai_model_eval_${label}_too_many`);
  const normalized = values.map((value) => value.trim());
  if (
    normalized.some((value) => !value || value.length > 120) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new Error(`ai_model_eval_${label}_invalid`);
  }
  return normalized.sort();
}

function endpoint(providerId: AiModelProviderId): AiIntelligenceEndpointId {
  if (providerId === "openai") return "openai_responses";
  if (providerId === "anthropic") return "anthropic_messages";
  if (providerId === "xai") return "xai_responses";
  if (providerId === "perplexity") return "perplexity_agent";
  return "openrouter_chat_completions";
}

function parseStringArray(value: unknown, maximum: number): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    value.some((item) => typeof item !== "string" || !item.trim() || item.length > 120)
  ) {
    return null;
  }
  const normalized = value.map((item) => String(item).trim());
  return new Set(normalized).size === normalized.length ? normalized : null;
}

export async function recordAiModelCapabilitySnapshot(
  client: PoolClient,
  input: EvalScope & { capability: AiIntelligenceModelCapabilitySnapshot },
): Promise<{ id: string; evidenceHash: string; replayed: boolean }> {
  assertScope(input);
  const capability = input.capability;
  if (!MODEL.test(capability.requestedModel) || !MODEL.test(capability.canonicalModel)) {
    throw new Error("ai_model_capability_identity_invalid");
  }
  const observedMs = Date.parse(capability.observedAt);
  if (!Number.isFinite(observedMs)) throw new Error("ai_model_capability_observed_at_invalid");
  const supportedDataClasses = boundedUniqueStrings(
    capability.supportedDataClasses,
    "data_classes",
    5,
  );
  if (
    supportedDataClasses.length < 1 ||
    supportedDataClasses.some((item) => !DATA_CLASSES.has(item as AiDataClass))
  ) {
    throw new Error("ai_model_capability_data_classes_invalid");
  }
  const capabilities = boundedUniqueStrings(capability.capabilities, "capabilities", 32);
  if (capabilities.length < 1) throw new Error("ai_model_capability_capabilities_invalid");
  const tools = boundedUniqueStrings(capability.tools, "tools", 32);
  const normalized = {
    providerId: capability.providerId,
    requestedModel: capability.requestedModel,
    canonicalModel: capability.canonicalModel,
    observedAt: new Date(observedMs).toISOString(),
    exactModelIdentity: capability.exactModelIdentity,
    deprecated: capability.deprecated,
    zeroDataRetention: capability.zeroDataRetention,
    supportedDataClasses,
    capabilities,
    tools,
    cacheMode: capability.cacheMode,
  };
  const evidenceHash = hash("capability", normalized);
  const id = randomUUID();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO ai_model_capability_snapshots
      (id,tenant_id,workspace_id,provider_id,requested_model,canonical_model,
       observed_at,exact_model_identity,deprecated,zero_data_retention,
       supported_data_classes,capabilities,tools,cache_mode,evidence_hash)
     VALUES
      ($1::uuid,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10,$11::jsonb,$12::jsonb,
       $13::jsonb,$14,$15)
     ON CONFLICT (tenant_id,workspace_id,evidence_hash) DO NOTHING
     RETURNING id`,
    [
      id,
      input.tenantId,
      input.workspaceId,
      normalized.providerId,
      normalized.requestedModel,
      normalized.canonicalModel,
      normalized.observedAt,
      normalized.exactModelIdentity,
      normalized.deprecated,
      normalized.zeroDataRetention,
      JSON.stringify(normalized.supportedDataClasses),
      JSON.stringify(normalized.capabilities),
      JSON.stringify(normalized.tools),
      normalized.cacheMode,
      evidenceHash,
    ],
  );
  if (inserted.rows[0]) {
    return { id: inserted.rows[0].id, evidenceHash, replayed: false };
  }
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM ai_model_capability_snapshots
      WHERE tenant_id=$1 AND workspace_id=$2 AND evidence_hash=$3
      LIMIT 1`,
    [input.tenantId, input.workspaceId, evidenceHash],
  );
  if (!existing.rows[0]) throw new Error("ai_model_capability_replay_unavailable");
  return { id: existing.rows[0].id, evidenceHash, replayed: true };
}

export async function recordAiModelEvaluationEvidence(
  client: PoolClient,
  input: EvalScope & { evaluation: AiModelEvalRunInput },
): Promise<{ id: string; summary: AiModelEvalSummary; replayed: boolean }> {
  assertScope(input);
  const summary = summarizeAiModelEvaluation(input.evaluation);
  const id = randomUUID();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO ai_model_eval_runs
      (id,tenant_id,workspace_id,task_id,eval_suite_id,provider_id,requested_model,
       canonical_model,measured_at,dataset_version,dataset_hash,evaluator_kind,
       evaluator_version,sample_size,quality_basis_points,passed,reasons,
       policy_version,evidence_hash)
     VALUES
      ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10,$11,$12,$13,$14,$15,
       $16,$17::jsonb,$18,$19)
     ON CONFLICT (tenant_id,workspace_id,evidence_hash) DO NOTHING
     RETURNING id`,
    [
      id,
      input.tenantId,
      input.workspaceId,
      summary.taskId,
      summary.evalSuiteId,
      summary.providerId,
      summary.requestedModel,
      summary.canonicalModel,
      summary.measuredAt,
      summary.datasetVersion,
      summary.datasetHash,
      summary.evaluatorKind,
      summary.evaluatorVersion,
      summary.sampleSize,
      summary.qualityBasisPoints,
      summary.passed,
      JSON.stringify(summary.reasons),
      AI_MODEL_EVAL_POLICY_VERSION,
      summary.evidenceHash,
    ],
  );
  const runId = inserted.rows[0]?.id;
  if (!runId) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM ai_model_eval_runs
        WHERE tenant_id=$1 AND workspace_id=$2 AND evidence_hash=$3
        LIMIT 1`,
      [input.tenantId, input.workspaceId, summary.evidenceHash],
    );
    if (!existing.rows[0]) throw new Error("ai_model_eval_replay_unavailable");
    return { id: existing.rows[0].id, summary, replayed: true };
  }

  for (const metric of summary.metrics) {
    await client.query(
      `INSERT INTO ai_model_eval_metric_results
        (tenant_id,workspace_id,run_id,metric,status,sample_count,
         score_basis_points,measured_value)
       VALUES ($1,$2,$3::uuid,$4,$5,$6,$7,$8)`,
      [
        input.tenantId,
        input.workspaceId,
        runId,
        metric.metric,
        metric.status,
        metric.sampleCount,
        metric.scoreBasisPoints,
        metric.measuredValue,
      ],
    );
  }
  return { id: runId, summary, replayed: false };
}

type EvidenceRow = {
  provider_id: AiModelProviderId;
  model: string;
  capability_id: string | null;
  requested_model: string | null;
  canonical_model: string | null;
  observed_at: Date | null;
  exact_model_identity: boolean | null;
  deprecated: boolean | null;
  zero_data_retention: boolean | null;
  supported_data_classes: unknown;
  capabilities: unknown;
  tools: unknown;
  cache_mode: AiIntelligenceModelCapabilitySnapshot["cacheMode"] | null;
  eval_id: string | null;
  eval_suite_id: string | null;
  measured_at: Date | null;
  sample_size: number | null;
  quality_basis_points: number | null;
};

function capabilityFromRow(row: EvidenceRow): AiIntelligenceModelCapabilitySnapshot | null {
  const dataClasses = parseStringArray(row.supported_data_classes, 5);
  const capabilities = parseStringArray(row.capabilities, 32);
  const tools = parseStringArray(row.tools, 32);
  if (
    !row.capability_id ||
    !row.requested_model ||
    !row.canonical_model ||
    !MODEL.test(row.requested_model) ||
    !MODEL.test(row.canonical_model) ||
    !row.observed_at ||
    row.exact_model_identity === null ||
    row.deprecated === null ||
    row.zero_data_retention === null ||
    !row.cache_mode ||
    !dataClasses ||
    dataClasses.some((item) => !DATA_CLASSES.has(item as AiDataClass)) ||
    !capabilities ||
    !tools
  ) {
    return null;
  }
  return {
    providerId: row.provider_id,
    requestedModel: row.requested_model,
    canonicalModel: row.canonical_model,
    observedAt: row.observed_at.toISOString(),
    exactModelIdentity: row.exact_model_identity,
    deprecated: row.deprecated,
    zeroDataRetention: row.zero_data_retention,
    supportedDataClasses: dataClasses as AiDataClass[],
    capabilities,
    tools,
    cacheMode: row.cache_mode,
  };
}

function evalFromRow(
  row: EvidenceRow,
  taskId: AiIntelligenceTaskId,
): AiIntelligenceEvalEvidence | null {
  if (
    !row.eval_id ||
    !row.eval_suite_id ||
    !row.measured_at ||
    !Number.isSafeInteger(row.sample_size) ||
    !Number.isSafeInteger(row.quality_basis_points) ||
    !row.canonical_model
  ) {
    return null;
  }
  return {
    taskId,
    evalSuiteId: row.eval_suite_id,
    candidateProviderId: row.provider_id,
    candidateModel: row.canonical_model,
    measuredAt: row.measured_at.toISOString(),
    sampleSize: Number(row.sample_size),
    qualityBasisPoints: Number(row.quality_basis_points),
  };
}

/**
 * Reads only configured, enabled, provider-tested routes and binds each route
 * to the latest immutable capability and task-evaluation evidence. Missing or
 * malformed authority remains visible as unavailable; it is never synthesized.
 */
export async function readGovernedModelLabEvidenceSet(
  client: PoolClient,
  input: EvalScope & { taskId: AiIntelligenceTaskId; agentId: AiAgentId },
): Promise<GovernedModelLabEvidenceSet> {
  assertScope(input);
  const rows = await client.query<EvidenceRow>(
    `SELECT
       route.provider_id, route.model,
       capability.id AS capability_id,
       capability.requested_model, capability.canonical_model,
       capability.observed_at, capability.exact_model_identity,
       capability.deprecated, capability.zero_data_retention,
       capability.supported_data_classes, capability.capabilities,
       capability.tools, capability.cache_mode,
       evaluation.id AS eval_id, evaluation.eval_suite_id,
       evaluation.measured_at, evaluation.sample_size,
       evaluation.quality_basis_points
     FROM ai_agent_route_candidates route
     JOIN ai_provider_configs provider
       ON provider.tenant_id=route.tenant_id
      AND provider.workspace_id=route.workspace_id
      AND provider.provider_id=route.provider_id
     LEFT JOIN LATERAL (
       SELECT snapshot.*
         FROM ai_model_capability_snapshots snapshot
        WHERE snapshot.tenant_id=route.tenant_id
          AND snapshot.workspace_id=route.workspace_id
          AND snapshot.provider_id=route.provider_id
          AND lower(snapshot.requested_model)=lower(route.model)
        ORDER BY snapshot.observed_at DESC, snapshot.id DESC
        LIMIT 1
     ) capability ON TRUE
     LEFT JOIN LATERAL (
       SELECT eval.*
         FROM ai_model_eval_runs eval
        WHERE eval.tenant_id=route.tenant_id
          AND eval.workspace_id=route.workspace_id
          AND eval.task_id=$4
          AND eval.provider_id=route.provider_id
          AND eval.passed=TRUE
          AND eval.policy_version=$5
          AND capability.canonical_model IS NOT NULL
          AND lower(eval.canonical_model)=lower(capability.canonical_model)
          AND EXISTS (
            SELECT 1
              FROM ai_model_eval_metric_results metric
             WHERE metric.tenant_id=eval.tenant_id
               AND metric.workspace_id=eval.workspace_id
               AND metric.run_id=eval.id
             GROUP BY metric.run_id
            HAVING COUNT(*)=8 AND COUNT(DISTINCT metric.metric)=8
          )
        ORDER BY eval.measured_at DESC, eval.id DESC
        LIMIT 1
     ) evaluation ON TRUE
     WHERE route.tenant_id=$1
       AND route.workspace_id=$2
       AND route.agent_id=$3
       AND route.enabled=TRUE
       AND provider.enabled=TRUE
       AND provider.last_test_status='passed'
     ORDER BY route.priority, route.provider_id, route.model
     LIMIT 6`,
    [
      input.tenantId,
      input.workspaceId,
      input.agentId,
      input.taskId,
      AI_MODEL_EVAL_POLICY_VERSION,
    ],
  );

  const candidates: AiModelLabCandidate[] = [];
  const unavailable: GovernedModelLabEvidenceSet["unavailable"][number][] = [];
  for (const row of rows.rows) {
    const capability = capabilityFromRow(row);
    if (!row.capability_id) {
      unavailable.push({
        providerId: row.provider_id,
        requestedModel: row.model,
        reason: "capability_snapshot_missing",
      });
      continue;
    }
    if (!capability) {
      unavailable.push({
        providerId: row.provider_id,
        requestedModel: row.model,
        reason: "capability_snapshot_invalid",
      });
      continue;
    }
    const evalEvidence = evalFromRow(row, input.taskId);
    if (!row.eval_id) {
      unavailable.push({
        providerId: row.provider_id,
        requestedModel: row.model,
        reason: "evaluation_missing",
      });
    } else if (!evalEvidence) {
      unavailable.push({
        providerId: row.provider_id,
        requestedModel: row.model,
        reason: "evaluation_invalid",
      });
    }
    candidates.push({
      endpointId: endpoint(row.provider_id),
      capability,
      evalEvidence,
    });
  }
  return Object.freeze({ candidates, unavailable });
}
