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

export type AuthProviderEvidenceRow = {
  provider_id: string;
  gate_id: string;
  evidence_state: AuthProviderEvidenceState;
  expires_at: string | Date | null;
};

export type AuthProviderEvidenceByProvider = Partial<Record<AuthProviderId, AuthProviderEvidence>>;

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

function isAuthProviderEvidenceMutationError(
  value: NormalizedEvidenceMutation | AuthProviderEvidenceMutationError,
): value is AuthProviderEvidenceMutationError {
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
