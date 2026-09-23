import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { readCommerceBillingAuthority } from "@/lib/commerce/commerce-billing-authority";
import {
  AI_MODEL_LAB_POLICY_VERSION,
  deriveAiCouncilSynthesis,
  planAiModelLabComparison,
  type AiCouncilContribution,
  type AiCouncilSynthesis,
  type AiModelLabCandidate,
  type AiModelLabPlan,
} from "./model-lab-council-policy";
import type { AiAgentId, AiDataClass } from "./control-plane-catalog";
import type { AiIntelligenceTaskId } from "./intelligence-task-catalog";

export const AI_MODEL_LAB_CAPABILITY = "model_lab" as const;
export const AI_COUNCIL_CAPABILITY = "ai_council" as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,120}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthorityScope = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
}>;

type EntitlementEvidence = Readonly<{
  snapshotVersion: number;
  subscriptionId: string;
  subscriptionStateVersion: number;
}>;

export type AiModelLabRunEvidence = Readonly<{
  id: string;
  status: "admitted" | "blocked";
  decisionHash: string;
  requestHash: string;
  candidateCount: number;
  replayed: boolean;
}>;

export type AiCouncilSynthesisEvidence = Readonly<{
  id: string;
  synthesis: AiCouncilSynthesis;
  requestHash: string;
  replayed: boolean;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("ai_model_lab_authority_non_finite_value");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  return value;
}

function authorityHash(namespace: string, value: unknown): string {
  return createHash("sha256")
    .update(`tecpey-ai-model-lab-authority:${namespace}:v1\0`)
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function assertScope(scope: AuthorityScope): void {
  if (!scope.tenantId || !scope.workspaceId || !scope.accountId) {
    throw new Error("ai_model_lab_scope_invalid");
  }
}

function normalizedIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!IDEMPOTENCY_PATTERN.test(normalized)) {
    throw new Error("ai_model_lab_idempotency_key_invalid");
  }
  return normalized;
}

function assertDigest(value: string, code: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function boundedJson(value: unknown, maximumBytes: number, code: string): string {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
    throw new Error(code);
  }
  return serialized;
}

function candidateIdentity(candidate: AiModelLabCandidate): string {
  return [
    candidate.capability.providerId,
    candidate.endpointId,
    candidate.capability.canonicalModel.trim().toLowerCase(),
  ].join("\0");
}

function sortedCandidates(candidates: readonly AiModelLabCandidate[]) {
  return [...candidates]
    .map((candidate) => ({
      endpointId: candidate.endpointId,
      capability: {
        providerId: candidate.capability.providerId,
        requestedModel: candidate.capability.requestedModel,
        canonicalModel: candidate.capability.canonicalModel,
        observedAt: candidate.capability.observedAt,
        exactModelIdentity: candidate.capability.exactModelIdentity,
        deprecated: candidate.capability.deprecated,
        zeroDataRetention: candidate.capability.zeroDataRetention,
        supportedDataClasses: [...candidate.capability.supportedDataClasses].sort(),
        capabilities: [...candidate.capability.capabilities].sort(),
        tools: [...candidate.capability.tools].sort(),
        cacheMode: candidate.capability.cacheMode,
      },
      evalEvidence: candidate.evalEvidence
        ? {
            taskId: candidate.evalEvidence.taskId,
            evalSuiteId: candidate.evalEvidence.evalSuiteId,
            candidateProviderId: candidate.evalEvidence.candidateProviderId,
            candidateModel: candidate.evalEvidence.candidateModel,
            measuredAt: candidate.evalEvidence.measuredAt,
            sampleSize: candidate.evalEvidence.sampleSize,
            qualityBasisPoints: candidate.evalEvidence.qualityBasisPoints,
          }
        : null,
    }))
    .sort((left, right) =>
      [
        left.capability.providerId,
        left.endpointId,
        left.capability.canonicalModel.toLowerCase(),
      ]
        .join("\0")
        .localeCompare(
          [
            right.capability.providerId,
            right.endpointId,
            right.capability.canonicalModel.toLowerCase(),
          ].join("\0"),
        ),
    );
}

function normalizedContributions(
  contributions: readonly AiCouncilContribution[],
): readonly AiCouncilContribution[] {
  return [...contributions]
    .map((contribution) => ({
      contributionId: contribution.contributionId,
      role: contribution.role,
      claims: [...contribution.claims]
        .map((claim) => ({
          claimKey: claim.claimKey,
          stance: claim.stance,
          evidenceIds: [...new Set(claim.evidenceIds)].sort(),
        }))
        .sort((left, right) => left.claimKey.localeCompare(right.claimKey)),
    }))
    .sort(
      (left, right) =>
        left.role.localeCompare(right.role) ||
        left.contributionId.localeCompare(right.contributionId),
    );
}

async function requireCapability(
  client: PoolClient,
  scope: AuthorityScope,
  capability: typeof AI_MODEL_LAB_CAPABILITY | typeof AI_COUNCIL_CAPABILITY,
): Promise<EntitlementEvidence> {
  assertScope(scope);
  const billing = await readCommerceBillingAuthority(client, scope);
  if (
    !billing.entitlement.active ||
    billing.entitlement.capabilities[capability] !== true
  ) {
    throw new Error(`${capability}_pro_entitlement_required`);
  }
  if (
    billing.entitlement.snapshotVersion === null ||
    !billing.subscription ||
    !Number.isSafeInteger(billing.subscription.stateVersion) ||
    billing.subscription.stateVersion < 1 ||
    !UUID_PATTERN.test(billing.subscription.id)
  ) {
    throw new Error(`${capability}_entitlement_authority_invalid`);
  }
  return {
    snapshotVersion: billing.entitlement.snapshotVersion,
    subscriptionId: billing.subscription.id,
    subscriptionStateVersion: billing.subscription.stateVersion,
  };
}

async function advisoryLock(
  client: PoolClient,
  scope: AuthorityScope,
  operation: "model_lab" | "ai_council",
  idempotencyKey: string,
): Promise<void> {
  const lock = authorityHash("idempotency-lock", [
    scope.tenantId,
    scope.workspaceId,
    scope.accountId,
    operation,
    idempotencyKey,
  ]);
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
    [lock],
  );
}

function modelLabRequestHash(input: {
  taskId: AiIntelligenceTaskId;
  agentId: AiAgentId;
  dataClass: AiDataClass;
  promptDigest: string;
  requireZeroDataRetention: boolean;
  maximumCapabilityAgeDays?: number;
  candidates: readonly AiModelLabCandidate[];
  plan: AiModelLabPlan;
}): string {
  return authorityHash("model-lab-request", {
    taskId: input.taskId,
    agentId: input.agentId,
    dataClass: input.dataClass,
    promptDigest: input.promptDigest,
    requireZeroDataRetention: input.requireZeroDataRetention,
    maximumCapabilityAgeDays: input.maximumCapabilityAgeDays ?? null,
    candidates: sortedCandidates(input.candidates),
    decisionHash: input.plan.decisionHash,
  });
}

export async function createAiModelLabRunEvidence(
  client: PoolClient,
  input: AuthorityScope & {
    idempotencyKey: string;
    taskId: AiIntelligenceTaskId;
    agentId: AiAgentId;
    dataClass: AiDataClass;
    promptDigest: string;
    requireZeroDataRetention: boolean;
    candidates: readonly AiModelLabCandidate[];
    nowMs?: number;
    maximumCapabilityAgeDays?: number;
  },
): Promise<AiModelLabRunEvidence> {
  assertScope(input);
  const idempotencyKey = normalizedIdempotencyKey(input.idempotencyKey);
  const promptDigest = assertDigest(
    input.promptDigest,
    "ai_model_lab_prompt_digest_invalid",
  );
  if (input.candidates.length < 2 || input.candidates.length > 6) {
    throw new Error("ai_model_lab_candidate_count_invalid");
  }

  const plan = planAiModelLabComparison({
    taskId: input.taskId,
    agentId: input.agentId,
    dataClass: input.dataClass,
    promptDigest,
    requireZeroDataRetention: input.requireZeroDataRetention,
    candidates: input.candidates,
    nowMs: input.nowMs,
    maximumCapabilityAgeDays: input.maximumCapabilityAgeDays,
  });
  const requestHash = modelLabRequestHash({
    taskId: input.taskId,
    agentId: input.agentId,
    dataClass: input.dataClass,
    promptDigest,
    requireZeroDataRetention: input.requireZeroDataRetention,
    maximumCapabilityAgeDays: input.maximumCapabilityAgeDays,
    candidates: input.candidates,
    plan,
  });
  const entitlement = await requireCapability(
    client,
    input,
    AI_MODEL_LAB_CAPABILITY,
  );
  await advisoryLock(client, input, "model_lab", idempotencyKey);

  const existing = await client.query<{
    id: string;
    request_hash: string;
    status: "admitted" | "blocked";
    decision_hash: string;
    candidate_count: number;
  }>(
    `SELECT id,request_hash,status,decision_hash,candidate_count
       FROM ai_model_lab_runs
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
        AND idempotency_key=$4
      FOR UPDATE`,
    [input.tenantId, input.workspaceId, input.accountId, idempotencyKey],
  );
  const prior = existing.rows[0];
  if (prior) {
    if (prior.request_hash !== requestHash) {
      throw new Error("ai_model_lab_idempotency_conflict");
    }
    return {
      id: prior.id,
      status: prior.status,
      decisionHash: prior.decision_hash,
      requestHash: prior.request_hash,
      candidateCount: Number(prior.candidate_count),
      replayed: true,
    };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO ai_model_lab_runs
      (tenant_id,workspace_id,account_id,task_id,agent_id,data_class,
       prompt_digest,decision_hash,policy_version,idempotency_key,request_hash,
       status,candidate_count,entitlement_snapshot_version,subscription_id,
       subscription_state_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::uuid,$16)
     RETURNING id`,
    [
      input.tenantId,
      input.workspaceId,
      input.accountId,
      input.taskId,
      input.agentId,
      input.dataClass,
      promptDigest,
      plan.decisionHash,
      AI_MODEL_LAB_POLICY_VERSION,
      idempotencyKey,
      requestHash,
      plan.status === "ready" ? "admitted" : "blocked",
      input.candidates.length,
      entitlement.snapshotVersion,
      entitlement.subscriptionId,
      entitlement.subscriptionStateVersion,
    ],
  );
  const runId = inserted.rows[0]?.id;
  if (!runId) throw new Error("ai_model_lab_run_insert_failed");

  const originals = new Map(
    input.candidates.map((candidate) => [candidateIdentity(candidate), candidate]),
  );
  for (const decision of [...plan.eligible, ...plan.rejected]) {
    const original = originals.get(
      [
        decision.providerId,
        decision.endpointId,
        decision.canonicalModel.trim().toLowerCase(),
      ].join("\0"),
    );
    if (!original) throw new Error("ai_model_lab_candidate_evidence_missing");
    const rejectionCodes = boundedJson(
      decision.reasons,
      8_192,
      "ai_model_lab_rejection_evidence_too_large",
    );
    await client.query(
      `INSERT INTO ai_model_lab_candidates
        (tenant_id,workspace_id,run_id,provider_id,endpoint_id,requested_model,
         canonical_model,eligibility,rejection_codes,capability_observed_at,
         eval_measured_at,eval_sample_size,quality_basis_points)
       VALUES ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb,$10::timestamptz,
               $11::timestamptz,$12,$13)`,
      [
        input.tenantId,
        input.workspaceId,
        runId,
        decision.providerId,
        decision.endpointId,
        decision.requestedModel,
        decision.canonicalModel,
        decision.status,
        rejectionCodes,
        original.capability.observedAt,
        original.evalEvidence?.measuredAt ?? null,
        original.evalEvidence?.sampleSize ?? null,
        original.evalEvidence?.qualityBasisPoints ?? null,
      ],
    );
  }

  return {
    id: runId,
    status: plan.status === "ready" ? "admitted" : "blocked",
    decisionHash: plan.decisionHash,
    requestHash,
    candidateCount: input.candidates.length,
    replayed: false,
  };
}

export async function createAiCouncilSynthesisEvidence(
  client: PoolClient,
  input: AuthorityScope & {
    idempotencyKey: string;
    inputDigest: string;
    modelLabRunId?: string | null;
    contributions: readonly AiCouncilContribution[];
  },
): Promise<AiCouncilSynthesisEvidence> {
  assertScope(input);
  const idempotencyKey = normalizedIdempotencyKey(input.idempotencyKey);
  const inputDigest = assertDigest(
    input.inputDigest,
    "ai_council_input_digest_invalid",
  );
  const modelLabRunId = input.modelLabRunId?.trim() || null;
  if (modelLabRunId !== null && !UUID_PATTERN.test(modelLabRunId)) {
    throw new Error("ai_council_model_lab_run_id_invalid");
  }

  const normalized = normalizedContributions(input.contributions);
  const synthesis = deriveAiCouncilSynthesis(normalized);
  const contributionsJson = boundedJson(
    normalized,
    65_536,
    "ai_council_contributions_too_large",
  );
  const agreementsJson = boundedJson(
    synthesis.agreements,
    32_768,
    "ai_council_agreements_too_large",
  );
  const disagreementsJson = boundedJson(
    synthesis.disagreements,
    32_768,
    "ai_council_disagreements_too_large",
  );
  const unresolvedJson = boundedJson(
    synthesis.unresolved,
    32_768,
    "ai_council_unresolved_too_large",
  );
  const requestHash = authorityHash("council-request", {
    inputDigest,
    modelLabRunId,
    contributions: normalized,
    synthesisHash: synthesis.synthesisHash,
  });
  const entitlement = await requireCapability(client, input, AI_COUNCIL_CAPABILITY);
  await advisoryLock(client, input, "ai_council", idempotencyKey);

  if (modelLabRunId) {
    const owned = await client.query<{ id: string }>(
      `SELECT id FROM ai_model_lab_runs
        WHERE id=$1::uuid AND tenant_id=$2 AND workspace_id=$3 AND account_id=$4
        LIMIT 1`,
      [modelLabRunId, input.tenantId, input.workspaceId, input.accountId],
    );
    if (!owned.rows[0]) throw new Error("ai_council_model_lab_run_not_owned");
  }

  const existing = await client.query<{
    id: string;
    request_hash: string;
    synthesis_hash: string;
  }>(
    `SELECT id,request_hash,synthesis_hash
       FROM ai_council_syntheses
      WHERE tenant_id=$1 AND workspace_id=$2 AND account_id=$3
        AND idempotency_key=$4
      FOR UPDATE`,
    [input.tenantId, input.workspaceId, input.accountId, idempotencyKey],
  );
  const prior = existing.rows[0];
  if (prior) {
    if (
      prior.request_hash !== requestHash ||
      prior.synthesis_hash !== synthesis.synthesisHash
    ) {
      throw new Error("ai_council_idempotency_conflict");
    }
    return {
      id: prior.id,
      synthesis,
      requestHash,
      replayed: true,
    };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO ai_council_syntheses
      (tenant_id,workspace_id,account_id,model_lab_run_id,input_digest,
       synthesis_hash,policy_version,idempotency_key,request_hash,
       contributions,agreements,disagreements,unresolved,
       entitlement_snapshot_version,subscription_id,subscription_state_version)
     VALUES ($1,$2,$3,$4::uuid,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,
             $12::jsonb,$13::jsonb,$14,$15::uuid,$16)
     RETURNING id`,
    [
      input.tenantId,
      input.workspaceId,
      input.accountId,
      modelLabRunId,
      inputDigest,
      synthesis.synthesisHash,
      AI_MODEL_LAB_POLICY_VERSION,
      idempotencyKey,
      requestHash,
      contributionsJson,
      agreementsJson,
      disagreementsJson,
      unresolvedJson,
      entitlement.snapshotVersion,
      entitlement.subscriptionId,
      entitlement.subscriptionStateVersion,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("ai_council_synthesis_insert_failed");
  return { id, synthesis, requestHash, replayed: false };
}
