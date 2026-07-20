import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { hashApiCommand } from "./api-command-idempotency";

const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const TENANT_PATTERN = /^[a-z][a-z0-9._-]{1,79}$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9._:-]{2,119}$/;
const FORBIDDEN_METADATA_KEYS = new Set([
  "token",
  "device_token",
  "content",
  "message",
  "messages",
  "conversation",
  "conversations",
  "secret",
  "password",
  "email",
  "phone",
  "raw",
  "body",
  "authorization",
  "cookie",
]);

export type SensitiveAuditOutcome = "success" | "no_op" | "rejected" | "failed";

export type SensitiveMutationAuditAction =
  | "device_token.register"
  | "mentor_conversations.migrate"
  | "mentor_profile.recompute"
  | "api_key.create"
  | "api_key.enable"
  | "api_key.disable"
  | "api_key.rotate"
  | "api_key.delete"
  | "credential.password.change"
  | "credential.2fa.enroll.start"
  | "credential.2fa.enable"
  | "credential.2fa.disable"
  | "credential.2fa.backup.consume";

export type SensitiveMutationAuditResource =
  | "device_token"
  | "mentor_conversations"
  | "mentor_profile"
  | "api_key"
  | "credential_account"
  | "credential_2fa";

export type SensitiveMutationAuditEvent = {
  tenantId: string;
  actorType: "student" | "user" | "admin" | "service";
  actorId: string;
  action: SensitiveMutationAuditAction;
  resourceType: SensitiveMutationAuditResource;
  resourceId: string;
  outcome: SensitiveAuditOutcome;
  correlationId: string;
  requestHash: string;
  metadata?: Record<string, unknown>;
};

type ExistingAuditRow = {
  id: string;
  actor_type: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  outcome: string;
  request_hash: string;
  metadata: Record<string, unknown>;
};

export function resolveSensitiveAuditCorrelation(value: string | null): string {
  const candidate = String(value ?? "").trim();
  return CORRELATION_PATTERN.test(candidate)
    ? candidate
    : `audit-${randomUUID()}`;
}

export function hashSensitiveAuditRequest(value: unknown): string {
  return hashApiCommand(value);
}

function assertSafeMetadata(value: unknown, path = "metadata"): void {
  if (value === null || value === undefined) return;
  if (["string", "number", "boolean"].includes(typeof value)) {
    if (typeof value === "string" && value.length > 1000) {
      throw new Error(`sensitive_audit_value_too_large:${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error(`sensitive_audit_array_too_large:${path}`);
    value.forEach((entry, index) => assertSafeMetadata(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`unsupported_sensitive_audit_value:${path}`);
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) {
      throw new Error(`forbidden_sensitive_audit_key:${key}`);
    }
    assertSafeMetadata(entry, `${path}.${key}`);
  }
}

function validateEvent(event: SensitiveMutationAuditEvent): Record<string, unknown> {
  if (!TENANT_PATTERN.test(event.tenantId)) {
    throw new Error("invalid_sensitive_audit_tenant");
  }
  if (!/^[a-z][a-z0-9._-]{1,39}$/.test(event.actorType)) {
    throw new Error("invalid_sensitive_audit_actor_type");
  }
  if (!event.actorId || event.actorId.length > 300) {
    throw new Error("invalid_sensitive_audit_actor");
  }
  if (!TOKEN_PATTERN.test(event.action)) {
    throw new Error("invalid_sensitive_audit_action");
  }
  if (!TOKEN_PATTERN.test(event.resourceType)) {
    throw new Error("invalid_sensitive_audit_resource_type");
  }
  if (!event.resourceId || event.resourceId.length > 300) {
    throw new Error("invalid_sensitive_audit_resource");
  }
  if (!CORRELATION_PATTERN.test(event.correlationId)) {
    throw new Error("invalid_sensitive_audit_correlation");
  }
  if (!/^[0-9a-f]{64}$/.test(event.requestHash)) {
    throw new Error("invalid_sensitive_audit_request_hash");
  }
  const metadata = event.metadata ?? {};
  assertSafeMetadata(metadata);
  const encoded = JSON.stringify(metadata);
  if (Buffer.byteLength(encoded, "utf8") > 16_384) {
    throw new Error("sensitive_audit_metadata_too_large");
  }
  return JSON.parse(encoded) as Record<string, unknown>;
}

function sameJson(left: unknown, right: unknown): boolean {
  return hashApiCommand(left) === hashApiCommand(right);
}

export async function writeSensitiveMutationAuditTx(
  client: PoolClient,
  event: SensitiveMutationAuditEvent,
): Promise<string> {
  const metadata = validateEvent(event);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO sensitive_mutation_audit_events
       (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        outcome, correlation_id, request_hash, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (tenant_id, action, correlation_id) DO NOTHING
     RETURNING id`,
    [
      event.tenantId,
      event.actorType,
      event.actorId,
      event.action,
      event.resourceType,
      event.resourceId,
      event.outcome,
      event.correlationId,
      event.requestHash,
      JSON.stringify(metadata),
    ],
  );
  if (inserted.rows[0]?.id) return inserted.rows[0].id;

  const existing = await client.query<ExistingAuditRow>(
    `SELECT id, actor_type, actor_id, resource_type, resource_id,
            outcome, request_hash, metadata
       FROM sensitive_mutation_audit_events
      WHERE tenant_id = $1
        AND action = $2
        AND correlation_id = $3
      LIMIT 1`,
    [event.tenantId, event.action, event.correlationId],
  );
  const row = existing.rows[0];
  if (
    !row ||
    row.actor_type !== event.actorType ||
    row.actor_id !== event.actorId ||
    row.resource_type !== event.resourceType ||
    row.resource_id !== event.resourceId ||
    row.outcome !== event.outcome ||
    row.request_hash !== event.requestHash ||
    !sameJson(row.metadata, metadata)
  ) {
    throw new Error("sensitive_audit_correlation_conflict");
  }
  return row.id;
}
