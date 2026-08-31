import type { PoolClient } from "pg";
import {
  computeAdminAuditHash,
  redactAdminAuditValue,
  type AdminAuditInput,
} from "@/lib/admin-control-plane";

type AiAdminAuditInput = AdminAuditInput & {
  actorAdminId: string;
  sessionId: string;
};

type AuditHeadRow = {
  event_id: string;
  previous_hash: string | null;
  created_at: string | Date;
};

/**
 * Appends an AI control-plane audit event without granting the tenant runtime
 * role direct access to the global audit relation. The first database function
 * holds the canonical chain advisory lock for the surrounding transaction;
 * the second validates actor scope and inserts the pre-hashed event.
 */
export async function writeAiAdminAuditEvent(
  client: PoolClient,
  input: AiAdminAuditInput,
): Promise<{ id: string; eventHash: string; createdAt: string }> {
  if (input.approvalRequestId) {
    throw new Error("ai_admin_audit_approval_request_forbidden");
  }
  const head = await client.query<AuditHeadRow>(
    "SELECT event_id, previous_hash, created_at FROM tecpey_ai_lock_admin_audit_head()",
  );
  const row = head.rows[0];
  if (!row) throw new Error("ai_admin_audit_head_unavailable");

  const createdAt = new Date(row.created_at).toISOString();
  const beforeState = input.beforeState === undefined
    ? null
    : redactAdminAuditValue(input.beforeState);
  const afterState = input.afterState === undefined
    ? null
    : redactAdminAuditValue(input.afterState);
  const effectiveRoles = [...new Set(input.effectiveRoles)].sort();
  const hashPayload: Record<string, unknown> = {
    id: row.event_id,
    createdAt,
    actorAdminId: input.actorAdminId,
    sessionId: input.sessionId,
    effectiveRoles,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    requestId: input.requestId ?? null,
    sourceIp: input.sourceIp ?? null,
    userAgent: input.userAgent ?? null,
    reason: input.reason ?? null,
    beforeState,
    afterState,
    approvalRequestId: null,
    outcome: input.outcome ?? "success",
    errorCode: input.errorCode ?? null,
  };
  const eventHash = computeAdminAuditHash(row.previous_hash, hashPayload);

  const inserted = await client.query<{
    event_id: string;
    event_hash: string;
    created_at: string | Date;
  }>(
    `SELECT event_id, event_hash, created_at
       FROM tecpey_ai_append_admin_audit(
         $1::uuid, $2::timestamptz, $3::uuid, $4::uuid, $5::jsonb,
         $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb,
         $15, $16, $17, $18
       )`,
    [
      row.event_id,
      createdAt,
      input.actorAdminId,
      input.sessionId,
      JSON.stringify(effectiveRoles),
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.requestId ?? null,
      input.sourceIp ?? null,
      input.userAgent ?? null,
      input.reason ?? null,
      beforeState === null ? null : JSON.stringify(beforeState),
      afterState === null ? null : JSON.stringify(afterState),
      input.outcome ?? "success",
      input.errorCode ?? null,
      row.previous_hash,
      eventHash,
    ],
  );
  const event = inserted.rows[0];
  if (
    event?.event_id !== row.event_id ||
    event.event_hash !== eventHash ||
    new Date(event.created_at).toISOString() !== createdAt
  ) {
    throw new Error("ai_admin_audit_insert_evidence_mismatch");
  }
  return { id: row.event_id, eventHash, createdAt };
}
