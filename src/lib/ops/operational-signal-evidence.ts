import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;
const LOWER_TOKEN_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const FORBIDDEN_CARDINALITY_SEGMENTS = new Set([
  "tenant",
  "workspace",
  "student",
  "learner",
  "user",
  "account",
  "customer",
  "email",
  "phone",
  "contact",
  "conversation",
  "prompt",
  "message",
  "kyc",
  "passport",
  "national",
  "address",
  "wallet",
  "portfolio",
  "credential",
  "secret",
]);
const LONG_IDENTIFIER_RE = /(?:\d{6,}|[0-9a-f]{16,})/i;

export type OperationalSignalSeverity = "warning" | "critical";
export type OperationalSignalLifecycle = "firing" | "resolved";
export type OperationalSignalMeasurement = number | boolean | null;

export type OperationalSignalEvidence = Readonly<{
  schemaVersion: 1;
  signalId: string;
  signalType: string;
  component: string;
  sourceUnit: string;
  severity: OperationalSignalSeverity;
  lifecycle: OperationalSignalLifecycle;
  occurredAt: string;
  dedupeWindowStart: string;
  dedupeWindowSeconds: number;
  incidentKey: string;
  incidentId: string;
  conditionFingerprint: string;
  reasonCodes: readonly string[];
  measurements: Readonly<Record<string, OperationalSignalMeasurement>>;
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

type SignalIdentityRow = {
  signal_type: string;
  component: string;
  severity: OperationalSignalSeverity;
  lifecycle: OperationalSignalLifecycle;
  dedupe_window_start: Date;
  dedupe_window_seconds: number;
  incident_key: string;
  incident_id: string;
  condition_fingerprint: string;
  payload_hash: string;
};

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error("operational_signal_value_invalid");
}

export function hashOperationalSignalEvidence(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function boundedToken(
  value: string,
  minimum: number,
  maximum: number,
  code: string,
  lowerOnly = false,
): string {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.trim();
  const pattern = lowerOnly ? LOWER_TOKEN_RE : TOKEN_RE;
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    !pattern.test(normalized)
  ) {
    throw new Error(code);
  }
  return normalized;
}

function iso(value: string, code: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(code);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(code);
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

function assertLowCardinalityLabel(value: string, code: string): string {
  const normalized = value.toLowerCase();
  const segments = normalized.split(/[._:-]+/).filter(Boolean);
  if (
    segments.some((segment) => FORBIDDEN_CARDINALITY_SEGMENTS.has(segment)) ||
    LONG_IDENTIFIER_RE.test(normalized)
  ) {
    throw new Error(code);
  }
  return value;
}

function normalizeReasonCodes(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 32) {
    throw new Error("operational_signal_reason_codes_invalid");
  }
  const output = values.map((value) =>
    assertLowCardinalityLabel(
      boundedToken(
        value,
        3,
        100,
        "operational_signal_reason_codes_invalid",
        true,
      ),
      "operational_signal_reason_cardinality_forbidden",
    ));
  const unique = [...new Set(output)].sort();
  if (unique.length !== output.length) {
    throw new Error("operational_signal_reason_codes_duplicate");
  }
  return unique;
}

function normalizeMeasurements(
  input: Readonly<Record<string, OperationalSignalMeasurement>>,
): Record<string, OperationalSignalMeasurement> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("operational_signal_measurements_invalid");
  }
  const entries = Object.entries(input);
  if (entries.length > 32) {
    throw new Error("operational_signal_measurements_invalid");
  }
  const output: Record<string, OperationalSignalMeasurement> = {};
  for (const [rawKey, value] of entries.sort(([left], [right]) =>
    left.localeCompare(right))) {
    const key = assertLowCardinalityLabel(
      boundedToken(
        rawKey,
        1,
        64,
        "operational_signal_measurement_key_invalid",
        true,
      ),
      "operational_signal_measurement_cardinality_forbidden",
    );
    if (
      value !== null &&
      typeof value !== "boolean" &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > 1_000_000_000_000_000)
    ) {
      throw new Error("operational_signal_measurement_value_invalid");
    }
    output[key] = value;
  }
  return output;
}

function expectedIncidentKey(input: {
  signalType: string;
  component: string;
  sourceUnit: string;
}): string {
  return hashOperationalSignalEvidence({
    authority: "tecpey-operational-condition-key-v2",
    signalType: input.signalType,
    component: input.component,
    sourceUnit: input.sourceUnit,
  });
}

function expectedConditionFingerprint(input: {
  severity: OperationalSignalSeverity;
  reasonCodes: readonly string[];
}): string {
  return hashOperationalSignalEvidence({
    authority: "tecpey-operational-condition-fingerprint-v2",
    severity: input.severity,
    reasonCodes: [...input.reasonCodes],
  });
}

function expectedSignalId(input: {
  incidentId: string;
  lifecycle: OperationalSignalLifecycle;
}): string {
  const digest = hashOperationalSignalEvidence({
    authority: "tecpey-operational-signal-id-v2",
    incidentId: input.incidentId,
    lifecycle: input.lifecycle,
  });
  return `ops:${digest.slice(0, 56)}`;
}

export function createOperationalSignalEvidence(input: {
  signalType: string;
  component: string;
  sourceUnit: string;
  severity: OperationalSignalSeverity;
  lifecycle?: OperationalSignalLifecycle;
  occurredAt: string;
  dedupeWindowSeconds?: number;
  incidentId?: string;
  conditionFingerprint?: string;
  reasonCodes: readonly string[];
  measurements?: Readonly<Record<string, OperationalSignalMeasurement>>;
}): OperationalSignalEvidence {
  const signalType = assertLowCardinalityLabel(
    boundedToken(
      input.signalType,
      3,
      100,
      "operational_signal_type_invalid",
      true,
    ),
    "operational_signal_type_cardinality_forbidden",
  );
  const component = assertLowCardinalityLabel(
    boundedToken(
      input.component,
      3,
      100,
      "operational_signal_component_invalid",
      true,
    ),
    "operational_signal_component_cardinality_forbidden",
  );
  const sourceUnit = boundedToken(
    input.sourceUnit,
    3,
    200,
    "operational_signal_source_unit_invalid",
  );
  if (!sourceUnit.endsWith(".service")) {
    throw new Error("operational_signal_source_unit_invalid");
  }
  if (input.severity !== "warning" && input.severity !== "critical") {
    throw new Error("operational_signal_severity_invalid");
  }
  const lifecycle = input.lifecycle ?? "firing";
  if (lifecycle !== "firing" && lifecycle !== "resolved") {
    throw new Error("operational_signal_lifecycle_invalid");
  }
  const occurredAt = iso(input.occurredAt, "operational_signal_occurred_at_invalid");
  const dedupeWindowSeconds = boundedInteger(
    input.dedupeWindowSeconds ?? 3_600,
    60,
    86_400,
    "operational_signal_dedupe_window_invalid",
  );
  const occurredAtMs = Date.parse(occurredAt);
  const windowMs = dedupeWindowSeconds * 1_000;
  const dedupeWindowStart = new Date(
    Math.floor(occurredAtMs / windowMs) * windowMs,
  ).toISOString();
  const reasonCodes = normalizeReasonCodes(input.reasonCodes);
  const measurements = normalizeMeasurements(input.measurements ?? {});
  const incidentKey = expectedIncidentKey({
    signalType,
    component,
    sourceUnit,
  });
  const computedConditionFingerprint = expectedConditionFingerprint({
    severity: input.severity,
    reasonCodes,
  });
  const conditionFingerprint =
    input.conditionFingerprint === undefined
      ? computedConditionFingerprint
      : input.conditionFingerprint;
  if (
    !HASH_RE.test(conditionFingerprint) ||
    (lifecycle === "firing" &&
      conditionFingerprint !== computedConditionFingerprint)
  ) {
    throw new Error("operational_signal_condition_fingerprint_invalid");
  }
  const incidentId =
    input.incidentId === undefined
      ? hashOperationalSignalEvidence({
          authority: "tecpey-operational-incident-generation-v2",
          incidentKey,
          conditionFingerprint,
          dedupeWindowStart,
          dedupeWindowSeconds,
        })
      : input.incidentId;
  if (!HASH_RE.test(incidentId)) {
    throw new Error("operational_signal_incident_id_invalid");
  }
  const signalId = expectedSignalId({
    incidentId,
    lifecycle,
  });
  return Object.freeze({
    schemaVersion: 1,
    signalId,
    signalType,
    component,
    sourceUnit,
    severity: input.severity,
    lifecycle,
    occurredAt,
    dedupeWindowStart,
    dedupeWindowSeconds,
    incidentKey,
    incidentId,
    conditionFingerprint,
    reasonCodes: Object.freeze(reasonCodes),
    measurements: Object.freeze(measurements),
  });
}

export function validateOperationalSignalEvidence(
  raw: OperationalSignalEvidence,
): OperationalSignalEvidence {
  if (!raw || raw.schemaVersion !== 1) {
    throw new Error("operational_signal_schema_invalid");
  }
  const signalType = assertLowCardinalityLabel(
    boundedToken(
      raw.signalType,
      3,
      100,
      "operational_signal_type_invalid",
      true,
    ),
    "operational_signal_type_cardinality_forbidden",
  );
  const component = assertLowCardinalityLabel(
    boundedToken(
      raw.component,
      3,
      100,
      "operational_signal_component_invalid",
      true,
    ),
    "operational_signal_component_cardinality_forbidden",
  );
  const sourceUnit = boundedToken(
    raw.sourceUnit,
    3,
    200,
    "operational_signal_source_unit_invalid",
  );
  if (!sourceUnit.endsWith(".service")) {
    throw new Error("operational_signal_source_unit_invalid");
  }
  if (raw.severity !== "warning" && raw.severity !== "critical") {
    throw new Error("operational_signal_severity_invalid");
  }
  if (raw.lifecycle !== "firing" && raw.lifecycle !== "resolved") {
    throw new Error("operational_signal_lifecycle_invalid");
  }
  const occurredAt = iso(raw.occurredAt, "operational_signal_occurred_at_invalid");
  const dedupeWindowStart = iso(
    raw.dedupeWindowStart,
    "operational_signal_window_start_invalid",
  );
  const dedupeWindowSeconds = boundedInteger(
    raw.dedupeWindowSeconds,
    60,
    86_400,
    "operational_signal_dedupe_window_invalid",
  );
  const windowStartMs = Date.parse(dedupeWindowStart);
  const occurredAtMs = Date.parse(occurredAt);
  const windowEndMs = windowStartMs + dedupeWindowSeconds * 1_000;
  if (occurredAtMs < windowStartMs || occurredAtMs >= windowEndMs) {
    throw new Error("operational_signal_occurred_outside_window");
  }
  const reasonCodes = normalizeReasonCodes(raw.reasonCodes);
  const measurements = normalizeMeasurements(raw.measurements);
  const incidentKey = expectedIncidentKey({
    signalType,
    component,
    sourceUnit,
  });
  if (!HASH_RE.test(raw.incidentKey) || raw.incidentKey !== incidentKey) {
    throw new Error("operational_signal_incident_key_invalid");
  }
  if (!HASH_RE.test(raw.incidentId)) {
    throw new Error("operational_signal_incident_id_invalid");
  }
  const computedConditionFingerprint = expectedConditionFingerprint({
    severity: raw.severity,
    reasonCodes,
  });
  if (
    !HASH_RE.test(raw.conditionFingerprint) ||
    (raw.lifecycle === "firing" &&
      raw.conditionFingerprint !== computedConditionFingerprint)
  ) {
    throw new Error("operational_signal_condition_fingerprint_invalid");
  }
  const signalId = expectedSignalId({
    incidentId: raw.incidentId,
    lifecycle: raw.lifecycle,
  });
  if (raw.signalId !== signalId) {
    throw new Error("operational_signal_identity_invalid");
  }
  return Object.freeze({
    schemaVersion: 1,
    signalId,
    signalType,
    component,
    sourceUnit,
    severity: raw.severity,
    lifecycle: raw.lifecycle,
    occurredAt,
    dedupeWindowStart,
    dedupeWindowSeconds,
    incidentKey,
    incidentId: raw.incidentId,
    conditionFingerprint: raw.conditionFingerprint,
    reasonCodes: Object.freeze(reasonCodes),
    measurements: Object.freeze(measurements),
  });
}

function sameIdentity(
  row: SignalIdentityRow,
  signal: OperationalSignalEvidence,
): boolean {
  return (
    row.signal_type === signal.signalType &&
    row.component === signal.component &&
    row.severity === signal.severity &&
    row.lifecycle === signal.lifecycle &&
    row.dedupe_window_start.toISOString() === signal.dedupeWindowStart &&
    row.dedupe_window_seconds === signal.dedupeWindowSeconds &&
    row.incident_key === signal.incidentKey &&
    row.incident_id === signal.incidentId &&
    row.condition_fingerprint === signal.conditionFingerprint
  );
}

export async function persistOperationalSignalTx(
  client: PoolClient,
  raw: OperationalSignalEvidence,
): Promise<{ replayed: boolean; payloadHash: string }> {
  const signal = validateOperationalSignalEvidence(raw);
  const payloadHash = hashOperationalSignalEvidence(signal);
  if (!HASH_RE.test(payloadHash)) {
    throw new Error("operational_signal_payload_hash_invalid");
  }
  const inserted = await client.query(
    `INSERT INTO platform_operational_signals
       (signal_id, signal_type, component, source_unit, severity, lifecycle,
        occurred_at, dedupe_window_start, dedupe_window_seconds, incident_key,
        incident_id, condition_fingerprint, payload_hash, payload)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10, $11,
        $12, $13, $14::jsonb)
     ON CONFLICT (signal_id) DO NOTHING`,
    [
      signal.signalId,
      signal.signalType,
      signal.component,
      signal.sourceUnit,
      signal.severity,
      signal.lifecycle,
      signal.occurredAt,
      signal.dedupeWindowStart,
      signal.dedupeWindowSeconds,
      signal.incidentKey,
      signal.incidentId,
      signal.conditionFingerprint,
      payloadHash,
      JSON.stringify(signal),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) {
    return { replayed: false, payloadHash };
  }

  const existing = await client.query<SignalIdentityRow>(
    `SELECT signal_type, component, severity, lifecycle,
            dedupe_window_start, dedupe_window_seconds, incident_key,
            incident_id, condition_fingerprint, payload_hash
       FROM platform_operational_signals
      WHERE signal_id = $1
      LIMIT 1`,
    [signal.signalId],
  );
  const row = existing.rows[0];
  if (!row) throw new Error("operational_signal_conflict_missing");
  if (!sameIdentity(row, signal)) {
    throw new Error("operational_signal_identity_conflict");
  }
  if (!HASH_RE.test(row.payload_hash)) {
    throw new Error("operational_signal_stored_payload_hash_invalid");
  }
  if (row.payload_hash !== payloadHash) {
    throw new Error("operational_signal_payload_conflict");
  }
  return { replayed: true, payloadHash: row.payload_hash };
}

export function validateOperationalSignalDeliveryAttempt(
  raw: OperationalSignalDeliveryAttempt,
): OperationalSignalDeliveryAttempt {
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
    "operational_signal_attempt_invalid",
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
  const errorCode =
    raw.errorCode === null
      ? null
      : boundedToken(
          raw.errorCode,
          1,
          100,
          "operational_signal_error_code_invalid",
          true,
        );
  const attemptedAt = iso(
    raw.attemptedAt,
    "operational_signal_attempted_at_invalid",
  );
  if (
    raw.evidence?.provider !== "webhook" ||
    !Number.isSafeInteger(raw.evidence.responseBodyBytes) ||
    raw.evidence.responseBodyBytes < 0 ||
    raw.evidence.responseBodyBytes > 1_000_000
  ) {
    throw new Error("operational_signal_attempt_evidence_invalid");
  }
  return Object.freeze({
    signalId,
    attemptNumber,
    deliveryResult: raw.deliveryResult,
    httpStatus: raw.httpStatus,
    errorCode,
    attemptedAt,
    evidence: Object.freeze({
      provider: "webhook" as const,
      responseBodyBytes: raw.evidence.responseBodyBytes,
    }),
  });
}

export async function persistOperationalSignalDeliveryAttemptTx(
  client: PoolClient,
  raw: OperationalSignalDeliveryAttempt,
): Promise<{ replayed: boolean }> {
  const attempt = validateOperationalSignalDeliveryAttempt(raw);
  const attemptHash = hashOperationalSignalEvidence(attempt);
  const inserted = await client.query(
    `INSERT INTO platform_operational_signal_delivery_attempts
       (signal_id, attempt_number, delivery_result, http_status,
        error_code, attempted_at, evidence)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb)
     ON CONFLICT (signal_id, attempt_number) DO NOTHING`,
    [
      attempt.signalId,
      attempt.attemptNumber,
      attempt.deliveryResult,
      attempt.httpStatus,
      attempt.errorCode,
      attempt.attemptedAt,
      JSON.stringify({ ...attempt.evidence, attemptHash }),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) return { replayed: false };

  const existing = await client.query<{ evidence: { attemptHash?: string } }>(
    `SELECT evidence
       FROM platform_operational_signal_delivery_attempts
      WHERE signal_id = $1 AND attempt_number = $2
      LIMIT 1`,
    [attempt.signalId, attempt.attemptNumber],
  );
  if (!existing.rows[0]) {
    throw new Error("operational_signal_attempt_conflict_missing");
  }
  if (existing.rows[0].evidence?.attemptHash !== attemptHash) {
    throw new Error("operational_signal_attempt_identity_conflict");
  }
  return { replayed: true };
}
