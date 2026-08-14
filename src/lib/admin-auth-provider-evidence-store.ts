import type { PoolClient } from "pg";
import { writeAdminAuditEvent } from "./admin-control-plane";
import { withDb, withTx } from "./db";
import { hashApiCommand } from "./security/api-command-idempotency";
import {
  isAuthProviderEvidenceGateId,
  isAuthProviderId,
  type AuthProviderEvidence,
  type AuthProviderEvidenceGateId,
  type AuthProviderId,
} from "./admin-auth-provider-control-plane";

export type AuthProviderEvidenceState = "missing" | "ready" | "rejected" | "expired";
export type AuthProviderEvidenceAction = "mark_missing" | "mark_ready" | "reject" | "expire";
export type AuthProviderReviewRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "executed";

export type AuthProviderEvidenceScope = {
  tenantId: string;
  workspaceId: string;
};

export type AuthProviderEvidenceMutationInput = AuthProviderEvidenceScope & {
  actorAdminId: string;
  providerId: AuthProviderId;
  gateId: AuthProviderEvidenceGateId;
  action: AuthProviderEvidenceAction;
  evidenceRef?: string | null;
  evidenceSha256?: string | null;
  expiresAt?: string | null;
  decisionNote?: string | null;
};

export type AuthProviderReviewRequestInput = AuthProviderEvidenceScope & {
  actorAdminId: string;
  sessionId: string | null;
  effectiveRoles: string[];
  providerId: AuthProviderId;
  requestedState: "enabled" | "disabled";
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
};

export type AuthProviderReviewDecisionAction = "approve" | "reject";

export type AuthProviderReviewDecisionInput = AuthProviderEvidenceScope & {
  actorAdminId: string;
  sessionId: string | null;
  effectiveRoles: string[];
  approvalRequestId: string;
  decision: AuthProviderReviewDecisionAction;
  decisionNote?: string | null;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
};

export type AuthProviderEvidenceMutationDecision =
  | {
      ok: true;
      providerId: AuthProviderId;
      gateId: AuthProviderEvidenceGateId;
      action: AuthProviderEvidenceAction;
      evidenceState: AuthProviderEvidenceState;
      eventId: string;
      evidenceByProvider: AuthProviderEvidenceByProvider;
    }
  | {
      ok: false;
      error:
        | "auth_provider_evidence_unavailable"
        | "invalid_auth_provider_evidence_request"
        | "auth_provider_evidence_secret_like_input"
        | "auth_provider_evidence_ready_requires_reference"
        | "auth_provider_evidence_reason_required"
        | "auth_provider_evidence_expiry_invalid";
      httpStatus: 400 | 422 | 503;
    };
type AuthProviderEvidenceMutationError = Extract<AuthProviderEvidenceMutationDecision, { ok: false }>;

export type AuthProviderReviewRequestDecision =
  | {
      ok: true;
      approvalRequestId: string;
      auditEventId: string;
      status: "pending";
      expiresAt: string;
    }
  | {
      ok: false;
      error: "auth_provider_review_request_unavailable";
      httpStatus: 503;
    };

export type AuthProviderReviewDecisionResult =
  | {
      ok: true;
      approvalRequestId: string;
      providerId: Exclude<AuthProviderId, "passkey">;
      requestedState: "enabled" | "disabled";
      status: "approved" | "rejected";
      reviewedAt: string;
      reviewedByAdminId: string;
      auditEventId: string;
      auditEventHash: string;
      reviewRequestsByProvider: AuthProviderReviewRequestsByProvider;
    }
  | {
      ok: false;
      error:
        | "invalid_auth_provider_review_decision_request"
        | "auth_provider_review_decision_reason_required"
        | "auth_provider_review_decision_secret_like_input"
        | "auth_provider_review_request_not_found"
        | "auth_provider_review_request_not_pending"
        | "auth_provider_review_request_expired"
        | "auth_provider_review_request_self_review_forbidden"
        | "auth_provider_review_decision_unavailable";
      httpStatus: 400 | 403 | 404 | 409 | 422 | 503;
    };
type AuthProviderReviewDecisionError = Extract<AuthProviderReviewDecisionResult, { ok: false }>;

export type AuthProviderEvidenceRow = {
  provider_id: string;
  gate_id: string;
  evidence_state: AuthProviderEvidenceState;
  expires_at: string | Date | null;
};

export type AuthProviderEvidenceByProvider = Partial<Record<AuthProviderId, AuthProviderEvidence>>;

export type AuthProviderReviewRequestRow = {
  id: string;
  action: string;
  resource_id: string | null;
  payload: unknown;
  reason: string;
  status: string;
  requested_by: string;
  reviewed_by: string | null;
  requested_at: string | Date;
  reviewed_at: string | Date | null;
  expires_at: string | Date;
  executed_at: string | Date | null;
  audit_event_id: string | null;
  audit_event_hash: string | null;
};

export type AuthProviderReviewRequest = {
  id: string;
  providerId: Exclude<AuthProviderId, "passkey">;
  requestedState: "enabled" | "disabled";
  action: "auth_provider.request_enable" | "auth_provider.request_disable";
  status: AuthProviderReviewRequestStatus;
  reason: string;
  requestedByAdminId: string;
  reviewedByAdminId: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  expiresAt: string;
  executedAt: string | null;
  auditEventId: string | null;
  auditEventHash: string | null;
};

export type AuthProviderReviewRequestsByProvider = Partial<Record<AuthProviderId, AuthProviderReviewRequest[]>>;

type NormalizedEvidenceMutation = {
  tenantId: string;
  workspaceId: string;
  actorAdminId: string;
  providerId: Exclude<AuthProviderId, "passkey">;
  gateId: AuthProviderEvidenceGateId;
  action: AuthProviderEvidenceAction;
  evidenceState: AuthProviderEvidenceState;
  evidenceRef: string | null;
  evidenceSha256: string | null;
  expiresAt: string | null;
  decisionNote: string | null;
  requestHash: string;
};

type NormalizedReviewDecision = {
  tenantId: string;
  workspaceId: string;
  actorAdminId: string;
  approvalRequestId: string;
  decision: AuthProviderReviewDecisionAction;
  status: "approved" | "rejected";
  decisionNote: string;
  requestHash: string;
};

function isAuthProviderEvidenceMutationError(
  value: NormalizedEvidenceMutation | AuthProviderEvidenceMutationError,
): value is AuthProviderEvidenceMutationError {
  return "ok" in value && value.ok === false;
}

function isAuthProviderReviewDecisionError(
  value: NormalizedReviewDecision | AuthProviderReviewDecisionError,
): value is AuthProviderReviewDecisionError {
  return "ok" in value && value.ok === false;
}

const ACTION_TO_STATE: Record<AuthProviderEvidenceAction, AuthProviderEvidenceState> = {
  mark_missing: "missing",
  mark_ready: "ready",
  reject: "rejected",
  expire: "expired",
};

const FORBIDDEN_RAW_SECRET_PATTERN =
  /(-----BEGIN|-----END|bearer\s+[a-z0-9._-]+|password\s*[=:]|secret\s*[=:]|token\s*[=:]|private[_ -]?key\s*[=:]|authorization\s*[=:]|cookie\s*[=:])/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeText(value: unknown, max: number): string | null {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
  return text.length > 0 ? text : null;
}

function validateReference(value: unknown): string | null {
  const text = safeText(value, 255);
  return text && /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,255}$/.test(text) ? text : null;
}

function validateSha256(value: unknown): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(text) ? text : null;
}

function validateFutureIso(value: unknown, now = new Date()): string | null {
  const text = safeText(value, 80);
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime()) || date <= now) return null;
  return date.toISOString();
}

function hasSecretLikeInput(...values: Array<string | null>): boolean {
  return values.some((value) => value !== null && FORBIDDEN_RAW_SECRET_PATTERN.test(value));
}

function timestampToIso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isAuthProviderReviewRequestStatus(value: string): value is AuthProviderReviewRequestStatus {
  return ["pending", "approved", "rejected", "expired", "cancelled", "executed"].includes(value);
}

function payloadRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function normalizeAuthProviderReviewRequestRow(
  row: AuthProviderReviewRequestRow,
  scope: AuthProviderEvidenceScope,
): AuthProviderReviewRequest | null {
  const action = row.action === "auth_provider.request_enable"
    ? row.action
    : row.action === "auth_provider.request_disable"
      ? row.action
      : null;
  const requestedState = action === "auth_provider.request_enable" ? "enabled" : "disabled";
  if (!action || !isAuthProviderReviewRequestStatus(row.status)) return null;

  const payload = payloadRecord(row.payload);
  const providerId = isAuthProviderId(payload?.providerId) && payload.providerId !== "passkey"
    ? payload.providerId
    : null;
  if (!payload || !providerId) return null;

  const tenantId = safeText(payload.tenantId, 128);
  const workspaceId = safeText(payload.workspaceId, 128);
  const payloadRequestedState = safeText(payload.requestedState, 32);
  const expectedResourceId = `${scope.tenantId}/${scope.workspaceId}/${providerId}`;
  if (
    tenantId !== scope.tenantId ||
    workspaceId !== scope.workspaceId ||
    payloadRequestedState !== requestedState ||
    row.resource_id !== expectedResourceId
  ) {
    return null;
  }

  const requestedAt = timestampToIso(row.requested_at);
  const expiresAt = timestampToIso(row.expires_at);
  if (!requestedAt || !expiresAt) return null;

  return {
    id: row.id,
    providerId,
    requestedState,
    action,
    status: row.status,
    reason: safeText(row.reason, 500) ?? "",
    requestedByAdminId: row.requested_by,
    reviewedByAdminId: row.reviewed_by,
    requestedAt,
    reviewedAt: timestampToIso(row.reviewed_at),
    expiresAt,
    executedAt: timestampToIso(row.executed_at),
    auditEventId: row.audit_event_id,
    auditEventHash: row.audit_event_hash,
  };
}

export function normalizeAuthProviderReviewDecision(
  input: AuthProviderReviewDecisionInput,
): NormalizedReviewDecision | AuthProviderReviewDecisionError {
  const approvalRequestId = safeText(input.approvalRequestId, 80);
  const decision = input.decision === "approve" || input.decision === "reject" ? input.decision : null;
  const decisionNote = safeText(input.decisionNote, 500);

  if (!approvalRequestId || !UUID_PATTERN.test(approvalRequestId) || !decision) {
    return { ok: false, error: "invalid_auth_provider_review_decision_request", httpStatus: 400 };
  }
  if (!decisionNote || decisionNote.length < 10) {
    return { ok: false, error: "auth_provider_review_decision_reason_required", httpStatus: 422 };
  }
  if (hasSecretLikeInput(decisionNote)) {
    return { ok: false, error: "auth_provider_review_decision_secret_like_input", httpStatus: 422 };
  }

  const normalized = {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorAdminId: input.actorAdminId,
    approvalRequestId: approvalRequestId.toLowerCase(),
    decision,
    status: decision === "approve" ? "approved" : "rejected",
    decisionNote,
  } satisfies Omit<NormalizedReviewDecision, "requestHash">;

  return {
    ...normalized,
    requestHash: hashApiCommand(normalized),
  };
}

export function normalizeAuthProviderEvidenceMutation(
  input: AuthProviderEvidenceMutationInput,
  now = new Date(),
): NormalizedEvidenceMutation | AuthProviderEvidenceMutationError {
  const providerId = input.providerId === "passkey" ? null : input.providerId;
  const action = ACTION_TO_STATE[input.action] ? input.action : null;
  if (!providerId || !isAuthProviderId(providerId) || !isAuthProviderEvidenceGateId(input.gateId) || !action) {
    return { ok: false, error: "invalid_auth_provider_evidence_request", httpStatus: 400 };
  }

  const rawEvidenceRef = safeText(input.evidenceRef, 255);
  const evidenceRef = input.action === "mark_missing" ? null : validateReference(input.evidenceRef);
  const evidenceSha256 = input.action === "mark_missing" ? null : validateSha256(input.evidenceSha256);
  const decisionNote = safeText(input.decisionNote, 500);
  const expiresAt = input.action === "mark_ready" && input.expiresAt
    ? validateFutureIso(input.expiresAt, now)
    : null;

  if (hasSecretLikeInput(rawEvidenceRef, decisionNote)) {
    return { ok: false, error: "auth_provider_evidence_secret_like_input", httpStatus: 422 };
  }

  if (input.action === "mark_ready") {
    if (!evidenceRef || !evidenceSha256) {
      return { ok: false, error: "auth_provider_evidence_ready_requires_reference", httpStatus: 422 };
    }
    if (input.expiresAt && !expiresAt) {
      return { ok: false, error: "auth_provider_evidence_expiry_invalid", httpStatus: 422 };
    }
  }

  if (decisionNote && decisionNote.length < 3) {
    return { ok: false, error: "auth_provider_evidence_reason_required", httpStatus: 422 };
  }

  if (input.action !== "mark_ready" && !decisionNote) {
    return { ok: false, error: "auth_provider_evidence_reason_required", httpStatus: 422 };
  }

  const normalized = {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    actorAdminId: input.actorAdminId,
    providerId,
    gateId: input.gateId,
    action: input.action,
    evidenceState: ACTION_TO_STATE[input.action],
    evidenceRef,
    evidenceSha256,
    expiresAt,
    decisionNote,
  } satisfies Omit<NormalizedEvidenceMutation, "requestHash">;

  return {
    ...normalized,
    requestHash: hashApiCommand(normalized),
  };
}

function rowIsReady(row: AuthProviderEvidenceRow, now: Date): boolean {
  if (row.evidence_state !== "ready") return false;
  if (!row.expires_at) return true;
  const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  return Number.isFinite(expiresAt.getTime()) && expiresAt > now;
}

export function evidenceByProviderFromRows(
  rows: readonly AuthProviderEvidenceRow[],
  now = new Date(),
): AuthProviderEvidenceByProvider {
  const evidenceByProvider: AuthProviderEvidenceByProvider = {};

  for (const row of rows) {
    if (!isAuthProviderId(row.provider_id) || row.provider_id === "passkey") continue;
    if (!isAuthProviderEvidenceGateId(row.gate_id)) continue;
    if (!rowIsReady(row, now)) continue;

    evidenceByProvider[row.provider_id] = {
      ...evidenceByProvider[row.provider_id],
      [row.gate_id]: true,
    };
  }

  return evidenceByProvider;
}

export function reviewRequestsByProviderFromRows(
  rows: readonly AuthProviderReviewRequestRow[],
  scope: AuthProviderEvidenceScope,
  limitPerProvider = 5,
): AuthProviderReviewRequestsByProvider {
  const reviewRequestsByProvider: AuthProviderReviewRequestsByProvider = {};
  const normalizedLimit = Math.max(1, Math.min(limitPerProvider, 20));

  for (const row of rows) {
    const reviewRequest = normalizeAuthProviderReviewRequestRow(row, scope);
    if (!reviewRequest) continue;

    const current = reviewRequestsByProvider[reviewRequest.providerId] ?? [];
    if (current.length >= normalizedLimit) continue;
    reviewRequestsByProvider[reviewRequest.providerId] = [...current, reviewRequest];
  }

  return reviewRequestsByProvider;
}

async function loadReviewRequestsByProviderTx(
  client: PoolClient,
  scope: AuthProviderEvidenceScope,
  limitPerProvider = 5,
): Promise<AuthProviderReviewRequestsByProvider> {
  const resourcePrefix = `${scope.tenantId}/${scope.workspaceId}/`;
  const queryLimit = Math.max(4, Math.min(limitPerProvider * 4, 50));
  const rows = await client.query<AuthProviderReviewRequestRow>(
    `SELECT request.id::text AS id,
            request.action,
            request.resource_id,
            request.payload,
            request.reason,
            request.status,
            request.requested_by::text AS requested_by,
            request.reviewed_by::text AS reviewed_by,
            request.requested_at,
            request.reviewed_at,
            request.expires_at,
            request.executed_at,
            audit.id::text AS audit_event_id,
            audit.event_hash AS audit_event_hash
       FROM admin_approval_requests request
       LEFT JOIN LATERAL (
            SELECT id, event_hash
              FROM admin_audit_events
             WHERE approval_request_id = request.id
             ORDER BY created_at DESC, id DESC
             LIMIT 1
       ) audit ON TRUE
      WHERE request.resource_type = 'auth_provider'
        AND request.action IN ('auth_provider.request_enable', 'auth_provider.request_disable')
        AND request.resource_id IS NOT NULL
        AND left(request.resource_id, length($1)) = $1
        AND request.payload ->> 'tenantId' = $2
        AND request.payload ->> 'workspaceId' = $3
      ORDER BY request.requested_at DESC, request.id DESC
      LIMIT $4`,
    [resourcePrefix, scope.tenantId, scope.workspaceId, queryLimit],
  );

  return reviewRequestsByProviderFromRows(rows.rows, scope, limitPerProvider);
}

export async function loadAuthProviderEvidenceByProvider(
  scope: AuthProviderEvidenceScope,
): Promise<AuthProviderEvidenceByProvider | "unavailable"> {
  const result = await withDb(async (client) => {
    const rows = await client.query<AuthProviderEvidenceRow>(
      `SELECT provider_id, gate_id, evidence_state, expires_at
         FROM admin_auth_provider_evidence
        WHERE tenant_id = $1
          AND workspace_id = $2
          AND evidence_state = 'ready'
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [scope.tenantId, scope.workspaceId],
    );

    return evidenceByProviderFromRows(rows.rows);
  });

  return result.enabled ? result.value : "unavailable";
}

export async function loadAuthProviderReviewRequestsByProvider(
  scope: AuthProviderEvidenceScope,
  limitPerProvider = 5,
): Promise<AuthProviderReviewRequestsByProvider | "unavailable"> {
  const result = await withDb(async (client) => {
    return loadReviewRequestsByProviderTx(client, scope, limitPerProvider);
  });

  return result.enabled ? result.value : "unavailable";
}

async function loadReadyEvidenceByProviderTx(
  client: PoolClient,
  scope: AuthProviderEvidenceScope,
): Promise<AuthProviderEvidenceByProvider> {
  const rows = await client.query<AuthProviderEvidenceRow>(
    `SELECT provider_id, gate_id, evidence_state, expires_at
       FROM admin_auth_provider_evidence
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND evidence_state = 'ready'
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [scope.tenantId, scope.workspaceId],
  );

  return evidenceByProviderFromRows(rows.rows);
}

export async function applyAuthProviderEvidenceMutation(
  input: AuthProviderEvidenceMutationInput,
): Promise<AuthProviderEvidenceMutationDecision> {
  const normalized = normalizeAuthProviderEvidenceMutation(input);
  if (isAuthProviderEvidenceMutationError(normalized)) return normalized;

  const result = await withTx(async (client) => {
    await client.query(
      `INSERT INTO admin_auth_provider_evidence
         (tenant_id, workspace_id, provider_id, gate_id, evidence_state,
          evidence_ref, evidence_sha256, decision_note, reviewed_by_admin_id,
          reviewed_at, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, NOW(), $10::timestamptz, NOW())
       ON CONFLICT (tenant_id, workspace_id, provider_id, gate_id)
       DO UPDATE SET
         evidence_state = EXCLUDED.evidence_state,
         evidence_ref = EXCLUDED.evidence_ref,
         evidence_sha256 = EXCLUDED.evidence_sha256,
         decision_note = EXCLUDED.decision_note,
         reviewed_by_admin_id = EXCLUDED.reviewed_by_admin_id,
         reviewed_at = EXCLUDED.reviewed_at,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [
        normalized.tenantId,
        normalized.workspaceId,
        normalized.providerId,
        normalized.gateId,
        normalized.evidenceState,
        normalized.evidenceRef,
        normalized.evidenceSha256,
        normalized.decisionNote,
        normalized.actorAdminId,
        normalized.expiresAt,
      ],
    );

    const event = await client.query<{ id: string }>(
      `INSERT INTO admin_auth_provider_evidence_events
         (tenant_id, workspace_id, provider_id, gate_id, action, actor_admin_id,
          request_hash, evidence_state, evidence_ref, evidence_sha256, decision_note,
          expires_at)
       VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12::timestamptz)
       RETURNING id`,
      [
        normalized.tenantId,
        normalized.workspaceId,
        normalized.providerId,
        normalized.gateId,
        normalized.action,
        normalized.actorAdminId,
        normalized.requestHash,
        normalized.evidenceState,
        normalized.evidenceRef,
        normalized.evidenceSha256,
        normalized.decisionNote,
        normalized.expiresAt,
      ],
    );

    const evidenceByProvider = await loadReadyEvidenceByProviderTx(client, normalized);
    return {
      ok: true,
      providerId: normalized.providerId,
      gateId: normalized.gateId,
      action: normalized.action,
      evidenceState: normalized.evidenceState,
      eventId: event.rows[0]?.id ?? "",
      evidenceByProvider,
    } satisfies AuthProviderEvidenceMutationDecision;
  });

  return result.enabled
    ? result.value
    : { ok: false, error: "auth_provider_evidence_unavailable", httpStatus: 503 };
}

export async function submitAuthProviderReviewRequest(
  input: AuthProviderReviewRequestInput,
): Promise<AuthProviderReviewRequestDecision> {
  if (input.providerId === "passkey" || !isAuthProviderId(input.providerId)) {
    return { ok: false, error: "auth_provider_review_request_unavailable", httpStatus: 503 };
  }

  const action = input.requestedState === "enabled"
    ? "auth_provider.request_enable"
    : "auth_provider.request_disable";
  const resourceId = `${input.tenantId}/${input.workspaceId}/${input.providerId}`;
  const reason = `Auth provider ${input.providerId} ${input.requestedState} review requested after evidence gates passed.`;
  const payload = {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    providerId: input.providerId,
    requestedState: input.requestedState,
    status: "accepted_for_review",
  };

  const result = await withTx(async (client) => {
    const request = await client.query<{
      id: string;
      status: "pending";
      expires_at: Date;
    }>(
      `INSERT INTO admin_approval_requests
         (action, resource_type, resource_id, payload, reason, status, requested_by, expires_at)
       VALUES ($1, 'auth_provider', $2, $3::jsonb, $4, 'pending', $5::uuid, NOW() + INTERVAL '7 days')
       RETURNING id::text AS id, status, expires_at`,
      [action, resourceId, JSON.stringify(payload), reason, input.actorAdminId],
    );
    const approval = request.rows[0];
    if (!approval) throw new Error("auth_provider_review_request_not_recorded");

    const audit = await writeAdminAuditEvent(client, {
      actorAdminId: input.actorAdminId,
      sessionId: input.sessionId,
      effectiveRoles: input.effectiveRoles,
      action,
      resourceType: "auth_provider",
      resourceId,
      requestId: input.requestId ?? null,
      sourceIp: input.sourceIp ?? null,
      userAgent: input.userAgent ?? null,
      reason,
      afterState: payload,
      approvalRequestId: approval.id,
      outcome: "success",
    });

    return {
      ok: true,
      approvalRequestId: approval.id,
      auditEventId: audit.id,
      status: approval.status,
      expiresAt: approval.expires_at.toISOString(),
    } satisfies AuthProviderReviewRequestDecision;
  });

  return result.enabled
    ? result.value
    : { ok: false, error: "auth_provider_review_request_unavailable", httpStatus: 503 };
}

export async function decideAuthProviderReviewRequest(
  input: AuthProviderReviewDecisionInput,
): Promise<AuthProviderReviewDecisionResult> {
  const normalized = normalizeAuthProviderReviewDecision(input);
  if (isAuthProviderReviewDecisionError(normalized)) return normalized;

  const result = await withTx(async (client) => {
    const resourcePrefix = `${normalized.tenantId}/${normalized.workspaceId}/`;
    const request = await client.query<AuthProviderReviewRequestRow>(
      `SELECT request.id::text AS id,
              request.action,
              request.resource_id,
              request.payload,
              request.reason,
              request.status,
              request.requested_by::text AS requested_by,
              request.reviewed_by::text AS reviewed_by,
              request.requested_at,
              request.reviewed_at,
              request.expires_at,
              request.executed_at,
              NULL::text AS audit_event_id,
              NULL::text AS audit_event_hash
         FROM admin_approval_requests request
        WHERE request.id = $1::uuid
          AND request.resource_type = 'auth_provider'
          AND request.action IN ('auth_provider.request_enable', 'auth_provider.request_disable')
          AND request.resource_id IS NOT NULL
          AND left(request.resource_id, length($2)) = $2
          AND request.payload ->> 'tenantId' = $3
          AND request.payload ->> 'workspaceId' = $4
        FOR UPDATE`,
      [normalized.approvalRequestId, resourcePrefix, normalized.tenantId, normalized.workspaceId],
    );
    const row = request.rows[0];
    if (!row) {
      return { ok: false, error: "auth_provider_review_request_not_found", httpStatus: 404 } satisfies AuthProviderReviewDecisionResult;
    }

    const reviewRequest = normalizeAuthProviderReviewRequestRow(row, normalized);
    if (!reviewRequest) {
      return { ok: false, error: "auth_provider_review_request_not_found", httpStatus: 404 } satisfies AuthProviderReviewDecisionResult;
    }
    const scopedReviewRequest = reviewRequest;
    const decisionInput = normalized;

    const action = decisionInput.decision === "approve"
      ? "auth_provider.review_approve"
      : "auth_provider.review_reject";
    const baseAfterState = {
      tenantId: decisionInput.tenantId,
      workspaceId: decisionInput.workspaceId,
      providerId: scopedReviewRequest.providerId,
      requestedState: scopedReviewRequest.requestedState,
      approvalRequestId: decisionInput.approvalRequestId,
      decision: decisionInput.decision,
      decisionNote: decisionInput.decisionNote,
      requestHash: decisionInput.requestHash,
    };

    async function writeDeniedAudit(errorCode: AuthProviderReviewDecisionError["error"]) {
      await writeAdminAuditEvent(client, {
        actorAdminId: decisionInput.actorAdminId,
        sessionId: input.sessionId,
        effectiveRoles: input.effectiveRoles,
        action,
        resourceType: "auth_provider",
        resourceId: `${decisionInput.tenantId}/${decisionInput.workspaceId}/${scopedReviewRequest.providerId}`,
        requestId: input.requestId ?? null,
        sourceIp: input.sourceIp ?? null,
        userAgent: input.userAgent ?? null,
        reason: decisionInput.decisionNote,
        beforeState: scopedReviewRequest,
        afterState: { ...baseAfterState, status: scopedReviewRequest.status, denied: true, errorCode },
        approvalRequestId: decisionInput.approvalRequestId,
        outcome: "denied",
        errorCode,
      });
    }

    if (reviewRequest.status !== "pending") {
      await writeDeniedAudit("auth_provider_review_request_not_pending");
      return { ok: false, error: "auth_provider_review_request_not_pending", httpStatus: 409 } satisfies AuthProviderReviewDecisionResult;
    }

    if (reviewRequest.requestedByAdminId === normalized.actorAdminId) {
      await writeDeniedAudit("auth_provider_review_request_self_review_forbidden");
      return { ok: false, error: "auth_provider_review_request_self_review_forbidden", httpStatus: 403 } satisfies AuthProviderReviewDecisionResult;
    }

    if (new Date(reviewRequest.expiresAt) <= new Date()) {
      await client.query(
        `UPDATE admin_approval_requests
            SET status = 'expired',
                reviewed_at = NOW()
          WHERE id = $1::uuid
            AND status = 'pending'`,
        [normalized.approvalRequestId],
      );
      await writeDeniedAudit("auth_provider_review_request_expired");
      return { ok: false, error: "auth_provider_review_request_expired", httpStatus: 409 } satisfies AuthProviderReviewDecisionResult;
    }

    const updated = await client.query<{
      status: "approved" | "rejected";
      reviewed_by: string;
      reviewed_at: Date;
    }>(
      `UPDATE admin_approval_requests
          SET status = $2,
              reviewed_by = $3::uuid,
              reviewed_at = NOW()
        WHERE id = $1::uuid
          AND status = 'pending'
          AND requested_by <> $3::uuid
          AND expires_at > NOW()
        RETURNING status, reviewed_by::text AS reviewed_by, reviewed_at`,
      [normalized.approvalRequestId, normalized.status, normalized.actorAdminId],
    );
    const decisionRow = updated.rows[0];
    if (!decisionRow) {
      await writeDeniedAudit("auth_provider_review_request_not_pending");
      return { ok: false, error: "auth_provider_review_request_not_pending", httpStatus: 409 } satisfies AuthProviderReviewDecisionResult;
    }

    const reviewedAt = decisionRow.reviewed_at.toISOString();
    const afterState = {
      ...baseAfterState,
      status: decisionRow.status,
      reviewedByAdminId: decisionRow.reviewed_by,
      reviewedAt,
    };
    const audit = await writeAdminAuditEvent(client, {
      actorAdminId: normalized.actorAdminId,
      sessionId: input.sessionId,
      effectiveRoles: input.effectiveRoles,
      action,
      resourceType: "auth_provider",
      resourceId: `${normalized.tenantId}/${normalized.workspaceId}/${reviewRequest.providerId}`,
      requestId: input.requestId ?? null,
      sourceIp: input.sourceIp ?? null,
      userAgent: input.userAgent ?? null,
      reason: normalized.decisionNote,
      beforeState: reviewRequest,
      afterState,
      approvalRequestId: normalized.approvalRequestId,
      outcome: "success",
    });
    const reviewRequestsByProvider = await loadReviewRequestsByProviderTx(client, normalized);

    return {
      ok: true,
      approvalRequestId: normalized.approvalRequestId,
      providerId: reviewRequest.providerId,
      requestedState: reviewRequest.requestedState,
      status: decisionRow.status,
      reviewedAt,
      reviewedByAdminId: decisionRow.reviewed_by,
      auditEventId: audit.id,
      auditEventHash: audit.eventHash,
      reviewRequestsByProvider,
    } satisfies AuthProviderReviewDecisionResult;
  });

  return result.enabled
    ? result.value
    : { ok: false, error: "auth_provider_review_decision_unavailable", httpStatus: 503 };
}
