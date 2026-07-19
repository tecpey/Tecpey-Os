import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { withTx } from "../db";

export const COMMAND_IDEMPOTENCY_HEADER = "idempotency-key";
export const DEFAULT_COMMAND_TENANT_ID = "tecpey";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const SCOPE_TOKEN_PATTERN = /^[a-z][a-z0-9._:-]{2,159}$/;

export type CommandIdempotencyScope = {
  tenantId?: string;
  principalType: string;
  principalId: string;
  operation: string;
  ttlSeconds?: number;
  leaseSeconds?: number;
};

export type IdempotentJsonResult = {
  status: number;
  body: Record<string, unknown>;
};

export type IdempotentCommandOutcome =
  | {
      kind: "result";
      replayed: boolean;
      result: IdempotentJsonResult;
    }
  | { kind: "conflict" }
  | { kind: "in_progress"; retryAfterSeconds: number }
  | { kind: "unavailable" }
  | {
      kind: "finalization_unavailable";
      result: IdempotentJsonResult;
    };

type CommandRow = {
  request_hash: string;
  state: "pending" | "completed";
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  lease_until: Date | string | null;
};

type NormalizedScope = Required<
  Pick<CommandIdempotencyScope, "tenantId" | "principalType" | "principalId" | "operation">
> & {
  ttlSeconds: number;
  leaseSeconds: number;
};

type ClaimResult =
  | { kind: "execute" }
  | { kind: "replay"; result: IdempotentJsonResult }
  | { kind: "conflict" }
  | { kind: "in_progress"; retryAfterSeconds: number };

export function parseCommandIdempotencyKey(value: string | null):
  | { ok: true; key: string }
  | { ok: false; error: "idempotency_key_required" | "invalid_idempotency_key" } {
  if (value === null || value.trim().length === 0) {
    return { ok: false, error: "idempotency_key_required" };
  }
  const key = value.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return { ok: false, error: "invalid_idempotency_key" };
  }
  return { ok: true, key };
}

function canonicalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_idempotency_value");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("circular_idempotency_payload");
    seen.add(value);
    const normalized = value.map((entry) => {
      const result = canonicalize(entry, seen);
      return result === undefined ? null : result;
    });
    seen.delete(value);
    return normalized;
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) throw new Error("circular_idempotency_payload");
    seen.add(value as object);
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const result = canonicalize((value as Record<string, unknown>)[key], seen);
      if (result !== undefined) output[key] = result;
    }
    seen.delete(value as object);
    return output;
  }
  if (value === undefined) return undefined;
  throw new Error("unsupported_idempotency_value");
}

export function canonicalCommandPayload(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set()));
}

export function hashCommandPayload(value: unknown): string {
  return createHash("sha256").update(canonicalCommandPayload(value)).digest("hex");
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error("invalid_command_idempotency_duration");
  }
  return value;
}

function normalizeScope(scope: CommandIdempotencyScope): NormalizedScope {
  const tenantId = String(scope.tenantId ?? DEFAULT_COMMAND_TENANT_ID).trim();
  const principalType = String(scope.principalType).trim().toLowerCase();
  const principalId = String(scope.principalId).trim();
  const operation = String(scope.operation).trim().toLowerCase();

  if (tenantId.length < 1 || tenantId.length > 80) throw new Error("invalid_idempotency_tenant");
  if (!/^[a-z][a-z0-9._-]{0,63}$/.test(principalType)) {
    throw new Error("invalid_idempotency_principal_type");
  }
  if (principalId.length < 1 || principalId.length > 220) {
    throw new Error("invalid_idempotency_principal");
  }
  if (!SCOPE_TOKEN_PATTERN.test(operation)) throw new Error("invalid_idempotency_operation");

  return {
    tenantId,
    principalType,
    principalId,
    operation,
    ttlSeconds: boundedInteger(scope.ttlSeconds, 7 * 24 * 60 * 60, 60, 90 * 24 * 60 * 60),
    leaseSeconds: boundedInteger(scope.leaseSeconds, 60, 5, 15 * 60),
  };
}

function validateResult(result: IdempotentJsonResult): IdempotentJsonResult {
  if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599) {
    throw new Error("invalid_idempotent_response_status");
  }
  if (!result.body || typeof result.body !== "object" || Array.isArray(result.body)) {
    throw new Error("invalid_idempotent_response_body");
  }
  const serialized = JSON.stringify(result.body);
  if (serialized.length > 256_000) throw new Error("idempotent_response_too_large");
  return {
    status: result.status,
    body: JSON.parse(serialized) as Record<string, unknown>,
  };
}

function lockKey(scope: NormalizedScope, key: string): string {
  return [
    "api-command-idempotency",
    scope.tenantId,
    scope.principalType,
    scope.principalId,
    scope.operation,
    key,
  ].join(":");
}

async function claimInTransaction(
  client: PoolClient,
  scope: NormalizedScope,
  key: string,
  requestHash: string,
): Promise<ClaimResult> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey(scope, key)]);

  const current = await client.query<CommandRow>(
    `SELECT request_hash,
            state,
            response_status,
            response_body,
            lease_until
       FROM api_command_idempotency
      WHERE tenant_id = $1
        AND principal_type = $2
        AND principal_id = $3
        AND operation = $4
        AND idempotency_key = $5
      FOR UPDATE`,
    [scope.tenantId, scope.principalType, scope.principalId, scope.operation, key],
  );

  const row = current.rows[0];
  if (row) {
    if (row.request_hash !== requestHash) return { kind: "conflict" };
    if (row.state === "completed") {
      if (row.response_status === null || row.response_body === null) {
        throw new Error("completed_idempotency_result_missing");
      }
      return {
        kind: "replay",
        result: validateResult({ status: row.response_status, body: row.response_body }),
      };
    }

    const leaseUntil = row.lease_until ? new Date(row.lease_until).getTime() : 0;
    const now = Date.now();
    if (Number.isFinite(leaseUntil) && leaseUntil > now) {
      return {
        kind: "in_progress",
        retryAfterSeconds: Math.max(1, Math.ceil((leaseUntil - now) / 1000)),
      };
    }

    await client.query(
      `UPDATE api_command_idempotency
          SET lease_until = NOW() + ($6::int * INTERVAL '1 second'),
              attempt_count = attempt_count + 1,
              last_error_code = NULL,
              expires_at = NOW() + ($7::int * INTERVAL '1 second')
        WHERE tenant_id = $1
          AND principal_type = $2
          AND principal_id = $3
          AND operation = $4
          AND idempotency_key = $5`,
      [
        scope.tenantId,
        scope.principalType,
        scope.principalId,
        scope.operation,
        key,
        scope.leaseSeconds,
        scope.ttlSeconds,
      ],
    );
    return { kind: "execute" };
  }

  await client.query(
    `INSERT INTO api_command_idempotency
      (tenant_id,
       principal_type,
       principal_id,
       operation,
       idempotency_key,
       request_hash,
       lease_until,
       expires_at)
     VALUES ($1, $2, $3, $4, $5, $6,
             NOW() + ($7::int * INTERVAL '1 second'),
             NOW() + ($8::int * INTERVAL '1 second'))`,
    [
      scope.tenantId,
      scope.principalType,
      scope.principalId,
      scope.operation,
      key,
      requestHash,
      scope.leaseSeconds,
      scope.ttlSeconds,
    ],
  );
  return { kind: "execute" };
}

async function completeInTransaction(
  client: PoolClient,
  scope: NormalizedScope,
  key: string,
  requestHash: string,
  result: IdempotentJsonResult,
): Promise<void> {
  const completed = await client.query(
    `UPDATE api_command_idempotency
        SET state = 'completed',
            response_status = $7,
            response_body = $8::jsonb,
            lease_until = NULL,
            last_error_code = NULL,
            expires_at = NOW() + ($9::int * INTERVAL '1 second')
      WHERE tenant_id = $1
        AND principal_type = $2
        AND principal_id = $3
        AND operation = $4
        AND idempotency_key = $5
        AND request_hash = $6
        AND state = 'pending'`,
    [
      scope.tenantId,
      scope.principalType,
      scope.principalId,
      scope.operation,
      key,
      requestHash,
      result.status,
      JSON.stringify(result.body),
      scope.ttlSeconds,
    ],
  );
  if ((completed.rowCount ?? 0) !== 1) throw new Error("idempotency_completion_conflict");
}

function claimToOutcome(claim: Exclude<ClaimResult, { kind: "execute" }>): IdempotentCommandOutcome {
  if (claim.kind === "replay") {
    return { kind: "result", replayed: true, result: claim.result };
  }
  return claim;
}

export async function runTransactionalIdempotentCommand(input: {
  scope: CommandIdempotencyScope;
  key: string;
  request: unknown;
  execute: (client: PoolClient) => Promise<IdempotentJsonResult>;
}): Promise<IdempotentCommandOutcome> {
  const scope = normalizeScope(input.scope);
  const parsedKey = parseCommandIdempotencyKey(input.key);
  if (!parsedKey.ok) throw new Error(parsedKey.error);
  const requestHash = hashCommandPayload(input.request);

  const transaction = await withTx(async (client) => {
    const claim = await claimInTransaction(client, scope, parsedKey.key, requestHash);
    if (claim.kind !== "execute") return claimToOutcome(claim);

    const result = validateResult(await input.execute(client));
    await completeInTransaction(client, scope, parsedKey.key, requestHash, result);
    return { kind: "result", replayed: false, result } satisfies IdempotentCommandOutcome;
  });

  if (!transaction.enabled || !transaction.value) return { kind: "unavailable" };
  return transaction.value;
}

async function markRetryableFailure(
  scope: NormalizedScope,
  key: string,
  requestHash: string,
  errorCode: string,
): Promise<void> {
  try {
    await withTx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey(scope, key)]);
      await client.query(
        `UPDATE api_command_idempotency
            SET lease_until = NOW(),
                last_error_code = $7
          WHERE tenant_id = $1
            AND principal_type = $2
            AND principal_id = $3
            AND operation = $4
            AND idempotency_key = $5
            AND request_hash = $6
            AND state = 'pending'`,
        [
          scope.tenantId,
          scope.principalType,
          scope.principalId,
          scope.operation,
          key,
          requestHash,
          errorCode.slice(0, 120),
        ],
      );
      return true;
    });
  } catch {
    // A stale lease is intentionally recoverable on the next same-key request.
  }
}

export async function runRecoverableIdempotentCommand(input: {
  scope: CommandIdempotencyScope;
  key: string;
  request: unknown;
  execute: () => Promise<IdempotentJsonResult>;
}): Promise<IdempotentCommandOutcome> {
  const scope = normalizeScope(input.scope);
  const parsedKey = parseCommandIdempotencyKey(input.key);
  if (!parsedKey.ok) throw new Error(parsedKey.error);
  const requestHash = hashCommandPayload(input.request);

  const claimTx = await withTx(async (client) =>
    claimInTransaction(client, scope, parsedKey.key, requestHash),
  );
  if (!claimTx.enabled || !claimTx.value) return { kind: "unavailable" };
  if (claimTx.value.kind !== "execute") return claimToOutcome(claimTx.value);

  let result: IdempotentJsonResult;
  try {
    result = validateResult(await input.execute());
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "command_execution_failed";
    await markRetryableFailure(scope, parsedKey.key, requestHash, errorCode);
    throw error;
  }

  const finalizeTx = await withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey(scope, parsedKey.key)]);
    const current = await client.query<CommandRow>(
      `SELECT request_hash, state, response_status, response_body, lease_until
         FROM api_command_idempotency
        WHERE tenant_id = $1
          AND principal_type = $2
          AND principal_id = $3
          AND operation = $4
          AND idempotency_key = $5
        FOR UPDATE`,
      [scope.tenantId, scope.principalType, scope.principalId, scope.operation, parsedKey.key],
    );
    const row = current.rows[0];
    if (!row || row.request_hash !== requestHash) throw new Error("idempotency_finalization_conflict");
    if (row.state === "completed") {
      if (row.response_status === null || row.response_body === null) {
        throw new Error("completed_idempotency_result_missing");
      }
      return validateResult({ status: row.response_status, body: row.response_body });
    }
    await completeInTransaction(client, scope, parsedKey.key, requestHash, result);
    return result;
  });

  if (!finalizeTx.enabled || !finalizeTx.value) {
    return { kind: "finalization_unavailable", result };
  }
  return { kind: "result", replayed: false, result: finalizeTx.value };
}
