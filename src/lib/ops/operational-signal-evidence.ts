import "server-only";

import type { PoolClient } from "pg";
import { hashOperationalEvidence } from "@/lib/ops/operational-job-evidence";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;
const KEY_RE = /^[a-z][A-Za-z0-9._:-]{1,63}$/;
const FORBIDDEN_DETAIL_TOKENS = new Set([
  "id",
  "student",
  "tenant",
  "workspace",
  "principal",
  "user",
  "account",
  "wallet",
  "order",
  "trade",
  "request",
  "session",
  "device",
  "email",
  "phone",
  "name",
  "address",
  "passport",
  "national",
  "kyc",
  "conversation",
  "prompt",
  "portfolio",
  "secret",
  "token",
  "password",
  "seed",
  "private",
  "key",
  "ip",
  "trace",
]);

const HASH_RE = /^[0-9a-f]{64}$/;

export type OperationalSignalSeverity = "info" | "warning" | "critical";
export type OperationalSignalPhase = "opened" | "updated" | "recovered";
export type OperationalSignalDetailValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];

export type OperationalSignalEvidence = Readonly<{
  schemaVersion: 1;
  signalId: string;
  incidentId: string;
  sequence: number;
  source: string;
  sourceUnit: string;
  hostName: string;
  phase: OperationalSignalPhase;
  severity: OperationalSignalSeverity;
  occurredAt: string;
  fingerprint: string;
  reasonCodes: readonly string[];
  details: Readonly<Record<string, OperationalSignalDetailValue>>;
}>;

export type OperationalSignalDeliveryAttempt = Readonly<{
  signalId: string;
  attemptNumber: number;
  deliveryResult: "delivered" | "retryable_failure" | "terminal_failure";
  httpStatus: number | null;
  errorCode: string | null;
  attemptedAt: string;
  evidence: Readonly<{
    provider: "webhook";
    responseBodyBytes: number;
  }>;
}>;

function iso(value: string, code: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(code);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(code);
  return normalized;
}

function boundedToken(
  value: string,
  minimum: number,
  maximum: number,
  code: string,
): string {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.trim();
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    !TOKEN_RE.test(normalized)
  ) {
    throw new Error(code);
  }
  return normalized;
}

function boundedHost(value: string): string {
  if (typeof value !== "string") {
    throw new Error("operational_signal_host_invalid");
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 1 ||
    normalized.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error("operational_signal_host_invalid");
  }
  return normalized;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function uniqueTokens(
  values: readonly string[],
  maximumItems: number,
  code: string,
): string[] {
  if (!Array.isArray(values) || values.length > maximumItems) {
    throw new Error(code);
  }
  const seen = new Set<string>();
  for (const raw of values) {
    seen.add(boundedToken(raw, 2, 100, code));
  }
  return [...seen].sort();
}

function validateDetails(
  raw: Readonly<Record<string, OperationalSignalDetailValue>>,
): Readonly<Record<string, OperationalSignalDetailValue>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("operational_signal_details_invalid");
  }
  const entries = Object.entries(raw);
  if (entries.length > 24) {
    throw new Error("operational_signal_details_invalid");
  }
  const output: Record<string, OperationalSignalDetailValue> = {};
  for (const [key, value] of entries.sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (!KEY_RE.test(key)) {
      throw new Error("operational_signal_detail_key_invalid");
    }
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase();
    const keyTokens = normalizedKey.split(/[._:-]+/).filter(Boolean);
    if (keyTokens.some((token) => FORBIDDEN_DETAIL_TOKENS.has(token))) {
      throw new Error("operational_signal_detail_key_forbidden");
    }
    if (value === null || typeof value === "boolean") {
      output[key] = value;
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) {
        throw new Error("operational_signal_detail_number_invalid");
      }
      output[key] = value;
      continue;
    }
    if (typeof value === "string") {
      output[key] = boundedToken(
        value,
        1,
        160,
        "operational_signal_detail_string_invalid",
      );
      continue;
    }
    if (Array.isArray(value)) {
      output[key] = uniqueTokens(
        value,
        32,
        "operational_signal_detail_array_invalid",
      );
      continue;
    }
    throw new Error("operational_signal_detail_value_invalid");
  }
  return Object.freeze(output);
}

export function validateOperationalSignalEvidence(
  input: OperationalSignalEvidence,
): OperationalSignalEvidence {
  if (input.schemaVersion !== 1) {
    throw new Error("operational_signal_schema_invalid");
  }
  if (!UUID_RE.test(input.incidentId)) {
    throw new Error("operational_signal_incident_id_invalid");
  }
  const incidentId = input.incidentId.toLowerCase();
  const sequence = boundedInteger(
    input.sequence,
    1,
    1_000_000,
    "operational_signal_sequence_invalid",
  );
  const source = boundedToken(
    input.source,
    3,
    100,
    "operational_signal_source_invalid",
  ).toLowerCase();
  const sourceUnit = boundedToken(
    input.sourceUnit,
    3,
    200,
    "operational_signal_unit_invalid",
  );
  if (!sourceUnit.endsWith(".service")) {
    throw new Error("operational_signal_unit_invalid");
  }
  const signalId = boundedToken(
    input.signalId,
    8,
    220,
    "operational_signal_id_invalid",
  );
  if (signalId !== `${source}:${incidentId}:${sequence}`) {
    throw new Error("operational_signal_identity_invalid");
  }
  if (
    input.phase !== "opened" &&
    input.phase !== "updated" &&
    input.phase !== "recovered"
  ) {
    throw new Error("operational_signal_phase_invalid");
  }
  if (
    input.severity !== "info" &&
    input.severity !== "warning" &&
    input.severity !== "critical"
  ) {
    throw new Error("operational_signal_severity_invalid");
  }
  if (
    (input.phase === "recovered" && input.severity !== "info") ||
    (input.phase !== "recovered" && input.severity === "info")
  ) {
    throw new Error("operational_signal_phase_severity_invalid");
  }
  if (!HASH_RE.test(input.fingerprint)) {
    throw new Error("operational_signal_fingerprint_invalid");
  }
  return Object.freeze({
    schemaVersion: 1,
    signalId,
    incidentId,
    sequence,
    source,
    sourceUnit,
    hostName: boundedHost(input.hostName),
    phase: input.phase,
    severity: input.severity,
    occurredAt: iso(input.occurredAt, "operational_signal_occurred_at_invalid"),
    fingerprint: input.fingerprint,
    reasonCodes: uniqueTokens(
      input.reasonCodes,
      32,
      "operational_signal_reason_codes_invalid",
    ),
    details: validateDetails(input.details),
  });
}

export async function persistOperationalSignalTx(
  client: PoolClient,
  raw: OperationalSignalEvidence,
): Promise<{ replayed: boolean; payloadHash: string }> {
  const signal = validateOperationalSignalEvidence(raw);
  const payloadHash = hashOperationalEvidence(signal);
  if (!HASH_RE.test(payloadHash)) {
    throw new Error("operational_signal_payload_hash_invalid");
  }
  const inserted = await client.query(
    `INSERT INTO platform_operational_signals
       (signal_id, incident_id, sequence, source, source_unit, host_name,
        phase, severity, occurred_at, fingerprint, payload_hash, payload)
     VALUES
       ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11,
        $12::jsonb)
     ON CONFLICT (signal_id) DO NOTHING`,
    [
      signal.signalId,
      signal.incidentId,
      signal.sequence,
      signal.source,
      signal.sourceUnit,
      signal.hostName,
      signal.phase,
      signal.severity,
      signal.occurredAt,
      signal.fingerprint,
      payloadHash,
      JSON.stringify(signal),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) {
    return { replayed: false, payloadHash };
  }
  const existing = await client.query<{ payload_hash: string }>(
    `SELECT payload_hash
       FROM platform_operational_signals
      WHERE signal_id = $1
      LIMIT 1`,
    [signal.signalId],
  );
  if (!existing.rows[0]) {
    throw new Error("operational_signal_conflict_missing");
  }
  if (existing.rows[0].payload_hash !== payloadHash) {
    throw new Error("operational_signal_identity_conflict");
  }
  return { replayed: true, payloadHash };
}

export async function persistOperationalSignalDeliveryAttemptTx(
  client: PoolClient,
  raw: OperationalSignalDeliveryAttempt,
): Promise<{ replayed: boolean }> {
  const signalId = boundedToken(
    raw.signalId,
    8,
    220,
    "operational_signal_id_invalid",
  );
  const attemptNumber = boundedInteger(
    raw.attemptNumber,
    1,
    100,
    "operational_signal_attempt_number_invalid",
  );
  if (
    raw.deliveryResult !== "delivered" &&
    raw.deliveryResult !== "retryable_failure" &&
    raw.deliveryResult !== "terminal_failure"
  ) {
    throw new Error("operational_signal_delivery_result_invalid");
  }
  if (
    raw.httpStatus !== null &&
    (!Number.isSafeInteger(raw.httpStatus) ||
      raw.httpStatus < 100 ||
      raw.httpStatus > 599)
  ) {
    throw new Error("operational_signal_http_status_invalid");
  }
  const errorCode = raw.errorCode === null
    ? null
    : boundedToken(
        raw.errorCode,
        1,
        100,
        "operational_signal_error_code_invalid",
      );
  const attemptedAt = iso(
    raw.attemptedAt,
    "operational_signal_attempted_at_invalid",
  );
  if (raw.evidence.provider !== "webhook") {
    throw new Error("operational_signal_provider_invalid");
  }
  const responseBodyBytes = boundedInteger(
    raw.evidence.responseBodyBytes,
    0,
    1_000_000,
    "operational_signal_response_body_bytes_invalid",
  );
  const attemptHash = hashOperationalEvidence({
    signalId,
    attemptNumber,
    deliveryResult: raw.deliveryResult,
    httpStatus: raw.httpStatus,
    errorCode,
    attemptedAt,
    evidence: { provider: "webhook", responseBodyBytes },
  });
  const inserted = await client.query(
    `INSERT INTO platform_operational_signal_delivery_attempts
       (signal_id, attempt_number, delivery_result, http_status, error_code,
        attempted_at, evidence)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb)
     ON CONFLICT (signal_id, attempt_number) DO NOTHING`,
    [
      signalId,
      attemptNumber,
      raw.deliveryResult,
      raw.httpStatus,
      errorCode,
      attemptedAt,
      JSON.stringify({
        provider: "webhook",
        responseBodyBytes,
        attemptHash,
      }),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) return { replayed: false };
  const existing = await client.query<{ evidence: { attemptHash?: string } }>(
    `SELECT evidence
       FROM platform_operational_signal_delivery_attempts
      WHERE signal_id = $1 AND attempt_number = $2
      LIMIT 1`,
    [signalId, attemptNumber],
  );
  if (!existing.rows[0]) {
    throw new Error("operational_signal_attempt_conflict_missing");
  }
  if (existing.rows[0].evidence?.attemptHash !== attemptHash) {
    throw new Error("operational_signal_attempt_identity_conflict");
  }
  return { replayed: true };
}
