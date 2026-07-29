import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

export const API_COMMAND_RECEIPT_RETENTION_DAYS = 90;

export type ApiCommandPrincipalType =
  | "user"
  | "admin"
  | "student"
  | "tenant-student";

export type ApiCommandScope = {
  tenantId: string;
  principalType: ApiCommandPrincipalType;
  principalId: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
};

export type ApiCommandClaim<T extends Record<string, unknown>> =
  | { status: "claimed" }
  | { status: "replayed"; httpStatus: number; response: T }
  | { status: "conflict" }
  | { status: "in_progress" };

type ReceiptRow = {
  request_hash: string;
  status: "processing" | "completed";
  http_status: number | null;
  response_body: unknown;
};

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_api_command_value");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return JSON.stringify(value.toString(10));
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  if (value === undefined) return "null";
  throw new Error("unsupported_api_command_value");
}

export function hashApiCommand(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function parseApiIdempotencyKey(
  headerValue: string | null,
  bodyValue?: unknown,
): string | null {
  const header = String(headerValue ?? "").trim();
  const body = typeof bodyValue === "string" ? bodyValue.trim() : "";
  if (header && body && header !== body) return null;
  const value = header || body;
  return /^[A-Za-z0-9._:-]{16,120}$/.test(value) ? value : null;
}

function validateScope(scope: ApiCommandScope): void {
  if (!/^[a-z][a-z0-9._-]{1,79}$/.test(scope.tenantId)) {
    throw new Error("invalid_api_command_tenant_id");
  }
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(scope.principalType)) {
    throw new Error("invalid_api_command_principal_type");
  }
  if (!scope.principalId || scope.principalId.length > 300) {
    throw new Error("invalid_api_command_principal_id");
  }
  if (!/^[a-z][a-z0-9._:-]{2,119}$/.test(scope.operation)) {
    throw new Error("invalid_api_command_operation");
  }
  if (!/^[A-Za-z0-9._:-]{16,120}$/.test(scope.idempotencyKey)) {
    throw new Error("invalid_api_command_idempotency_key");
  }
  if (!/^[0-9a-f]{64}$/.test(scope.requestHash)) {
    throw new Error("invalid_api_command_request_hash");
  }
}

function receiptLockKey(scope: ApiCommandScope): string {
  return createHash("sha256")
    .update(
      `${scope.tenantId}\0${scope.principalType}\0${scope.principalId}\0${scope.operation}\0${scope.idempotencyKey}`,
    )
    .digest("hex");
}

function responseObject<T extends Record<string, unknown>>(value: unknown): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

export async function claimApiCommandTx<T extends Record<string, unknown>>(
  client: PoolClient,
  scope: ApiCommandScope,
): Promise<ApiCommandClaim<T>> {
  validateScope(scope);
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
    [receiptLockKey(scope)],
  );

  const existing = await client.query<ReceiptRow>(
    `SELECT request_hash, status, http_status, response_body
       FROM api_command_receipts
      WHERE tenant_id = $1
        AND principal_type = $2
        AND principal_id = $3
        AND operation = $4
        AND idempotency_key = $5
      FOR UPDATE`,
    [
      scope.tenantId,
      scope.principalType,
      scope.principalId,
      scope.operation,
      scope.idempotencyKey,
    ],
  );
  const row = existing.rows[0];
  if (row) {
    if (row.request_hash !== scope.requestHash) return { status: "conflict" };
    if (row.status !== "completed") return { status: "in_progress" };
    const response = responseObject<T>(row.response_body);
    if (!response || !row.http_status) throw new Error("api_command_receipt_corrupt");
    return { status: "replayed", httpStatus: row.http_status, response };
  }

  await client.query(
    `INSERT INTO api_command_receipts
       (tenant_id, principal_type, principal_id, operation, idempotency_key,
        request_hash, status, retain_until)
     VALUES ($1, $2, $3, $4, $5, $6, 'processing',
             NOW() + ($7::text || ' days')::interval)`,
    [
      scope.tenantId,
      scope.principalType,
      scope.principalId,
      scope.operation,
      scope.idempotencyKey,
      scope.requestHash,
      String(API_COMMAND_RECEIPT_RETENTION_DAYS),
    ],
  );
  return { status: "claimed" };
}

export async function completeApiCommandTx<T extends Record<string, unknown>>(
  client: PoolClient,
  scope: ApiCommandScope,
  input: { httpStatus: number; response: T },
): Promise<void> {
  validateScope(scope);
  if (!Number.isInteger(input.httpStatus) || input.httpStatus < 200 || input.httpStatus > 499) {
    throw new Error("invalid_api_command_http_status");
  }
  const completed = await client.query(
    `UPDATE api_command_receipts
        SET status = 'completed',
            http_status = $7,
            response_body = $8::jsonb,
            completed_at = NOW(),
            updated_at = NOW()
      WHERE tenant_id = $1
        AND principal_type = $2
        AND principal_id = $3
        AND operation = $4
        AND idempotency_key = $5
        AND request_hash = $6
        AND status = 'processing'`,
    [
      scope.tenantId,
      scope.principalType,
      scope.principalId,
      scope.operation,
      scope.idempotencyKey,
      scope.requestHash,
      input.httpStatus,
      JSON.stringify(input.response),
    ],
  );
  if ((completed.rowCount ?? 0) !== 1) {
    throw new Error("api_command_receipt_completion_failed");
  }
}

export async function purgeExpiredApiCommandReceipts(
  client: PoolClient,
  limit = 1_000,
): Promise<number> {
  const bounded = Math.max(1, Math.min(5_000, Math.trunc(limit)));
  const deleted = await client.query(
    `WITH expired AS (
       SELECT tenant_id, principal_type, principal_id, operation, idempotency_key
         FROM api_command_receipts
        WHERE status = 'completed'
          AND retain_until < NOW()
        ORDER BY retain_until ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM api_command_receipts receipt
      USING expired
      WHERE receipt.tenant_id = expired.tenant_id
        AND receipt.principal_type = expired.principal_type
        AND receipt.principal_id = expired.principal_id
        AND receipt.operation = expired.operation
        AND receipt.idempotency_key = expired.idempotency_key`,
    [bounded],
  );
  return deleted.rowCount ?? 0;
}
