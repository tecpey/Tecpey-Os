import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { writeAdminAuditEvent } from "@/lib/admin-control-plane";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  AI_AUTOMATION_POLICIES,
  AI_AUTOMATION_POLICY_VERSION,
  aiAutomationPolicy,
  assertAiAutomationDataClass,
  evaluateAiAutomationGate,
  type AiAutomationDecision,
  type AiAutomationReviewKind,
  type AiAutomationRunStatus,
  type AiAutomationWorkflowId,
} from "./automation-catalog";
import {
  isAiAgentId,
  isAiDataClass,
  isAiModelProviderId,
  type AiAgentId,
  type AiDataClass,
  type AiModelProviderId,
} from "./control-plane-catalog";
import { resolveRuntimeAiAgent, type AdminAiMutationContext } from "./control-plane-store";
import { inspectMentorUserText } from "./mentor-trust-boundary";
import {
  safeAiSourceUrl,
  type AiSourceReference,
  type OpenRouterKeyStatus,
} from "./provider-router";

export type AiAutomationPolicySnapshot = {
  workflowId: AiAutomationWorkflowId;
  enabled: boolean;
  configured: boolean;
  intervalMinutes: number | null;
  maxConcurrency: number;
  policyVersion: string;
  revision: number;
  nextRunAt: string | null;
  lastEnqueuedAt: string | null;
  updatedAt: string | null;
};

export type AiAutomationReviewSnapshot = {
  id: string;
  runId: string;
  reviewKind: AiAutomationReviewKind;
  reviewerAgentId: AiAgentId | null;
  reviewerAdminId: string | null;
  reviewerRoles: string[];
  decision: AiAutomationDecision;
  summary: string;
  evidenceHash: string;
  providerId: AiModelProviderId | null;
  model: string | null;
  sources: AiSourceReference[];
  createdAt: string;
};

export type AiAutomationRunSnapshot = {
  id: string;
  workflowId: AiAutomationWorkflowId;
  status: AiAutomationRunStatus;
  triggerType: "manual" | "event" | "scheduled";
  dataClass: Exclude<AiDataClass, "private_user" | "restricted_admin">;
  criticality: "noncritical" | "standard" | "critical";
  resourceType: string;
  resourceId: string | null;
  inputText: string;
  inputHash: string;
  idempotencyKey: string;
  policyVersion: string;
  aiReviewerIds: AiAgentId[];
  aiQuorum: number;
  managerRoleIds: string[];
  managerQuorum: number;
  cLevelRoleIds: string[];
  cLevelQuorum: number;
  externalEffect: "none" | "publish" | "knowledge_promotion";
  freeFallbackAllowed: boolean;
  attemptCount: number;
  maxAttempts: number;
  requestedBy: string | null;
  approvedAt: string | null;
  executionStartedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  reviews: AiAutomationReviewSnapshot[];
};

export type AiAutomationSnapshot = {
  policyVersion: string;
  catalog: typeof AI_AUTOMATION_POLICIES;
  policies: AiAutomationPolicySnapshot[];
  runs: AiAutomationRunSnapshot[];
  statusSummary: Partial<Record<AiAutomationRunStatus, number>>;
};

type PolicyRow = {
  workflow_id: AiAutomationWorkflowId;
  enabled: boolean;
  interval_minutes: number | null;
  max_concurrency: number;
  policy_version: string;
  revision: string | number;
  next_run_at: string | Date | null;
  last_enqueued_at: string | Date | null;
  updated_at: string | Date;
};

type RunRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  workflow_id: AiAutomationWorkflowId;
  status: AiAutomationRunStatus;
  trigger_type: AiAutomationRunSnapshot["triggerType"];
  data_class: AiAutomationRunSnapshot["dataClass"];
  criticality: AiAutomationRunSnapshot["criticality"];
  resource_type: string;
  resource_id: string | null;
  input_text: string;
  input_hash: string;
  idempotency_key: string;
  policy_version: string;
  ai_reviewer_ids: unknown;
  ai_quorum: number;
  manager_role_ids: unknown;
  manager_quorum: number;
  c_level_role_ids: unknown;
  c_level_quorum: number;
  external_effect: AiAutomationRunSnapshot["externalEffect"];
  free_fallback_allowed: boolean;
  attempt_count: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | Date | null;
  requested_by: string | null;
  approved_at: string | Date | null;
  execution_started_at: string | Date | null;
  completed_at: string | Date | null;
  expires_at: string | Date;
  failure_code: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type ReviewRow = {
  id: string;
  run_id: string;
  review_kind: AiAutomationReviewKind;
  reviewer_agent_id: AiAgentId | null;
  reviewer_worker_id: string | null;
  reviewer_admin_id: string | null;
  reviewer_roles: unknown;
  decision: AiAutomationDecision;
  summary: string;
  evidence_hash: string;
  provider_id: AiModelProviderId | null;
  model: string | null;
  source_refs: unknown;
  created_at: string | Date;
};

const SAFE_RESOURCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/;
const SAFE_RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SAFE_IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,199}$/;
const SAFE_WORKER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{7,199}$/;
const SAFE_FAILURE_PATTERN = /^[a-z0-9][a-z0-9_:-]{1,119}$/;

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string"))]
    : [];
}

function sourceReferences(value: unknown): AiSourceReference[] {
  if (!Array.isArray(value)) return [];
  const output: AiSourceReference[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, 12)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const candidate = item as Record<string, unknown>;
    const url = safeAiSourceUrl(candidate.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push({
      url,
      title:
        typeof candidate.title === "string" && candidate.title.trim()
          ? candidate.title.trim().slice(0, 300)
          : null,
    });
  }
  return output;
}

function mapReview(row: ReviewRow): AiAutomationReviewSnapshot {
  return {
    id: row.id,
    runId: row.run_id,
    reviewKind: row.review_kind,
    reviewerAgentId: row.reviewer_agent_id,
    reviewerAdminId: row.reviewer_admin_id,
    reviewerRoles: strings(row.reviewer_roles),
    decision: row.decision,
    summary: row.summary,
    evidenceHash: row.evidence_hash,
    providerId: row.provider_id,
    model: row.model,
    sources: sourceReferences(row.source_refs),
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
  };
}

function mapRun(
  row: RunRow,
  reviews: AiAutomationReviewSnapshot[] = [],
): AiAutomationRunSnapshot {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    status: row.status,
    triggerType: row.trigger_type,
    dataClass: row.data_class,
    criticality: row.criticality,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    inputText: row.input_text,
    inputHash: row.input_hash,
    idempotencyKey: row.idempotency_key,
    policyVersion: row.policy_version,
    aiReviewerIds: strings(row.ai_reviewer_ids).filter(isAiAgentId),
    aiQuorum: row.ai_quorum,
    managerRoleIds: strings(row.manager_role_ids),
    managerQuorum: row.manager_quorum,
    cLevelRoleIds: strings(row.c_level_role_ids),
    cLevelQuorum: row.c_level_quorum,
    externalEffect: row.external_effect,
    freeFallbackAllowed: row.free_fallback_allowed,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    requestedBy: row.requested_by,
    approvedAt: iso(row.approved_at),
    executionStartedAt: iso(row.execution_started_at),
    completedAt: iso(row.completed_at),
    expiresAt: iso(row.expires_at) ?? new Date(0).toISOString(),
    failureCode: row.failure_code,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
    reviews,
  };
}

function policyDefaults(workflowId: AiAutomationWorkflowId): AiAutomationPolicySnapshot {
  const policy = aiAutomationPolicy(workflowId);
  return {
    workflowId,
    enabled: false,
    configured: false,
    intervalMinutes: policy.defaultIntervalMinutes,
    maxConcurrency: 1,
    policyVersion: AI_AUTOMATION_POLICY_VERSION,
    revision: 0,
    nextRunAt: null,
    lastEnqueuedAt: null,
    updatedAt: null,
  };
}

function mapPolicy(row: PolicyRow): AiAutomationPolicySnapshot {
  return {
    workflowId: row.workflow_id,
    enabled: row.enabled,
    configured: true,
    intervalMinutes: row.interval_minutes,
    maxConcurrency: row.max_concurrency,
    policyVersion: row.policy_version,
    revision: Number(row.revision),
    nextRunAt: iso(row.next_run_at),
    lastEnqueuedAt: iso(row.last_enqueued_at),
    updatedAt: iso(row.updated_at),
  };
}

async function insertRunEvent(
  client: PoolClient,
  input: {
    tenantId: string;
    workspaceId: string;
    runId: string;
    eventType:
      | "queued"
      | "claimed"
      | "review_recorded"
      | "status_changed"
      | "execution_claimed"
      | "completed"
      | "failed"
      | "blocked"
      | "cancelled"
      | "lease_recovered";
    fromStatus?: AiAutomationRunStatus | null;
    toStatus?: AiAutomationRunStatus | null;
    actorType: "system" | "worker" | "admin";
    actorId?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ai_automation_run_events
       (tenant_id, workspace_id, run_id, event_type, from_status, to_status,
        actor_type, actor_id, metadata)
     VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.tenantId,
      input.workspaceId,
      input.runId,
      input.eventType,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.actorType,
      input.actorId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function loadAiAutomationSnapshot(input: {
  tenantId: string;
  workspaceId: string;
}): Promise<AiAutomationSnapshot | null> {
  const loaded = await withDb(async (client) => {
    const [policies, runs] = await Promise.all([
      client.query<PolicyRow>(
        `SELECT workflow_id, enabled, interval_minutes, max_concurrency,
                policy_version, revision, next_run_at, last_enqueued_at, updated_at
           FROM ai_automation_policies
          WHERE tenant_id = $1 AND workspace_id = $2
          ORDER BY workflow_id`,
        [input.tenantId, input.workspaceId],
      ),
      client.query<RunRow>(
        `SELECT *
           FROM ai_automation_runs
          WHERE tenant_id = $1 AND workspace_id = $2
          ORDER BY created_at DESC, id DESC
          LIMIT 100`,
        [input.tenantId, input.workspaceId],
      ),
    ]);
    const runIds = runs.rows.map((row) => row.id);
    const reviewResult = runIds.length
      ? await client.query<ReviewRow>(
          `SELECT *
             FROM ai_automation_reviews
            WHERE tenant_id = $1 AND workspace_id = $2 AND run_id = ANY($3::uuid[])
            ORDER BY created_at ASC, id ASC`,
          [input.tenantId, input.workspaceId, runIds],
        )
      : { rows: [] as ReviewRow[] };
    return { policies: policies.rows, runs: runs.rows, reviews: reviewResult.rows };
  });
  if (!loaded.enabled) return null;

  const policyRows = new Map(
    loaded.value.policies.map((row) => [row.workflow_id, row] as const),
  );
  const reviewsByRun = new Map<string, AiAutomationReviewSnapshot[]>();
  for (const row of loaded.value.reviews) {
    const mapped = mapReview(row);
    const current = reviewsByRun.get(row.run_id) ?? [];
    current.push(mapped);
    reviewsByRun.set(row.run_id, current);
  }
  const runs = loaded.value.runs.map((row) =>
    mapRun(row, reviewsByRun.get(row.id) ?? []),
  );
  const statusSummary: Partial<Record<AiAutomationRunStatus, number>> = {};
  for (const run of runs) statusSummary[run.status] = (statusSummary[run.status] ?? 0) + 1;

  return {
    policyVersion: AI_AUTOMATION_POLICY_VERSION,
    catalog: AI_AUTOMATION_POLICIES,
    policies: AI_AUTOMATION_POLICIES.map((definition) => {
      const row = policyRows.get(definition.id);
      return row ? mapPolicy(row) : policyDefaults(definition.id);
    }),
    runs,
    statusSummary,
  };
}

export type AiAutomationPolicyUpdateResult =
  | { ok: true; policy: AiAutomationPolicySnapshot }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "revision_conflict"
        | "agents_not_ready"
        | "human_reviewer_gap";
      missingAgents?: AiAgentId[];
      missingGate?: "manager" | "c_level" | "separation_of_duties";
    };

export async function updateAiAutomationPolicy(input: {
  context: AdminAiMutationContext;
  workflowId: AiAutomationWorkflowId;
  enabled: boolean;
  intervalMinutes: number | null;
  maxConcurrency: number;
  expectedRevision: number;
}): Promise<AiAutomationPolicyUpdateResult> {
  const definition = aiAutomationPolicy(input.workflowId);
  if (
    !Number.isSafeInteger(input.maxConcurrency) ||
    input.maxConcurrency < 1 ||
    input.maxConcurrency > 20 ||
    (input.intervalMinutes !== null &&
      (!Number.isSafeInteger(input.intervalMinutes) ||
        input.intervalMinutes < 5 ||
        input.intervalMinutes > 10_080)) ||
    (definition.trigger === "scheduled" &&
      input.enabled &&
      input.intervalMinutes === null)
  ) {
    throw new Error("ai_automation_policy_input_invalid");
  }

  if (input.enabled) {
    const resolutions = await Promise.all(
      definition.aiReviewers.map(async (agentId) => ({
        agentId,
        resolution: await resolveRuntimeAiAgent(agentId, {
          tenantId: input.context.tenantId,
          workspaceId: input.context.workspaceId,
        }),
      })),
    );
    const missingAgents = resolutions
      .filter((item) => item.resolution.status !== "configured")
      .map((item) => item.agentId);
    if (missingAgents.length) {
      return { ok: false, reason: "agents_not_ready", missingAgents };
    }
  }

  const transaction = await withTx(async (client) => {
    const existing = await client.query<PolicyRow>(
      `SELECT workflow_id, enabled, interval_minutes, max_concurrency,
              policy_version, revision, next_run_at, last_enqueued_at, updated_at
         FROM ai_automation_policies
        WHERE tenant_id = $1 AND workspace_id = $2 AND workflow_id = $3
        FOR UPDATE`,
      [input.context.tenantId, input.context.workspaceId, input.workflowId],
    );
    const before = existing.rows[0] ?? null;
    if (Number(before?.revision ?? 0) !== input.expectedRevision) {
      return { kind: "revision_conflict" as const };
    }

    if (input.enabled && (definition.managerQuorum > 0 || definition.cLevelQuorum > 0)) {
      const coverage = await client.query<{
        manager_count: string | number;
        c_level_count: string | number;
        total_human_count: string | number;
      }>(
        `SELECT
           COUNT(DISTINCT user_role.admin_id) FILTER (
             WHERE user_role.role_id = ANY($3::text[])
           ) AS manager_count,
           COUNT(DISTINCT user_role.admin_id) FILTER (
             WHERE user_role.role_id = ANY($4::text[])
           ) AS c_level_count,
           COUNT(DISTINCT user_role.admin_id) FILTER (
             WHERE user_role.role_id = ANY($3::text[] || $4::text[])
           ) AS total_human_count
         FROM admin_user_roles user_role
         JOIN admin_users admin_user ON admin_user.id = user_role.admin_id
         WHERE admin_user.tenant_id = $1
           AND admin_user.workspace_id = $2
           AND admin_user.status = 'active'
           AND user_role.revoked_at IS NULL`,
        [
          input.context.tenantId,
          input.context.workspaceId,
          [...definition.managerRoles],
          [...definition.cLevelRoles],
        ],
      );
      if (Number(coverage.rows[0]?.manager_count ?? 0) < definition.managerQuorum) {
        return { kind: "human_reviewer_gap" as const, gate: "manager" as const };
      }
      if (Number(coverage.rows[0]?.c_level_count ?? 0) < definition.cLevelQuorum) {
        return { kind: "human_reviewer_gap" as const, gate: "c_level" as const };
      }
      if (
        Number(coverage.rows[0]?.total_human_count ?? 0) <
        definition.managerQuorum + definition.cLevelQuorum
      ) {
        return {
          kind: "human_reviewer_gap" as const,
          gate: "separation_of_duties" as const,
        };
      }
    }

    const revision = Number(before?.revision ?? 0) + 1;
    const updated = await client.query<PolicyRow>(
      `INSERT INTO ai_automation_policies
         (tenant_id, workspace_id, workflow_id, enabled, interval_minutes,
          max_concurrency, policy_version, revision, next_run_at, updated_by,
          created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8,
          CASE WHEN $4 AND $5::integer IS NOT NULL
               THEN NOW() + make_interval(mins => $5::integer)
               ELSE NULL END,
          $9::uuid, NOW(), NOW())
       ON CONFLICT (tenant_id, workspace_id, workflow_id) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             interval_minutes = EXCLUDED.interval_minutes,
             max_concurrency = EXCLUDED.max_concurrency,
             policy_version = EXCLUDED.policy_version,
             revision = EXCLUDED.revision,
             next_run_at = CASE
               WHEN EXCLUDED.enabled AND EXCLUDED.interval_minutes IS NOT NULL
                 THEN NOW() + make_interval(mins => EXCLUDED.interval_minutes)
               ELSE NULL
             END,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING workflow_id, enabled, interval_minutes, max_concurrency,
                 policy_version, revision, next_run_at, last_enqueued_at, updated_at`,
      [
        input.context.tenantId,
        input.context.workspaceId,
        input.workflowId,
        input.enabled,
        input.intervalMinutes,
        input.maxConcurrency,
        AI_AUTOMATION_POLICY_VERSION,
        revision,
        input.context.actorAdminId,
      ],
    );
    const policy = updated.rows[0];
    const blockedRuns = await client.query<RunRow & { prior_status: AiAutomationRunStatus }>(
      `WITH candidates AS (
         SELECT id, status AS prior_status
           FROM ai_automation_runs
          WHERE tenant_id = $1
            AND workspace_id = $2
            AND workflow_id = $3
            AND status IN (
              'queued', 'ai_review', 'manager_review', 'c_level_review', 'approved'
            )
            AND (NOT $4::boolean OR policy_version <> $5)
          FOR UPDATE
       )
       UPDATE ai_automation_runs AS run
          SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
              failure_code = CASE
                WHEN $4::boolean THEN 'policy_superseded'
                ELSE 'policy_disabled'
              END
         FROM candidates
        WHERE run.id = candidates.id
        RETURNING run.*, candidates.prior_status`,
      [
        input.context.tenantId,
        input.context.workspaceId,
        input.workflowId,
        input.enabled,
        AI_AUTOMATION_POLICY_VERSION,
      ],
    );
    for (const run of blockedRuns.rows) {
      await insertRunEvent(client, {
        tenantId: run.tenant_id,
        workspaceId: run.workspace_id,
        runId: run.id,
        eventType: "blocked",
        fromStatus: run.prior_status,
        toStatus: "blocked",
        actorType: "admin",
        actorId: input.context.actorAdminId,
        metadata: {
          reason: input.enabled ? "policy_superseded" : "policy_disabled",
        },
      });
    }
    await client.query(
      `INSERT INTO ai_automation_policy_events
         (tenant_id, workspace_id, workflow_id, event_type, enabled,
          interval_minutes, max_concurrency, policy_version, revision, actor_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid)`,
      [
        input.context.tenantId,
        input.context.workspaceId,
        input.workflowId,
        input.enabled ? (before?.enabled ? "configured" : "enabled") : "disabled",
        input.enabled,
        input.intervalMinutes,
        input.maxConcurrency,
        AI_AUTOMATION_POLICY_VERSION,
        revision,
        input.context.actorAdminId,
      ],
    );
    await writeAdminAuditEvent(client, {
      actorAdminId: input.context.actorAdminId,
      sessionId: input.context.sessionId,
      effectiveRoles: input.context.effectiveRoles,
      action: "ai.automation.policy.update",
      resourceType: "ai_automation_policy",
      resourceId: input.workflowId,
      requestId: input.context.requestId,
      sourceIp: input.context.sourceIp,
      userAgent: input.context.userAgent,
      beforeState: before ? mapPolicy(before) : null,
      afterState: {
        ...mapPolicy(policy),
        blockedRunCount: blockedRuns.rowCount ?? blockedRuns.rows.length,
      },
      outcome: "success",
    });
    return { kind: "updated" as const, policy: mapPolicy(policy) };
  });

  if (!transaction.enabled) return { ok: false, reason: "unavailable" };
  if (transaction.value.kind === "revision_conflict") {
    return { ok: false, reason: "revision_conflict" };
  }
  if (transaction.value.kind === "human_reviewer_gap") {
    return {
      ok: false,
      reason: "human_reviewer_gap",
      missingGate: transaction.value.gate,
    };
  }
  return { ok: true, policy: transaction.value.policy };
}

export type EnqueueAiAutomationResult =
  | { ok: true; run: AiAutomationRunSnapshot; deduplicated: boolean }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "policy_disabled"
        | "policy_stale"
        | "human_reviewer_gap"
        | "input_rejected"
        | "data_class_forbidden";
    };

export async function enqueueAiAutomationRun(input: {
  tenantId: string;
  workspaceId: string;
  workflowId: AiAutomationWorkflowId;
  triggerType: "manual" | "event" | "scheduled";
  dataClass: AiDataClass;
  resourceType: string;
  resourceId?: string | null;
  inputText: string;
  idempotencyKey: string;
  requestedBy?: string | null;
  context?: AdminAiMutationContext;
}): Promise<EnqueueAiAutomationResult> {
  const definition = aiAutomationPolicy(input.workflowId);
  try {
    assertAiAutomationDataClass(input.workflowId, input.dataClass);
  } catch {
    return { ok: false, reason: "data_class_forbidden" };
  }
  if (
    input.dataClass === "private_user" ||
    input.dataClass === "restricted_admin" ||
    !SAFE_RESOURCE_PATTERN.test(input.resourceType) ||
    (input.resourceId !== null &&
      input.resourceId !== undefined &&
      !SAFE_RESOURCE_ID_PATTERN.test(input.resourceId)) ||
    !SAFE_IDEMPOTENCY_PATTERN.test(input.idempotencyKey)
  ) {
    return { ok: false, reason: "input_rejected" };
  }
  const inspection = inspectMentorUserText(input.inputText);
  if (
    inspection.blocked ||
    inspection.injectionSignals.length > 0 ||
    inspection.normalized.length < 8 ||
    inspection.normalized.length > 4_000 ||
    inspection.classes.some((value) =>
      ["personal", "financial_sensitive", "authentication_secret", "prohibited"].includes(value),
    )
  ) {
    return { ok: false, reason: "input_rejected" };
  }

  const transaction = await withTx(async (client) => {
    const configured = await client.query<{
      enabled: boolean;
      policy_version: string;
    }>(
      `SELECT enabled, policy_version
         FROM ai_automation_policies
        WHERE tenant_id = $1 AND workspace_id = $2 AND workflow_id = $3
        LIMIT 1
        FOR SHARE`,
      [input.tenantId, input.workspaceId, input.workflowId],
    );
    if (!configured.rows[0]?.enabled) return { kind: "disabled" as const };
    if (configured.rows[0].policy_version !== AI_AUTOMATION_POLICY_VERSION) {
      return { kind: "stale" as const };
    }
    if (
      input.requestedBy &&
      (definition.managerQuorum > 0 || definition.cLevelQuorum > 0)
    ) {
      const coverage = await client.query<{
        manager_count: string | number;
        c_level_count: string | number;
        total_human_count: string | number;
      }>(
        `SELECT
           COUNT(DISTINCT user_role.admin_id) FILTER (
             WHERE user_role.role_id = ANY($3::text[])
           ) AS manager_count,
           COUNT(DISTINCT user_role.admin_id) FILTER (
             WHERE user_role.role_id = ANY($4::text[])
           ) AS c_level_count,
           COUNT(DISTINCT user_role.admin_id) FILTER (
             WHERE user_role.role_id = ANY($3::text[] || $4::text[])
           ) AS total_human_count
         FROM admin_user_roles user_role
         JOIN admin_users admin_user ON admin_user.id = user_role.admin_id
         WHERE admin_user.tenant_id = $1
           AND admin_user.workspace_id = $2
           AND admin_user.status = 'active'
           AND admin_user.id <> $5::uuid
           AND user_role.revoked_at IS NULL`,
        [
          input.tenantId,
          input.workspaceId,
          [...definition.managerRoles],
          [...definition.cLevelRoles],
          input.requestedBy,
        ],
      );
      if (
        Number(coverage.rows[0]?.manager_count ?? 0) < definition.managerQuorum ||
        Number(coverage.rows[0]?.c_level_count ?? 0) < definition.cLevelQuorum ||
        Number(coverage.rows[0]?.total_human_count ?? 0) <
          definition.managerQuorum + definition.cLevelQuorum
      ) {
        return { kind: "reviewer_gap" as const };
      }
    }

    const existing = await client.query<RunRow>(
      `SELECT *
         FROM ai_automation_runs
        WHERE tenant_id = $1 AND workspace_id = $2 AND idempotency_key = $3
        LIMIT 1`,
      [input.tenantId, input.workspaceId, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      if (
        existing.rows[0].workflow_id !== input.workflowId ||
        existing.rows[0].input_hash !== inspection.inputHash
      ) {
        throw new Error("ai_automation_idempotency_conflict");
      }
      return { kind: "existing" as const, run: existing.rows[0] };
    }

    const runId = randomUUID();
    const inserted = await client.query<RunRow>(
      `INSERT INTO ai_automation_runs
         (id, tenant_id, workspace_id, workflow_id, status, trigger_type,
          data_class, criticality, resource_type, resource_id, input_text,
          input_hash, idempotency_key, policy_version, ai_reviewer_ids,
          ai_quorum, manager_role_ids, manager_quorum, c_level_role_ids,
          c_level_quorum, external_effect, free_fallback_allowed, max_attempts,
          requested_by, expires_at)
       VALUES
         ($1::uuid, $2, $3, $4, 'queued', $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14::text[], $15, $16::text[], $17,
          $18::text[], $19, $20, $21, $22, $23::uuid,
          NOW() + make_interval(mins => $24))
       RETURNING *`,
      [
        runId,
        input.tenantId,
        input.workspaceId,
        input.workflowId,
        input.triggerType,
        input.dataClass,
        definition.criticality,
        input.resourceType,
        input.resourceId ?? null,
        inspection.normalized,
        inspection.inputHash,
        input.idempotencyKey,
        AI_AUTOMATION_POLICY_VERSION,
        [...definition.aiReviewers],
        definition.aiQuorum,
        [...definition.managerRoles],
        definition.managerQuorum,
        [...definition.cLevelRoles],
        definition.cLevelQuorum,
        definition.externalEffect,
        definition.freeFallbackAllowed,
        definition.maxAttempts,
        input.requestedBy ?? null,
        definition.approvalTtlMinutes,
      ],
    );
    await insertRunEvent(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      runId,
      eventType: "queued",
      toStatus: "queued",
      actorType: input.context ? "admin" : "system",
      actorId: input.context?.actorAdminId ?? null,
      metadata: {
        workflow_id: input.workflowId,
        trigger_type: input.triggerType,
        data_class: input.dataClass,
      },
    });
    if (input.context) {
      await writeAdminAuditEvent(client, {
        actorAdminId: input.context.actorAdminId,
        sessionId: input.context.sessionId,
        effectiveRoles: input.context.effectiveRoles,
        action: "ai.automation.run.enqueue",
        resourceType: "ai_automation_run",
        resourceId: runId,
        requestId: input.context.requestId,
        sourceIp: input.context.sourceIp,
        userAgent: input.context.userAgent,
        afterState: {
          workflowId: input.workflowId,
          dataClass: input.dataClass,
          inputHash: inspection.inputHash,
          idempotencyKey: input.idempotencyKey,
        },
        outcome: "success",
      });
    }
    return { kind: "inserted" as const, run: inserted.rows[0] };
  });
  if (!transaction.enabled) return { ok: false, reason: "unavailable" };
  if (transaction.value.kind === "disabled") {
    return { ok: false, reason: "policy_disabled" };
  }
  if (transaction.value.kind === "stale") {
    return { ok: false, reason: "policy_stale" };
  }
  if (transaction.value.kind === "reviewer_gap") {
    return { ok: false, reason: "human_reviewer_gap" };
  }
  return {
    ok: true,
    run: mapRun(transaction.value.run),
    deduplicated: transaction.value.kind === "existing",
  };
}

export type ClaimedAiAutomationRun = AiAutomationRunSnapshot & {
  tenantId: string;
  workspaceId: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
};

const SCHEDULED_AUTOMATION_INPUTS: Partial<
  Record<
    AiAutomationWorkflowId,
    { dataClass: AiAutomationRunSnapshot["dataClass"]; resourceType: string; inputText: string }
  >
> = {
  public_intelligence_digest: {
    dataClass: "public",
    resourceType: "scheduled_public_intelligence",
    inputText:
      "اخبار عمومی، پست‌های عمومی X، تغییرات مهم ابزارهای رمزارزی و ادعاهای تازه درباره کوین‌ها را با منابع قابل‌بررسی پایش کن؛ فقط یک digest داخلی و بدون سیگنال خرید یا فروش آماده شود.",
  },
  executive_operating_review: {
    dataClass: "aggregate_deidentified",
    resourceType: "scheduled_executive_review",
    inputText:
      "برای مرور عملیاتی C-Level فقط از شاخص‌های تجمیعی و بدون هویت که در scope تأییدشده در دسترس‌اند استفاده کن؛ نبود evidence را صریح اعلام کن و هیچ کاربر یا پیام خامی را شناسایی نکن.",
  },
};

export async function enqueueDueAiAutomationRuns(limit = 10): Promise<number> {
  const bounded = Math.min(50, Math.max(1, Math.trunc(limit)));
  const transaction = await withTx(async (client) => {
    const due = await client.query<
      PolicyRow & { tenant_id: string; workspace_id: string }
    >(
      `SELECT tenant_id, workspace_id, workflow_id, enabled, interval_minutes, max_concurrency,
              policy_version, revision, next_run_at, last_enqueued_at, updated_at
         FROM ai_automation_policies
        WHERE enabled
          AND interval_minutes IS NOT NULL
          AND next_run_at <= NOW()
          AND workflow_id = ANY($1::text[])
          AND policy_version = $2
        ORDER BY next_run_at ASC, tenant_id, workspace_id
        FOR UPDATE SKIP LOCKED
        LIMIT $3`,
      [
        Object.keys(SCHEDULED_AUTOMATION_INPUTS),
        AI_AUTOMATION_POLICY_VERSION,
        bounded,
      ],
    );
    let enqueued = 0;
    for (const policyRow of due.rows) {
      const scheduled = SCHEDULED_AUTOMATION_INPUTS[policyRow.workflow_id];
      if (!scheduled) continue;
      const definition = aiAutomationPolicy(policyRow.workflow_id);
      const scheduledAt = iso(policyRow.next_run_at) ?? new Date().toISOString();
      const idempotencyKey = `schedule:${policyRow.workflow_id}:${createHash("sha256")
        .update(`${policyRow.tenant_id}:${policyRow.workspace_id}:${scheduledAt}`)
        .digest("hex")
        .slice(0, 32)}`;
      const runId = randomUUID();
      const inputHash = createHash("sha256").update(scheduled.inputText).digest("hex");
      const inserted = await client.query<{ id: string }>(
          `INSERT INTO ai_automation_runs
             (id, tenant_id, workspace_id, workflow_id, status, trigger_type,
              data_class, criticality, resource_type, input_text, input_hash,
              idempotency_key, policy_version, ai_reviewer_ids, ai_quorum,
              manager_role_ids, manager_quorum, c_level_role_ids, c_level_quorum,
              external_effect, free_fallback_allowed, max_attempts, expires_at)
           VALUES
             ($1::uuid, $2, $3, $4, 'queued', 'scheduled', $5, $6, $7, $8, $9,
              $10, $11, $12::text[], $13, $14::text[], $15, $16::text[], $17,
              $18, $19, $20, NOW() + make_interval(mins => $21))
           ON CONFLICT (tenant_id, workspace_id, idempotency_key) DO NOTHING
           RETURNING id`,
          [
            runId,
            policyRow.tenant_id,
            policyRow.workspace_id,
            policyRow.workflow_id,
            scheduled.dataClass,
            definition.criticality,
            scheduled.resourceType,
            scheduled.inputText,
            inputHash,
            idempotencyKey,
            AI_AUTOMATION_POLICY_VERSION,
            [...definition.aiReviewers],
            definition.aiQuorum,
            [...definition.managerRoles],
            definition.managerQuorum,
            [...definition.cLevelRoles],
            definition.cLevelQuorum,
            definition.externalEffect,
            definition.freeFallbackAllowed,
            definition.maxAttempts,
            definition.approvalTtlMinutes,
          ],
      );
      await client.query(
          `UPDATE ai_automation_policies
              SET last_enqueued_at = NOW(),
                  next_run_at = GREATEST(
                    next_run_at + make_interval(mins => interval_minutes),
                    NOW() + make_interval(mins => interval_minutes)
                  )
            WHERE tenant_id = $1 AND workspace_id = $2 AND workflow_id = $3`,
        [policyRow.tenant_id, policyRow.workspace_id, policyRow.workflow_id],
      );
      if (inserted.rows[0]) {
        await insertRunEvent(client, {
          tenantId: policyRow.tenant_id,
          workspaceId: policyRow.workspace_id,
          runId,
          eventType: "queued",
          toStatus: "queued",
          actorType: "system",
          metadata: {
            workflow_id: policyRow.workflow_id,
            trigger_type: "scheduled",
            data_class: scheduled.dataClass,
          },
        });
        enqueued += 1;
      }
    }
    return enqueued;
  });
  return transaction.enabled ? transaction.value : 0;
}

export async function claimAiAutomationReviewRun(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<ClaimedAiAutomationRun | null> {
  if (!SAFE_WORKER_PATTERN.test(input.workerId)) {
    throw new Error("ai_automation_worker_id_invalid");
  }
  const leaseSeconds = Math.min(300, Math.max(30, Math.trunc(input.leaseSeconds ?? 120)));
  const claimed = await withTx(async (client) => {
    const selected = await client.query<RunRow>(
      `SELECT run.*
         FROM ai_automation_runs run
         JOIN ai_automation_policies policy
           ON policy.tenant_id = run.tenant_id
          AND policy.workspace_id = run.workspace_id
          AND policy.workflow_id = run.workflow_id
        WHERE policy.enabled
          AND policy.policy_version = run.policy_version
          AND run.expires_at > NOW()
          AND run.attempt_count < run.max_attempts
          AND (
            run.status = 'queued'
            OR (run.status = 'ai_review' AND run.lease_expires_at <= NOW())
          )
          AND (
            SELECT COUNT(*)
              FROM ai_automation_runs active
             WHERE active.tenant_id = run.tenant_id
               AND active.workspace_id = run.workspace_id
               AND active.workflow_id = run.workflow_id
               AND active.status IN ('ai_review', 'executing')
               AND (active.lease_expires_at IS NULL OR active.lease_expires_at > NOW())
          ) < policy.max_concurrency
        ORDER BY run.created_at ASC, run.id ASC
        FOR UPDATE OF run SKIP LOCKED
        LIMIT 1`,
    );
    const row = selected.rows[0];
    if (!row) return null;

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `ai-automation-concurrency:${row.tenant_id}:${row.workspace_id}:${row.workflow_id}`,
    ]);
    const concurrency = await client.query<{
      max_concurrency: number;
      active_count: string | number;
    }>(
      `SELECT policy.max_concurrency,
              (SELECT COUNT(*)
                 FROM ai_automation_runs active
                WHERE active.tenant_id = policy.tenant_id
                  AND active.workspace_id = policy.workspace_id
                  AND active.workflow_id = policy.workflow_id
                  AND active.status IN ('ai_review', 'executing')
                  AND (active.lease_expires_at IS NULL OR active.lease_expires_at > NOW())
              ) AS active_count
         FROM ai_automation_policies policy
        WHERE policy.tenant_id = $1
          AND policy.workspace_id = $2
          AND policy.workflow_id = $3
          AND policy.enabled
          AND policy.policy_version = $4
        FOR UPDATE`,
      [row.tenant_id, row.workspace_id, row.workflow_id, row.policy_version],
    );
    if (
      !concurrency.rows[0] ||
      Number(concurrency.rows[0].active_count) >= concurrency.rows[0].max_concurrency
    ) {
      return null;
    }

    const initialStatus = nextStatusForReviews({ run: row, reviews: [] });
    const nextStatus = row.status === "ai_review" ? "ai_review" : initialStatus;
    const needsAiLease = nextStatus === "ai_review";
    const updated = await client.query<RunRow>(
      `UPDATE ai_automation_runs
          SET status = $2,
              attempt_count = attempt_count + CASE WHEN $3 THEN 1 ELSE 0 END,
              lease_owner = CASE WHEN $3 THEN $4 ELSE NULL END,
              lease_expires_at = CASE
                WHEN $3 THEN NOW() + make_interval(secs => $5)
                ELSE NULL
              END,
              failure_code = NULL
        WHERE id = $1::uuid
        RETURNING *`,
      [row.id, nextStatus, needsAiLease, input.workerId, leaseSeconds],
    );
    await insertRunEvent(client, {
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      runId: row.id,
      eventType: row.status === "ai_review" ? "lease_recovered" : "claimed",
      fromStatus: row.status,
      toStatus: nextStatus,
      actorType: "worker",
      actorId: input.workerId,
      metadata: { attempt: updated.rows[0].attempt_count },
    });
    return updated.rows[0];
  });
  if (!claimed.enabled || !claimed.value) return null;

  const reviews = await withDb(async (client) =>
    client.query<ReviewRow>(
      `SELECT * FROM ai_automation_reviews WHERE run_id = $1::uuid ORDER BY created_at, id`,
      [claimed.value?.id],
    ),
  );
  const row = claimed.value;
  return {
    ...mapRun(row, reviews.enabled ? reviews.value.rows.map(mapReview) : []),
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: iso(row.lease_expires_at),
  };
}

function nextStatusForReviews(input: {
  run: RunRow;
  reviews: ReviewRow[];
}): AiAutomationRunStatus {
  const aiApprovals = input.reviews.filter(
    (review) => review.review_kind === "ai_agent" && review.decision === "approve",
  ).length;
  const managerApprovals = input.reviews.filter(
    (review) => review.review_kind === "manager" && review.decision === "approve",
  ).length;
  const cLevelApprovals = input.reviews.filter(
    (review) => review.review_kind === "c_level" && review.decision === "approve",
  ).length;
  const rejectionCount = input.reviews.filter((review) => review.decision === "reject").length;
  if (rejectionCount > 0) return "rejected";

  const status = evaluateAiAutomationGate({
    policy: {
      ...aiAutomationPolicy(input.run.workflow_id),
      aiReviewers: strings(input.run.ai_reviewer_ids).filter(isAiAgentId),
      aiQuorum: input.run.ai_quorum,
      managerRoles: strings(input.run.manager_role_ids),
      managerQuorum: input.run.manager_quorum,
      cLevelRoles: strings(input.run.c_level_role_ids),
      cLevelQuorum: input.run.c_level_quorum,
      externalEffect: input.run.external_effect,
      freeFallbackAllowed: input.run.free_fallback_allowed,
    },
    aiApprovals,
    managerApprovals,
    cLevelApprovals,
    rejectionCount,
  });
  if (
    status === "ai_review" &&
    input.reviews.filter((review) => review.review_kind === "ai_agent").length >=
      strings(input.run.ai_reviewer_ids).length
  ) {
    return "blocked";
  }
  return status;
}

export type RecordAiAutomationReviewResult =
  | { ok: true; run: AiAutomationRunSnapshot }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "not_found"
        | "not_reviewable"
        | "wrong_gate"
        | "lease_invalid"
        | "reviewer_forbidden"
        | "already_reviewed";
    };

export async function recordAiAutomationReview(input: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  reviewKind: AiAutomationReviewKind;
  decision: AiAutomationDecision;
  summary: string;
  evidenceHash: string;
  reviewerAgentId?: AiAgentId | null;
  reviewerAdminId?: string | null;
  reviewerRoles?: string[];
  providerId?: AiModelProviderId | null;
  model?: string | null;
  sources?: AiSourceReference[];
  workerId?: string | null;
  context?: AdminAiMutationContext;
}): Promise<RecordAiAutomationReviewResult> {
  const summaryInspection = inspectMentorUserText(input.summary);
  const summary = summaryInspection.normalized;
  if (
    summaryInspection.blocked ||
    summaryInspection.classes.includes("personal") ||
    summary.length < 8 ||
    summary.length > 2_000 ||
    !/^[0-9a-f]{64}$/.test(input.evidenceHash) ||
    !["approve", "reject", "abstain"].includes(input.decision)
  ) {
    throw new Error("ai_automation_review_input_invalid");
  }
  if (
    input.reviewKind === "ai_agent" &&
    (!input.reviewerAgentId ||
      !input.workerId ||
      !SAFE_WORKER_PATTERN.test(input.workerId) ||
      !input.providerId ||
      !isAiModelProviderId(input.providerId) ||
      !input.model)
  ) {
    throw new Error("ai_automation_ai_review_identity_invalid");
  }
  if (
    input.reviewKind !== "ai_agent" &&
    (!input.reviewerAdminId || !input.context || !(input.reviewerRoles?.length))
  ) {
    throw new Error("ai_automation_human_review_identity_invalid");
  }

  try {
    const transaction = await withTx(async (client) => {
      const selected = await client.query<RunRow>(
        `SELECT * FROM ai_automation_runs
          WHERE id = $1::uuid AND tenant_id = $2 AND workspace_id = $3
          FOR UPDATE`,
        [input.runId, input.tenantId, input.workspaceId],
      );
      const run = selected.rows[0];
      if (!run) return { kind: "not_found" as const };
      if (
        ["approved", "executing", "completed", "rejected", "blocked", "failed", "cancelled"].includes(run.status) ||
        Date.parse(String(run.expires_at)) <= Date.now()
      ) {
        return { kind: "not_reviewable" as const };
      }
      const expectedStatus =
        input.reviewKind === "ai_agent"
          ? "ai_review"
          : input.reviewKind === "manager"
            ? "manager_review"
            : "c_level_review";
      if (run.status !== expectedStatus) return { kind: "wrong_gate" as const };
      if (
        input.reviewKind === "ai_agent" &&
        (run.lease_owner !== input.workerId ||
          !run.lease_expires_at ||
          Date.parse(String(run.lease_expires_at)) <= Date.now())
      ) {
        return { kind: "lease_invalid" as const };
      }
      if (
        input.reviewKind === "manager" &&
        !(input.reviewerRoles ?? []).some((role) => strings(run.manager_role_ids).includes(role))
      ) {
        return { kind: "reviewer_forbidden" as const };
      }
      if (
        input.reviewKind === "c_level" &&
        !(input.reviewerRoles ?? []).some((role) => strings(run.c_level_role_ids).includes(role))
      ) {
        return { kind: "reviewer_forbidden" as const };
      }

      const sources = sourceReferences(input.sources ?? []);
      await client.query(
        `INSERT INTO ai_automation_reviews
           (tenant_id, workspace_id, run_id, review_kind, reviewer_agent_id,
            reviewer_worker_id, reviewer_admin_id, reviewer_roles, decision, summary, evidence_hash,
            provider_id, model, source_refs)
         VALUES
           ($1, $2, $3::uuid, $4, $5, $6, $7::uuid, $8::text[], $9, $10, $11, $12, $13,
            $14::jsonb)`,
        [
          input.tenantId,
          input.workspaceId,
          input.runId,
          input.reviewKind,
          input.reviewerAgentId ?? null,
          input.workerId ?? null,
          input.reviewerAdminId ?? null,
          input.reviewerRoles ?? [],
          input.decision,
          summary,
          input.evidenceHash,
          input.providerId ?? null,
          input.model ?? null,
          JSON.stringify(sources),
        ],
      );
      const reviewRows = await client.query<ReviewRow>(
        `SELECT * FROM ai_automation_reviews WHERE run_id = $1::uuid ORDER BY created_at, id`,
        [input.runId],
      );
      const nextStatus = nextStatusForReviews({ run, reviews: reviewRows.rows });
      const updated = await client.query<RunRow>(
        `UPDATE ai_automation_runs
            SET status = $2,
                lease_owner = CASE WHEN $2 = 'ai_review' THEN lease_owner ELSE NULL END,
                lease_expires_at = CASE WHEN $2 = 'ai_review' THEN lease_expires_at ELSE NULL END,
                failure_code = CASE WHEN $2 = 'blocked' THEN 'ai_quorum_unmet' ELSE NULL END
          WHERE id = $1::uuid
          RETURNING *`,
        [input.runId, nextStatus],
      );
      await insertRunEvent(client, {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        runId: input.runId,
        eventType: "review_recorded",
        fromStatus: run.status,
        toStatus: nextStatus,
        actorType: input.reviewKind === "ai_agent" ? "worker" : "admin",
        actorId: input.workerId ?? input.reviewerAdminId ?? null,
        metadata: {
          review_kind: input.reviewKind,
          decision: input.decision,
          reviewer_agent_id: input.reviewerAgentId ?? null,
        },
      });
      if (input.context) {
        await writeAdminAuditEvent(client, {
          actorAdminId: input.context.actorAdminId,
          sessionId: input.context.sessionId,
          effectiveRoles: input.context.effectiveRoles,
          action: "ai.automation.run.review",
          resourceType: "ai_automation_run",
          resourceId: input.runId,
          requestId: input.context.requestId,
          sourceIp: input.context.sourceIp,
          userAgent: input.context.userAgent,
          beforeState: { status: run.status },
          afterState: {
            status: nextStatus,
            reviewKind: input.reviewKind,
            decision: input.decision,
            evidenceHash: input.evidenceHash,
          },
          outcome: "success",
        });
      }
      return {
        kind: "recorded" as const,
        run: updated.rows[0],
        reviews: reviewRows.rows,
      };
    });
    if (!transaction.enabled) return { ok: false, reason: "unavailable" };
    if (transaction.value.kind !== "recorded") {
      return { ok: false, reason: transaction.value.kind };
    }
    return {
      ok: true,
      run: mapRun(transaction.value.run, transaction.value.reviews.map(mapReview)),
    };
  } catch (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") return { ok: false, reason: "already_reviewed" };
    if (pgCode === "42501") return { ok: false, reason: "reviewer_forbidden" };
    logger.error("[ai-automation] review persistence failed", {
      runId: input.runId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "unavailable" };
  }
}

export function aiAutomationEvidenceHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function recordOpenRouterQuotaSnapshot(input: {
  tenantId: string;
  workspaceId: string;
  status: OpenRouterKeyStatus;
  creditFloorUsdMicros: number;
  source: "provider_api" | "request_failure" | "worker_probe";
}): Promise<boolean> {
  const state = !input.status.ok
    ? input.status.status === 429 ? "rate_limited" : "unavailable"
    : input.status.limitRemainingUsdMicros === null
      ? "unavailable"
    : input.status.limitRemainingUsdMicros !== null &&
        input.status.limitRemainingUsdMicros <= 0
      ? "exhausted"
      : input.status.limitRemainingUsdMicros !== null &&
          input.status.limitRemainingUsdMicros <= input.creditFloorUsdMicros
        ? "low"
        : "healthy";
  const payload = input.status.ok
    ? {
        limit: input.status.limitUsdMicros,
        remaining: input.status.limitRemainingUsdMicros,
        usage: input.status.usageMonthlyUsdMicros,
        free: input.status.isFreeTier,
      }
    : { reason: input.status.reason, status: input.status.status ?? null };
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  try {
    const stored = await withDb(async (client) => {
      await client.query(
        `INSERT INTO ai_provider_quota_snapshots
           (tenant_id, workspace_id, provider_id, status, limit_usd_micros,
            remaining_usd_micros, usage_usd_micros, is_free_tier, source, source_hash)
         VALUES ($1, $2, 'openrouter', $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.tenantId,
          input.workspaceId,
          state,
          input.status.ok ? input.status.limitUsdMicros : null,
          input.status.ok ? input.status.limitRemainingUsdMicros : null,
          input.status.ok ? input.status.usageMonthlyUsdMicros : null,
          input.status.ok ? input.status.isFreeTier : null,
          input.source,
          sourceHash,
        ],
      );
      return true;
    });
    return stored.enabled && stored.value;
  } catch (error) {
    logger.error("[ai-automation] quota snapshot persistence failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function recoverExpiredAiAutomationRuns(): Promise<number> {
  const recovered = await withTx(async (client) => {
    const expired = await client.query<RunRow>(
      `SELECT * FROM ai_automation_runs
        WHERE status IN ('queued', 'ai_review', 'manager_review', 'c_level_review', 'approved')
          AND expires_at <= NOW()
        FOR UPDATE SKIP LOCKED`,
    );
    let count = 0;
    for (const run of expired.rows) {
      await client.query(
        `UPDATE ai_automation_runs
            SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
                failure_code = 'approval_expired'
          WHERE id = $1::uuid`,
        [run.id],
      );
      await insertRunEvent(client, {
        tenantId: run.tenant_id,
        workspaceId: run.workspace_id,
        runId: run.id,
        eventType: "blocked",
        fromStatus: run.status,
        toStatus: "blocked",
        actorType: "system",
        metadata: { reason: "approval_expired" },
      });
      count += 1;
    }
    const exhausted = await client.query<RunRow>(
      `SELECT * FROM ai_automation_runs
        WHERE status = 'ai_review'
          AND attempt_count >= max_attempts
          AND lease_expires_at <= NOW()
        FOR UPDATE SKIP LOCKED`,
    );
    for (const run of exhausted.rows) {
      await client.query(
        `UPDATE ai_automation_runs
            SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
                failure_code = 'review_attempts_exhausted'
          WHERE id = $1::uuid`,
        [run.id],
      );
      await insertRunEvent(client, {
        tenantId: run.tenant_id,
        workspaceId: run.workspace_id,
        runId: run.id,
        eventType: "failed",
        fromStatus: run.status,
        toStatus: "failed",
        actorType: "system",
        metadata: { reason: "review_attempts_exhausted" },
      });
      count += 1;
    }
    const abandonedExecutions = await client.query<RunRow>(
      `SELECT * FROM ai_automation_runs
        WHERE status = 'executing'
          AND lease_expires_at <= NOW()
        FOR UPDATE SKIP LOCKED`,
    );
    for (const run of abandonedExecutions.rows) {
      await client.query(
        `UPDATE ai_automation_runs
            SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
                failure_code = 'execution_lease_expired'
          WHERE id = $1::uuid`,
        [run.id],
      );
      await insertRunEvent(client, {
        tenantId: run.tenant_id,
        workspaceId: run.workspace_id,
        runId: run.id,
        eventType: "failed",
        fromStatus: "executing",
        toStatus: "failed",
        actorType: "system",
        metadata: { reason: "execution_lease_expired", requires_reconciliation: true },
      });
      count += 1;
    }
    return count;
  });
  return recovered.enabled ? recovered.value : 0;
}

export async function claimApprovedAiAutomationExecution(input: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  executorId: string;
  leaseSeconds?: number;
}): Promise<AiAutomationRunSnapshot | null> {
  if (!SAFE_WORKER_PATTERN.test(input.executorId)) {
    throw new Error("ai_automation_executor_id_invalid");
  }
  const leaseSeconds = Math.min(900, Math.max(30, Math.trunc(input.leaseSeconds ?? 300)));
  const claimed = await withTx(async (client) => {
    const run = await client.query<RunRow>(
      `SELECT run.*
         FROM ai_automation_runs run
         JOIN ai_automation_policies policy
           ON policy.tenant_id = run.tenant_id
          AND policy.workspace_id = run.workspace_id
          AND policy.workflow_id = run.workflow_id
        WHERE run.id = $1::uuid
          AND run.tenant_id = $2
          AND run.workspace_id = $3
          AND run.status = 'approved'
          AND run.expires_at > NOW()
          AND policy.enabled
          AND policy.policy_version = run.policy_version
        FOR UPDATE OF run, policy`,
      [input.runId, input.tenantId, input.workspaceId],
    );
    if (!run.rows[0]) return null;
    const updated = await client.query<RunRow>(
      `UPDATE ai_automation_runs
          SET status = 'executing', lease_owner = $2,
              lease_expires_at = NOW() + make_interval(secs => $3)
        WHERE id = $1::uuid
        RETURNING *`,
      [input.runId, input.executorId, leaseSeconds],
    );
    await insertRunEvent(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      eventType: "execution_claimed",
      fromStatus: "approved",
      toStatus: "executing",
      actorType: "worker",
      actorId: input.executorId,
    });
    return updated.rows[0];
  });
  return claimed.enabled && claimed.value ? mapRun(claimed.value) : null;
}

export async function completeNextApprovedNoEffectAiAutomationRun(input: {
  executorId: string;
}): Promise<AiAutomationRunSnapshot | null> {
  if (!SAFE_WORKER_PATTERN.test(input.executorId)) {
    throw new Error("ai_automation_executor_id_invalid");
  }
  const completed = await withTx(async (client) => {
    const selected = await client.query<RunRow>(
      `SELECT run.*
         FROM ai_automation_runs run
         JOIN ai_automation_policies policy
           ON policy.tenant_id = run.tenant_id
          AND policy.workspace_id = run.workspace_id
          AND policy.workflow_id = run.workflow_id
        WHERE run.status = 'approved'
          AND run.external_effect = 'none'
          AND run.expires_at > NOW()
          AND policy.enabled
          AND policy.policy_version = run.policy_version
        ORDER BY run.approved_at ASC, run.created_at ASC, run.id ASC
        FOR UPDATE OF run SKIP LOCKED
        LIMIT 1`,
    );
    const run = selected.rows[0];
    if (!run) return null;
    await client.query(
      `UPDATE ai_automation_runs
          SET status = 'executing', lease_owner = $2,
              lease_expires_at = NOW() + INTERVAL '60 seconds'
        WHERE id = $1::uuid`,
      [run.id, input.executorId],
    );
    await insertRunEvent(client, {
      tenantId: run.tenant_id,
      workspaceId: run.workspace_id,
      runId: run.id,
      eventType: "execution_claimed",
      fromStatus: "approved",
      toStatus: "executing",
      actorType: "worker",
      actorId: input.executorId,
      metadata: { mode: "internal_no_effect" },
    });
    const updated = await client.query<RunRow>(
      `UPDATE ai_automation_runs
          SET status = 'completed', lease_owner = NULL, lease_expires_at = NULL,
              failure_code = NULL
        WHERE id = $1::uuid
        RETURNING *`,
      [run.id],
    );
    await insertRunEvent(client, {
      tenantId: run.tenant_id,
      workspaceId: run.workspace_id,
      runId: run.id,
      eventType: "completed",
      fromStatus: "executing",
      toStatus: "completed",
      actorType: "worker",
      actorId: input.executorId,
      metadata: { mode: "internal_no_effect" },
    });
    return updated.rows[0];
  });
  return completed.enabled && completed.value ? mapRun(completed.value) : null;
}

export async function finalizeAiAutomationExecution(input: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  executorId: string;
  outcome: "completed" | "failed";
  failureCode?: string | null;
}): Promise<boolean> {
  if (
    !SAFE_WORKER_PATTERN.test(input.executorId) ||
    (input.outcome === "failed" &&
      (!input.failureCode || !SAFE_FAILURE_PATTERN.test(input.failureCode)))
  ) {
    throw new Error("ai_automation_execution_result_invalid");
  }
  const transaction = await withTx(async (client) => {
    const run = await client.query<RunRow>(
      `SELECT * FROM ai_automation_runs
        WHERE id = $1::uuid AND tenant_id = $2 AND workspace_id = $3
        FOR UPDATE`,
      [input.runId, input.tenantId, input.workspaceId],
    );
    const row = run.rows[0];
    if (
      row?.status !== "executing" ||
      row.lease_owner !== input.executorId ||
      !row.lease_expires_at
    ) {
      return false;
    }
    const updated = await client.query<{ id: string }>(
      `UPDATE ai_automation_runs
          SET status = $2, lease_owner = NULL, lease_expires_at = NULL,
              failure_code = $3
        WHERE id = $1::uuid
          AND status = 'executing'
          AND lease_owner = $4
          AND lease_expires_at > NOW()
        RETURNING id`,
      [
        input.runId,
        input.outcome,
        input.outcome === "failed" ? input.failureCode : null,
        input.executorId,
      ],
    );
    if (!updated.rows[0]) return false;
    await insertRunEvent(client, {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      eventType: input.outcome,
      fromStatus: "executing",
      toStatus: input.outcome,
      actorType: "worker",
      actorId: input.executorId,
      metadata: input.failureCode ? { failure_code: input.failureCode } : {},
    });
    return true;
  });
  return transaction.enabled && transaction.value;
}

export function validateAiAutomationStoreInput(input: {
  workflowId: unknown;
  dataClass: unknown;
}): boolean {
  return (
    AI_AUTOMATION_POLICIES.some((item) => item.id === input.workflowId) &&
    isAiDataClass(input.dataClass)
  );
}
