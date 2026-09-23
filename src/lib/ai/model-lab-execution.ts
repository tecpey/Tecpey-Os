import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { readCommerceBillingAuthority } from "../commerce/commerce-billing-authority";
import {
  admitAiAgentUsageWithinAuthorityTransaction,
  reserveAiAgentSpendWithinAuthorityTransaction,
  resolveRuntimeAiAgent,
  settleAiAgentSpendWithinAuthorityTransaction,
  type AiAgentLimits,
  type RuntimeAiAgent,
} from "./control-plane-store";
import {
  callAiProvider,
  safeAiSourceUrl,
  type AiProviderCallResult,
  type AiProviderRouterDependencies,
  type AiSourceReference,
} from "./provider-router";
import { withAiTenantTransaction } from "./database-authority";
import type {
  AiAgentId,
  AiDataClass,
  AiModelProviderId,
} from "./control-plane-catalog";
import type { AiIntelligenceEndpointId } from "./intelligence-endpoint-policy";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const MODEL_LAB_CAPABILITY = "model_lab";
const DEFAULT_OUTPUT_TOKENS = 1_200;
const DEFAULT_TIMEOUT_MS = 12_000;

type ExecutionScope = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
}>;

type ModelLabRunRow = {
  id: string;
  account_id: string;
  task_id: string;
  agent_id: AiAgentId;
  data_class: AiDataClass;
  prompt_digest: string;
  status: "admitted" | "blocked";
  candidate_count: number;
};

type ModelLabCandidateRow = {
  id: string;
  provider_id: AiModelProviderId;
  endpoint_id: AiIntelligenceEndpointId;
  requested_model: string;
  canonical_model: string;
  eligibility: "eligible" | "rejected";
};

export type AiModelLabExecutionCandidate = Readonly<{
  candidateId: string;
  providerId: AiModelProviderId;
  endpointId: AiIntelligenceEndpointId;
  requestedModel: string;
  canonicalModel: string;
}>;

export type AiModelLabExecutionDescriptor = Readonly<{
  runId: string;
  taskId: string;
  agentId: AiAgentId;
  dataClass: AiDataClass;
  promptDigest: string;
  candidates: readonly AiModelLabExecutionCandidate[];
}>;

type ResolvedCandidateRoute = AiModelLabExecutionCandidate & Readonly<{
  apiKey: string;
  worstCaseUsdMicros: number;
}>;

export type PreparedAiModelLabCandidate = ResolvedCandidateRoute & Readonly<{
  attemptId: string;
  reservationId: string;
  reservedUsdMicros: number;
}>;

export type AiModelLabPreparedExecution = Readonly<{
  runId: string;
  taskId: string;
  agentId: AiAgentId;
  dataClass: AiDataClass;
  promptDigest: string;
  maxOutputTokens: number;
  candidates: readonly PreparedAiModelLabCandidate[];
}>;

export type AiModelLabPersistedResult = Readonly<{
  candidateId: string;
  providerId: AiModelProviderId;
  requestedModel: string;
  actualModel: string | null;
  modelIdentityVerified: boolean;
  status: "succeeded" | "failed" | "cancelled" | "authority_failed";
  failureReason: string | null;
  outputHash: string | null;
  sourceCount: number;
  chargedCostUsdMicros: number;
  reconciliationRequired: boolean;
}>;

export type AiModelLabCandidateExecutionResult = AiModelLabPersistedResult & Readonly<{
  text: string | null;
  sources: readonly AiSourceReference[];
}>;

export type AiModelLabExecutionResult =
  | Readonly<{
      status: "completed" | "incomplete";
      runId: string;
      results: readonly AiModelLabCandidateExecutionResult[];
    }>
  | Readonly<{
      status: "already_executed";
      runId: string;
      results: readonly AiModelLabPersistedResult[];
    }>
  | Readonly<{
      status: "reconciliation_required";
      runId: string;
      results: readonly AiModelLabPersistedResult[];
    }>
  | Readonly<{
      status: "blocked";
      runId: string;
      reason: string;
    }>;

type DescriptorLoadResult =
  | Readonly<{ status: "ready"; descriptor: AiModelLabExecutionDescriptor }>
  | Exclude<AiModelLabExecutionResult, { status: "completed" | "incomplete" }>;

type PrepareResult =
  | Readonly<{ status: "prepared"; prepared: AiModelLabPreparedExecution }>
  | Exclude<AiModelLabExecutionResult, { status: "completed" | "incomplete" }>;

export type AiModelLabEgressMark =
  | Readonly<{ ok: true; replayed: boolean }>
  | Readonly<{ ok: false; reason: string }>;

type FinalizeInput = ExecutionScope & Readonly<{
  runId: string;
  prepared: PreparedAiModelLabCandidate;
  egressMarked: boolean;
  providerResult: AiProviderCallResult;
  status: AiModelLabPersistedResult["status"];
  failureReason: string | null;
  actualModel: string | null;
  modelIdentityVerified: boolean;
  outputHash: string | null;
  sources: readonly AiSourceReference[];
}>;

export type AiModelLabExecutionDependencies = Readonly<{
  loadDescriptor?: typeof loadAiModelLabExecutionDescriptor;
  resolveRuntime?: typeof resolveRuntimeAiAgent;
  callProvider?: typeof callAiProvider;
  providerRouter?: AiProviderRouterDependencies;
  prepare?: typeof prepareAiModelLabExecution;
  markEgress?: typeof markAiModelLabCandidateEgress;
  finalize?: typeof finalizeAiModelLabCandidateExecution;
  uuid?: () => string;
}>;

class ModelLabPreparationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ModelLabPreparationError";
  }
}

function normalizeModel(value: string): string {
  return value.trim().toLowerCase();
}

function boundedOutputTokens(value: number | undefined, limits: AiAgentLimits): number {
  const requested = Number.isFinite(value)
    ? Math.trunc(value ?? DEFAULT_OUTPUT_TOKENS)
    : DEFAULT_OUTPUT_TOKENS;
  return Math.max(64, Math.min(limits.maxOutputTokens, requested));
}

function boundedTimeout(value: number | undefined): number {
  const requested = Number.isFinite(value)
    ? Math.trunc(value ?? DEFAULT_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  return Math.max(2_000, Math.min(30_000, requested));
}

function safeSources(input: readonly AiSourceReference[]): AiSourceReference[] {
  const output: AiSourceReference[] = [];
  const seen = new Set<string>();
  for (const item of input.slice(0, 12)) {
    const url = safeAiSourceUrl(item.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push({
      url,
      title: item.title?.trim().slice(0, 300) || null,
    });
  }
  return output;
}

function hash(namespace: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey-model-lab:${namespace}:v1\0`)
    .update(value)
    .digest("hex");
}

export function modelLabComparisonInputDigest(
  instructions: string,
  input: string,
): string {
  return hash("comparison-input", `${instructions}\0${input}`);
}

function outputDigest(input: {
  providerId: AiModelProviderId;
  requestedModel: string;
  actualModel: string;
  text: string;
}): string {
  return hash(
    "provider-output",
    [
      input.providerId,
      input.requestedModel,
      input.actualModel,
      input.text,
    ].join("\0"),
  );
}

function expectedEndpoint(providerId: AiModelProviderId): AiIntelligenceEndpointId {
  if (providerId === "openai") return "openai_responses";
  if (providerId === "anthropic") return "anthropic_messages";
  if (providerId === "xai") return "xai_responses";
  if (providerId === "perplexity") return "perplexity_agent";
  return "openrouter_chat_completions";
}

async function requireModelLabEntitlement(
  client: PoolClient,
  scope: ExecutionScope,
): Promise<boolean> {
  const billing = await readCommerceBillingAuthority(client, scope);
  return Boolean(
    billing.entitlement.active &&
      billing.entitlement.capabilities[MODEL_LAB_CAPABILITY] === true &&
      billing.entitlement.snapshotVersion !== null &&
      billing.subscription,
  );
}

async function lockExecutionScope(
  client: PoolClient,
  scope: ExecutionScope,
  runId: string,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
    [
      `ai-model-lab-execution:${scope.tenantId}:${scope.workspaceId}:${scope.accountId}:${runId}`,
    ],
  );
}

function validScope(scope: ExecutionScope): boolean {
  return Boolean(scope.tenantId && scope.workspaceId && scope.accountId);
}

async function readPersistedResults(
  client: PoolClient,
  scope: ExecutionScope,
  runId: string,
): Promise<AiModelLabPersistedResult[]> {
  const rows = await client.query<{
    candidate_id: string;
    provider_id: AiModelProviderId;
    requested_model: string;
    actual_model: string | null;
    model_identity_verified: boolean;
    status: AiModelLabPersistedResult["status"];
    failure_reason: string | null;
    output_hash: string | null;
    source_refs: unknown;
    charged_cost_usd_micros: string | number;
    reconciliation_required: boolean;
  }>(
    `SELECT candidate_id,provider_id,requested_model,actual_model,
            model_identity_verified,status,failure_reason,output_hash,
            source_refs,charged_cost_usd_micros,reconciliation_required
       FROM ai_model_lab_execution_results
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
        AND run_id=$4::uuid
      ORDER BY provider_id,requested_model,candidate_id`,
    [scope.tenantId, scope.workspaceId, scope.accountId, runId],
  );
  return rows.rows.map((row) => ({
    candidateId: row.candidate_id,
    providerId: row.provider_id,
    requestedModel: row.requested_model,
    actualModel: row.actual_model,
    modelIdentityVerified: row.model_identity_verified,
    status: row.status,
    failureReason: row.failure_reason,
    outputHash: row.output_hash,
    sourceCount: Array.isArray(row.source_refs) ? row.source_refs.length : 0,
    chargedCostUsdMicros: Number(row.charged_cost_usd_micros),
    reconciliationRequired: row.reconciliation_required,
  }));
}

export async function loadAiModelLabExecutionDescriptor(
  scope: ExecutionScope & { runId: string },
): Promise<DescriptorLoadResult> {
  if (!validScope(scope) || !UUID_PATTERN.test(scope.runId)) {
    return { status: "blocked", runId: scope.runId, reason: "invalid_scope" };
  }
  try {
    const result = await withAiTenantTransaction(scope, async (client) => {
      if (!(await requireModelLabEntitlement(client, scope))) {
        return { status: "blocked", runId: scope.runId, reason: "model_lab_pro_entitlement_required" } as const;
      }
      const runs = await client.query<ModelLabRunRow>(
        `SELECT id,account_id,task_id,agent_id,data_class,prompt_digest,status,candidate_count
           FROM ai_model_lab_runs
          WHERE id=$1::uuid AND tenant_id=$2 AND workspace_id=$3 AND account_id=$4
          LIMIT 1`,
        [scope.runId, scope.tenantId, scope.workspaceId, scope.accountId],
      );
      const run = runs.rows[0];
      if (!run) {
        return { status: "blocked", runId: scope.runId, reason: "run_not_found" } as const;
      }
      if (run.status !== "admitted" || !SHA256_PATTERN.test(run.prompt_digest)) {
        return { status: "blocked", runId: scope.runId, reason: "run_not_admitted" } as const;
      }
      const candidates = await client.query<ModelLabCandidateRow>(
        `SELECT id,provider_id,endpoint_id,requested_model,canonical_model,eligibility
           FROM ai_model_lab_candidates
          WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3::uuid
          ORDER BY provider_id,endpoint_id,canonical_model,id`,
        [scope.tenantId, scope.workspaceId, scope.runId],
      );
      if (
        candidates.rows.length !== Number(run.candidate_count) ||
        candidates.rows.some(
          (candidate) =>
            !UUID_PATTERN.test(candidate.id) ||
            !MODEL_PATTERN.test(candidate.requested_model) ||
            !MODEL_PATTERN.test(candidate.canonical_model) ||
            expectedEndpoint(candidate.provider_id) !== candidate.endpoint_id,
        )
      ) {
        return { status: "blocked", runId: scope.runId, reason: "candidate_authority_invalid" } as const;
      }
      const eligible = candidates.rows.filter((candidate) => candidate.eligibility === "eligible");
      if (eligible.length < 2 || eligible.length > 6) {
        return { status: "blocked", runId: scope.runId, reason: "eligible_candidate_count_invalid" } as const;
      }
      const admissions = await client.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
           FROM ai_model_lab_egress_admissions
          WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
            AND run_id=$4::uuid`,
        [scope.tenantId, scope.workspaceId, scope.accountId, scope.runId],
      );
      const admissionCount = Number(admissions.rows[0]?.count ?? 0);
      if (admissionCount > 0) {
        const persisted = await readPersistedResults(client, scope, scope.runId);
        return admissionCount === eligible.length && persisted.length === admissionCount
          ? { status: "already_executed", runId: scope.runId, results: persisted } as const
          : { status: "reconciliation_required", runId: scope.runId, results: persisted } as const;
      }
      return {
        status: "ready",
        descriptor: {
          runId: run.id,
          taskId: run.task_id,
          agentId: run.agent_id,
          dataClass: run.data_class,
          promptDigest: run.prompt_digest,
          candidates: eligible.map((candidate) => ({
            candidateId: candidate.id,
            providerId: candidate.provider_id,
            endpointId: candidate.endpoint_id,
            requestedModel: candidate.requested_model,
            canonicalModel: candidate.canonical_model,
          })),
        },
      } as const;
    });
    return result.enabled
      ? result.value
      : { status: "blocked", runId: scope.runId, reason: "database_authority_unavailable" };
  } catch {
    return { status: "blocked", runId: scope.runId, reason: "database_authority_unavailable" };
  }
}

function resolveCandidateRoutes(
  descriptor: AiModelLabExecutionDescriptor,
  runtime: RuntimeAiAgent,
): ResolvedCandidateRoute[] | null {
  if (runtime.configurationSource !== "managed" || runtime.agentId !== descriptor.agentId) {
    return null;
  }
  const resolved: ResolvedCandidateRoute[] = [];
  for (const candidate of descriptor.candidates) {
    let apiKey: string | null = null;
    let worstCaseUsdMicros: number | null = null;
    const route = runtime.routeCandidates.find(
      (item) =>
        item.enabled &&
        item.providerReady &&
        Boolean(item.apiKey) &&
        item.providerId === candidate.providerId &&
        normalizeModel(item.model) === normalizeModel(candidate.requestedModel) &&
        item.supportedDataClasses.includes(descriptor.dataClass) &&
        item.zeroDataRetention,
    );
    if (route) {
      apiKey = route.apiKey;
      worstCaseUsdMicros = Number(route.estimatedMaxCostUsdMicros);
    } else if (
      runtime.providerId === candidate.providerId &&
      normalizeModel(runtime.model) === normalizeModel(candidate.requestedModel) &&
      runtime.apiKey.trim()
    ) {
      apiKey = runtime.apiKey;
      worstCaseUsdMicros = runtime.limits.maxRequestCostUsdMicros;
    }
    if (
      !apiKey ||
      !Number.isSafeInteger(worstCaseUsdMicros) ||
      Number(worstCaseUsdMicros) < 0 ||
      Number(worstCaseUsdMicros) > runtime.limits.maxRequestCostUsdMicros
    ) {
      return null;
    }
    resolved.push({
      ...candidate,
      apiKey,
      worstCaseUsdMicros: Math.max(1_000, Number(worstCaseUsdMicros)),
    });
  }
  return resolved;
}

export async function prepareAiModelLabExecution(input: ExecutionScope & {
  descriptor: AiModelLabExecutionDescriptor;
  routes: readonly ResolvedCandidateRoute[];
  limits: AiAgentLimits;
  maxOutputTokens: number;
  estimatedInputTokens: number;
  uuid?: () => string;
}): Promise<PrepareResult> {
  const uuid = input.uuid ?? randomUUID;
  try {
    const result = await withAiTenantTransaction(input, async (client) => {
      await lockExecutionScope(client, input, input.descriptor.runId);
      if (!(await requireModelLabEntitlement(client, input))) {
        throw new ModelLabPreparationError("model_lab_pro_entitlement_required");
      }
      const runs = await client.query<ModelLabRunRow>(
        `SELECT id,account_id,task_id,agent_id,data_class,prompt_digest,status,candidate_count
           FROM ai_model_lab_runs
          WHERE id=$1::uuid AND tenant_id=$2 AND workspace_id=$3 AND account_id=$4
          FOR SHARE`,
        [
          input.descriptor.runId,
          input.tenantId,
          input.workspaceId,
          input.accountId,
        ],
      );
      const run = runs.rows[0];
      if (
        !run ||
        run.status !== "admitted" ||
        run.agent_id !== input.descriptor.agentId ||
        run.data_class !== input.descriptor.dataClass ||
        run.prompt_digest !== input.descriptor.promptDigest
      ) {
        throw new ModelLabPreparationError("run_authority_changed");
      }
      const candidateRows = await client.query<ModelLabCandidateRow>(
        `SELECT id,provider_id,endpoint_id,requested_model,canonical_model,eligibility
           FROM ai_model_lab_candidates
          WHERE tenant_id=$1 AND workspace_id=$2 AND run_id=$3::uuid
            AND eligibility='eligible'
          ORDER BY provider_id,endpoint_id,canonical_model,id
          FOR SHARE`,
        [input.tenantId, input.workspaceId, input.descriptor.runId],
      );
      const expectedIds = [...input.descriptor.candidates]
        .map((candidate) => candidate.candidateId)
        .sort();
      const actualIds = candidateRows.rows.map((candidate) => candidate.id).sort();
      if (
        expectedIds.length !== actualIds.length ||
        expectedIds.some((id, index) => id !== actualIds[index])
      ) {
        throw new ModelLabPreparationError("candidate_authority_changed");
      }

      const admissions = await client.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
           FROM ai_model_lab_egress_admissions
          WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
            AND run_id=$4::uuid`,
        [input.tenantId, input.workspaceId, input.accountId, input.descriptor.runId],
      );
      if (Number(admissions.rows[0]?.count ?? 0) > 0) {
        const persisted = await readPersistedResults(
          client,
          input,
          input.descriptor.runId,
        );
        return {
          status: "reconciliation_required",
          runId: input.descriptor.runId,
          results: persisted,
        } as const;
      }

      const prepared: PreparedAiModelLabCandidate[] = [];
      for (const route of input.routes) {
        const quota = await admitAiAgentUsageWithinAuthorityTransaction(client, {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          agentId: input.descriptor.agentId,
          estimatedInputTokens: input.estimatedInputTokens,
          maxOutputTokens: input.maxOutputTokens,
          limits: input.limits,
        });
        if (!quota.ok) {
          throw new ModelLabPreparationError(`quota_${quota.reason}`);
        }
        const spend = await reserveAiAgentSpendWithinAuthorityTransaction(client, {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          agentId: input.descriptor.agentId,
          idempotencyKey: `model-lab:${input.descriptor.runId}:${route.candidateId}`,
          limits: {
            ...input.limits,
            maxRequestCostUsdMicros: route.worstCaseUsdMicros,
          },
        });
        if (!spend.ok) {
          throw new ModelLabPreparationError(`spend_${spend.reason}`);
        }
        const attemptId = uuid();
        if (!UUID_PATTERN.test(attemptId)) {
          throw new ModelLabPreparationError("attempt_identity_invalid");
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO ai_model_lab_egress_admissions
            (attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
             agent_id,provider_id,endpoint_id,requested_model,canonical_model,
             reservation_id,reserved_usd_micros,input_digest)
           VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9,$10,$11,
                   $12::uuid,$13,$14)
           RETURNING id`,
          [
            attemptId,
            input.tenantId,
            input.workspaceId,
            input.accountId,
            input.descriptor.runId,
            route.candidateId,
            input.descriptor.agentId,
            route.providerId,
            route.endpointId,
            route.requestedModel,
            route.canonicalModel,
            spend.reservation.reservationId,
            spend.reservation.reservedUsdMicros,
            input.descriptor.promptDigest,
          ],
        );
        if (!inserted.rows[0]) {
          throw new Error("ai_model_lab_egress_admission_insert_failed");
        }
        prepared.push({
          ...route,
          attemptId,
          reservationId: spend.reservation.reservationId,
          reservedUsdMicros: spend.reservation.reservedUsdMicros,
        });
      }
      return {
        status: "prepared",
        prepared: {
          runId: input.descriptor.runId,
          taskId: input.descriptor.taskId,
          agentId: input.descriptor.agentId,
          dataClass: input.descriptor.dataClass,
          promptDigest: input.descriptor.promptDigest,
          maxOutputTokens: input.maxOutputTokens,
          candidates: prepared,
        },
      } as const;
    });
    return result.enabled
      ? result.value
      : {
          status: "blocked",
          runId: input.descriptor.runId,
          reason: "database_authority_unavailable",
        };
  } catch (error) {
    return {
      status: "blocked",
      runId: input.descriptor.runId,
      reason:
        error instanceof ModelLabPreparationError
          ? error.reason
          : "database_authority_unavailable",
    };
  }
}

export async function markAiModelLabCandidateEgress(input: ExecutionScope & {
  runId: string;
  candidateId: string;
  attemptId: string;
  reservationId: string;
}): Promise<AiModelLabEgressMark> {
  if (
    !validScope(input) ||
    ![input.runId, input.candidateId, input.attemptId, input.reservationId].every(
      (value) => UUID_PATTERN.test(value),
    )
  ) {
    return { ok: false, reason: "invalid_egress_identity" };
  }
  try {
    const result = await withAiTenantTransaction(input, async (client) => {
      await lockExecutionScope(client, input, input.runId);
      if (!(await requireModelLabEntitlement(client, input))) {
        return { ok: false, reason: "entitlement_revoked" } as const;
      }
      const rows = await client.query<{
        agent_id: AiAgentId;
        provider_id: AiModelProviderId;
        requested_model: string;
        reservation_id: string;
        reservation_status: "active" | "settled" | "released";
        expires_at: Date;
        egress_attempt_id: string | null;
      }>(
        `SELECT admission.agent_id,admission.provider_id,admission.requested_model,
                admission.reservation_id,reservation.status AS reservation_status,
                reservation.expires_at,reservation.egress_attempt_id
           FROM ai_model_lab_egress_admissions admission
           JOIN ai_spend_reservations reservation
             ON reservation.id=admission.reservation_id
            AND reservation.tenant_id=admission.tenant_id
            AND reservation.workspace_id=admission.workspace_id
            AND reservation.agent_id=admission.agent_id
          WHERE admission.attempt_id=$1::uuid
            AND admission.tenant_id=$2 AND admission.workspace_id=$3
            AND admission.account_id=$4 AND admission.run_id=$5::uuid
            AND admission.candidate_id=$6::uuid
            AND admission.reservation_id=$7::uuid
          FOR UPDATE OF reservation`,
        [
          input.attemptId,
          input.tenantId,
          input.workspaceId,
          input.accountId,
          input.runId,
          input.candidateId,
          input.reservationId,
        ],
      );
      const admission = rows.rows[0];
      if (!admission) return { ok: false, reason: "egress_admission_not_found" } as const;
      if (admission.reservation_status !== "active") {
        return { ok: false, reason: "reservation_not_active" } as const;
      }
      if (admission.expires_at.getTime() <= Date.now()) {
        return { ok: false, reason: "reservation_expired" } as const;
      }
      if (admission.egress_attempt_id !== null) {
        return admission.egress_attempt_id === input.attemptId
          ? { ok: true, replayed: true } as const
          : { ok: false, reason: "reservation_attempt_conflict" } as const;
      }

      const provider = await client.query<{
        enabled: boolean;
        last_test_status: string | null;
      }>(
        `SELECT enabled,last_test_status
           FROM ai_provider_configs
          WHERE tenant_id=$1 AND workspace_id=$2 AND provider_id=$3
          LIMIT 1`,
        [input.tenantId, input.workspaceId, admission.provider_id],
      );
      if (
        provider.rows[0]?.enabled !== true ||
        provider.rows[0]?.last_test_status !== "passed"
      ) {
        return { ok: false, reason: "provider_not_ready" } as const;
      }

      const binding = await client.query<{
        enabled: boolean;
        provider_id: AiModelProviderId;
        model: string;
      }>(
        `SELECT enabled,provider_id,model
           FROM ai_agent_bindings
          WHERE tenant_id=$1 AND workspace_id=$2 AND agent_id=$3
          LIMIT 1`,
        [input.tenantId, input.workspaceId, admission.agent_id],
      );
      const primaryAuthorized =
        binding.rows[0]?.enabled === true &&
        binding.rows[0].provider_id === admission.provider_id &&
        normalizeModel(binding.rows[0].model) === normalizeModel(admission.requested_model);
      const alternate = await client.query<{ present: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM ai_agent_route_candidates
            WHERE tenant_id=$1 AND workspace_id=$2 AND agent_id=$3
              AND provider_id=$4 AND enabled=TRUE
              AND lower(model)=lower($5)
         ) AS present`,
        [
          input.tenantId,
          input.workspaceId,
          admission.agent_id,
          admission.provider_id,
          admission.requested_model,
        ],
      );
      if (!primaryAuthorized && alternate.rows[0]?.present !== true) {
        return { ok: false, reason: "route_revoked" } as const;
      }

      const marked = await client.query(
        `UPDATE ai_spend_reservations
            SET egress_attempt_id=$2::uuid,egress_started_at=NOW()
          WHERE id=$1::uuid AND status='active'
            AND egress_attempt_id IS NULL AND expires_at>NOW()`,
        [input.reservationId, input.attemptId],
      );
      if (marked.rowCount !== 1) {
        return { ok: false, reason: "egress_mark_conflict" } as const;
      }
      return { ok: true, replayed: false } as const;
    });
    return result.enabled
      ? result.value
      : { ok: false, reason: "database_authority_unavailable" };
  } catch {
    return { ok: false, reason: "database_authority_unavailable" };
  }
}

export async function finalizeAiModelLabCandidateExecution(
  input: FinalizeInput,
): Promise<AiModelLabPersistedResult | null> {
  const sources = safeSources(input.sources);
  try {
    const result = await withAiTenantTransaction(input, async (client) => {
      await lockExecutionScope(client, input, input.runId);
      const admissionRows = await client.query<{ agent_id: AiAgentId }>(
        `SELECT agent_id
           FROM ai_model_lab_egress_admissions
          WHERE attempt_id=$1::uuid
            AND tenant_id=$2 AND workspace_id=$3 AND account_id=$4
            AND run_id=$5::uuid AND candidate_id=$6::uuid
            AND reservation_id=$7::uuid
          LIMIT 1`,
        [
          input.prepared.attemptId,
          input.tenantId,
          input.workspaceId,
          input.accountId,
          input.runId,
          input.prepared.candidateId,
          input.prepared.reservationId,
        ],
      );
      const agentId = admissionRows.rows[0]?.agent_id;
      if (!agentId) throw new Error("ai_model_lab_egress_admission_not_found");

      const settlement = await settleAiAgentSpendWithinAuthorityTransaction(client, {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        agentId,
        reservationId: input.prepared.reservationId,
        accountedCostUsdMicros: input.egressMarked
          ? input.providerResult.ok
            ? input.providerResult.costUsdMicros
            : null
          : 0,
        egressAttemptId: input.egressMarked ? input.prepared.attemptId : null,
      });
      if (!settlement.ok) {
        throw new Error(`ai_model_lab_settlement_${settlement.reason}`);
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ai_model_lab_execution_results
          (attempt_id,tenant_id,workspace_id,account_id,run_id,candidate_id,
           provider_id,requested_model,actual_model,model_identity_verified,
           status,failure_reason,output_hash,source_refs,input_tokens,output_tokens,
           reported_cost_usd_micros,charged_cost_usd_micros,duration_ms,
           reconciliation_required)
         SELECT admission.attempt_id,admission.tenant_id,admission.workspace_id,
                admission.account_id,admission.run_id,admission.candidate_id,
                admission.provider_id,admission.requested_model,$8,$9,$10,$11,$12,
                $13::jsonb,$14,$15,$16,$17,$18,$19
           FROM ai_model_lab_egress_admissions admission
          WHERE admission.attempt_id=$1::uuid
            AND admission.tenant_id=$2 AND admission.workspace_id=$3
            AND admission.account_id=$4 AND admission.run_id=$5::uuid
            AND admission.candidate_id=$6::uuid
            AND admission.reservation_id=$7::uuid
         RETURNING id`,
        [
          input.prepared.attemptId,
          input.tenantId,
          input.workspaceId,
          input.accountId,
          input.runId,
          input.prepared.candidateId,
          input.prepared.reservationId,
          input.actualModel,
          input.modelIdentityVerified,
          input.status,
          input.failureReason,
          input.outputHash,
          JSON.stringify(sources),
          input.providerResult.ok ? input.providerResult.inputTokens : 0,
          input.providerResult.ok ? input.providerResult.outputTokens : 0,
          input.providerResult.ok ? input.providerResult.costUsdMicros : null,
          settlement.chargedUsdMicros,
          Math.max(0, Math.min(30_000, Math.trunc(input.providerResult.durationMs))),
          settlement.reconciliationRequired,
        ],
      );
      if (!inserted.rows[0]) {
        throw new Error("ai_model_lab_execution_result_insert_failed");
      }
      return {
        candidateId: input.prepared.candidateId,
        providerId: input.prepared.providerId,
        requestedModel: input.prepared.requestedModel,
        actualModel: input.actualModel,
        modelIdentityVerified: input.modelIdentityVerified,
        status: input.status,
        failureReason: input.failureReason,
        outputHash: input.outputHash,
        sourceCount: sources.length,
        chargedCostUsdMicros: settlement.chargedUsdMicros,
        reconciliationRequired: settlement.reconciliationRequired,
      } satisfies AiModelLabPersistedResult;
    });
    return result.enabled ? result.value : null;
  } catch {
    return null;
  }
}

async function executePreparedCandidate(
  scope: ExecutionScope,
  runId: string,
  agentId: AiAgentId,
  dataClass: AiDataClass,
  candidate: PreparedAiModelLabCandidate,
  instructions: string,
  input: string,
  maxOutputTokens: number,
  timeoutMs: number,
  requestSignal: AbortSignal | undefined,
  dependencies: AiModelLabExecutionDependencies,
): Promise<AiModelLabCandidateExecutionResult> {
  const markEgress = dependencies.markEgress ?? markAiModelLabCandidateEgress;
  const finalize = dependencies.finalize ?? finalizeAiModelLabCandidateExecution;
  const callProvider = dependencies.callProvider ?? callAiProvider;
  const baseFetch = dependencies.providerRouter?.fetchImpl ?? fetch;
  let fetchObserved = false;
  let egressMarked = false;
  let markFailure: string | null = null;

  const guardedFetch: typeof fetch = async (request, init) => {
    if (fetchObserved) {
      markFailure = "multiple_provider_attempts_forbidden";
      throw new Error(markFailure);
    }
    fetchObserved = true;
    const marked = await markEgress({
      ...scope,
      runId,
      candidateId: candidate.candidateId,
      attemptId: candidate.attemptId,
      reservationId: candidate.reservationId,
    });
    if (!marked.ok) {
      markFailure = marked.reason;
      throw new Error(`ai_model_lab_egress_${marked.reason}`);
    }
    egressMarked = true;
    return baseFetch(request, init);
  };

  let providerResult: AiProviderCallResult;
  try {
    providerResult = await callProvider(
      {
        providerId: candidate.providerId,
        agentId,
        apiKey: candidate.apiKey,
        model: candidate.requestedModel,
        instructions,
        input,
        requestSignal,
        timeoutMs,
        maxOutputTokens,
        circuitScope: `${scope.tenantId}:${scope.workspaceId}:model-lab:${candidate.providerId}:${candidate.canonicalModel}`,
        toolsEnabled: true,
        dataClass,
        requireZeroDataRetention: true,
        requireProviderReportedModel: true,
        disableRetries: true,
      },
      {
        ...(dependencies.providerRouter ?? {}),
        fetchImpl: guardedFetch,
      },
    );
  } catch {
    providerResult = {
      ok: false,
      reason: "network_error",
      providerId: candidate.providerId,
      model: candidate.requestedModel,
      attempts: fetchObserved ? 1 : 0,
      durationMs: 0,
    };
  }

  const actualModel = providerResult.ok ? providerResult.model : null;
  const exactModel =
    providerResult.ok &&
    normalizeModel(providerResult.model) === normalizeModel(candidate.canonicalModel);
  const sources = providerResult.ok ? safeSources(providerResult.sources) : [];
  const digest =
    providerResult.ok && exactModel
      ? outputDigest({
          providerId: candidate.providerId,
          requestedModel: candidate.requestedModel,
          actualModel: providerResult.model,
          text: providerResult.text,
        })
      : null;
  const status: AiModelLabPersistedResult["status"] =
    markFailure !== null
      ? "authority_failed"
      : providerResult.ok
        ? exactModel
          ? "succeeded"
          : "authority_failed"
        : providerResult.reason === "cancelled"
          ? "cancelled"
          : "failed";
  const failureReason =
    markFailure ??
    (providerResult.ok
      ? exactModel
        ? null
        : "model_identity_mismatch"
      : providerResult.reason);

  const persisted = await finalize({
    ...scope,
    runId,
    prepared: candidate,
    egressMarked,
    providerResult,
    status,
    failureReason,
    actualModel,
    modelIdentityVerified: exactModel,
    outputHash: digest,
    sources,
  });
  if (!persisted) {
    return {
      candidateId: candidate.candidateId,
      providerId: candidate.providerId,
      requestedModel: candidate.requestedModel,
      actualModel,
      modelIdentityVerified: exactModel,
      status: "authority_failed",
      failureReason: "terminal_evidence_unavailable",
      outputHash: digest,
      sourceCount: sources.length,
      chargedCostUsdMicros: candidate.reservedUsdMicros,
      reconciliationRequired: egressMarked,
      text: null,
      sources,
    };
  }
  return {
    ...persisted,
    text:
      persisted.status === "succeeded" && providerResult.ok && exactModel
        ? providerResult.text
        : null,
    sources,
  };
}

export async function executeAiModelLabRun(
  input: ExecutionScope & {
    runId: string;
    instructions: string;
    input: string;
    maxOutputTokens?: number;
    timeoutMs?: number;
    requestSignal?: AbortSignal;
  },
  dependencies: AiModelLabExecutionDependencies = {},
): Promise<AiModelLabExecutionResult> {
  const instructions = input.instructions.trim();
  const userInput = input.input.trim();
  if (
    !validScope(input) ||
    !UUID_PATTERN.test(input.runId) ||
    instructions.length < 1 ||
    instructions.length > 8_000 ||
    userInput.length < 1 ||
    userInput.length > 12_000
  ) {
    return { status: "blocked", runId: input.runId, reason: "invalid_execution_input" };
  }

  const loadDescriptor =
    dependencies.loadDescriptor ?? loadAiModelLabExecutionDescriptor;
  const descriptorResult = await loadDescriptor(input);
  if (descriptorResult.status !== "ready") return descriptorResult;
  const descriptor = descriptorResult.descriptor;
  const digest = modelLabComparisonInputDigest(instructions, userInput);
  if (digest !== descriptor.promptDigest) {
    return { status: "blocked", runId: input.runId, reason: "prompt_digest_mismatch" };
  }

  const resolveRuntime = dependencies.resolveRuntime ?? resolveRuntimeAiAgent;
  const resolution = await resolveRuntime(descriptor.agentId, {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
  });
  if (
    resolution.status !== "configured" ||
    resolution.config.configurationSource !== "managed"
  ) {
    return {
      status: "blocked",
      runId: input.runId,
      reason: `runtime_${resolution.status}`,
    };
  }

  const routes = resolveCandidateRoutes(descriptor, resolution.config);
  if (!routes || routes.length !== descriptor.candidates.length) {
    return { status: "blocked", runId: input.runId, reason: "candidate_route_unavailable" };
  }
  const maxOutputTokens = boundedOutputTokens(input.maxOutputTokens, resolution.config.limits);
  const estimatedInputTokens = Math.max(
    1,
    Math.ceil((instructions.length + userInput.length) / 3.2),
  );
  if (estimatedInputTokens > resolution.config.limits.maxInputTokens) {
    return { status: "blocked", runId: input.runId, reason: "input_limit" };
  }

  const prepare = dependencies.prepare ?? prepareAiModelLabExecution;
  const preparedResult = await prepare({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    descriptor,
    routes,
    limits: resolution.config.limits,
    maxOutputTokens,
    estimatedInputTokens,
    uuid: dependencies.uuid,
  });
  if (preparedResult.status !== "prepared") return preparedResult;

  const timeoutMs = boundedTimeout(input.timeoutMs);
  const results = await Promise.all(
    preparedResult.prepared.candidates.map((candidate) =>
      executePreparedCandidate(
        {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          accountId: input.accountId,
        },
        input.runId,
        descriptor.agentId,
        descriptor.dataClass,
        candidate,
        instructions,
        userInput,
        maxOutputTokens,
        timeoutMs,
        input.requestSignal,
        dependencies,
      ),
    ),
  );
  return {
    status: results.every((result) => result.status === "succeeded")
      ? "completed"
      : "incomplete",
    runId: input.runId,
    results,
  };
}
