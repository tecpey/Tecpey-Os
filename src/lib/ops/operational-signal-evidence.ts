import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;
const LOWER_TOKEN_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const ATTRIBUTE_KEY_RE = /^[a-z][A-Za-z0-9._:-]{0,63}$/;
const FORBIDDEN_ATTRIBUTE_KEY_RE =
  /(tenant|workspace|student|user|account|conversation|prompt|email|phone|address|token|secret|cookie|authorization|portfolio|kyc|passport)/i;
const ALLOWED_STRING_ATTRIBUTE_KEYS = new Set(["policyVersion", "sourceVersion"]);
const FORBIDDEN_REASON_CODE_RE =
  /(tenant|workspace|student|user|account|conversation|prompt|email|phone|address|token|secret|cookie|authorization|portfolio|kyc|passport)/i;

export type OperationalSignalSeverity = "warning" | "critical";
export type OperationalSignalStatus = "active" | "authority_unavailable";
export type OperationalSignalAttribute = string | number | boolean | null;

export type OperationalSignalEvidence = {
  schemaVersion: 1;
  signalId: string;
  signalType: string;
  component: string;
  detector: string;
  severity: OperationalSignalSeverity;
  statusClassification: OperationalSignalStatus;
  occurredAt: string;
  dedupeBucketAt: string;
  fingerprint: string;
  reasonCodes: string[];
  attributes: Record<string, OperationalSignalAttribute>;
};

export type CreateOperationalSignalInput = Readonly<{
  signalType: string;
  component: string;
  detector: string;
  severity: OperationalSignalSeverity;
  statusClassification: OperationalSignalStatus;
  occurredAt: string;
  reasonCodes: readonly string[];
  attributes: Record<string, OperationalSignalAttribute>;
  dedupeWindowSeconds?: number;
}>;

export type OperationalSignalDeliveryAttempt = {
  signalId: string;
  attemptNumber: number;
  deliveryResult: "delivered" | "retryable_failure" | "terminal_failure";
  httpStatus: number | null;
  errorCode: string | null;
  attemptedAt: string;
  evidence: {
    provider: "webhook";
    responseBodyBytes: number;
  };
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
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    !(lowerOnly ? LOWER_TOKEN_RE : TOKEN_RE).test(value)
  ) {
    throw new Error(code);
  }
  return value;
}

function iso(value: string, code: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(code);
  return normalized;
}

function count(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

function validatedAttributes(
  raw: Record<string, OperationalSignalAttribute>,
): Record<string, OperationalSignalAttribute> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("operational_signal_attributes_invalid");
  }
  const entries = Object.entries(raw);
  if (entries.length > 24) throw new Error("operational_signal_attributes_too_many");
  const normalized: Record<string, OperationalSignalAttribute> = {};
  for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (
      !ATTRIBUTE_KEY_RE.test(key) ||
      FORBIDDEN_ATTRIBUTE_KEY_RE.test(key)
    ) {
      throw new Error("operational_signal_attribute_key_invalid");
    }
    if (typeof value === "string") {
      if (
        !ALLOWED_STRING_ATTRIBUTE_KEYS.has(key) ||
        value.length < 1 ||
        value.length > 80 ||
        !TOKEN_RE.test(value)
      ) {
        throw new Error("operational_signal_attribute_value_invalid");
      }
    } else if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) {
        throw new Error("operational_signal_attribute_value_invalid");
      }
    } else if (
      value !== null &&
      typeof value !== "boolean"
    ) {
      throw new Error("operational_signal_attribute_value_invalid");
    }
    normalized[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 4_096) {
    throw new Error("operational_signal_attributes_too_large");
  }
  return normalized;
}

function normalizedReasonCodes(raw: readonly string[]): string[] {
  if (!Array.isArray(raw) || raw.length > 16) {
    throw new Error("operational_signal_reason_codes_invalid");
  }
  const normalized = [...new Set(
    raw.map((reason) => {
      const normalized = boundedToken(
        reason,
        1,
        80,
        "operational_signal_reason_code_invalid",
        true,
      );
      if (FORBIDDEN_REASON_CODE_RE.test(normalized)) {
        throw new Error("operational_signal_reason_code_invalid");
      }
      return normalized;
    }),
  )].sort();
  if (normalized.length !== raw.length) {
    throw new Error("operational_signal_reason_codes_duplicate");
  }
  return normalized;
}

function computedFingerprint(input: {
  signalType: string;
  component: string;
  detector: string;
  severity: OperationalSignalSeverity;
  statusClassification: OperationalSignalStatus;
  reasonCodes: readonly string[];
  attributes: Record<string, OperationalSignalAttribute>;
}): string {
  return hashOperationalSignalEvidence({
    authority: "operational-signal-fingerprint-v1",
    signalType: input.signalType,
    component: input.component,
    detector: input.detector,
    severity: input.severity,
    statusClassification: input.statusClassification,
    reasonCodes: input.reasonCodes,
    attributes: input.attributes,
  });
}

function derivedSignalId(
  signalType: string,
  dedupeBucketAt: string,
  fingerprint: string,
): string {
  const bucketEpoch = Math.floor(Date.parse(dedupeBucketAt) / 1_000);
  return `signal:${signalType}:${bucketEpoch}:${fingerprint.slice(0, 24)}`;
}

export function createOperationalSignalEvidence(
  input: CreateOperationalSignalInput,
): OperationalSignalEvidence {
  const signalType = boundedToken(
    input.signalType,
    3,
    100,
    "operational_signal_type_invalid",
    true,
  );
  const component = boundedToken(
    input.component,
    3,
    100,
    "operational_signal_component_invalid",
    true,
  );
  const detector = boundedToken(
    input.detector,
    3,
    120,
    "operational_signal_detector_invalid",
    true,
  );
  if (input.severity !== "warning" && input.severity !== "critical") {
    throw new Error("operational_signal_severity_invalid");
  }
  if (
    input.statusClassification !== "active" &&
    input.statusClassification !== "authority_unavailable"
  ) {
    throw new Error("operational_signal_status_invalid");
  }
  const occurredAt = iso(
    input.occurredAt,
    "operational_signal_occurred_at_invalid",
  );
  const dedupeWindowSeconds = input.dedupeWindowSeconds ?? 900;
  if (
    !Number.isSafeInteger(dedupeWindowSeconds) ||
    dedupeWindowSeconds < 60 ||
    dedupeWindowSeconds > 86_400
  ) {
    throw new Error("operational_signal_dedupe_window_invalid");
  }
  const reasonCodes = normalizedReasonCodes(input.reasonCodes);
  const attributes = validatedAttributes(input.attributes);
  const fingerprint = computedFingerprint({
    signalType,
    component,
    detector,
    severity: input.severity,
    statusClassification: input.statusClassification,
    reasonCodes,
    attributes,
  });
  const occurredMs = Date.parse(occurredAt);
  const bucketMs = dedupeWindowSeconds * 1_000;
  const dedupeBucketAt = new Date(
    Math.floor(occurredMs / bucketMs) * bucketMs,
  ).toISOString();

  return Object.freeze({
    schemaVersion: 1,
    signalId: derivedSignalId(signalType, dedupeBucketAt, fingerprint),
    signalType,
    component,
    detector,
    severity: input.severity,
    statusClassification: input.statusClassification,
    occurredAt,
    dedupeBucketAt,
    fingerprint,
    reasonCodes,
    attributes,
  });
}

export function validateOperationalSignalEvidence(
  raw: OperationalSignalEvidence,
): OperationalSignalEvidence {
  if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1) {
    throw new Error("operational_signal_invalid");
  }
  const signalId = boundedToken(
    raw.signalId,
    8,
    220,
    "operational_signal_id_invalid",
  );
  const signalType = boundedToken(
    raw.signalType,
    3,
    100,
    "operational_signal_type_invalid",
    true,
  );
  const component = boundedToken(
    raw.component,
    3,
    100,
    "operational_signal_component_invalid",
    true,
  );
  const detector = boundedToken(
    raw.detector,
    3,
    120,
    "operational_signal_detector_invalid",
    true,
  );
  if (raw.severity !== "warning" && raw.severity !== "critical") {
    throw new Error("operational_signal_severity_invalid");
  }
  if (
    raw.statusClassification !== "active" &&
    raw.statusClassification !== "authority_unavailable"
  ) {
    throw new Error("operational_signal_status_invalid");
  }
  const occurredAt = iso(raw.occurredAt, "operational_signal_occurred_at_invalid");
  const dedupeBucketAt = iso(
    raw.dedupeBucketAt,
    "operational_signal_dedupe_bucket_invalid",
  );
  if (Date.parse(dedupeBucketAt) > Date.parse(occurredAt)) {
    throw new Error("operational_signal_time_not_canonical");
  }
  if (!HASH_RE.test(raw.fingerprint)) {
    throw new Error("operational_signal_fingerprint_invalid");
  }
  const reasonCodes = normalizedReasonCodes(raw.reasonCodes);
  const attributes = validatedAttributes(raw.attributes);
  const expectedFingerprint = computedFingerprint({
    signalType,
    component,
    detector,
    severity: raw.severity,
    statusClassification: raw.statusClassification,
    reasonCodes,
    attributes,
  });
  if (raw.fingerprint !== expectedFingerprint) {
    throw new Error("operational_signal_fingerprint_mismatch");
  }
  const expectedSignalId = derivedSignalId(
    signalType,
    dedupeBucketAt,
    expectedFingerprint,
  );
  if (signalId !== expectedSignalId) {
    throw new Error("operational_signal_id_mismatch");
  }

  return Object.freeze({
    schemaVersion: 1,
    signalId,
    signalType,
    component,
    detector,
    severity: raw.severity,
    statusClassification: raw.statusClassification,
    occurredAt,
    dedupeBucketAt,
    fingerprint: raw.fingerprint,
    reasonCodes,
    attributes,
  });
}

export async function persistOperationalSignalTx(
  client: PoolClient,
  raw: OperationalSignalEvidence,
): Promise<{ replayed: boolean; payloadHash: string }> {
  const signal = validateOperationalSignalEvidence(raw);
  const payloadHash = hashOperationalSignalEvidence(signal);
  const inserted = await client.query(
    `INSERT INTO platform_operational_signals
       (signal_id, signal_type, component, detector, severity,
        status_classification, occurred_at, dedupe_bucket_at, fingerprint,
        payload_hash, payload)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz,
        $9, $10, $11::jsonb)
     ON CONFLICT (signal_id) DO NOTHING`,
    [
      signal.signalId,
      signal.signalType,
      signal.component,
      signal.detector,
      signal.severity,
      signal.statusClassification,
      signal.occurredAt,
      signal.dedupeBucketAt,
      signal.fingerprint,
      payloadHash,
      JSON.stringify(signal),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) {
    return { replayed: false, payloadHash };
  }
  const existing = await client.query<{ payload_hash: string }>(
    "SELECT payload_hash FROM platform_operational_signals WHERE signal_id = $1 LIMIT 1",
    [signal.signalId],
  );
  if (!existing.rows[0]) throw new Error("operational_signal_conflict_missing");
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
  const attemptNumber = count(
    raw.attemptNumber,
    "operational_signal_attempt_number_invalid",
  );
  if (attemptNumber < 1 || attemptNumber > 100) {
    throw new Error("operational_signal_attempt_number_invalid");
  }
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
        true,
      );
  const attemptedAt = iso(
    raw.attemptedAt,
    "operational_signal_attempted_at_invalid",
  );
  if (raw.evidence.provider !== "webhook") {
    throw new Error("operational_signal_provider_invalid");
  }
  const responseBodyBytes = count(
    raw.evidence.responseBodyBytes,
    "operational_signal_response_body_bytes_invalid",
  );
  const evidence = {
    provider: "webhook" as const,
    responseBodyBytes,
  };
  const attemptHash = hashOperationalSignalEvidence({
    signalId,
    attemptNumber,
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
      signalId,
      attemptNumber,
      raw.deliveryResult,
      raw.httpStatus,
      errorCode,
      attemptedAt,
      JSON.stringify({ ...evidence, attemptHash }),
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
