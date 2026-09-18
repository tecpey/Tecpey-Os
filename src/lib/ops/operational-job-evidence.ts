import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;
const HASH_RE = /^[0-9a-f]{64}$/;

export type OperationalJobResultStatus =
  | "succeeded"
  | "partial_failure"
  | "authority_unavailable";

export type OperationalJobRunEvidence = {
  runId: string;
  jobName: string;
  schedulerUnit: string;
  hostName: string;
  resultStatus: OperationalJobResultStatus;
  startedAt: string;
  completedAt: string;
  batchesProcessed: number;
  selectedCount: number;
  finalizedCompletedCount: number;
  finalizedNotCompletedCount: number;
  failureCount: number;
  drainLimitReached: boolean;
  failureFingerprints: string[];
  reasonCodes: string[];
};

export type OperationalAlertEvidence = {
  schemaVersion: 1;
  alertId: string;
  run: OperationalJobRunEvidence;
  severity: "warning" | "critical";
  occurredAt: string;
};

export type OperationalAlertDeliveryAttempt = {
  alertId: string;
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

export type OperationalSignalEvidence = {
  schemaVersion: 1;
  signalId: string;
  incidentId: string;
  source: string;
  sourceUnit: string;
  hostName: string;
  severity: "warning" | "critical";
  lifecycle: "firing" | "resolved";
  condition: string;
  conditionFingerprint: string;
  occurredAt: string;
  reasonCodes: string[];
  counters: Record<string, number>;
  gauges: Record<string, number | null>;
};

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
  throw new Error("operational_evidence_value_invalid");
}

export function hashOperationalEvidence(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function iso(value: string, code: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(code);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(code);
  return normalized;
}

function boundedToken(value: string, minimum: number, maximum: number, code: string): string {
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
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 1 ||
    normalized.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error("operational_host_invalid");
  }
  return normalized;
}

function count(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error(code);
  }
  return value;
}

function uniqueTokens(
  values: string[],
  maximumItems: number,
  minimumLength: number,
  maximumLength: number,
  code: string,
): string[] {
  if (!Array.isArray(values) || values.length > maximumItems) throw new Error(code);
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = boundedToken(raw, minimumLength, maximumLength, code);
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output.sort();
}

function metricMap(
  input: Record<string, number | null>,
  kind: "counter" | "gauge",
  code: string,
): Record<string, number | null> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(code);
  }
  const entries = Object.entries(input);
  if (entries.length > 32) throw new Error(code);
  const output: Record<string, number | null> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = boundedToken(rawKey, 1, 64, code);
    if (rawValue === null) {
      if (kind !== "gauge") throw new Error(code);
      output[key] = null;
      continue;
    }
    if (
      !Number.isFinite(rawValue) ||
      Math.abs(rawValue) > 1_000_000_000_000 ||
      (kind === "counter" && (!Number.isSafeInteger(rawValue) || rawValue < 0))
    ) {
      throw new Error(code);
    }
    output[key] = rawValue;
  }
  return Object.fromEntries(
    Object.entries(output).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function operationalDeliveryAttemptEvidence(
  raw: {
    deliveryResult: "delivered" | "retryable_failure" | "terminal_failure";
    httpStatus: number | null;
    errorCode: string | null;
    attemptedAt: string;
    evidence: { provider: "webhook"; responseBodyBytes: number };
  },
): {
  deliveryResult: "delivered" | "retryable_failure" | "terminal_failure";
  httpStatus: number | null;
  errorCode: string | null;
  attemptedAt: string;
  evidence: { provider: "webhook"; responseBodyBytes: number };
} {
  if (
    raw.deliveryResult !== "delivered" &&
    raw.deliveryResult !== "retryable_failure" &&
    raw.deliveryResult !== "terminal_failure"
  ) {
    throw new Error("operational_delivery_result_invalid");
  }
  if (
    raw.httpStatus !== null &&
    (!Number.isSafeInteger(raw.httpStatus) ||
      raw.httpStatus < 100 ||
      raw.httpStatus > 599)
  ) {
    throw new Error("operational_http_status_invalid");
  }
  const errorCode = raw.errorCode === null
    ? null
    : boundedToken(
        raw.errorCode,
        1,
        100,
        "operational_error_code_invalid",
      );
  const attemptedAt = iso(
    raw.attemptedAt,
    "operational_attempted_at_invalid",
  );
  const evidence = {
    provider: raw.evidence.provider,
    responseBodyBytes: count(
      raw.evidence.responseBodyBytes,
      "operational_response_body_bytes_invalid",
    ),
  };
  if (evidence.provider !== "webhook") {
    throw new Error("operational_provider_invalid");
  }
  return {
    deliveryResult: raw.deliveryResult,
    httpStatus: raw.httpStatus,
    errorCode,
    attemptedAt,
    evidence,
  };
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
  const source = boundedToken(
    input.source,
    3,
    100,
    "operational_signal_source_invalid",
  );
  const sourceUnit = boundedToken(
    input.sourceUnit,
    3,
    200,
    "operational_signal_unit_invalid",
  );
  if (!sourceUnit.endsWith(".service")) {
    throw new Error("operational_signal_unit_invalid");
  }
  const lifecycle = input.lifecycle;
  if (lifecycle !== "firing" && lifecycle !== "resolved") {
    throw new Error("operational_signal_lifecycle_invalid");
  }
  const signalId = boundedToken(
    input.signalId,
    8,
    240,
    "operational_signal_id_invalid",
  );
  if (signalId !== `${source}:${incidentId}:${lifecycle}`) {
    throw new Error("operational_signal_identity_invalid");
  }
  if (input.severity !== "warning" && input.severity !== "critical") {
    throw new Error("operational_signal_severity_invalid");
  }
  const condition = boundedToken(
    input.condition,
    3,
    100,
    "operational_signal_condition_invalid",
  );
  if (!HASH_RE.test(input.conditionFingerprint)) {
    throw new Error("operational_signal_fingerprint_invalid");
  }
  const reasonCodes = uniqueTokens(
    input.reasonCodes,
    32,
    3,
    100,
    "operational_signal_reason_codes_invalid",
  );
  if (lifecycle === "firing" && reasonCodes.length === 0) {
    throw new Error("operational_signal_firing_reason_required");
  }
  if (lifecycle === "resolved" && !reasonCodes.includes("condition_recovered")) {
    throw new Error("operational_signal_resolution_reason_required");
  }
  return {
    schemaVersion: 1,
    signalId,
    incidentId,
    source,
    sourceUnit,
    hostName: boundedHost(input.hostName),
    severity: input.severity,
    lifecycle,
    condition,
    conditionFingerprint: input.conditionFingerprint,
    occurredAt: iso(input.occurredAt, "operational_signal_occurred_at_invalid"),
    reasonCodes,
    counters: metricMap(
      input.counters,
      "counter",
      "operational_signal_counters_invalid",
    ) as Record<string, number>,
    gauges: metricMap(
      input.gauges,
      "gauge",
      "operational_signal_gauges_invalid",
    ),
  };
}

export function validateOperationalJobRunEvidence(
  input: OperationalJobRunEvidence,
): OperationalJobRunEvidence {
  if (!UUID_RE.test(input.runId)) throw new Error("operational_run_id_invalid");
  const jobName = boundedToken(input.jobName, 3, 100, "operational_job_name_invalid");
  const schedulerUnit = boundedToken(
    input.schedulerUnit,
    3,
    200,
    "operational_scheduler_unit_invalid",
  );
  if (!schedulerUnit.endsWith(".service")) {
    throw new Error("operational_scheduler_unit_invalid");
  }
  const startedAt = iso(input.startedAt, "operational_started_at_invalid");
  const completedAt = iso(input.completedAt, "operational_completed_at_invalid");
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new Error("operational_time_order_invalid");
  }
  if (
    input.resultStatus !== "succeeded" &&
    input.resultStatus !== "partial_failure" &&
    input.resultStatus !== "authority_unavailable"
  ) {
    throw new Error("operational_result_status_invalid");
  }
  const selectedCount = count(input.selectedCount, "operational_selected_count_invalid");
  const finalizedCompletedCount = count(
    input.finalizedCompletedCount,
    "operational_completed_count_invalid",
  );
  const finalizedNotCompletedCount = count(
    input.finalizedNotCompletedCount,
    "operational_not_completed_count_invalid",
  );
  if (finalizedCompletedCount + finalizedNotCompletedCount > selectedCount) {
    throw new Error("operational_finalized_count_invalid");
  }
  const failureFingerprints = uniqueTokens(
    input.failureFingerprints,
    250,
    24,
    24,
    "operational_failure_fingerprint_invalid",
  );
  const reasonCodes = uniqueTokens(
    input.reasonCodes,
    32,
    3,
    100,
    "operational_reason_code_invalid",
  );
  const failureCount = count(input.failureCount, "operational_failure_count_invalid");
  if (failureCount !== failureFingerprints.length && input.resultStatus !== "authority_unavailable") {
    throw new Error("operational_failure_count_mismatch");
  }
  if (input.resultStatus === "succeeded" && (failureCount > 0 || input.drainLimitReached)) {
    throw new Error("operational_success_evidence_invalid");
  }
  if (
    input.resultStatus === "authority_unavailable" &&
    (selectedCount !== 0 || finalizedCompletedCount !== 0 || finalizedNotCompletedCount !== 0)
  ) {
    throw new Error("operational_unavailable_counts_invalid");
  }
  return {
    runId: input.runId.toLowerCase(),
    jobName,
    schedulerUnit,
    hostName: boundedHost(input.hostName),
    resultStatus: input.resultStatus,
    startedAt,
    completedAt,
    batchesProcessed: count(input.batchesProcessed, "operational_batches_invalid"),
    selectedCount,
    finalizedCompletedCount,
    finalizedNotCompletedCount,
    failureCount,
    drainLimitReached: input.drainLimitReached === true,
    failureFingerprints,
    reasonCodes,
  };
}

export function validateOperationalAlertEvidence(
  input: OperationalAlertEvidence,
): OperationalAlertEvidence {
  if (input.schemaVersion !== 1) throw new Error("operational_alert_schema_invalid");
  const run = validateOperationalJobRunEvidence(input.run);
  const alertId = boundedToken(input.alertId, 8, 220, "operational_alert_id_invalid");
  if (alertId !== `${run.jobName}:${run.runId}`) {
    throw new Error("operational_alert_identity_invalid");
  }
  if (run.resultStatus === "succeeded") {
    throw new Error("operational_alert_success_forbidden");
  }
  const severity = input.severity;
  if (
    (run.resultStatus === "partial_failure" && severity !== "warning") ||
    (run.resultStatus === "authority_unavailable" && severity !== "critical")
  ) {
    throw new Error("operational_alert_severity_invalid");
  }
  return {
    schemaVersion: 1,
    alertId,
    run,
    severity,
    occurredAt: iso(input.occurredAt, "operational_alert_occurred_at_invalid"),
  };
}

export async function persistOperationalJobRunTx(
  client: PoolClient,
  raw: OperationalJobRunEvidence,
): Promise<{ replayed: boolean; resultHash: string }> {
  const run = validateOperationalJobRunEvidence(raw);
  const summary = {
    failureFingerprints: run.failureFingerprints,
    reasonCodes: run.reasonCodes,
  };
  const resultHash = hashOperationalEvidence(run);
  if (!HASH_RE.test(resultHash)) throw new Error("operational_result_hash_invalid");
  const inserted = await client.query(
    `INSERT INTO platform_operational_job_runs
       (run_id, job_name, scheduler_unit, host_name, result_status,
        started_at, completed_at, batches_processed, selected_count,
        finalized_completed_count, finalized_not_completed_count,
        failure_count, drain_limit_reached, result_hash, summary)
     VALUES
       ($1::uuid, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz,
        $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
     ON CONFLICT (run_id) DO NOTHING`,
    [
      run.runId,
      run.jobName,
      run.schedulerUnit,
      run.hostName,
      run.resultStatus,
      run.startedAt,
      run.completedAt,
      run.batchesProcessed,
      run.selectedCount,
      run.finalizedCompletedCount,
      run.finalizedNotCompletedCount,
      run.failureCount,
      run.drainLimitReached,
      resultHash,
      JSON.stringify(summary),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) return { replayed: false, resultHash };
  const existing = await client.query<{ result_hash: string }>(
    "SELECT result_hash FROM platform_operational_job_runs WHERE run_id = $1::uuid LIMIT 1",
    [run.runId],
  );
  if (!existing.rows[0]) throw new Error("operational_run_conflict_missing");
  if (existing.rows[0].result_hash !== resultHash) {
    throw new Error("operational_run_identity_conflict");
  }
  return { replayed: true, resultHash };
}

export async function persistOperationalAlertTx(
  client: PoolClient,
  raw: OperationalAlertEvidence,
): Promise<{ replayed: boolean; payloadHash: string }> {
  const alert = validateOperationalAlertEvidence(raw);
  await persistOperationalJobRunTx(client, alert.run);
  const payloadHash = hashOperationalEvidence(alert);
  const inserted = await client.query(
    `INSERT INTO platform_operational_alerts
       (alert_id, run_id, job_name, scheduler_unit, severity,
        status_classification, occurred_at, payload_hash, payload)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::timestamptz, $8, $9::jsonb)
     ON CONFLICT (alert_id) DO NOTHING`,
    [
      alert.alertId,
      alert.run.runId,
      alert.run.jobName,
      alert.run.schedulerUnit,
      alert.severity,
      alert.run.resultStatus,
      alert.occurredAt,
      payloadHash,
      JSON.stringify(alert),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) return { replayed: false, payloadHash };
  const existing = await client.query<{ payload_hash: string }>(
    "SELECT payload_hash FROM platform_operational_alerts WHERE alert_id = $1 LIMIT 1",
    [alert.alertId],
  );
  if (!existing.rows[0]) throw new Error("operational_alert_conflict_missing");
  if (existing.rows[0].payload_hash !== payloadHash) {
    throw new Error("operational_alert_identity_conflict");
  }
  return { replayed: true, payloadHash };
}

export async function persistOperationalSignalTx(
  client: PoolClient,
  raw: OperationalSignalEvidence,
): Promise<{ replayed: boolean; payloadHash: string }> {
  const signal = validateOperationalSignalEvidence(raw);
  const payloadHash = hashOperationalEvidence(signal);
  const inserted = await client.query(
    `INSERT INTO platform_operational_signals
       (signal_id, incident_id, source, source_unit, host_name, severity,
        lifecycle, condition, condition_fingerprint, occurred_at,
        payload_hash, payload)
     VALUES
       ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz,
        $11, $12::jsonb)
     ON CONFLICT (signal_id) DO NOTHING`,
    [
      signal.signalId,
      signal.incidentId,
      signal.source,
      signal.sourceUnit,
      signal.hostName,
      signal.severity,
      signal.lifecycle,
      signal.condition,
      signal.conditionFingerprint,
      signal.occurredAt,
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
    240,
    "operational_signal_id_invalid",
  );
  const attemptNumber = count(
    raw.attemptNumber,
    "operational_attempt_number_invalid",
  );
  if (attemptNumber < 1 || attemptNumber > 100) {
    throw new Error("operational_attempt_number_invalid");
  }
  const normalized = operationalDeliveryAttemptEvidence(raw);
  const attemptHash = hashOperationalEvidence({
    signalId,
    attemptNumber,
    ...normalized,
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
      normalized.deliveryResult,
      normalized.httpStatus,
      normalized.errorCode,
      normalized.attemptedAt,
      JSON.stringify({ ...normalized.evidence, attemptHash }),
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

export async function persistOperationalAlertDeliveryAttemptTx(
  client: PoolClient,
  raw: OperationalAlertDeliveryAttempt,
): Promise<{ replayed: boolean }> {
  const alertId = boundedToken(
    raw.alertId,
    8,
    220,
    "operational_alert_id_invalid",
  );
  const attemptNumber = count(
    raw.attemptNumber,
    "operational_attempt_number_invalid",
  );
  if (attemptNumber < 1 || attemptNumber > 100) {
    throw new Error("operational_attempt_number_invalid");
  }
  const normalized = operationalDeliveryAttemptEvidence(raw);
  const attemptHash = hashOperationalEvidence({
    alertId,
    attemptNumber,
    ...normalized,
  });
  const inserted = await client.query(
    `INSERT INTO platform_operational_alert_delivery_attempts
       (alert_id, attempt_number, delivery_result, http_status,
        error_code, attempted_at, evidence)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb)
     ON CONFLICT (alert_id, attempt_number) DO NOTHING`,
    [
      alertId,
      attemptNumber,
      normalized.deliveryResult,
      normalized.httpStatus,
      normalized.errorCode,
      normalized.attemptedAt,
      JSON.stringify({ ...normalized.evidence, attemptHash }),
    ],
  );
  if ((inserted.rowCount ?? 0) === 1) return { replayed: false };
  const existing = await client.query<{ evidence: { attemptHash?: string } }>(
    `SELECT evidence
       FROM platform_operational_alert_delivery_attempts
      WHERE alert_id = $1 AND attempt_number = $2
      LIMIT 1`,
    [alertId, attemptNumber],
  );
  if (!existing.rows[0]) {
    throw new Error("operational_attempt_conflict_missing");
  }
  if (existing.rows[0].evidence?.attemptHash !== attemptHash) {
    throw new Error("operational_attempt_identity_conflict");
  }
  return { replayed: true };
}
