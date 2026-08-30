import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { writeAdminAuditEvent } from "@/lib/admin-control-plane";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { PLATFORM } from "@/lib/platform-config";
import {
  AI_AGENT_CATALOG,
  AI_AGENT_IDS,
  AI_PROVIDER_CATALOG,
  AI_PROVIDER_IDS,
  AI_WORKFLOW_CATALOG,
  aiAgentDefinition,
  assertAiAgentProviderAllowed,
  isAiAgentId,
  isAiDataClass,
  isAiModelProviderId,
  type AiAgentId,
  type AiApprovalMode,
  type AiDataClass,
  type AiModelProviderId,
  type AiProviderId,
} from "./control-plane-catalog";
import { safeAiSourceUrl, type AiSourceReference } from "./provider-router";
import {
  aiProviderSecretFingerprint,
  decryptAiProviderSecret,
  encryptAiProviderSecret,
} from "@/lib/security/ai-provider-secret";
import {
  AI_TENANT_ISOLATION_BLOCK_REASON,
  evaluateAiLaunchPolicy,
  managedAiLaunchStatus,
  type ManagedAiLaunchStatus,
} from "./managed-ai-launch-policy";

export type AiProviderSnapshot = {
  providerId: AiProviderId;
  enabled: boolean;
  secretConfigured: boolean;
  keyFingerprint: string | null;
  revision: number;
  rotatedAt: string | null;
  lastTestStatus: "passed" | "failed" | null;
  lastTestedAt: string | null;
  updatedAt: string | null;
  configurationSource: "managed" | "environment" | "unconfigured";
};

export type AiAgentLimits = {
  dailyRequests: number;
  dailyTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxRequestCostUsdMicros: number;
  monthlyBudgetUsdMicros: number;
};

export type AiRouteCandidateSnapshot = {
  providerId: AiModelProviderId;
  model: string;
  priority: number;
  enabled: boolean;
  estimatedMaxCostUsdMicros: number;
  expectedLatencyMs: number;
  zeroDataRetention: true;
  free: boolean;
  supportedDataClasses: AiDataClass[];
  revision: number;
  updatedAt: string;
  providerReady: boolean;
  health: "healthy" | "degraded" | "unknown" | "unavailable";
};

export type AiAgentBindingSnapshot = {
  agentId: AiAgentId;
  configured: boolean;
  enabled: boolean;
  providerId: AiModelProviderId | null;
  model: string | null;
  fallbackModel: string | null;
  limits: AiAgentLimits;
  approvalMode: AiApprovalMode;
  revision: number;
  updatedAt: string | null;
  providerReady: boolean;
  routeCandidates: AiRouteCandidateSnapshot[];
  routing: {
    openRouterFallbackEnabled: boolean;
    openRouterModel: string | null;
    freeFallbackEnabled: boolean;
    openRouterCreditFloorUsdMicros: number;
    fallbackProviderReady: boolean;
  };
};

export type AiKnowledgeSnapshot = {
  id: string;
  knowledgeType: "recurring_pattern" | "research_claim" | "operating_rule";
  subjectType: string;
  subjectId: string | null;
  statement: string;
  contentHash: string;
  evidenceRefs: AiSourceReference[];
  confidence: number;
  dataClass: "public" | "aggregate_deidentified" | "approved_platform_content";
  status: "candidate" | "verified" | "rejected" | "superseded";
  derivedByAgent: AiAgentId | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type VerifiedAiKnowledgeContextItem = {
  knowledgeType: AiKnowledgeSnapshot["knowledgeType"];
  subjectType: string;
  subjectId: string | null;
  statement: string;
  contentHash: string;
  confidence: number;
  dataClass: AiKnowledgeSnapshot["dataClass"];
  evidenceRefs: AiSourceReference[];
};

export type AiOpenRouterQuotaSnapshot = {
  status: "healthy" | "low" | "exhausted" | "rate_limited" | "unavailable";
  limitUsdMicros: number | null;
  remainingUsdMicros: number | null;
  usageUsdMicros: number | null;
  isFreeTier: boolean | null;
  source: "provider_api" | "request_failure" | "worker_probe";
  checkedAt: string;
};

export type AiControlPlaneSnapshot = {
  managedLaunch: ManagedAiLaunchStatus;
  providers: AiProviderSnapshot[];
  agents: AiAgentBindingSnapshot[];
  knowledge: AiKnowledgeSnapshot[];
  knowledgeSummary: Record<
    "candidate" | "verified" | "rejected" | "superseded",
    number
  >;
  usageToday: Record<
    AiAgentId,
    { requestCount: number; reservedTokens: number }
  >;
  spendThisMonth: Record<
    AiAgentId,
    {
      activeReservedUsdMicros: number;
      settledUsdMicros: number;
      budgetUsdMicros: number;
      remainingUsdMicros: number;
    }
  >;
  openRouterQuota: AiOpenRouterQuotaSnapshot | null;
};

type ProviderRow = {
  provider_id: AiProviderId;
  enabled: boolean;
  encrypted_api_key: string | null;
  api_key_fingerprint: string | null;
  revision: string | number;
  rotated_at: string | Date | null;
  last_test_status: "passed" | "failed" | null;
  last_tested_at: string | Date | null;
  updated_at: string | Date;
};

type AgentRow = {
  agent_id: AiAgentId;
  enabled: boolean;
  provider_id: AiModelProviderId;
  model: string;
  fallback_model: string | null;
  daily_request_limit: number;
  daily_token_limit: string | number;
  max_input_tokens: number;
  max_output_tokens: number;
  max_request_cost_usd_micros: string | number;
  monthly_budget_usd_micros: string | number;
  openrouter_fallback_enabled: boolean;
  openrouter_model: string | null;
  free_fallback_enabled: boolean;
  openrouter_credit_floor_usd_micros: string | number;
  approval_mode: AiApprovalMode;
  revision: string | number;
  updated_at: string | Date;
};

type RouteCandidateRow = {
  agent_id: AiAgentId;
  provider_id: AiModelProviderId;
  model: string;
  priority: number;
  enabled: boolean;
  estimated_max_cost_usd_micros: string | number;
  expected_latency_ms: number;
  zero_data_retention: boolean;
  free: boolean;
  supported_data_classes: string[];
  revision: string | number;
  updated_at: string | Date;
};

type KnowledgeRow = {
  id: string;
  knowledge_type: AiKnowledgeSnapshot["knowledgeType"];
  subject_type: string;
  subject_id: string | null;
  statement: string;
  content_hash: string;
  evidence_refs: unknown;
  confidence: number;
  data_class: AiKnowledgeSnapshot["dataClass"];
  status: AiKnowledgeSnapshot["status"];
  derived_by_agent: AiAgentId | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
  revision: string | number;
  created_at: string | Date;
  updated_at: string | Date;
};

export type AdminAiMutationContext = {
  tenantId: string;
  workspaceId: string;
  actorAdminId: string;
  sessionId: string;
  effectiveRoles: string[];
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
};

export type RuntimeAiAgent = {
  agentId: AiAgentId;
  providerId: AiModelProviderId;
  apiKey: string;
  model: string;
  fallbackModel: string | null;
  limits: AiAgentLimits;
  approvalMode: AiApprovalMode;
  configurationSource: "managed" | "environment";
  openRouterFallback: {
    apiKey: string;
    paidModel: string;
    freeFallbackEnabled: boolean;
    creditFloorUsdMicros: number;
  } | null;
  routeCandidates: RuntimeAiRouteCandidate[];
};

export type RuntimeAiRouteCandidate = AiRouteCandidateSnapshot & {
  apiKey: string | null;
};

export type RuntimeAiAgentResolution =
  | { status: "configured"; config: RuntimeAiAgent }
  | {
      status:
        | "disabled"
        | "unconfigured"
        | "provider_not_ready"
        | "tenant_isolation_unresolved"
        | "unavailable";
      config: null;
    };

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const OPENROUTER_FREE_MODEL_PATTERN = /(?:^openrouter\/free$|:free$)/i;

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function environmentKey(providerId: AiProviderId): string {
  const value =
    providerId === "openai"
      ? process.env.OPENAI_API_KEY
      : providerId === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : providerId === "perplexity"
          ? process.env.PERPLEXITY_API_KEY
          : providerId === "xai"
            ? process.env.XAI_API_KEY
            : providerId === "openrouter"
              ? process.env.OPENROUTER_API_KEY
              : process.env.X_API_BEARER_TOKEN;
  return value?.trim() ?? "";
}

function providerScope(
  tenantId: string,
  workspaceId: string,
  providerId: AiProviderId,
): string {
  return `${tenantId}:${workspaceId}:${providerId}`;
}

function providerSnapshot(
  row: ProviderRow | null,
  providerId: AiProviderId,
  allowEnvironmentFallback = false,
): AiProviderSnapshot {
  const environmentConfigured =
    allowEnvironmentFallback && Boolean(environmentKey(providerId));
  return {
    providerId,
    enabled: row?.enabled ?? false,
    secretConfigured: Boolean(row?.encrypted_api_key),
    keyFingerprint: row?.api_key_fingerprint ?? null,
    revision: Number(row?.revision ?? 0),
    rotatedAt: iso(row?.rotated_at ?? null),
    lastTestStatus: row?.last_test_status ?? null,
    lastTestedAt: iso(row?.last_tested_at ?? null),
    updatedAt: iso(row?.updated_at ?? null),
    configurationSource: row
      ? "managed"
      : environmentConfigured
        ? "environment"
        : "unconfigured",
  };
}

function limitsFromAgentRow(row: AgentRow): AiAgentLimits {
  return {
    dailyRequests: Number(row.daily_request_limit),
    dailyTokens: Number(row.daily_token_limit),
    maxInputTokens: Number(row.max_input_tokens),
    maxOutputTokens: Number(row.max_output_tokens),
    maxRequestCostUsdMicros: Number(row.max_request_cost_usd_micros),
    monthlyBudgetUsdMicros: Number(row.monthly_budget_usd_micros),
  };
}

function agentSnapshot(
  row: AgentRow | null,
  agentId: AiAgentId,
  providers: Map<AiProviderId, ProviderRow>,
  routeCandidates: readonly RouteCandidateRow[] = [],
): AiAgentBindingSnapshot {
  const definition = aiAgentDefinition(agentId);
  const provider = row ? providers.get(row.provider_id) : null;
  const openRouterProvider = providers.get("openrouter") ?? null;
  return {
    agentId,
    configured: Boolean(row),
    enabled: row?.enabled ?? false,
    providerId: row?.provider_id ?? null,
    model: row?.model ?? null,
    fallbackModel: row?.fallback_model ?? null,
    limits: row ? limitsFromAgentRow(row) : { ...definition.defaultLimits },
    approvalMode: definition.approvalMode,
    revision: Number(row?.revision ?? 0),
    updatedAt: iso(row?.updated_at ?? null),
    providerReady: Boolean(
      provider?.enabled &&
      provider.encrypted_api_key &&
      provider.last_test_status === "passed",
    ),
    routeCandidates: routeCandidates
      .map((candidate) => routeCandidateSnapshot(candidate, providers))
      .sort((left, right) =>
        left.priority - right.priority ||
        left.providerId.localeCompare(right.providerId) ||
        left.model.localeCompare(right.model),
      ),
    routing: {
      openRouterFallbackEnabled:
        row?.openrouter_fallback_enabled ?? false,
      openRouterModel: row?.openrouter_model ?? null,
      freeFallbackEnabled: row?.free_fallback_enabled ?? false,
      openRouterCreditFloorUsdMicros: Number(
        row?.openrouter_credit_floor_usd_micros ?? 0,
      ),
      fallbackProviderReady: Boolean(
        openRouterProvider?.enabled &&
          openRouterProvider.encrypted_api_key &&
          openRouterProvider.last_test_status === "passed",
      ),
    },
  };
}

function providerHealth(
  provider: ProviderRow | null | undefined,
  nowMs = Date.now(),
): AiRouteCandidateSnapshot["health"] {
  if (!provider?.enabled || !provider.encrypted_api_key) return "unavailable";
  if (provider.last_test_status === "failed") return "unavailable";
  if (provider.last_test_status !== "passed") return "unknown";
  const testedAt = iso(provider.last_tested_at);
  if (!testedAt) return "unknown";
  return nowMs - new Date(testedAt).getTime() <= 24 * 60 * 60 * 1_000
    ? "healthy"
    : "degraded";
}

function routeCandidateSnapshot(
  row: RouteCandidateRow,
  providers: Map<AiProviderId, ProviderRow>,
): AiRouteCandidateSnapshot {
  const provider = providers.get(row.provider_id);
  const health = providerHealth(provider);
  return {
    providerId: row.provider_id,
    model: row.model,
    priority: Number(row.priority),
    enabled: row.enabled,
    estimatedMaxCostUsdMicros: Number(row.estimated_max_cost_usd_micros),
    expectedLatencyMs: Number(row.expected_latency_ms),
    zeroDataRetention: true,
    free: row.free,
    supportedDataClasses: row.supported_data_classes.filter(isAiDataClass),
    revision: Number(row.revision),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
    providerReady: health === "healthy" || health === "degraded",
    health,
  };
}

function sourceReferences(value: unknown): AiSourceReference[] {
  if (!Array.isArray(value)) return [];
  const output: AiSourceReference[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, 12)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const url = safeAiSourceUrl(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push({
      url,
      title:
        typeof source.title === "string" ? source.title.slice(0, 300) : null,
    });
  }
  return output;
}

function knowledgeSnapshot(row: KnowledgeRow): AiKnowledgeSnapshot {
  return {
    id: String(row.id),
    knowledgeType: row.knowledge_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    statement: row.statement,
    contentHash: row.content_hash,
    evidenceRefs: sourceReferences(row.evidence_refs),
    confidence: Number(row.confidence),
    dataClass: row.data_class,
    status: row.status,
    derivedByAgent: row.derived_by_agent,
    reviewedAt: iso(row.reviewed_at),
    reviewNote: row.review_note,
    revision: Number(row.revision),
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

async function selectProvider(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  providerId: AiProviderId,
  lock = false,
): Promise<ProviderRow | null> {
  const result = await client.query<ProviderRow>(
    `SELECT provider_id, enabled, encrypted_api_key, api_key_fingerprint,
            revision, rotated_at, last_test_status, last_tested_at, updated_at
       FROM ai_provider_configs
      WHERE tenant_id = $1 AND workspace_id = $2 AND provider_id = $3
      ${lock ? "FOR UPDATE" : ""}`,
    [tenantId, workspaceId, providerId],
  );
  return result.rows[0] ?? null;
}

async function selectAgent(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  agentId: AiAgentId,
  lock = false,
): Promise<AgentRow | null> {
  const result = await client.query<AgentRow>(
    `SELECT agent_id, enabled, provider_id, model, fallback_model,
            daily_request_limit, daily_token_limit, max_input_tokens,
            max_output_tokens, max_request_cost_usd_micros,
            monthly_budget_usd_micros,
            openrouter_fallback_enabled, openrouter_model,
            free_fallback_enabled, openrouter_credit_floor_usd_micros,
            approval_mode,
            revision, updated_at
       FROM ai_agent_bindings
      WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
      ${lock ? "FOR UPDATE" : ""}`,
    [tenantId, workspaceId, agentId],
  );
  return result.rows[0] ?? null;
}

async function selectRouteCandidates(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  agentId: AiAgentId,
  lock = false,
): Promise<RouteCandidateRow[]> {
  const result = await client.query<RouteCandidateRow>(
    `SELECT agent_id, provider_id, model, priority, enabled,
            estimated_max_cost_usd_micros, expected_latency_ms,
            zero_data_retention, free, supported_data_classes,
            revision, updated_at
       FROM ai_agent_route_candidates
      WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
      ORDER BY priority, provider_id, model
      ${lock ? "FOR UPDATE" : ""}`,
    [tenantId, workspaceId, agentId],
  );
  return result.rows;
}

async function advisoryLock(client: PoolClient, scope: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    scope,
  ]);
}

function aiAgentAdvisoryScope(input: {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
}): string {
  return `ai-agent:${input.tenantId}:${input.workspaceId}:${input.agentId}`;
}

function aiSpendAdvisoryScope(input: {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
}): string {
  return `ai-spend:${input.tenantId}:${input.workspaceId}:${input.agentId}`;
}

export async function loadAiControlPlaneSnapshot(input: {
  tenantId: string;
  workspaceId: string;
}): Promise<AiControlPlaneSnapshot | "unavailable"> {
  try {
    const result = await withDb(async (client) => {
      const providerRows = await client.query<ProviderRow>(
        `SELECT provider_id, enabled, encrypted_api_key, api_key_fingerprint,
                revision, rotated_at, last_test_status, last_tested_at, updated_at
           FROM ai_provider_configs
          WHERE tenant_id = $1 AND workspace_id = $2`,
        [input.tenantId, input.workspaceId],
      );
      const agentRows = await client.query<AgentRow>(
        `SELECT agent_id, enabled, provider_id, model, fallback_model,
                daily_request_limit, daily_token_limit, max_input_tokens,
                max_output_tokens, max_request_cost_usd_micros,
                monthly_budget_usd_micros,
                openrouter_fallback_enabled, openrouter_model,
                free_fallback_enabled, openrouter_credit_floor_usd_micros,
                approval_mode,
                revision, updated_at
           FROM ai_agent_bindings
          WHERE tenant_id = $1 AND workspace_id = $2`,
        [input.tenantId, input.workspaceId],
      );
      const routeRows = await client.query<RouteCandidateRow>(
        `SELECT agent_id, provider_id, model, priority, enabled,
                estimated_max_cost_usd_micros, expected_latency_ms,
                zero_data_retention, free, supported_data_classes,
                revision, updated_at
           FROM ai_agent_route_candidates
          WHERE tenant_id = $1 AND workspace_id = $2
          ORDER BY agent_id, priority, provider_id, model`,
        [input.tenantId, input.workspaceId],
      );
      const knowledgeRows = await client.query<KnowledgeRow>(
        `SELECT id, knowledge_type, subject_type, subject_id, statement,
                content_hash, evidence_refs, confidence, data_class, status,
                derived_by_agent, reviewed_at, review_note, revision,
                created_at, updated_at
           FROM ai_knowledge_items
          WHERE tenant_id = $1 AND workspace_id = $2
          ORDER BY updated_at DESC, id DESC
          LIMIT 30`,
        [input.tenantId, input.workspaceId],
      );
      const summaryRows = await client.query<{
        status: AiKnowledgeSnapshot["status"];
        count: string | number;
      }>(
        `SELECT status, COUNT(*) AS count
           FROM ai_knowledge_items
          WHERE tenant_id = $1 AND workspace_id = $2
          GROUP BY status`,
        [input.tenantId, input.workspaceId],
      );
      const usageRows = await client.query<{
        agent_id: AiAgentId;
        request_count: string | number;
        reserved_tokens: string | number;
      }>(
        `SELECT agent_id, request_count, reserved_tokens
           FROM ai_agent_usage_daily
          WHERE tenant_id = $1 AND workspace_id = $2 AND usage_date = CURRENT_DATE`,
        [input.tenantId, input.workspaceId],
      );
      const spendRows = await client.query<{
        agent_id: AiAgentId;
        active_reserved_usd_micros: string | number;
        settled_usd_micros: string | number;
      }>(
        `SELECT agent_id, active_reserved_usd_micros, settled_usd_micros
           FROM ai_agent_spend_monthly
          WHERE tenant_id = $1 AND workspace_id = $2
            AND budget_month = date_trunc('month', CURRENT_DATE)::date`,
        [input.tenantId, input.workspaceId],
      );
      const quotaRows = await client.query<{
        status: AiOpenRouterQuotaSnapshot["status"];
        limit_usd_micros: string | number | null;
        remaining_usd_micros: string | number | null;
        usage_usd_micros: string | number | null;
        is_free_tier: boolean | null;
        source: "provider_api" | "request_failure" | "worker_probe";
        checked_at: string | Date;
      }>(
        `SELECT status, limit_usd_micros, remaining_usd_micros,
                usage_usd_micros, is_free_tier, source, checked_at
           FROM ai_provider_quota_snapshots
          WHERE tenant_id = $1 AND workspace_id = $2
            AND provider_id = 'openrouter'
          ORDER BY checked_at DESC, id DESC
          LIMIT 1`,
        [input.tenantId, input.workspaceId],
      );
      const providers = new Map(
        providerRows.rows.map((row) => [row.provider_id, row]),
      );
      const agents = new Map(agentRows.rows.map((row) => [row.agent_id, row]));
      const routesByAgent = new Map<AiAgentId, RouteCandidateRow[]>();
      for (const row of routeRows.rows) {
        const routes = routesByAgent.get(row.agent_id) ?? [];
        routes.push(row);
        routesByAgent.set(row.agent_id, routes);
      }
      const knowledgeSummary = {
        candidate: 0,
        verified: 0,
        rejected: 0,
        superseded: 0,
      };
      for (const row of summaryRows.rows)
        knowledgeSummary[row.status] = Number(row.count);
      const usageByAgent = new Map(
        usageRows.rows.map((row) => [row.agent_id, row]),
      );
      const usageToday = Object.fromEntries(
        AI_AGENT_IDS.map((agentId) => {
          const row = usageByAgent.get(agentId);
          return [
            agentId,
            {
              requestCount: Number(row?.request_count ?? 0),
              reservedTokens: Number(row?.reserved_tokens ?? 0),
            },
          ];
        }),
      ) as AiControlPlaneSnapshot["usageToday"];
      const spendByAgent = new Map(
        spendRows.rows.map((row) => [row.agent_id, row]),
      );
      const spendThisMonth = Object.fromEntries(
        AI_AGENT_IDS.map((agentId) => {
          const row = spendByAgent.get(agentId);
          const budgetUsdMicros = Number(
            agents.get(agentId)?.monthly_budget_usd_micros ??
              aiAgentDefinition(agentId).defaultLimits.monthlyBudgetUsdMicros,
          );
          const activeReservedUsdMicros = Number(
            row?.active_reserved_usd_micros ?? 0,
          );
          const settledUsdMicros = Number(row?.settled_usd_micros ?? 0);
          return [
            agentId,
            {
              activeReservedUsdMicros,
              settledUsdMicros,
              budgetUsdMicros,
              remainingUsdMicros: Math.max(
                0,
                budgetUsdMicros - activeReservedUsdMicros - settledUsdMicros,
              ),
            },
          ];
        }),
      ) as AiControlPlaneSnapshot["spendThisMonth"];
      const quota = quotaRows.rows[0];
      const openRouterQuota = quota
        ? {
            status: quota.status,
            limitUsdMicros:
              quota.limit_usd_micros === null
                ? null
                : Number(quota.limit_usd_micros),
            remainingUsdMicros:
              quota.remaining_usd_micros === null
                ? null
                : Number(quota.remaining_usd_micros),
            usageUsdMicros:
              quota.usage_usd_micros === null
                ? null
                : Number(quota.usage_usd_micros),
            isFreeTier: quota.is_free_tier,
            source: quota.source,
            checkedAt:
              quota.checked_at instanceof Date
                ? quota.checked_at.toISOString()
                : new Date(quota.checked_at).toISOString(),
          }
        : null;
      return {
        managedLaunch: managedAiLaunchStatus(),
        providers: AI_PROVIDER_IDS.map((providerId) =>
          providerSnapshot(
            providers.get(providerId) ?? null,
            providerId,
            input.tenantId === PLATFORM.DEFAULT_TENANT_ID &&
              input.workspaceId === PLATFORM.DEFAULT_WORKSPACE_ID,
          ),
        ),
        agents: AI_AGENT_IDS.map((agentId) =>
          agentSnapshot(
            agents.get(agentId) ?? null,
            agentId,
            providers,
            routesByAgent.get(agentId) ?? [],
          ),
        ),
        knowledge: knowledgeRows.rows.map(knowledgeSnapshot),
        knowledgeSummary,
        usageToday,
        spendThisMonth,
        openRouterQuota,
      };
    });
    return result.enabled ? result.value : "unavailable";
  } catch {
    return "unavailable";
  }
}

export type AiUsageAdmission =
  | { ok: true; requestCount: number; reservedTokens: number }
  | {
      ok: false;
      reason:
        | "input_limit"
        | "output_limit"
        | "request_limit"
        | "token_limit"
        | "unavailable";
    };

export type AiSpendReservation = {
  reservationId: string;
  reservedUsdMicros: number;
  activeReservedUsdMicros: number;
  settledUsdMicros: number;
  budgetUsdMicros: number;
  expiresAt: string;
};

export type AiSpendAdmission =
  | { ok: true; reservation: AiSpendReservation }
  | {
      ok: false;
      reason:
        | "budget_exhausted"
        | "duplicate_request"
        | "invalid_request"
        | "unavailable";
    };

export type AiSpendSettlement =
  | {
      ok: true;
      reservedUsdMicros: number;
      chargedUsdMicros: number;
      overrunUsdMicros: number;
      status: "settled" | "released";
      reconciliationRequired: boolean;
      replayed: boolean;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "scope_mismatch"
        | "attempt_mismatch"
        | "invalid_request"
        | "unavailable";
    };

export type AiSpendEgressMark =
  | {
      ok: true;
      attemptId: string;
      markedAt: string;
      replayed: boolean;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "scope_mismatch"
        | "expired"
        | "already_marked"
        | "not_active"
        | "tenant_isolation_unresolved"
        | "invalid_request"
        | "unavailable";
    };

type AiSpendReservationRow = {
  tenant_id: string;
  workspace_id: string;
  agent_id: AiAgentId;
  budget_month: string | Date;
  reserved_usd_micros: string | number;
  settled_usd_micros: string | number | null;
  overrun_usd_micros: string | number;
  egress_attempt_id: string | null;
  egress_started_at: string | Date | null;
  reconciliation_required: boolean;
  status: "active" | "settled" | "released";
};

export type AiSpendSettlementInput = {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
  reservationId: string;
  accountedCostUsdMicros?: number | null;
  egressAttemptId?: string | null;
  /** @deprecated Compatibility only. Attempted legacy calls fail closed. */
  costUsdMicros?: number | null;
  /** @deprecated Compatibility only. Call markAiAgentSpendEgress first. */
  providerAttempted?: boolean;
};

type NormalizedAiSpendSettlementInput = Omit<
  AiSpendSettlementInput,
  "accountedCostUsdMicros" | "egressAttemptId" | "costUsdMicros" | "providerAttempted"
> & {
  accountedCostUsdMicros: number | null;
  egressAttemptId: string | null;
};

type AiRoutedCostEvidence = {
  result: { attempts: number };
  accountedCostUsdMicros?: unknown;
};

/**
 * Consumes the failover layer's cumulative cost when available. During a
 * rolling deployment, an older failover module has no such field; any route
 * that may have reached a provider then returns unknown so settlement charges
 * the full reservation instead of undercounting spend.
 */
export function accountedAiProviderRouteCost(
  routed: AiRoutedCostEvidence,
): number | null {
  if ("accountedCostUsdMicros" in routed) {
    const value = routed.accountedCostUsdMicros;
    if (value === null) return null;
    if (Number.isSafeInteger(value) && Number(value) >= 0) return Number(value);
    return null;
  }
  return routed.result.attempts === 0 ? 0 : null;
}

function validSpendIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,199}$/.test(value);
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function reconcileExpiredAiSpendReservations(
  client: PoolClient,
  input: Pick<NormalizedAiSpendSettlementInput, "tenantId" | "workspaceId" | "agentId">,
): Promise<Set<string>> {
  const expired = await client.query<{
    id: string;
    budget_month: string | Date;
    reserved_usd_micros: string | number;
    egress_attempt_id: string | null;
  }>(
    `UPDATE ai_spend_reservations
        SET status = CASE
              WHEN egress_attempt_id IS NULL THEN 'released'
              ELSE 'settled'
            END,
            settled_usd_micros = CASE
              WHEN egress_attempt_id IS NULL THEN 0
              ELSE reserved_usd_micros
            END,
            overrun_usd_micros = 0,
            reconciliation_required = (egress_attempt_id IS NOT NULL),
            settled_at = NOW()
      WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
        AND status = 'active' AND expires_at <= NOW()
    RETURNING id, budget_month, reserved_usd_micros, egress_attempt_id`,
    [input.tenantId, input.workspaceId, input.agentId],
  );
  const byMonth = new Map<
    string,
    { releasedReserved: number; conservativelyCharged: number }
  >();
  for (const row of expired.rows) {
    const budgetMonth = row.budget_month instanceof Date
      ? row.budget_month.toISOString().slice(0, 10)
      : String(row.budget_month).slice(0, 10);
    const value = byMonth.get(budgetMonth) ?? {
      releasedReserved: 0,
      conservativelyCharged: 0,
    };
    const reserved = Number(row.reserved_usd_micros);
    value.releasedReserved += reserved;
    if (row.egress_attempt_id !== null) value.conservativelyCharged += reserved;
    byMonth.set(budgetMonth, value);
  }
  for (const [budgetMonth, value] of [...byMonth.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const monthly = await client.query(
      `UPDATE ai_agent_spend_monthly
          SET active_reserved_usd_micros = active_reserved_usd_micros - $5,
              settled_usd_micros = settled_usd_micros + $6,
              updated_at = NOW()
        WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
          AND budget_month = $4::date
          AND active_reserved_usd_micros >= $5`,
      [
        input.tenantId,
        input.workspaceId,
        input.agentId,
        budgetMonth,
        value.releasedReserved,
        value.conservativelyCharged,
      ],
    );
    if (monthly.rowCount !== 1) throw new Error("ai_spend_expiry_invariant");
  }
  return new Set(expired.rows.map((row) => row.id));
}

type AiSpendReservationInput = {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
  idempotencyKey: string;
  limits: AiAgentLimits;
  ttlSeconds?: number;
};

async function reserveAiAgentSpendWithClient(
  client: PoolClient,
  input: AiSpendReservationInput,
): Promise<AiSpendAdmission> {
  const reservedUsdMicros = input.limits.maxRequestCostUsdMicros;
  const budgetUsdMicros = input.limits.monthlyBudgetUsdMicros;
  const ttlSeconds = Math.max(60, Math.min(3_600, Math.trunc(input.ttlSeconds ?? 900)));
  if (
    !isAiAgentId(input.agentId) ||
    !validSpendIdempotencyKey(input.idempotencyKey) ||
    !Number.isSafeInteger(reservedUsdMicros) ||
    reservedUsdMicros < 1_000 ||
    !Number.isSafeInteger(budgetUsdMicros) ||
    budgetUsdMicros < reservedUsdMicros
  ) {
    return { ok: false, reason: "invalid_request" };
  }
  await advisoryLock(client, aiSpendAdvisoryScope(input));
  const month = await client.query<{ budget_month: string | Date }>(
    "SELECT date_trunc('month', CURRENT_DATE)::date AS budget_month",
  );
  const budgetMonth = month.rows[0]?.budget_month;
  if (!budgetMonth) return { ok: false, reason: "unavailable" };

  await client.query(
    `INSERT INTO ai_agent_spend_monthly
       (tenant_id, workspace_id, agent_id, budget_month)
     VALUES ($1, $2, $3, $4::date)
     ON CONFLICT DO NOTHING`,
    [input.tenantId, input.workspaceId, input.agentId, budgetMonth],
  );

  await reconcileExpiredAiSpendReservations(client, input);

  const existing = await client.query<{ id: string }>(
    `SELECT reservation.id
       FROM ai_spend_reservations reservation
      WHERE reservation.tenant_id = $1 AND reservation.workspace_id = $2
        AND reservation.agent_id = $3 AND reservation.idempotency_key = $4`,
    [input.tenantId, input.workspaceId, input.agentId, input.idempotencyKey],
  );
  if (existing.rows[0]) return { ok: false, reason: "duplicate_request" };

  const monthly = await client.query<{
    active_reserved_usd_micros: string | number;
    settled_usd_micros: string | number;
  }>(
    `UPDATE ai_agent_spend_monthly
        SET active_reserved_usd_micros = active_reserved_usd_micros + $5,
            updated_at = NOW()
      WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
        AND budget_month = $4::date
        AND active_reserved_usd_micros + settled_usd_micros + $5 <= $6
    RETURNING active_reserved_usd_micros, settled_usd_micros`,
    [
      input.tenantId,
      input.workspaceId,
      input.agentId,
      budgetMonth,
      reservedUsdMicros,
      budgetUsdMicros,
    ],
  );
  const totals = monthly.rows[0];
  if (!totals) return { ok: false, reason: "budget_exhausted" };
  const reservationId = randomUUID();
  const inserted = await client.query<{ expires_at: string | Date }>(
    `INSERT INTO ai_spend_reservations
       (id, tenant_id, workspace_id, agent_id, budget_month,
        idempotency_key, reserved_usd_micros, expires_at)
     VALUES ($1::uuid, $2, $3, $4, $5::date, $6, $7,
             NOW() + make_interval(secs => $8))
     RETURNING expires_at`,
    [
      reservationId,
      input.tenantId,
      input.workspaceId,
      input.agentId,
      budgetMonth,
      input.idempotencyKey,
      reservedUsdMicros,
      ttlSeconds,
    ],
  );
  return {
    ok: true,
    reservation: {
      reservationId,
      reservedUsdMicros,
      activeReservedUsdMicros: Number(totals.active_reserved_usd_micros),
      settledUsdMicros: Number(totals.settled_usd_micros),
      budgetUsdMicros,
      expiresAt: iso(inserted.rows[0]?.expires_at ?? null) ?? new Date(0).toISOString(),
    },
  };
}

/**
 * Reserves the per-call worst-case charge before provider egress. The monthly
 * row and reservation are committed in one transaction under a scope lock, so
 * concurrent workers cannot collectively authorize more than the configured
 * budget. Expired reservations are reclaimed inside the same lock.
 */
export async function reserveAiAgentSpend(
  input: AiSpendReservationInput,
): Promise<AiSpendAdmission> {
  try {
    const result = await withTx((client) =>
      reserveAiAgentSpendWithClient(client, input)
    );
    return result.enabled ? result.value : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Caller must hold the matching ai-agent advisory lock. A disabled binding is
 * still managed provenance and therefore closes the environment exception.
 */
async function hasNoManagedAiAgentBinding(
  client: PoolClient,
  input: { tenantId: string; workspaceId: string; agentId: AiAgentId },
): Promise<boolean> {
  const binding = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM ai_agent_bindings
        WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
     ) AS present`,
    [input.tenantId, input.workspaceId, input.agentId],
  );
  return binding.rows[0]?.present === false;
}

/**
 * Durably records the single provider-egress attempt before any network call.
 * A reservation that expires after this commit is conservatively charged in
 * full and left reconciliation-safe instead of being released as unused.
 */
export async function markAiAgentSpendEgress(input: {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
  configurationSource: RuntimeAiAgent["configurationSource"];
  reservationId: string;
  attemptId: string;
}): Promise<AiSpendEgressMark> {
  if (
    !isAiAgentId(input.agentId) ||
    !validUuid(input.reservationId) ||
    !validUuid(input.attemptId)
  ) {
    return { ok: false, reason: "invalid_request" };
  }
  const launch = evaluateAiLaunchPolicy(input);
  if (!launch.allowed) {
    return { ok: false, reason: launch.reason };
  }
  try {
    const result = await withTx(async (client) => {
      await advisoryLock(client, aiAgentAdvisoryScope(input));
      if (!(await hasNoManagedAiAgentBinding(client, input))) {
        return {
          ok: false,
          reason: AI_TENANT_ISOLATION_BLOCK_REASON,
        } as const;
      }
      await advisoryLock(client, aiSpendAdvisoryScope(input));
      const expired = await reconcileExpiredAiSpendReservations(client, input);
      const selected = await client.query<AiSpendReservationRow>(
        `SELECT tenant_id, workspace_id, agent_id, budget_month,
                reserved_usd_micros, settled_usd_micros,
                overrun_usd_micros, egress_attempt_id, egress_started_at,
                reconciliation_required, status
           FROM ai_spend_reservations
          WHERE id = $1::uuid
          FOR UPDATE`,
        [input.reservationId],
      );
      const reservation = selected.rows[0];
      if (!reservation) return { ok: false, reason: "not_found" } as const;
      if (
        reservation.tenant_id !== input.tenantId ||
        reservation.workspace_id !== input.workspaceId ||
        reservation.agent_id !== input.agentId
      ) return { ok: false, reason: "scope_mismatch" } as const;
      if (expired.has(input.reservationId)) {
        return { ok: false, reason: "expired" } as const;
      }
      if (reservation.status !== "active") {
        return { ok: false, reason: "not_active" } as const;
      }
      if (reservation.egress_attempt_id !== null) {
        if (reservation.egress_attempt_id === input.attemptId) {
          return {
            ok: true,
            attemptId: input.attemptId,
            markedAt:
              iso(reservation.egress_started_at) ?? new Date(0).toISOString(),
            replayed: true,
          } as const;
        }
        return { ok: false, reason: "already_marked" } as const;
      }
      const marked = await client.query<{ egress_started_at: string | Date }>(
        `UPDATE ai_spend_reservations
            SET egress_attempt_id = $2::uuid, egress_started_at = NOW()
          WHERE id = $1::uuid AND status = 'active'
            AND egress_attempt_id IS NULL
        RETURNING egress_started_at`,
        [input.reservationId, input.attemptId],
      );
      if (marked.rowCount !== 1) {
        throw new Error("ai_spend_egress_mark_invariant");
      }
      return {
        ok: true,
        attemptId: input.attemptId,
        markedAt:
          iso(marked.rows[0]?.egress_started_at ?? null) ??
          new Date(0).toISOString(),
        replayed: false,
      } as const;
    });
    return result.enabled ? result.value : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function normalizeAiSpendSettlementInput(
  input: AiSpendSettlementInput,
): NormalizedAiSpendSettlementInput | null {
  const modern =
    Object.prototype.hasOwnProperty.call(input, "accountedCostUsdMicros") &&
    Object.prototype.hasOwnProperty.call(input, "egressAttemptId");
  if (!modern) {
    if (
      input.providerAttempted !== false ||
      (input.costUsdMicros !== undefined &&
        input.costUsdMicros !== null &&
        input.costUsdMicros !== 0)
    ) return null;
    return {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      reservationId: input.reservationId,
      accountedCostUsdMicros: 0,
      egressAttemptId: null,
    };
  }
  const accountedCost = input.accountedCostUsdMicros;
  const attemptId = input.egressAttemptId;
  if (
    accountedCost !== null &&
    (!Number.isSafeInteger(accountedCost) || Number(accountedCost) < 0)
  ) return null;
  if (attemptId !== null && (typeof attemptId !== "string" || !validUuid(attemptId))) {
    return null;
  }
  return {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    reservationId: input.reservationId,
    accountedCostUsdMicros: accountedCost ?? null,
    egressAttemptId: attemptId ?? null,
  };
}

async function settleAiAgentSpendWithClient(
  client: PoolClient,
  input: NormalizedAiSpendSettlementInput,
): Promise<AiSpendSettlement> {
  await advisoryLock(
    client,
    `ai-spend:${input.tenantId}:${input.workspaceId}:${input.agentId}`,
  );
  const selected = await client.query<AiSpendReservationRow>(
    `SELECT tenant_id, workspace_id, agent_id, budget_month,
            reserved_usd_micros, settled_usd_micros,
            overrun_usd_micros, egress_attempt_id, egress_started_at,
            reconciliation_required, status
       FROM ai_spend_reservations
      WHERE id = $1::uuid
      FOR UPDATE`,
    [input.reservationId],
  );
  const reservation = selected.rows[0];
  if (!reservation) return { ok: false, reason: "not_found" };
  if (
    reservation.tenant_id !== input.tenantId ||
    reservation.workspace_id !== input.workspaceId ||
    reservation.agent_id !== input.agentId
  ) return { ok: false, reason: "scope_mismatch" };
  if (reservation.egress_attempt_id !== input.egressAttemptId) {
    return { ok: false, reason: "attempt_mismatch" };
  }

  const reserved = Number(reservation.reserved_usd_micros);
  const previousCharged = Number(reservation.settled_usd_micros ?? 0);
  if (reservation.status === "released") {
    if (input.accountedCostUsdMicros !== 0) {
      return { ok: false, reason: "attempt_mismatch" };
    }
    return {
      ok: true,
      reservedUsdMicros: reserved,
      chargedUsdMicros: 0,
      overrunUsdMicros: 0,
      status: "released",
      reconciliationRequired: false,
      replayed: true,
    };
  }

  if (reservation.status === "settled") {
    if (input.accountedCostUsdMicros === null) {
      return {
        ok: true,
        reservedUsdMicros: reserved,
        chargedUsdMicros: previousCharged,
        overrunUsdMicros: Number(reservation.overrun_usd_micros),
        status: "settled",
        reconciliationRequired: reservation.reconciliation_required,
        replayed: true,
      };
    }
    const charged = Math.max(previousCharged, input.accountedCostUsdMicros);
    const overrun = Math.max(0, charged - reserved);
    const delta = charged - previousCharged;
    if (delta > 0 || reservation.reconciliation_required) {
      await client.query(
        `UPDATE ai_spend_reservations
            SET settled_usd_micros = $2, overrun_usd_micros = $3,
                reconciliation_required = FALSE
          WHERE id = $1::uuid`,
        [input.reservationId, charged, overrun],
      );
      if (delta > 0) {
        const monthly = await client.query(
          `UPDATE ai_agent_spend_monthly
              SET settled_usd_micros = settled_usd_micros + $5,
                  updated_at = NOW()
            WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
              AND budget_month = $4::date`,
          [
            input.tenantId,
            input.workspaceId,
            input.agentId,
            reservation.budget_month,
            delta,
          ],
        );
        if (monthly.rowCount !== 1) {
          throw new Error("ai_spend_late_settlement_invariant");
        }
      }
    }
    return {
      ok: true,
      reservedUsdMicros: reserved,
      chargedUsdMicros: charged,
      overrunUsdMicros: overrun,
      status: "settled",
      reconciliationRequired: false,
      replayed: delta === 0 && !reservation.reconciliation_required,
    };
  }

  const attempted = input.egressAttemptId !== null;
  if (!attempted && input.accountedCostUsdMicros !== 0) {
    return { ok: false, reason: "invalid_request" };
  }
  const charged = attempted
    ? (input.accountedCostUsdMicros ?? reserved)
    : 0;
  const overrun = Math.max(0, charged - reserved);
  const status = attempted ? "settled" : "released";
  const reconciliationRequired = attempted && input.accountedCostUsdMicros === null;
  await client.query(
    `UPDATE ai_spend_reservations
        SET status = $2, settled_usd_micros = $3,
            overrun_usd_micros = $4, reconciliation_required = $5,
            settled_at = NOW()
      WHERE id = $1::uuid`,
    [
      input.reservationId,
      status,
      charged,
      overrun,
      reconciliationRequired,
    ],
  );
  const monthly = await client.query(
    `UPDATE ai_agent_spend_monthly
        SET active_reserved_usd_micros = active_reserved_usd_micros - $5,
            settled_usd_micros = settled_usd_micros + $6,
            updated_at = NOW()
      WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
        AND budget_month = $4::date
        AND active_reserved_usd_micros >= $5`,
    [
      input.tenantId,
      input.workspaceId,
      input.agentId,
      reservation.budget_month,
      reserved,
      charged,
    ],
  );
  if (monthly.rowCount !== 1) {
    throw new Error("ai_spend_monthly_settlement_invariant");
  }
  return {
    ok: true,
    reservedUsdMicros: reserved,
    chargedUsdMicros: charged,
    overrunUsdMicros: overrun,
    status,
    reconciliationRequired,
    replayed: false,
  };
}

/** Settles the marked attempt, or releases a reservation that never reached egress. */
export async function settleAiAgentSpend(
  rawInput: AiSpendSettlementInput,
): Promise<AiSpendSettlement> {
  const input = normalizeAiSpendSettlementInput(rawInput);
  if (
    !input ||
    !isAiAgentId(input.agentId) ||
    !validUuid(input.reservationId)
  ) return { ok: false, reason: "invalid_request" };
  try {
    const result = await withTx((client) =>
      settleAiAgentSpendWithClient(client, input)
    );
    return result.enabled ? result.value : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Best-effort cleanup after a pre-egress mark failure. If a mark actually
 * committed, the null attempt cannot match and settlement safely refuses to
 * release it; an unmarked reservation is released immediately.
 */
export async function releaseUnmarkedAiAgentSpend(input: {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
  reservationId: string;
}): Promise<AiSpendSettlement> {
  return settleAiAgentSpend({
    ...input,
    accountedCostUsdMicros: 0,
    egressAttemptId: null,
  });
}

/**
 * Retrieves only human-promoted, currently valid knowledge in the acting
 * tenant/workspace. Candidate and rejected content can never reach Mentor.
 * Simple-language full-text ranking works for Persian, English and symbols;
 * verified operating rules remain globally eligible within the same scope.
 */
export async function loadVerifiedAiKnowledgeContext(input: {
  tenantId: string;
  workspaceId: string;
  query: string;
  limit?: number;
}): Promise<
  | VerifiedAiKnowledgeContextItem[]
  | "tenant_isolation_unresolved"
  | "unavailable"
> {
  const query = input.query.trim().slice(0, 2_000);
  const limit = Math.max(1, Math.min(8, Math.trunc(input.limit ?? 6)));
  if (!managedAiLaunchStatus().ready) {
    return AI_TENANT_ISOLATION_BLOCK_REASON;
  }
  try {
    const result = await withDb(async (client) => {
      const rows = await client.query<KnowledgeRow>(
        `WITH eligible AS (
           SELECT id, knowledge_type, subject_type, subject_id, statement,
                  content_hash, evidence_refs, confidence, data_class, status,
                  derived_by_agent, reviewed_at, review_note, revision,
                  created_at, updated_at,
                  to_tsvector(
                    'simple',
                    concat_ws(' ', subject_type, COALESCE(subject_id, ''), statement)
                  ) AS search_vector
             FROM ai_knowledge_items
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND status = 'verified'
              AND reviewed_by IS NOT NULL
              AND reviewed_at IS NOT NULL
              AND valid_from <= NOW()
              AND (valid_until IS NULL OR valid_until > NOW())
         ), ranked AS (
           SELECT *,
                  search_vector @@ plainto_tsquery('simple', $3) AS matches_query,
                  ts_rank_cd(search_vector, plainto_tsquery('simple', $3)) AS relevance
             FROM eligible
         )
         SELECT id, knowledge_type, subject_type, subject_id, statement,
                content_hash, evidence_refs, confidence, data_class, status,
                derived_by_agent, reviewed_at, review_note, revision,
                created_at, updated_at
           FROM ranked
          WHERE knowledge_type = 'operating_rule' OR matches_query
          ORDER BY matches_query DESC, relevance DESC, confidence DESC,
                   updated_at DESC, id DESC
          LIMIT $4`,
        [input.tenantId, input.workspaceId, query, limit],
      );
      return rows.rows.map((row) => {
        const item = knowledgeSnapshot(row);
        return {
          knowledgeType: item.knowledgeType,
          subjectType: item.subjectType,
          subjectId: item.subjectId,
          statement: item.statement,
          contentHash: item.contentHash,
          confidence: item.confidence,
          dataClass: item.dataClass,
          evidenceRefs: item.evidenceRefs,
        } satisfies VerifiedAiKnowledgeContextItem;
      });
    });
    return result.enabled ? result.value : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Conservatively reserves the largest possible response before provider
 * egress. The single conditional UPSERT keeps request and token ceilings
 * race-safe across workers; unused output capacity is not returned.
 */
export async function admitAiAgentUsage(input: {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  limits: AiAgentLimits;
}): Promise<AiUsageAdmission> {
  const inputTokens = Number.isFinite(input.estimatedInputTokens)
    ? Math.max(1, Math.trunc(input.estimatedInputTokens))
    : input.limits.maxInputTokens + 1;
  const outputTokens = Number.isFinite(input.maxOutputTokens)
    ? Math.max(64, Math.trunc(input.maxOutputTokens))
    : input.limits.maxOutputTokens + 1;
  if (inputTokens > input.limits.maxInputTokens)
    return { ok: false, reason: "input_limit" };
  if (outputTokens > input.limits.maxOutputTokens)
    return { ok: false, reason: "output_limit" };
  const reservation = inputTokens + outputTokens;
  if (reservation > input.limits.dailyTokens)
    return { ok: false, reason: "token_limit" };
  try {
    const result = await withDb(async (client) => {
      const admitted = await client.query<{
        request_count: string | number;
        reserved_tokens: string | number;
      }>(
        `INSERT INTO ai_agent_usage_daily
           (tenant_id, workspace_id, agent_id, usage_date, request_count, reserved_tokens)
         VALUES ($1, $2, $3, CURRENT_DATE, 1, $4)
         ON CONFLICT (tenant_id, workspace_id, agent_id, usage_date) DO UPDATE SET
           request_count = ai_agent_usage_daily.request_count + 1,
           reserved_tokens = ai_agent_usage_daily.reserved_tokens + EXCLUDED.reserved_tokens,
           updated_at = NOW()
         WHERE ai_agent_usage_daily.request_count < $5
           AND ai_agent_usage_daily.reserved_tokens + EXCLUDED.reserved_tokens <= $6
         RETURNING request_count, reserved_tokens`,
        [
          input.tenantId,
          input.workspaceId,
          input.agentId,
          reservation,
          input.limits.dailyRequests,
          input.limits.dailyTokens,
        ],
      );
      if (admitted.rows[0]) {
        return {
          ok: true as const,
          requestCount: Number(admitted.rows[0].request_count),
          reservedTokens: Number(admitted.rows[0].reserved_tokens),
        };
      }
      const current = await client.query<{
        request_count: string | number;
        reserved_tokens: string | number;
      }>(
        `SELECT request_count, reserved_tokens
           FROM ai_agent_usage_daily
          WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
            AND usage_date = CURRENT_DATE`,
        [input.tenantId, input.workspaceId, input.agentId],
      );
      const row = current.rows[0];
      return {
        ok: false as const,
        reason:
          Number(row?.request_count ?? 0) >= input.limits.dailyRequests
            ? ("request_limit" as const)
            : ("token_limit" as const),
      };
    });
    return result.enabled ? result.value : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export type AiExecutionAdmission =
  | {
      ok: true;
      requestCount: number;
      reservedTokens: number;
      spend: AiSpendReservation;
    }
  | {
      ok: false;
      reason:
        | "input_limit"
        | "output_limit"
        | "request_limit"
        | "token_limit"
        | "budget_exhausted"
        | "duplicate_request"
        | "tenant_isolation_unresolved"
        | "invalid_request"
        | "unavailable";
    };

/**
 * Composes token/request admission with monthly spend authority. Spend is
 * reserved first; if token admission fails it is released before returning.
 */
export async function admitAiAgentExecution(input: {
  tenantId: string;
  workspaceId: string;
  agentId: AiAgentId;
  configurationSource: RuntimeAiAgent["configurationSource"];
  idempotencyKey: string;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  limits: AiAgentLimits;
}): Promise<AiExecutionAdmission> {
  const launch = evaluateAiLaunchPolicy(input);
  if (!launch.allowed) return { ok: false, reason: launch.reason };
  let spend: AiSpendAdmission | {
    ok: false;
    reason: typeof AI_TENANT_ISOLATION_BLOCK_REASON;
  };
  try {
    const result = await withTx(async (client) => {
      await advisoryLock(client, aiAgentAdvisoryScope(input));
      if (!(await hasNoManagedAiAgentBinding(client, input))) {
        return {
          ok: false,
          reason: AI_TENANT_ISOLATION_BLOCK_REASON,
        } as const;
      }
      return reserveAiAgentSpendWithClient(client, input);
    });
    spend = result.enabled
      ? result.value
      : { ok: false, reason: "unavailable" };
  } catch {
    spend = { ok: false, reason: "unavailable" };
  }
  if (!spend.ok) return spend;
  const usage = await admitAiAgentUsage(input);
  if (!usage.ok) {
    await settleAiAgentSpend({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      reservationId: spend.reservation.reservationId,
      accountedCostUsdMicros: 0,
      egressAttemptId: null,
    });
    return usage;
  }
  return { ...usage, spend: spend.reservation };
}

export async function updateAiProvider(
  input: AdminAiMutationContext & {
    providerId: AiProviderId;
    enabled: boolean;
    apiKey?: string;
  },
): Promise<
  | AiProviderSnapshot
  | "secret_required"
  | "tenant_isolation_unresolved"
  | "unavailable"
> {
  if (input.enabled && !managedAiLaunchStatus().ready) {
    return AI_TENANT_ISOLATION_BLOCK_REASON;
  }
  try {
    const result = await withTx(async (client) => {
      const lockScope = `ai-provider:${providerScope(input.tenantId, input.workspaceId, input.providerId)}`;
      await advisoryLock(client, lockScope);
      const before = await selectProvider(
        client,
        input.tenantId,
        input.workspaceId,
        input.providerId,
        true,
      );
      const apiKey = input.apiKey?.trim();
      const encrypted = apiKey
        ? encryptAiProviderSecret(
            apiKey,
            providerScope(input.tenantId, input.workspaceId, input.providerId),
          )
        : (before?.encrypted_api_key ?? null);
      const fingerprint = apiKey
        ? aiProviderSecretFingerprint(apiKey)
        : (before?.api_key_fingerprint ?? null);
      if (input.enabled && !encrypted) return "secret_required" as const;
      const revision = Number(before?.revision ?? 0) + 1;
      const rotatedAt = apiKey
        ? new Date().toISOString()
        : iso(before?.rotated_at ?? null);
      const updated = await client.query<ProviderRow>(
        `INSERT INTO ai_provider_configs
           (tenant_id, workspace_id, provider_id, enabled, encrypted_api_key,
            api_key_fingerprint, settings, revision, rotated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7, $8::timestamptz, $9::uuid)
         ON CONFLICT (tenant_id, workspace_id, provider_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           encrypted_api_key = EXCLUDED.encrypted_api_key,
           api_key_fingerprint = EXCLUDED.api_key_fingerprint,
           settings = '{}'::jsonb,
           revision = EXCLUDED.revision,
           rotated_at = EXCLUDED.rotated_at,
           last_test_status = NULL,
           last_tested_at = NULL,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING provider_id, enabled, encrypted_api_key, api_key_fingerprint,
                   revision, rotated_at, last_test_status, last_tested_at, updated_at`,
        [
          input.tenantId,
          input.workspaceId,
          input.providerId,
          input.enabled,
          encrypted,
          fingerprint,
          revision,
          rotatedAt,
          input.actorAdminId,
        ],
      );
      const row = updated.rows[0];
      const eventType = apiKey
        ? before?.encrypted_api_key
          ? "rotated"
          : "configured"
        : before?.enabled !== input.enabled
          ? input.enabled
            ? "enabled"
            : "disabled"
          : "configured";
      await client.query(
        `INSERT INTO ai_provider_config_events
           (tenant_id, workspace_id, provider_id, event_type, revision,
            api_key_fingerprint, settings_snapshot, actor_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7::uuid)`,
        [
          input.tenantId,
          input.workspaceId,
          input.providerId,
          eventType,
          revision,
          fingerprint,
          input.actorAdminId,
        ],
      );
      const after = providerSnapshot(row, input.providerId);
      await writeAdminAuditEvent(client, {
        actorAdminId: input.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action: `ai_provider.${eventType}`,
        resourceType: "ai_provider",
        resourceId: input.providerId,
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
        beforeState: before ? providerSnapshot(before, input.providerId) : null,
        afterState: after,
      });
      return after;
    });
    return result.enabled ? result.value : "unavailable";
  } catch (error) {
    logger.error("[ai-control-plane] provider update failed", {
      providerId: input.providerId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "unavailable";
  }
}

export async function resolveAiProviderForTest(input: {
  tenantId: string;
  workspaceId: string;
  providerId: AiProviderId;
}): Promise<
  { apiKey: string } | "tenant_isolation_unresolved" | null
> {
  if (!managedAiLaunchStatus().ready) {
    return AI_TENANT_ISOLATION_BLOCK_REASON;
  }
  try {
    const result = await withDb((client) =>
      selectProvider(
        client,
        input.tenantId,
        input.workspaceId,
        input.providerId,
      ),
    );
    if (!result.enabled || !result.value?.encrypted_api_key) return null;
    return {
      apiKey: decryptAiProviderSecret(
        result.value.encrypted_api_key,
        providerScope(input.tenantId, input.workspaceId, input.providerId),
      ),
    };
  } catch {
    return null;
  }
}

export async function recordAiProviderTest(
  input: AdminAiMutationContext & {
    providerId: AiProviderId;
    passed: boolean;
  },
): Promise<boolean> {
  try {
    const result = await withTx(async (client) => {
      await advisoryLock(
        client,
        `ai-provider:${providerScope(input.tenantId, input.workspaceId, input.providerId)}`,
      );
      const row = await selectProvider(
        client,
        input.tenantId,
        input.workspaceId,
        input.providerId,
        true,
      );
      if (!row) return false;
      const status = input.passed ? "passed" : "failed";
      await client.query(
        `UPDATE ai_provider_configs
            SET last_test_status = $4, last_tested_at = NOW(), updated_at = NOW()
          WHERE tenant_id = $1 AND workspace_id = $2 AND provider_id = $3`,
        [input.tenantId, input.workspaceId, input.providerId, status],
      );
      await client.query(
        `INSERT INTO ai_provider_config_events
           (tenant_id, workspace_id, provider_id, event_type, revision,
            api_key_fingerprint, settings_snapshot, actor_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7::uuid)`,
        [
          input.tenantId,
          input.workspaceId,
          input.providerId,
          input.passed ? "test_passed" : "test_failed",
          Number(row.revision),
          row.api_key_fingerprint,
          input.actorAdminId,
        ],
      );
      await writeAdminAuditEvent(client, {
        actorAdminId: input.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action: input.passed
          ? "ai_provider.test_passed"
          : "ai_provider.test_failed",
        resourceType: "ai_provider",
        resourceId: input.providerId,
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
        afterState: { testStatus: status, revision: Number(row.revision) },
        outcome: input.passed ? "success" : "failed",
        errorCode: input.passed ? null : "ai_provider_test_failed",
      });
      return true;
    });
    return result.enabled && result.value;
  } catch {
    return false;
  }
}

function limitsWithinCatalog(
  agentId: AiAgentId,
  limits: AiAgentLimits,
): boolean {
  const maximum = aiAgentDefinition(agentId).defaultLimits;
  return (
    Number.isSafeInteger(limits.dailyRequests) &&
    limits.dailyRequests >= 1 &&
    limits.dailyRequests <= maximum.dailyRequests &&
    Number.isSafeInteger(limits.dailyTokens) &&
    limits.dailyTokens >= 1_000 &&
    limits.dailyTokens <= maximum.dailyTokens &&
    Number.isSafeInteger(limits.maxInputTokens) &&
    limits.maxInputTokens >= 256 &&
    limits.maxInputTokens <= maximum.maxInputTokens &&
    Number.isSafeInteger(limits.maxOutputTokens) &&
    limits.maxOutputTokens >= 64 &&
    limits.maxOutputTokens <= maximum.maxOutputTokens &&
    Number.isSafeInteger(limits.maxRequestCostUsdMicros) &&
    limits.maxRequestCostUsdMicros >= 1_000 &&
    limits.maxRequestCostUsdMicros <= maximum.maxRequestCostUsdMicros &&
    limits.maxRequestCostUsdMicros <= limits.monthlyBudgetUsdMicros &&
    Number.isSafeInteger(limits.monthlyBudgetUsdMicros) &&
    limits.monthlyBudgetUsdMicros >= 1_000_000 &&
    limits.monthlyBudgetUsdMicros <= maximum.monthlyBudgetUsdMicros
  );
}

export async function updateAiAgentBinding(
  input: AdminAiMutationContext & {
    agentId: AiAgentId;
    enabled: boolean;
    providerId: AiModelProviderId;
    model: string;
    fallbackModel?: string | null;
    limits: AiAgentLimits;
    routing: {
      openRouterFallbackEnabled: boolean;
      openRouterModel?: string | null;
      freeFallbackEnabled: boolean;
      openRouterCreditFloorUsdMicros: number;
    };
  },
): Promise<
  | AiAgentBindingSnapshot
  | "invalid_model"
  | "invalid_limits"
  | "invalid_routing"
  | "provider_forbidden"
  | "provider_not_configured"
  | "provider_not_ready"
  | "fallback_provider_not_ready"
  | "tenant_isolation_unresolved"
  | "unavailable"
> {
  const model = input.model.trim();
  const fallbackModel = input.fallbackModel?.trim() || null;
  const openRouterModel = input.routing.openRouterModel?.trim() || null;
  const fallbackPolicy = aiAgentDefinition(input.agentId).openRouterFallback;
  const directOpenRouterFreeFallback =
    input.providerId === "openrouter" && input.routing.freeFallbackEnabled;
  if (
    !MODEL_PATTERN.test(model) ||
    (fallbackModel && !MODEL_PATTERN.test(fallbackModel)) ||
    (input.providerId === "openrouter" &&
      (OPENROUTER_FREE_MODEL_PATTERN.test(model) ||
        Boolean(fallbackModel && OPENROUTER_FREE_MODEL_PATTERN.test(fallbackModel))) &&
      (!fallbackPolicy.freeAllowed ||
        aiAgentDefinition(input.agentId).mayReceivePrivateUserData))
  )
    return "invalid_model";
  if (!limitsWithinCatalog(input.agentId, input.limits))
    return "invalid_limits";
  if (
    typeof input.routing.openRouterFallbackEnabled !== "boolean" ||
    typeof input.routing.freeFallbackEnabled !== "boolean" ||
    !Number.isSafeInteger(input.routing.openRouterCreditFloorUsdMicros) ||
    input.routing.openRouterCreditFloorUsdMicros < 0 ||
    input.routing.openRouterCreditFloorUsdMicros >
      input.limits.monthlyBudgetUsdMicros ||
    (input.routing.openRouterFallbackEnabled &&
      (!openRouterModel ||
        !MODEL_PATTERN.test(openRouterModel) ||
        input.providerId === "openrouter")) ||
    Boolean(openRouterModel && OPENROUTER_FREE_MODEL_PATTERN.test(openRouterModel)) ||
    (!input.routing.openRouterFallbackEnabled && openRouterModel !== null) ||
    (input.routing.freeFallbackEnabled &&
      !input.routing.openRouterFallbackEnabled &&
      input.providerId !== "openrouter") ||
    (input.routing.freeFallbackEnabled && !fallbackPolicy.freeAllowed) ||
    (!input.routing.openRouterFallbackEnabled &&
      !directOpenRouterFreeFallback &&
      input.routing.openRouterCreditFloorUsdMicros !== 0) ||
    (directOpenRouterFreeFallback && OPENROUTER_FREE_MODEL_PATTERN.test(model))
  ) {
    return "invalid_routing";
  }
  try {
    assertAiAgentProviderAllowed(input.agentId, input.providerId);
  } catch {
    return "provider_forbidden";
  }
  if (input.enabled && !managedAiLaunchStatus().ready) {
    return AI_TENANT_ISOLATION_BLOCK_REASON;
  }
  try {
    const result = await withTx(async (client) => {
      await advisoryLock(
        client,
        aiAgentAdvisoryScope(input),
      );
      const before = await selectAgent(
        client,
        input.tenantId,
        input.workspaceId,
        input.agentId,
        true,
      );
      const provider = await selectProvider(
        client,
        input.tenantId,
        input.workspaceId,
        input.providerId,
        true,
      );
      if (!provider) return "provider_not_configured" as const;
      const providerReady = Boolean(
        provider.enabled &&
        provider.encrypted_api_key &&
        provider.last_test_status === "passed",
      );
      if (input.enabled && !providerReady) return "provider_not_ready" as const;
      const openRouterRouteEnabled =
        input.routing.openRouterFallbackEnabled || directOpenRouterFreeFallback;
      const openRouterProvider = input.routing.openRouterFallbackEnabled
        ? await selectProvider(
            client,
            input.tenantId,
            input.workspaceId,
            "openrouter",
            true,
          )
        : directOpenRouterFreeFallback
          ? provider
          : null;
      const openRouterReady = Boolean(
        openRouterProvider?.enabled &&
          openRouterProvider.encrypted_api_key &&
          openRouterProvider.last_test_status === "passed",
      );
      if (input.enabled && openRouterRouteEnabled && !openRouterReady) {
        return "fallback_provider_not_ready" as const;
      }
      const revision = Number(before?.revision ?? 0) + 1;
      const approvalMode = aiAgentDefinition(input.agentId).approvalMode;
      const updated = await client.query<AgentRow>(
        `INSERT INTO ai_agent_bindings
           (tenant_id, workspace_id, agent_id, enabled, provider_id, model,
            fallback_model, daily_request_limit, daily_token_limit,
            max_input_tokens, max_output_tokens, max_request_cost_usd_micros,
            monthly_budget_usd_micros,
            openrouter_fallback_enabled, openrouter_model,
            free_fallback_enabled, openrouter_credit_floor_usd_micros,
            approval_mode, revision, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 $13, $14, $15, $16, $17, $18, $19, $20::uuid)
         ON CONFLICT (tenant_id, workspace_id, agent_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           provider_id = EXCLUDED.provider_id,
           model = EXCLUDED.model,
           fallback_model = EXCLUDED.fallback_model,
           daily_request_limit = EXCLUDED.daily_request_limit,
           daily_token_limit = EXCLUDED.daily_token_limit,
           max_input_tokens = EXCLUDED.max_input_tokens,
           max_output_tokens = EXCLUDED.max_output_tokens,
           max_request_cost_usd_micros = EXCLUDED.max_request_cost_usd_micros,
           monthly_budget_usd_micros = EXCLUDED.monthly_budget_usd_micros,
           openrouter_fallback_enabled = EXCLUDED.openrouter_fallback_enabled,
           openrouter_model = EXCLUDED.openrouter_model,
           free_fallback_enabled = EXCLUDED.free_fallback_enabled,
           openrouter_credit_floor_usd_micros = EXCLUDED.openrouter_credit_floor_usd_micros,
           approval_mode = EXCLUDED.approval_mode,
           revision = EXCLUDED.revision,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING agent_id, enabled, provider_id, model, fallback_model,
                   daily_request_limit, daily_token_limit, max_input_tokens,
                   max_output_tokens, max_request_cost_usd_micros,
                   monthly_budget_usd_micros,
                   openrouter_fallback_enabled, openrouter_model,
                   free_fallback_enabled, openrouter_credit_floor_usd_micros,
                   approval_mode,
                   revision, updated_at`,
        [
          input.tenantId,
          input.workspaceId,
          input.agentId,
          input.enabled,
          input.providerId,
          model,
          fallbackModel,
          input.limits.dailyRequests,
          input.limits.dailyTokens,
          input.limits.maxInputTokens,
          input.limits.maxOutputTokens,
          input.limits.maxRequestCostUsdMicros,
          input.limits.monthlyBudgetUsdMicros,
          input.routing.openRouterFallbackEnabled,
          openRouterModel,
          input.routing.freeFallbackEnabled,
          input.routing.openRouterCreditFloorUsdMicros,
          approvalMode,
          revision,
          input.actorAdminId,
        ],
      );
      const row = updated.rows[0];
      const eventType =
        before?.enabled !== input.enabled
          ? input.enabled
            ? "enabled"
            : "disabled"
          : "configured";
      await client.query(
        `INSERT INTO ai_agent_binding_events
           (tenant_id, workspace_id, agent_id, event_type, provider_id, model,
            limits_snapshot, approval_mode, revision, actor_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::uuid)`,
        [
          input.tenantId,
          input.workspaceId,
          input.agentId,
          eventType,
          input.providerId,
          model,
          JSON.stringify({
            ...input.limits,
            routing: {
              openRouterFallbackEnabled:
                input.routing.openRouterFallbackEnabled,
              openRouterModel,
              freeFallbackEnabled: input.routing.freeFallbackEnabled,
              openRouterCreditFloorUsdMicros:
                input.routing.openRouterCreditFloorUsdMicros,
            },
          }),
          approvalMode,
          revision,
          input.actorAdminId,
        ],
      );
      const providers = new Map<AiProviderId, ProviderRow>([
        [provider.provider_id, provider],
      ]);
      if (openRouterProvider)
        providers.set(openRouterProvider.provider_id, openRouterProvider);
      const after = agentSnapshot(row, input.agentId, providers);
      await writeAdminAuditEvent(client, {
        actorAdminId: input.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action: `ai_agent.${eventType}`,
        resourceType: "ai_agent_binding",
        resourceId: input.agentId,
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
        beforeState: before
          ? agentSnapshot(before, input.agentId, providers)
          : null,
        afterState: after,
      });
      return after;
    });
    return result.enabled ? result.value : "unavailable";
  } catch {
    return "unavailable";
  }
}

export type AiRouteCandidateInput = {
  providerId: AiModelProviderId;
  model: string;
  priority: number;
  enabled: boolean;
  estimatedMaxCostUsdMicros: number;
  expectedLatencyMs: number;
  zeroDataRetention: true;
  free: boolean;
  supportedDataClasses: AiDataClass[];
};

export async function replaceAiAgentRouteCandidates(
  input: AdminAiMutationContext & {
    agentId: AiAgentId;
    candidates: AiRouteCandidateInput[];
  },
): Promise<
  | AiRouteCandidateSnapshot[]
  | "agent_not_configured"
  | "invalid_candidates"
  | "provider_forbidden"
  | "provider_not_ready"
  | "tenant_isolation_unresolved"
  | "unavailable"
> {
  const definition = aiAgentDefinition(input.agentId);
  const identities = new Set<string>();
  const priorities = new Set<number>();
  if (input.candidates.length > 5) return "invalid_candidates";
  for (const candidate of input.candidates) {
    const identity = `${candidate.providerId}\0${candidate.model.trim()}`;
    if (
      !isAiModelProviderId(candidate.providerId) ||
      !MODEL_PATTERN.test(candidate.model.trim()) ||
      !Number.isSafeInteger(candidate.priority) ||
      candidate.priority < 1 ||
      candidate.priority > 20 ||
      typeof candidate.enabled !== "boolean" ||
      !Number.isSafeInteger(candidate.estimatedMaxCostUsdMicros) ||
      candidate.estimatedMaxCostUsdMicros < 0 ||
      candidate.estimatedMaxCostUsdMicros > definition.defaultLimits.maxRequestCostUsdMicros ||
      (!candidate.free && candidate.estimatedMaxCostUsdMicros < 1_000) ||
      !Number.isSafeInteger(candidate.expectedLatencyMs) ||
      candidate.expectedLatencyMs < 100 ||
      candidate.expectedLatencyMs > 30_000 ||
      candidate.zeroDataRetention !== true ||
      typeof candidate.free !== "boolean" ||
      candidate.supportedDataClasses.length < 1 ||
      candidate.supportedDataClasses.length > 5 ||
      candidate.supportedDataClasses.some((value) => !isAiDataClass(value)) ||
      identities.has(identity) ||
      priorities.has(candidate.priority) ||
      (candidate.free &&
        (candidate.providerId !== "openrouter" ||
          !OPENROUTER_FREE_MODEL_PATTERN.test(candidate.model) ||
          candidate.estimatedMaxCostUsdMicros !== 0 ||
          candidate.supportedDataClasses.length !== 1 ||
          candidate.supportedDataClasses[0] !== "public" ||
          !definition.openRouterFallback.freeAllowed)) ||
      (!candidate.free && OPENROUTER_FREE_MODEL_PATTERN.test(candidate.model))
    ) {
      return "invalid_candidates";
    }
    try {
      assertAiAgentProviderAllowed(input.agentId, candidate.providerId);
    } catch {
      return "provider_forbidden";
    }
    identities.add(identity);
    priorities.add(candidate.priority);
  }
  if (
    input.candidates.some((candidate) => candidate.enabled) &&
    !managedAiLaunchStatus().ready
  ) {
    return AI_TENANT_ISOLATION_BLOCK_REASON;
  }

  try {
    const result = await withTx(async (client) => {
      await advisoryLock(
        client,
        `ai-routes:${input.tenantId}:${input.workspaceId}:${input.agentId}`,
      );
      const agent = await selectAgent(
        client,
        input.tenantId,
        input.workspaceId,
        input.agentId,
        true,
      );
      if (!agent) return "agent_not_configured" as const;
      if (input.candidates.some(
        (candidate) =>
          candidate.estimatedMaxCostUsdMicros >
          Number(agent.max_request_cost_usd_micros),
      )) {
        return "invalid_candidates" as const;
      }
      const before = await selectRouteCandidates(
        client,
        input.tenantId,
        input.workspaceId,
        input.agentId,
        true,
      );
      const providerRows = new Map<AiProviderId, ProviderRow>();
      for (const providerId of new Set(input.candidates.map((route) => route.providerId))) {
        const provider = await selectProvider(
          client,
          input.tenantId,
          input.workspaceId,
          providerId,
          true,
        );
        const providerRequired = input.candidates.some(
          (candidate) => candidate.providerId === providerId && candidate.enabled,
        );
        if (
          providerRequired &&
          (!provider?.enabled ||
            !provider.encrypted_api_key ||
            provider.last_test_status !== "passed")
        ) {
          return "provider_not_ready" as const;
        }
        if (provider) providerRows.set(providerId, provider);
      }
      const revision = Math.max(0, ...before.map((row) => Number(row.revision))) + 1;
      await client.query(
        `DELETE FROM ai_agent_route_candidates
          WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3`,
        [input.tenantId, input.workspaceId, input.agentId],
      );
      for (const candidate of input.candidates) {
        await client.query(
          `INSERT INTO ai_agent_route_candidates
             (tenant_id, workspace_id, agent_id, provider_id, model, priority,
              enabled, estimated_max_cost_usd_micros, expected_latency_ms,
              zero_data_retention, free, supported_data_classes, revision,
              updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10,
                   $11::text[], $12, $13::uuid)`,
          [
            input.tenantId,
            input.workspaceId,
            input.agentId,
            candidate.providerId,
            candidate.model.trim(),
            candidate.priority,
            candidate.enabled,
            candidate.estimatedMaxCostUsdMicros,
            candidate.expectedLatencyMs,
            candidate.free,
            [...new Set(candidate.supportedDataClasses)],
            revision,
            input.actorAdminId,
          ],
        );
      }
      const rows = await selectRouteCandidates(
        client,
        input.tenantId,
        input.workspaceId,
        input.agentId,
      );
      const after = rows.map((row) => routeCandidateSnapshot(row, providerRows));
      await client.query(
        `INSERT INTO ai_agent_route_candidate_events
           (tenant_id, workspace_id, agent_id, event_type, route_count,
            revision, routes_snapshot, actor_admin_id)
         VALUES ($1, $2, $3, 'replaced', $4, $5, $6::jsonb, $7::uuid)`,
        [
          input.tenantId,
          input.workspaceId,
          input.agentId,
          after.length,
          revision,
          JSON.stringify(after),
          input.actorAdminId,
        ],
      );
      await writeAdminAuditEvent(client, {
        actorAdminId: input.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action: "ai_agent.routes_replaced",
        resourceType: "ai_agent_routes",
        resourceId: input.agentId,
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
        beforeState: before.map((row) => routeCandidateSnapshot(row, providerRows)),
        afterState: after,
      });
      return after;
    });
    return result.enabled ? result.value : "unavailable";
  } catch {
    return "unavailable";
  }
}

function environmentMentorResolution(
  tenantId: string,
  workspaceId: string,
): RuntimeAiAgentResolution {
  const launch = evaluateAiLaunchPolicy({
    tenantId,
    workspaceId,
    agentId: "mentor_coach",
    configurationSource: "environment",
  });
  if (!launch.allowed) {
    return { status: launch.reason, config: null };
  }
  const apiKey = environmentKey("openai");
  if (!apiKey) return { status: "unconfigured", config: null };
  const definition = aiAgentDefinition("mentor_coach");
  return {
    status: "configured",
    config: {
      agentId: "mentor_coach",
      providerId: "openai",
      apiKey,
      model: process.env.AI_MENTOR_MODEL?.trim() || "gpt-4o-mini",
      fallbackModel:
        process.env.AI_MENTOR_FALLBACK_MODEL?.trim() || "gpt-4.1-mini",
      limits: { ...definition.defaultLimits },
      approvalMode: definition.approvalMode,
      configurationSource: "environment",
      openRouterFallback:
        process.env.AI_MENTOR_OPENROUTER_FALLBACK_ENABLED === "true" &&
        environmentKey("openrouter")
          ? {
              apiKey: environmentKey("openrouter"),
              paidModel:
                process.env.OPENROUTER_FALLBACK_MODEL?.trim() ||
                "openrouter/auto",
              freeFallbackEnabled: false,
              creditFloorUsdMicros: 0,
            }
          : null,
      routeCandidates: [],
    },
  };
}

export async function resolveRuntimeAiAgent(
  agentId: AiAgentId,
  input: { tenantId?: string; workspaceId?: string } = {},
): Promise<RuntimeAiAgentResolution> {
  const tenantId = input.tenantId ?? PLATFORM.DEFAULT_TENANT_ID;
  const workspaceId = input.workspaceId ?? PLATFORM.DEFAULT_WORKSPACE_ID;
  try {
    const result = await withDb(async (client) => {
      const agent = await selectAgent(client, tenantId, workspaceId, agentId);
      if (!agent) {
        const environmentFallbackAllowed =
          tenantId === PLATFORM.DEFAULT_TENANT_ID &&
          workspaceId === PLATFORM.DEFAULT_WORKSPACE_ID;
        return agentId === "mentor_coach" && environmentFallbackAllowed
          ? environmentMentorResolution(tenantId, workspaceId)
          : ({ status: "unconfigured", config: null } as const);
      }
      if (!agent.enabled) return { status: "disabled", config: null } as const;
      const launch = evaluateAiLaunchPolicy({
        tenantId,
        workspaceId,
        agentId,
        configurationSource: "managed",
      });
      if (!launch.allowed) {
        return { status: launch.reason, config: null } as const;
      }
      if (!isAiModelProviderId(agent.provider_id))
        return { status: "unconfigured", config: null } as const;
      assertAiAgentProviderAllowed(agentId, agent.provider_id);
      const provider = await selectProvider(
        client,
        tenantId,
        workspaceId,
        agent.provider_id,
      );
      if (
        !provider?.enabled ||
        !provider.encrypted_api_key ||
        provider.last_test_status !== "passed"
      ) {
        return { status: "provider_not_ready", config: null } as const;
      }
      const primaryApiKey = decryptAiProviderSecret(
        provider.encrypted_api_key,
        providerScope(tenantId, workspaceId, agent.provider_id),
      );
      const directOpenRouterFreeFallback =
        agent.provider_id === "openrouter" && agent.free_fallback_enabled;
      const openRouterProvider = agent.openrouter_fallback_enabled
        ? await selectProvider(client, tenantId, workspaceId, "openrouter")
        : directOpenRouterFreeFallback
          ? provider
          : null;
      const paidOpenRouterFallback =
        agent.openrouter_fallback_enabled &&
        agent.openrouter_model &&
        openRouterProvider?.enabled &&
        openRouterProvider.encrypted_api_key &&
        openRouterProvider.last_test_status === "passed"
          ? {
              apiKey: decryptAiProviderSecret(
                openRouterProvider.encrypted_api_key,
                providerScope(tenantId, workspaceId, "openrouter"),
              ),
              paidModel: agent.openrouter_model,
              freeFallbackEnabled: Boolean(agent.free_fallback_enabled),
              creditFloorUsdMicros: Number(
                agent.openrouter_credit_floor_usd_micros,
              ),
            }
          : null;
      const openRouterFallback = paidOpenRouterFallback ??
        (directOpenRouterFreeFallback
          ? {
              apiKey: primaryApiKey,
              paidModel: agent.model,
              freeFallbackEnabled: true,
              creditFloorUsdMicros: Number(
                agent.openrouter_credit_floor_usd_micros,
              ),
            }
          : null);
      const routeRows = await selectRouteCandidates(
        client,
        tenantId,
        workspaceId,
        agentId,
      );
      const routeProviders = new Map<AiProviderId, ProviderRow>([
        [provider.provider_id, provider],
      ]);
      for (const providerId of new Set(routeRows.map((route) => route.provider_id))) {
        if (routeProviders.has(providerId)) continue;
        const routeProvider = await selectProvider(
          client,
          tenantId,
          workspaceId,
          providerId,
        );
        if (routeProvider) routeProviders.set(providerId, routeProvider);
      }
      const routeCandidates = routeRows.map((row) => {
        const snapshot = routeCandidateSnapshot(row, routeProviders);
        const routeProvider = routeProviders.get(row.provider_id);
        let apiKey: string | null = null;
        if (routeProvider?.enabled && routeProvider.encrypted_api_key) {
          try {
            apiKey = decryptAiProviderSecret(
              routeProvider.encrypted_api_key,
              providerScope(tenantId, workspaceId, row.provider_id),
            );
          } catch {
            apiKey = null;
          }
        }
        return { ...snapshot, apiKey };
      });
      return {
        status: "configured",
        config: {
          agentId,
          providerId: agent.provider_id,
          apiKey: primaryApiKey,
          model: agent.model,
          fallbackModel: agent.fallback_model,
          limits: limitsFromAgentRow(agent),
          approvalMode: aiAgentDefinition(agentId).approvalMode,
          configurationSource: "managed",
          openRouterFallback,
          routeCandidates,
        },
      } as const;
    });
    return result.enabled
      ? result.value
      : { status: "unavailable", config: null };
  } catch {
    return { status: "unavailable", config: null };
  }
}

export function aiEvidenceHash(namespace: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey-ai-evidence:${namespace}:v1\0`)
    .update(value)
    .digest("hex");
}

export type AiRoutingDecisionInput = {
  tenantId: string;
  workspaceId: string;
  runId: string;
  agentId: AiAgentId;
  providerId: AiModelProviderId | null;
  routeMode: "primary" | "alternate" | "openrouter_paid" | "openrouter_free" | "blocked";
  decisionCode: string;
  candidateCount: number;
  dataClass: AiDataClass;
  criticality: "noncritical" | "standard" | "critical";
  externalEffect: boolean;
  approvalMode: AiApprovalMode;
  spendReservationId?: string | null;
  decisionHash?: string | null;
  requestedModel?: string | null;
  actualModel?: string | null;
  providerAttemptCount?: number;
  reservedUsdMicros?: number | null;
  accountedCostUsdMicros?: number | null;
  overrunUsdMicros?: number | null;
};

function validAiRoutingDecisionInput(input: AiRoutingDecisionInput): boolean {
  return !(
    !isAiAgentId(input.agentId) ||
    (input.providerId !== null && !isAiModelProviderId(input.providerId)) ||
    !isAiDataClass(input.dataClass) ||
    !validUuid(input.runId) ||
    (input.spendReservationId != null && !validUuid(input.spendReservationId)) ||
    (input.requestedModel != null && !MODEL_PATTERN.test(input.requestedModel)) ||
    (input.actualModel != null && !MODEL_PATTERN.test(input.actualModel)) ||
    !/^[a-z][a-z0-9_]{2,79}$/.test(input.decisionCode) ||
    !Number.isSafeInteger(input.candidateCount) ||
    input.candidateCount < 0 ||
    input.candidateCount > 20 ||
    !Number.isSafeInteger(input.providerAttemptCount ?? 0) ||
    (input.providerAttemptCount ?? 0) < 0 ||
    (input.providerAttemptCount ?? 0) > 20
  );
}

async function insertAiRoutingDecision(
  client: PoolClient,
  input: AiRoutingDecisionInput,
): Promise<boolean> {
  if (!validAiRoutingDecisionInput(input)) return false;
  let reservedUsdMicros: number | null = null;
  let accountedCostUsdMicros: number | null = null;
  let overrunUsdMicros: number | null = null;
  if (input.spendReservationId) {
    const spend = await client.query<{
      reserved_usd_micros: string | number;
      settled_usd_micros: string | number | null;
      overrun_usd_micros: string | number;
    }>(
      `SELECT reserved_usd_micros, settled_usd_micros, overrun_usd_micros
         FROM ai_spend_reservations
        WHERE id = $1::uuid AND tenant_id = $2 AND workspace_id = $3
          AND agent_id = $4`,
      [
        input.spendReservationId,
        input.tenantId,
        input.workspaceId,
        input.agentId,
      ],
    );
    const reservation = spend.rows[0];
    if (!reservation || reservation.settled_usd_micros === null) return false;
    reservedUsdMicros = Number(reservation.reserved_usd_micros);
    accountedCostUsdMicros = Number(reservation.settled_usd_micros);
    overrunUsdMicros = Number(reservation.overrun_usd_micros);
    if (
      (input.reservedUsdMicros != null &&
        input.reservedUsdMicros !== reservedUsdMicros) ||
      (input.accountedCostUsdMicros != null &&
        input.accountedCostUsdMicros !== accountedCostUsdMicros) ||
      (input.overrunUsdMicros != null &&
        input.overrunUsdMicros !== overrunUsdMicros)
    ) return false;
  } else if (
    input.reservedUsdMicros != null ||
    input.accountedCostUsdMicros != null ||
    input.overrunUsdMicros != null
  ) {
    return false;
  }
  if (
    input.spendReservationId &&
    (!Number.isSafeInteger(reservedUsdMicros) ||
      Number(reservedUsdMicros) < 1_000 ||
      !Number.isSafeInteger(accountedCostUsdMicros) ||
      Number(accountedCostUsdMicros) < 0 ||
      !Number.isSafeInteger(overrunUsdMicros) ||
      Number(overrunUsdMicros) !== Math.max(
        Number(accountedCostUsdMicros) - Number(reservedUsdMicros),
        0,
      ))
  ) return false;
  const hash = input.decisionHash?.trim() || aiEvidenceHash(
    "routing-decision-v3",
    JSON.stringify({
      runId: input.runId,
      agentId: input.agentId,
      providerId: input.providerId,
      routeMode: input.routeMode,
      decisionCode: input.decisionCode,
      candidateCount: input.candidateCount,
      dataClass: input.dataClass,
      criticality: input.criticality,
      externalEffect: input.externalEffect,
      approvalMode: input.approvalMode,
      spendReservationId: input.spendReservationId ?? null,
      requestedModel: input.requestedModel ?? null,
      actualModel: input.actualModel ?? null,
      providerAttemptCount: input.providerAttemptCount ?? 0,
      reservedUsdMicros,
      accountedCostUsdMicros,
      overrunUsdMicros,
    }),
  );
  if (!/^[0-9a-f]{64}$/.test(hash)) return false;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO ai_routing_decision_events
       (tenant_id, workspace_id, run_id, agent_id, provider_id,
        route_mode, decision_code, candidate_count, data_class,
        criticality, external_effect, approval_mode,
        spend_reservation_id, requested_model, actual_model,
        provider_attempt_count, reserved_usd_micros,
        accounted_cost_usd_micros, overrun_usd_micros, decision_hash)
     VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13::uuid, $14, $15, $16, $17, $18, $19, $20)
     ON CONFLICT (tenant_id, workspace_id, agent_id, spend_reservation_id)
       WHERE spend_reservation_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [
      input.tenantId,
      input.workspaceId,
      input.runId,
      input.agentId,
      input.providerId,
      input.routeMode,
      input.decisionCode,
      input.candidateCount,
      input.dataClass,
      input.criticality,
      input.externalEffect,
      input.approvalMode,
      input.spendReservationId ?? null,
      input.requestedModel ?? null,
      input.actualModel ?? null,
      input.providerAttemptCount ?? 0,
      reservedUsdMicros,
      accountedCostUsdMicros,
      overrunUsdMicros,
      hash,
    ],
  );
  if (inserted.rowCount === 1) return true;
  if (!input.spendReservationId) return false;
  const replay = await client.query<{
    run_id: string;
    provider_id: AiModelProviderId | null;
    route_mode: AiRoutingDecisionInput["routeMode"];
    decision_code: string;
    candidate_count: number;
    data_class: AiDataClass;
    criticality: AiRoutingDecisionInput["criticality"];
    external_effect: boolean;
    approval_mode: AiApprovalMode;
    requested_model: string | null;
    actual_model: string | null;
    provider_attempt_count: number;
    reserved_usd_micros: string | number;
    accounted_cost_usd_micros: string | number;
    overrun_usd_micros: string | number;
    decision_hash: string;
  }>(
    `SELECT run_id, provider_id, route_mode, decision_code, candidate_count,
            data_class, criticality, external_effect, approval_mode,
            requested_model, actual_model, provider_attempt_count,
            reserved_usd_micros, accounted_cost_usd_micros,
            overrun_usd_micros, decision_hash
       FROM ai_routing_decision_events
      WHERE tenant_id = $1 AND workspace_id = $2 AND agent_id = $3
        AND spend_reservation_id = $4::uuid`,
    [
      input.tenantId,
      input.workspaceId,
      input.agentId,
      input.spendReservationId,
    ],
  );
  const existing = replay.rows[0];
  return Boolean(
    existing &&
      existing.run_id === input.runId &&
      existing.provider_id === input.providerId &&
      existing.route_mode === input.routeMode &&
      existing.decision_code === input.decisionCode &&
      existing.candidate_count === input.candidateCount &&
      existing.data_class === input.dataClass &&
      existing.criticality === input.criticality &&
      existing.external_effect === input.externalEffect &&
      existing.approval_mode === input.approvalMode &&
      existing.requested_model === (input.requestedModel ?? null) &&
      existing.actual_model === (input.actualModel ?? null) &&
      existing.provider_attempt_count === (input.providerAttemptCount ?? 0) &&
      Number(existing.reserved_usd_micros) === reservedUsdMicros &&
      Number(existing.accounted_cost_usd_micros) === accountedCostUsdMicros &&
      Number(existing.overrun_usd_micros) === overrunUsdMicros &&
      existing.decision_hash === hash
  );
}

export async function recordAiRoutingDecision(
  input: AiRoutingDecisionInput,
): Promise<boolean> {
  try {
    const result = await withDb(async (client) => {
      return insertAiRoutingDecision(client, input);
    });
    return result.enabled && result.value;
  } catch {
    return false;
  }
}

export async function settleAiAgentSpendAndRecordRoutingDecision(input: {
  settlement: AiSpendSettlementInput;
  routing: AiRoutingDecisionInput;
}): Promise<
  | { ok: true; settlement: Extract<AiSpendSettlement, { ok: true }> }
  | { ok: false; reason: Exclude<AiSpendSettlement, { ok: true }>["reason"] }
> {
  const settlementInput = normalizeAiSpendSettlementInput(input.settlement);
  if (
    !settlementInput ||
    !isAiAgentId(settlementInput.agentId) ||
    !validUuid(settlementInput.reservationId) ||
    !validAiRoutingDecisionInput(input.routing) ||
    input.routing.spendReservationId !== settlementInput.reservationId ||
    input.routing.tenantId !== settlementInput.tenantId ||
    input.routing.workspaceId !== settlementInput.workspaceId ||
    input.routing.agentId !== settlementInput.agentId
  ) return { ok: false, reason: "invalid_request" };
  try {
    const result = await withTx(async (client) => {
      const settlement = await settleAiAgentSpendWithClient(client, settlementInput);
      if (!settlement.ok) return settlement;
      const recorded = await insertAiRoutingDecision(client, {
        ...input.routing,
        reservedUsdMicros: settlement.reservedUsdMicros,
        accountedCostUsdMicros: settlement.chargedUsdMicros,
        overrunUsdMicros: settlement.overrunUsdMicros,
      });
      if (!recorded) throw new Error("ai_routing_evidence_invariant");
      return { ok: true, settlement } as const;
    });
    return result.enabled ? result.value : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function recordAiWorkflowEvidence(input: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  workflowId:
    | "mentor_response"
    | "mentor_public_research"
    | "news_x_intelligence"
    | "coin_tool_research"
    | "governed_pattern_learning"
    | "admin_research_preview";
  agentId: AiAgentId;
  providerId: AiModelProviderId;
  model: string;
  inputHash: string;
  outputHash?: string | null;
  status:
    | "admitted"
    | "completed"
    | "blocked"
    | "failed"
    | "timeout"
    | "output_rejected";
  sources?: AiSourceReference[];
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  approvalMode: AiApprovalMode;
  actorAdminId?: string | null;
}): Promise<boolean> {
  if (!isAiAgentId(input.agentId) || !isAiModelProviderId(input.providerId))
    return false;
  try {
    const result = await withDb(async (client) => {
      await client.query(
        `INSERT INTO ai_workflow_run_evidence
           (tenant_id, workspace_id, run_id, workflow_id, agent_id,
            provider_id, model, input_hash, output_hash, status, source_refs,
            estimated_input_tokens, estimated_output_tokens, duration_ms,
            approval_mode, actor_admin_id)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10,
                 $11::jsonb, $12, $13, $14, $15, $16::uuid)`,
        [
          input.tenantId,
          input.workspaceId,
          input.runId,
          input.workflowId,
          input.agentId,
          input.providerId,
          input.model,
          input.inputHash,
          input.outputHash ?? null,
          input.status,
          JSON.stringify(sourceReferences(input.sources ?? [])),
          Math.max(0, Math.trunc(input.inputTokens ?? 0)),
          Math.max(0, Math.trunc(input.outputTokens ?? 0)),
          Math.max(0, Math.trunc(input.durationMs ?? 0)),
          input.approvalMode,
          input.actorAdminId ?? null,
        ],
      );
      return true;
    });
    return result.enabled && result.value;
  } catch {
    return false;
  }
}

export async function createAiKnowledgeCandidate(input: {
  tenantId: string;
  workspaceId: string;
  knowledgeType: AiKnowledgeSnapshot["knowledgeType"];
  subjectType: string;
  subjectId?: string | null;
  statement: string;
  evidenceRefs: AiSourceReference[];
  confidence: number;
  dataClass: AiKnowledgeSnapshot["dataClass"];
  derivedByAgent: AiAgentId;
  actorAdminId?: string | null;
}): Promise<AiKnowledgeSnapshot | "tenant_isolation_unresolved" | null> {
  const statement = input.statement.trim();
  const subjectType = input.subjectType.trim();
  const subjectId = input.subjectId?.trim() || null;
  const evidenceRefs = sourceReferences(input.evidenceRefs);
  if (
    !["recurring_pattern", "research_claim", "operating_rule"].includes(
      input.knowledgeType,
    ) ||
    statement.length < 8 ||
    statement.length > 8_000 ||
    subjectType.length < 2 ||
    subjectType.length > 80 ||
    (subjectId !== null && subjectId.length > 160) ||
    !Number.isFinite(input.confidence) ||
    !isAiAgentId(input.derivedByAgent)
  )
    return null;
  if (input.knowledgeType !== "operating_rule" && evidenceRefs.length === 0)
    return null;
  if (
    input.dataClass !== "public" &&
    input.dataClass !== "aggregate_deidentified" &&
    input.dataClass !== "approved_platform_content"
  )
    return null;
  if (!managedAiLaunchStatus().ready) {
    return AI_TENANT_ISOLATION_BLOCK_REASON;
  }
  const contentHash = aiEvidenceHash(
    "knowledge",
    [input.knowledgeType, subjectType, subjectId ?? "", statement].join("\0"),
  );
  try {
    const result = await withTx(async (client) => {
      const inserted = await client.query<KnowledgeRow>(
        `INSERT INTO ai_knowledge_items
           (tenant_id, workspace_id, knowledge_type, subject_type, subject_id,
            statement, content_hash, evidence_refs, confidence, data_class,
            status, derived_by_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'candidate', $11)
         ON CONFLICT (tenant_id, workspace_id, content_hash) DO UPDATE SET
           evidence_refs = EXCLUDED.evidence_refs,
           confidence = GREATEST(ai_knowledge_items.confidence, EXCLUDED.confidence),
           updated_at = NOW()
         WHERE ai_knowledge_items.status = 'candidate'
         RETURNING id, knowledge_type, subject_type, subject_id, statement,
                   content_hash, evidence_refs, confidence, data_class, status,
                   derived_by_agent, reviewed_at, review_note, revision,
                   created_at, updated_at`,
        [
          input.tenantId,
          input.workspaceId,
          input.knowledgeType,
          subjectType,
          subjectId,
          statement,
          contentHash,
          JSON.stringify(evidenceRefs),
          Math.max(0, Math.min(100, Math.trunc(input.confidence))),
          input.dataClass,
          input.derivedByAgent,
        ],
      );
      const row = inserted.rows[0];
      // A hash that has already been reviewed is immutable through the agent
      // candidate path. A human must supersede/review it explicitly instead.
      if (!row) return null;
      await client.query(
        `INSERT INTO ai_knowledge_item_events
           (tenant_id, workspace_id, knowledge_item_id, event_type,
            content_hash, actor_admin_id, metadata)
         VALUES ($1, $2, $3::uuid, 'candidate_created', $4, $5::uuid, $6::jsonb)`,
        [
          input.tenantId,
          input.workspaceId,
          row.id,
          contentHash,
          input.actorAdminId ?? null,
          JSON.stringify({
            confidence: row.confidence,
            evidenceCount: evidenceRefs.length,
          }),
        ],
      );
      return knowledgeSnapshot(row);
    });
    return result.enabled ? result.value : null;
  } catch {
    return null;
  }
}

export async function reviewAiKnowledgeItem(
  input: AdminAiMutationContext & {
    knowledgeItemId: string;
    decision: "verified" | "rejected";
    reviewNote: string;
  },
): Promise<
  | AiKnowledgeSnapshot
  | "not_found"
  | "invalid_state"
  | "tenant_isolation_unresolved"
  | "unavailable"
> {
  if (input.decision === "verified" && !managedAiLaunchStatus().ready) {
    return AI_TENANT_ISOLATION_BLOCK_REASON;
  }
  try {
    const result = await withTx(async (client) => {
      await advisoryLock(
        client,
        `ai-knowledge:${input.tenantId}:${input.workspaceId}:${input.knowledgeItemId}`,
      );
      const selected = await client.query<KnowledgeRow>(
        `SELECT id, knowledge_type, subject_type, subject_id, statement,
                content_hash, evidence_refs, confidence, data_class, status,
                derived_by_agent, reviewed_at, review_note, revision,
                created_at, updated_at
           FROM ai_knowledge_items
          WHERE id = $1::uuid AND tenant_id = $2 AND workspace_id = $3
          FOR UPDATE`,
        [input.knowledgeItemId, input.tenantId, input.workspaceId],
      );
      const before = selected.rows[0];
      if (!before) return "not_found" as const;
      if (before.status !== "candidate") return "invalid_state" as const;
      const updated = await client.query<KnowledgeRow>(
        `UPDATE ai_knowledge_items
            SET status = $4, reviewed_by = $5::uuid, reviewed_at = NOW(),
                review_note = $6, revision = revision + 1, updated_at = NOW()
          WHERE id = $1::uuid AND tenant_id = $2 AND workspace_id = $3
          RETURNING id, knowledge_type, subject_type, subject_id, statement,
                    content_hash, evidence_refs, confidence, data_class, status,
                    derived_by_agent, reviewed_at, review_note, revision,
                    created_at, updated_at`,
        [
          input.knowledgeItemId,
          input.tenantId,
          input.workspaceId,
          input.decision,
          input.actorAdminId,
          input.reviewNote.slice(0, 2_000),
        ],
      );
      const row = updated.rows[0];
      await client.query(
        `INSERT INTO ai_knowledge_item_events
           (tenant_id, workspace_id, knowledge_item_id, event_type,
            content_hash, actor_admin_id, metadata)
         VALUES ($1, $2, $3::uuid, $4, $5, $6::uuid, $7::jsonb)`,
        [
          input.tenantId,
          input.workspaceId,
          input.knowledgeItemId,
          input.decision,
          row.content_hash,
          input.actorAdminId,
          JSON.stringify({
            revision: Number(row.revision),
            confidence: Number(row.confidence),
          }),
        ],
      );
      await writeAdminAuditEvent(client, {
        actorAdminId: input.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action: `ai_knowledge.${input.decision}`,
        resourceType: "ai_knowledge_item",
        resourceId: input.knowledgeItemId,
        requestId: input.requestId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
        beforeState: {
          status: before.status,
          contentHash: before.content_hash,
          revision: Number(before.revision),
        },
        afterState: {
          status: row.status,
          contentHash: row.content_hash,
          revision: Number(row.revision),
        },
      });
      return knowledgeSnapshot(row);
    });
    return result.enabled ? result.value : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function safeAiCatalogForAdmin() {
  return {
    providers: AI_PROVIDER_CATALOG,
    agents: AI_AGENT_CATALOG,
    workflows: AI_WORKFLOW_CATALOG,
  };
}
