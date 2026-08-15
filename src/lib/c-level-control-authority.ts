import "server-only";

import type { PoolClient } from "pg";

export const C_LEVEL_CONTROL_POLICY_VERSION = "c-level-control-v1";

export const C_LEVEL_CONTROLLED_ACTIONS = [
  "academy_mastery.publish",
  "arena_cash_reward.execute",
  "academy_credential.lifecycle_sensitive",
] as const;

export type CLevelControlledAction = typeof C_LEVEL_CONTROLLED_ACTIONS[number];

export type CLevelApprovalEvidence = {
  approvalRequestId: string;
  action: CLevelControlledAction;
  resourceType: string;
  resourceId: string;
  requestedByAdminId: string;
  reviewedByAdminId: string;
  reviewedByRoles: string[];
  reviewedAt: string;
  expiresAt: string;
  policyVersion: typeof C_LEVEL_CONTROL_POLICY_VERSION;
};

type Queryable = Pick<PoolClient, "query">;

type ApprovalRow = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  payload: unknown;
  requested_by: string;
  reviewed_by: string;
  reviewed_roles: unknown;
  reviewed_at: Date | string;
  expires_at: Date | string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

const REVIEWER_ROLES: Record<CLevelControlledAction, readonly string[]> = {
  "academy_mastery.publish": ["super_admin", "compliance_approver"],
  "arena_cash_reward.execute": ["super_admin", "compliance_approver", "treasury_approver"],
  "academy_credential.lifecycle_sensitive": ["super_admin", "compliance_approver"],
};

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((role): role is string => typeof role === "string" && role.length > 0))]
    .sort();
}

function assertScope(tenantId: string, workspaceId: string): void {
  if (!SCOPE_PATTERN.test(tenantId) || !SCOPE_PATTERN.test(workspaceId)) {
    throw new Error("c_level_scope_invalid");
  }
}

function assertControlledAction(action: string): asserts action is CLevelControlledAction {
  if (!(C_LEVEL_CONTROLLED_ACTIONS as readonly string[]).includes(action)) {
    throw new Error("c_level_action_invalid");
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function cLevelApprovalResourceId(input: {
  tenantId: string;
  workspaceId: string;
  resourceId: string;
}): string {
  return `${input.tenantId}/${input.workspaceId}/${input.resourceId}`;
}

export async function requestCLevelApprovalTx(
  client: Queryable,
  input: {
    tenantId: string;
    workspaceId: string;
    action: CLevelControlledAction;
    resourceType: string;
    resourceId: string;
    requestedByAdminId: string;
    reason: string;
    payload?: Record<string, unknown>;
    expiresInDays?: number;
  },
): Promise<{ approvalRequestId: string; expiresAt: string }> {
  assertScope(input.tenantId, input.workspaceId);
  assertControlledAction(input.action);
  if (!UUID_PATTERN.test(input.requestedByAdminId)) throw new Error("c_level_requester_invalid");
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 20) throw new Error("c_level_reason_too_short");
  const expiresInDays = Math.max(1, Math.min(30, Math.floor(Number(input.expiresInDays) || 7)));
  const resourceId = cLevelApprovalResourceId(input);
  const payload = {
    ...record(input.payload),
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    controlledAction: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    controlPolicyVersion: C_LEVEL_CONTROL_POLICY_VERSION,
  };

  const result = await client.query<{ id: string; expires_at: Date | string }>(
    `INSERT INTO admin_approval_requests
       (action, resource_type, resource_id, payload, reason, status, requested_by, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, 'pending', $6::uuid, NOW() + ($7::int * INTERVAL '1 day'))
     RETURNING id::text AS id, expires_at`,
    [
      input.action,
      input.resourceType,
      resourceId,
      JSON.stringify(payload),
      reason,
      input.requestedByAdminId,
      expiresInDays,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("c_level_approval_request_not_recorded");
  return {
    approvalRequestId: row.id,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function requireCLevelApprovalTx(
  client: Queryable,
  input: {
    tenantId: string;
    workspaceId: string;
    action: CLevelControlledAction;
    resourceType: string;
    resourceId: string;
    approvalRequestId?: string | null;
  },
): Promise<CLevelApprovalEvidence> {
  assertScope(input.tenantId, input.workspaceId);
  assertControlledAction(input.action);
  const approvalRequestId = String(input.approvalRequestId ?? "").trim();
  if (!UUID_PATTERN.test(approvalRequestId)) throw new Error("c_level_approval_required");
  const scopedResourceId = cLevelApprovalResourceId(input);
  const result = await client.query<ApprovalRow>(
    `SELECT request.id::text AS id,
            request.action,
            request.resource_type,
            request.resource_id,
            request.payload,
            request.requested_by::text AS requested_by,
            request.reviewed_by::text AS reviewed_by,
            request.reviewed_at,
            request.expires_at,
            COALESCE((
              SELECT jsonb_agg(DISTINCT role.role_id)
                FROM admin_user_roles role
               WHERE role.admin_id = request.reviewed_by
                 AND role.revoked_at IS NULL
            ), '[]'::jsonb) AS reviewed_roles
       FROM admin_approval_requests request
       JOIN admin_users reviewer
         ON reviewer.id = request.reviewed_by
        AND reviewer.status = 'active'
      WHERE request.id = $1::uuid
        AND request.action = $2
        AND request.resource_type = $3
        AND request.resource_id = $4
        AND request.status = 'approved'
        AND request.expires_at > NOW()
        AND request.payload ->> 'tenantId' = $5
        AND request.payload ->> 'workspaceId' = $6
        AND request.payload ->> 'controlledAction' = $2
        AND request.payload ->> 'controlPolicyVersion' = $7
      LIMIT 1
      FOR SHARE OF request`,
    [
      approvalRequestId,
      input.action,
      input.resourceType,
      scopedResourceId,
      input.tenantId,
      input.workspaceId,
      C_LEVEL_CONTROL_POLICY_VERSION,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("c_level_approval_required");
  const reviewedRoles = normalizeRoles(row.reviewed_roles);
  const allowedRoles = REVIEWER_ROLES[input.action];
  if (!reviewedRoles.some((role) => allowedRoles.includes(role))) {
    throw new Error("c_level_reviewer_role_required");
  }
  const payload = record(row.payload);
  if (payload.resourceId !== input.resourceId || payload.resourceType !== input.resourceType) {
    throw new Error("c_level_approval_resource_mismatch");
  }
  return {
    approvalRequestId: row.id,
    action: input.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    requestedByAdminId: row.requested_by,
    reviewedByAdminId: row.reviewed_by,
    reviewedByRoles: reviewedRoles,
    reviewedAt: new Date(row.reviewed_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    policyVersion: C_LEVEL_CONTROL_POLICY_VERSION,
  };
}
