import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;
const LOWER_TOKEN_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OperationalSignalSeverity = "warning" | "critical";
export type OperationalSignalLifecycleV1 = "firing" | "resolved";
export type OperationalSignalLifecycle = "firing" | "updated" | "resolved";
export type OperationalSignalMeasurement = number | boolean | null;

type OperationalSignalCommon = Readonly<{
  signalId: string;
  signalType: string;
  component: string;
  sourceUnit: string;
  severity: OperationalSignalSeverity;
  occurredAt: string;
  dedupeWindowStart: string;
  dedupeWindowSeconds: number;
  incidentKey: string;
  reasonCodes: readonly string[];
  measurements: Readonly<Record<string, OperationalSignalMeasurement>>;
}>;

export type OperationalSignalEvidenceV1 = OperationalSignalCommon & Readonly<{
  schemaVersion: 1;
  lifecycle: OperationalSignalLifecycleV1;
}>;

export type OperationalSignalEvidenceV2 = OperationalSignalCommon & Readonly<{
  schemaVersion: 2;
  lifecycle: OperationalSignalLifecycle;
  episodeId: string;
  episodeSequence: number;
}>;

export type OperationalSignalEvidence =
  | OperationalSignalEvidenceV1
  | OperationalSignalEvidenceV2;

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
  episode_id: string | null;
  episode_sequence: number | null;
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

function normalizeReasonCodes(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 32) {
    throw new Error("operational_signal_reason_codes_invalid");
  }
  const output = values.map((value) =>
    boundedToken(
      value,
      3,
      100,
      "operational_signal_reason_codes_invalid",
      true,
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
    const key = boundedToken(
      rawKey,
      1,
      64,
      "operational_signal_measurement_key_invalid",
      true,
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
  severity: OperationalSignalSeverity;
  reasonCodes: readonly string[];
}): string {
  return hashOperationalSignalEvidence({
    authority: "tecpey-operational-signal-incident-v1",
    signalType: input.signalType,
    component: input.component,
    sourceUnit: input.sourceUnit,
    severity: input.severity,
    reasonCodes: [...input.reasonCodes],
  });
}

function expectedLegacySignalId(input: {
  incidentKey: string;
  lifecycle: OperationalSignalLifecycleV1;
  dedupeWindowStart: string;
  dedupeWindowSeconds: number;
}): string {
  const digest = hashOperationalSignalEvidence({
    authority: "tecpey-operational-signal-dedupe-v1",
    incidentKey: input.incidentKey,
    lifecycle: input.lifecycle,
    dedupeWindowStart: input.dedupeWindowStart,
    dedupeWindowSeconds: input.dedupeWindowSeconds,
  });
  return `ops:${digest.slice(0, 56)}`;
}

function expectedEpisodeSignalId(input: {
  episodeId: string;
  episodeSequence: number;
  incidentKey: string;
  lifecycle: OperationalSignalLifecycle;
}): string {
  const digest = hashOperationalSignalEvidence({
    authority: "tecpey-operational-signal-episode-v2",
    episodeId: input.episodeId,
    episodeSequence: input.episodeSequence,
    incidentKey: input.incidentKey,
    lifecycle: input.lifecycle,
  });
  return `ops:${digest.slice(0, 56)}`;
}

function normalizeEpisodeId(value: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error("operational_signal_episode_invalid");
  }
  return value.toLowerCase();
}

function normalizeCommon(input: {
  signalType: string;
  component: string;
  sourceUnit: string;
  severity: OperationalSignalSeverity;
  occurredAt: string;
  dedupeWindowSeconds: number;
  reasonCodes: readonly string[];
  measurements: Readonly<Record<string, OperationalSignalMeasurement>>;
}): Omit<OperationalSignalCommon, "signalId"> {
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
  const occurredAt = iso(
    input.occurredAt,
    "operational_signal_occurred_at_invalid",
  );
  const dedupeWindowSeconds = boundedInteger(
    input.dedupeWindowSeconds,
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
  const measurements = normalizeMeasurements(input.measurements);
  const incidentKey = expectedIncidentKey({
    signalType,
    component,
    sourceUnit,
    severity: input.severity,
    reasonCodes,
  });
  return {
    signalType,
    component,
    sourceUnit,
    severity: input.severity,
    occurredAt,
    dedupeWindowStart,
    dedupeWindowSeconds,
    incidentKey,
    reasonCodes: Object.freeze(reasonCodes),
    measurements: Object.freeze(measurements),
  };
}

export function createOperationalSignalEvidence(input: {
  signalType: string;
  component: string;
  sourceUnit: string;
  severity: OperationalSignalSeverity;
  lifecycle?: OperationalSignalLifecycleV1;
  occurredAt: string;
  dedupeWindowSeconds?: number;
  reasonCodes: readonly string[];
  measurements?: Readonly<Record<string, OperationalSignalMeasurement>>;
}): OperationalSignalEvidenceV1 {
  const lifecycle = input.lifecycle ?? "firing";
  if (lifecycle !== "firing" && lifecycle !== "resolved") {
    throw new Error("operational_signal_lifecycle_invalid");
  }
  const common = normalizeCommon({
    ...input,
    dedupeWindowSeconds: input.dedupeWindowSeconds ?? 3_600,
    measurements: input.measurements ?? {},
  });
  const signalId = expectedLegacySignalId({
    incidentKey: common.incidentKey,
    lifecycle,
    dedupeWindowStart: common.dedupeWindowStart,
    dedupeWindowSeconds: common.dedupeWindowSeconds,
  });
  return Object.freeze({
    schemaVersion: 1,
    signalId,
    ...common,
    lifecycle,
  });
}

export function createOperationalSignalEpisodeEvidence(input: {
  signalType: string;
  component: string;
  sourceUnit: string;
  severity: OperationalSignalSeverity;
  lifecycle: OperationalSignalLifecycle;
  episodeId: string;
  episodeSequence: number;
  occurredAt: string;
  dedupeWindowSeconds?: number;
  reasonCodes: readonly string[];
  measurements?: Readonly<Record<string, OperationalSignalMeasurement>>;
}): OperationalSignalEvidenceV2 {
  if (
    input.lifecycle !== "firing" &&
    input.lifecycle !== "updated" &&
    input.lifecycle !== "resolved"
  ) {
    throw new Error("operational_signal_lifecycle_invalid");
  }
  const episodeId = normalizeEpisodeId(input.episodeId);
  const episodeSequence = boundedInteger(
    input.episodeSequence,
    1,
    1_000_000,
    "operational_signal_episode_sequence_invalid",
  );
  const common = normalizeCommon({
    ...input,
    dedupeWindowSeconds: input.dedupeWindowSeconds ?? 3_600,
    measurements: input.measurements ?? {},
  });
  const signalId = expectedEpisodeSignalId({
    episodeId,
    episodeSequence,
    incidentKey: common.incidentKey,
    lifecycle: input.lifecycle,
  });
  return Object.freeze({
    schemaVersion: 2,
    signalId,
    ...common,
    lifecycle: input.lifecycle,
    episodeId,
    episodeSequence,
  });
}

export function validateOperationalSignalEvidence(
  raw: OperationalSignalEvidence,
): OperationalSignalEvidence {
  if (!raw || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2)) {
    throw new Error("operational_signal_schema_invalid");
  }
  if (raw.schemaVersion === 1) {
    if (raw.lifecycle !== "firing" && raw.lifecycle !== "resolved") {
      throw new Error("operational_signal_lifecycle_invalid");
    }
    const common = normalizeCommon({
      ...raw,
      dedupeWindowSeconds: raw.dedupeWindowSeconds,
      measurements: raw.measurements,
    });
    if (raw.dedupeWindowStart !== common.dedupeWindowStart) {
      throw new Error("operational_signal_window_start_invalid");
    }
    const signalId = expectedLegacySignalId({
      incidentKey: common.incidentKey,
      lifecycle: raw.lifecycle,
      dedupeWindowStart: common.dedupeWindowStart,
      dedupeWindowSeconds: common.dedupeWindowSeconds,
    });
    if (
      raw.signalId !== signalId ||
      raw.incidentKey !== common.incidentKey
    ) {
      throw new Error("operational_signal_identity_invalid");
    }
    return Object.freeze({
      schemaVersion: 1,
      signalId,
      ...common,
      lifecycle: raw.lifecycle,
    });
  }

  if (
    raw.lifecycle !== "firing" &&
    raw.lifecycle !== "updated" &&
    raw.lifecycle !== "resolved"
  ) {
    throw new Error("operational_signal_lifecycle_invalid");
  }
  const episodeId = normalizeEpisodeId(raw.episodeId);
  const episodeSequence = boundedInteger(
    raw.episodeSequence,
    1,
    1_000_000,
    "operational_signal_episode_sequence_invalid",
  );
  const common = normalizeCommon({
    ...raw,
    dedupeWindowSeconds: raw.dedupeWindowSeconds,
    measurements: raw.measurements,
  });
  if (raw.dedupeWindowStart !== common.dedupeWindowStart) {
    throw new Error("operational_signal_window_start_invalid");
  }
  const signalId = expectedEpisodeSignalId({
    episodeId,
    episodeSequence,
    incidentKey: common.incidentKey,
    lifecycle: raw.lifecycle,
  });
  if (
    raw.signalId !== signalId ||
    raw.incidentKey !== common.incidentKey
  ) {
    throw new Error("operational_signal_identity_invalid");
  }
  return Object.freeze({
    schemaVersion: 2,
    signalId,
    ...common,
    lifecycle: raw.lifecycle,
    episodeId,
    episodeSequence,
  });
}

function sameIdentity(
  row: SignalIdentityRow,
  signal: OperationalSignalEvidence,
): boolean {
  const episodeId = signal.schemaVersion === 2 ? signal.episodeId : null;
  const episodeSequence =
    signal.schemaVersion === 2 ? signal.episodeSequence : null;
  return (
    row.signal_type === signal.signalType &&
    row.component === signal.component &&
    row.severity === signal.severity &&
    row.lifecycle === signal.lifecycle &&
    row.dedupe_window_start.toISOString() === signal.dedupeWindowStart &&
    row.dedupe_window_seconds === signal.dedupeWindowSeconds &&
    row.incident_key === signal.incidentKey &&
    row.episode_id === episodeId &&
    (row.episode_sequence === null
      ? episodeSequence === null
      : Number(row.episode_sequence) === episodeSequence)
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
        episode_id, episode_sequence, payload_hash, payload)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10,
        $11::uuid, $12, $13, $14::jsonb)
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
      signal.schemaVersion === 2 ? signal.episodeId : null,
      signal.schemaVersion === 2 ? signal.episodeSequence : null,
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
            episode_id::text, episode_sequence, payload_hash
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
  if (signal.schemaVersion === 2 && row.payload_hash !== payloadHash) {
    throw new Error("operational_signal_payload_identity_conflict");
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
