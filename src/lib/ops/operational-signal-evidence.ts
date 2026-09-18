import "server-only";

import type { PoolClient } from "pg";
import { hashOperationalEvidence } from "@/lib/ops/operational-job-evidence";

const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const SIGNAL_ID_RE = /^ops:[0-9a-f]{64}$/;

export type OperationalSignalSeverity = "info" | "warning" | "critical";
export type OperationalSignalAttributeValue = number | boolean | null;

export type OperationalSignalEvidence = Readonly<{
  schemaVersion: 1;
  signalId: string;
  dedupeKey: string;
  eventName: string;
  source: Readonly<{
    component: string;
    unit: string;
  }>;
  severity: OperationalSignalSeverity;
  policyVersion: string;
  occurredAt: string;
  observedAt: string;
  dedupeWindowSeconds: number;
  bucketStartedAt: string;
  reasonCodes: readonly string[];
  attributes: Readonly<Record<string, OperationalSignalAttributeValue>>;
}>;

export type OperationalSignalInput = Readonly<{
  eventName: string;
  source: Readonly<{
    component: string;
    unit: string;
  }>;
  severity: OperationalSignalSeverity;
  policyVersion: string;
  occurredAt: string;
  observedAt?: string;
  dedupeWindowSeconds: number;
  reasonCodes: readonly string[];
  attributes?: Readonly<Record<string, OperationalSignalAttributeValue>>;
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

function token(
  value: string,
  minimum: number,
  maximum: number,
  code: string,
): string {
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

function positiveInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(code);
  }
  return value;
}

function normalizedReasonCodes(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length > 32) {
    throw new Error("operational_signal_reason_codes_invalid");
  }
  const unique = new Set<string>();
  for (const raw of values) {
    unique.add(token(raw, 3, 100, "operational_signal_reason_code_invalid"));
  }
  return [...unique].sort();
}

function normalizedAttributes(
  raw: Readonly<Record<string, OperationalSignalAttributeValue>> | undefined,
): Readonly<Record<string, OperationalSignalAttributeValue>> {
  const entries = Object.entries(raw ?? {});
  if (entries.length > 32) {
    throw new Error("operational_signal_attributes_invalid");
  }
  const output: Record<string, OperationalSignalAttributeValue> = {};
  for (const [rawKey, value] of entries.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const key = token(
      rawKey,
      1,
      80,
      "operational_signal_attribute_key_invalid",
    );
    if (
      value !== null &&
      typeof value !== "boolean" &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error("operational_signal_attribute_value_invalid");
    }
    output[key] = value;
  }
  return Object.freeze(output);
}

function bucketStartedAt(
  observedAt: string,
  dedupeWindowSeconds: number,
): string {
  const observedMs = Date.parse(observedAt);
  const windowMs = dedupeWindowSeconds * 1_000;
  return new Date(Math.floor(observedMs / windowMs) * windowMs).toISOString();
}

function signalDedupeKey(input: {
  eventName: string;
  component: string;
  unit: string;
  policyVersion: string;
}): string {
  return hashOperationalEvidence({
    authority: "tecpey-operational-signal-dedupe-v1",
    eventName: input.eventName,
    component: input.component,
    unit: input.unit,
    policyVersion: input.policyVersion,
  });
}

function signalId(input: {
  dedupeKey: string;
  bucketStartedAt: string;
  severity: OperationalSignalSeverity;
  reasonCodes: readonly string[];
}): string {
  return `ops:${hashOperationalEvidence({
    authority: "tecpey-operational-signal-id-v1",
    dedupeKey: input.dedupeKey,
    bucketStartedAt: input.bucketStartedAt,
    severity: input.severity,
    reasonCodes: input.reasonCodes,
  })}`;
}

export function buildOperationalSignal(
  input: OperationalSignalInput,
): OperationalSignalEvidence {
  const eventName = token(
    input.eventName,
    3,
    120,
    "operational_signal_event_name_invalid",
  );
  const component = token(
    input.source.component,
    3,
    120,
    "operational_signal_component_invalid",
  );
  const unit = token(
    input.source.unit,
    3,
    200,
    "operational_signal_unit_invalid",
  );
  if (!unit.endsWith(".service")) {
    throw new Error("operational_signal_unit_invalid");
  }
  if (
    input.severity !== "info" &&
    input.severity !== "warning" &&
    input.severity !== "critical"
  ) {
    throw new Error("operational_signal_severity_invalid");
  }
  const policyVersion = token(
    input.policyVersion,
    1,
    120,
    "operational_signal_policy_version_invalid",
  );
  const occurredAt = iso(
    input.occurredAt,
    "operational_signal_occurred_at_invalid",
  );
  const observedAt = iso(
    input.observedAt ?? input.occurredAt,
    "operational_signal_observed_at_invalid",
  );
  if (Date.parse(observedAt) < Date.parse(occurredAt)) {
    throw new Error("operational_signal_time_order_invalid");
  }
  const dedupeWindowSeconds = positiveInteger(
    input.dedupeWindowSeconds,
    60,
    86_400,
    "operational_signal_dedupe_window_invalid",
  );
  const reasonCodes = normalizedReasonCodes(input.reasonCodes);
  const attributes = normalizedAttributes(input.attributes);
  const dedupeKey = signalDedupeKey({
    eventName,
    component,
    unit,
    policyVersion,
  });
  const bucket = bucketStartedAt(observedAt, dedupeWindowSeconds);

  return Object.freeze({
    schemaVersion: 1,
    signalId: signalId({
      dedupeKey,
      bucketStartedAt: bucket,
      severity: input.severity,
      reasonCodes,
    }),
    dedupeKey,
    eventName,
    source: Object.freeze({ component, unit }),
    severity: input.severity,
    policyVersion,
    occurredAt,
    observedAt,
    dedupeWindowSeconds,
    bucketStartedAt: bucket,
    reasonCodes: Object.freeze(reasonCodes),
    attributes,
  });
}

export function validateOperationalSignalEvidence(
  raw: OperationalSignalEvidence,
): OperationalSignalEvidence {
  if (raw.schemaVersion !== 1) {
    throw new Error("operational_signal_schema_invalid");
  }
  const rebuilt = buildOperationalSignal({
    eventName: raw.eventName,
    source: raw.source,
    severity: raw.severity,
    policyVersion: raw.policyVersion,
    occurredAt: raw.occurredAt,
    observedAt: raw.observedAt,
    dedupeWindowSeconds: raw.dedupeWindowSeconds,
    reasonCodes: raw.reasonCodes,
    attributes: raw.attributes,
  });
  if (
    !SIGNAL_ID_RE.test(raw.signalId) ||
    !HASH_RE.test(raw.dedupeKey) ||
    rebuilt.signalId !== raw.signalId ||
    rebuilt.dedupeKey !== raw.dedupeKey ||
    rebuilt.bucketStartedAt !== raw.bucketStartedAt
  ) {
    throw new Error("operational_signal_identity_invalid");
  }
  return rebuilt;
}

function signalIdentityHash(
  signal: OperationalSignalEvidence,
): string {
  return hashOperationalEvidence({
    signalId: signal.signalId,
    dedupeKey: signal.dedupeKey,
    eventName: signal.eventName,
    source: signal.source,
    severity: signal.severity,
    policyVersion: signal.policyVersion,
    dedupeWindowSeconds: signal.dedupeWindowSeconds,
    bucketStartedAt: signal.bucketStartedAt,
    reasonCodes: signal.reasonCodes,
  });
}

export async function persistOperationalSignalTx(
  client: PoolClient,
  raw: OperationalSignalEvidence,
): Promise<{ replayed: boolean; payloadHash: string }> {
  const signal = validateOperationalSignalEvidence(raw);
  const payloadHash = hashOperationalEvidence(signal);
  const identityHash = signalIdentityHash(signal);
  const inserted = await client.query(
    `INSERT INTO platform_operational_signals
       (signal_id, dedupe_key, event_name, source_component, source_unit,
        severity, policy_version, occurred_at, observed_at, payload_hash,
        reason_codes, attributes, payload)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz,
        $10, $11::jsonb, $12::jsonb, $13::jsonb)
     ON CONFLICT (signal_id) DO NOTHING`,
    [
      signal.signalId,
      signal.dedupeKey,
      signal.eventName,
      signal.source.component,
      signal.source.unit,
      signal.severity,
      signal.policyVersion,
      signal.occurredAt,
      signal.observedAt,
      payloadHash,
      JSON.stringify(signal.reasonCodes),
      JSON.stringify(signal.attributes),
      JSON.stringify({ ...signal, identityHash }),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) {
    return { replayed: false, payloadHash };
  }

  const existing = await client.query<{
    payload_hash: string;
    payload: { identityHash?: string };
  }>(
    `SELECT payload_hash, payload
       FROM platform_operational_signals
      WHERE signal_id = $1
      LIMIT 1`,
    [signal.signalId],
  );
  if (!existing.rows[0]) {
    throw new Error("operational_signal_conflict_missing");
  }
  if (existing.rows[0].payload?.identityHash !== identityHash) {
    throw new Error("operational_signal_identity_conflict");
  }
  return {
    replayed: true,
    payloadHash: existing.rows[0].payload_hash,
  };
}

function attemptNumber(value: number): number {
  return positiveInteger(
    value,
    1,
    100,
    "operational_signal_attempt_number_invalid",
  );
}

function responseBodyBytes(value: number): number {
  return positiveInteger(
    value,
    0,
    1_000_000,
    "operational_signal_response_body_bytes_invalid",
  );
}

export async function persistOperationalSignalDeliveryAttemptTx(
  client: PoolClient,
  raw: OperationalSignalDeliveryAttempt,
): Promise<{ replayed: boolean }> {
  if (!SIGNAL_ID_RE.test(raw.signalId)) {
    throw new Error("operational_signal_id_invalid");
  }
  const attempt = attemptNumber(raw.attemptNumber);
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
    : token(
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
  const evidence = {
    provider: "webhook" as const,
    responseBodyBytes: responseBodyBytes(raw.evidence.responseBodyBytes),
  };
  const attemptHash = hashOperationalEvidence({
    signalId: raw.signalId,
    attemptNumber: attempt,
    deliveryResult: raw.deliveryResult,
    httpStatus: raw.httpStatus,
    errorCode,
    attemptedAt,
    evidence,
  });

  const inserted = await client.query(
    `INSERT INTO platform_operational_signal_delivery_attempts
       (signal_id, attempt_number, delivery_result, http_status,
        error_code, attempted_at, evidence)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb)
     ON CONFLICT (signal_id, attempt_number) DO NOTHING`,
    [
      raw.signalId,
      attempt,
      raw.deliveryResult,
      raw.httpStatus,
      errorCode,
      attemptedAt,
      JSON.stringify({ ...evidence, attemptHash }),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) return { replayed: false };

  const existing = await client.query<{
    evidence: { attemptHash?: string };
  }>(
    `SELECT evidence
       FROM platform_operational_signal_delivery_attempts
      WHERE signal_id = $1 AND attempt_number = $2
      LIMIT 1`,
    [raw.signalId, attempt],
  );
  if (!existing.rows[0]) {
    throw new Error("operational_signal_attempt_conflict_missing");
  }
  if (existing.rows[0].evidence?.attemptHash !== attemptHash) {
    throw new Error("operational_signal_attempt_identity_conflict");
  }
  return { replayed: true };
}
