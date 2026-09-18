import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  hashOperationalEvidence,
  persistOperationalAlertDeliveryAttemptTx,
  persistOperationalAlertTx,
  validateOperationalAlertEvidence,
  validateOperationalJobRunEvidence,
  type OperationalAlertEvidence,
  type OperationalJobRunEvidence,
} from "@/lib/ops/operational-job-evidence";
import {
  persistOperationalSignalDeliveryAttemptTx,
  persistOperationalSignalTx,
  validateOperationalSignalEvidence,
  type OperationalSignalDetailValue,
  type OperationalSignalEvidence,
  type OperationalSignalPhase,
  type OperationalSignalSeverity,
} from "@/lib/ops/operational-signal-evidence";

const MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_ATTEMPTS = 10;
const MAX_RESPONSE_BODY_BYTES = 0;
const SAFE_FILE_RE = /^[0-9a-f]{64}\.json$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LocalDeliveryAttempt = Readonly<{
  attemptNumber: number;
  deliveryResult: "delivered" | "retryable_failure" | "terminal_failure";
  httpStatus: number | null;
  errorCode: string | null;
  attemptedAt: string;
}>;

type DeliveryState = {
  attemptCount: number;
  nextAttemptAt: string;
  lastErrorCode: string | null;
  attempts: readonly LocalDeliveryAttempt[];
};

export type OperationalAlertSpoolItem = {
  schemaVersion: 1;
  alert: OperationalAlertEvidence;
  delivery: DeliveryState;
};

export type OperationalSignalSpoolItem = {
  schemaVersion: 2;
  signal: OperationalSignalEvidence;
  delivery: DeliveryState;
};

export type OperationalSpoolItem =
  | OperationalAlertSpoolItem
  | OperationalSignalSpoolItem;

export type OperationalAlertDeliveryConfig = {
  stateDirectory: string;
  webhookUrl: string;
  bearerToken?: string | null;
  limit?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  now?: Date;
  fetchImpl?: typeof fetch;
};

export type OperationalAlertDeliverySummary = {
  selected: number;
  delivered: number;
  retryable: number;
  quarantined: number;
  skippedUntilLater: number;
};

export type OperationalSignalObservation = Readonly<{
  source: string;
  sourceUnit: string;
  hostName: string;
  status: "healthy" | "warning" | "critical" | "authority_unavailable";
  observedAt: string;
  reasonCodes: readonly string[];
  details: Readonly<Record<string, OperationalSignalDetailValue>>;
}>;

export type OperationalSignalIncidentResult = Readonly<{
  emitted: boolean;
  replayed: boolean;
  phase: OperationalSignalPhase | null;
  incidentId: string | null;
  sequence: number | null;
}>;

type OperationalSignalIncidentState = {
  schemaVersion: 1;
  source: string;
  sourceUnit: string;
  hostName: string;
  incidentId: string;
  sequence: number;
  lastEmittedSequence: number;
  pendingPhase: OperationalSignalPhase;
  severity: OperationalSignalSeverity;
  fingerprint: string;
  reasonCodes: readonly string[];
  details: Readonly<Record<string, OperationalSignalDetailValue>>;
  openedAt: string;
  lastObservedAt: string;
};

function normalizedAbsoluteDirectory(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    value.length > 500 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    throw new Error("operational_state_directory_invalid");
  }
  const normalized = path.normalize(value);
  if (normalized === path.parse(normalized).root) {
    throw new Error("operational_state_directory_unsafe");
  }
  return normalized;
}

function iso(value: string, code: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(code);
  return normalized;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < minimum || selected > maximum) {
    throw new Error(code);
  }
  return selected;
}

function validateWebhookUrl(value: string): string {
  if (typeof value !== "string" || value.length < 10 || value.length > 2_048) {
    throw new Error("operational_alert_webhook_invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("operational_alert_webhook_invalid");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("operational_alert_webhook_invalid");
  }
  const testHttpAllowed =
    process.env.NODE_ENV === "test" &&
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (parsed.protocol !== "https:" && !testHttpAllowed) {
    throw new Error("operational_alert_webhook_https_required");
  }
  return parsed.toString();
}

function validateBearerToken(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (value.length > 2_000 || /[\r\n\u0000]/.test(value)) {
    throw new Error("operational_alert_bearer_invalid");
  }
  return value;
}

function spoolFileName(identity: string): string {
  return `${createHash("sha256").update(identity).digest("hex")}.json`;
}

function activeSignalFileName(source: string): string {
  return spoolFileName(`active-signal:${source}`);
}

function directories(stateDirectory: string) {
  const root = normalizedAbsoluteDirectory(stateDirectory);
  return {
    root,
    lastRun: path.join(root, "community-challenge-finalization-last-run.json"),
    pending: path.join(root, "alerts", "pending"),
    delivered: path.join(root, "alerts", "delivered"),
    quarantine: path.join(root, "alerts", "quarantine"),
    activeSignals: path.join(root, "signals", "active"),
  };
}

export type ManagedOperationalSpoolDirectories = ReturnType<typeof directories>;

async function assertNoSymlinkedAncestors(directory: string): Promise<void> {
  const parsed = path.parse(directory);
  const segments = path
    .relative(parsed.root, directory)
    .split(path.sep)
    .filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let entry;
    try {
      entry = await lstat(current);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        break;
      }
      throw error;
    }
    if (entry.isSymbolicLink()) {
      throw new Error("operational_state_directory_alias_forbidden");
    }
    if (!entry.isDirectory()) {
      throw new Error("operational_state_directory_unsafe");
    }
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertManagedDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_spool_directory_unsafe");
  }
  await chmod(directory, 0o700);
  await syncDirectory(directory);
}

export async function ensureOperationalSpoolDirectories(
  stateDirectory: string,
): Promise<ManagedOperationalSpoolDirectories> {
  const managed = directories(stateDirectory);
  await assertNoSymlinkedAncestors(managed.root);
  await assertManagedDirectory(managed.root);
  const resolvedRoot = await realpath(managed.root);
  if (resolvedRoot !== managed.root) {
    throw new Error("operational_state_directory_alias_forbidden");
  }
  await assertManagedDirectory(path.dirname(managed.pending));
  await assertManagedDirectory(managed.pending);
  await assertManagedDirectory(managed.delivered);
  await assertManagedDirectory(managed.quarantine);
  await assertManagedDirectory(path.dirname(managed.activeSignals));
  await assertManagedDirectory(managed.activeSignals);
  await syncDirectory(managed.root);
  await syncDirectory(path.dirname(managed.pending));
  await syncDirectory(path.dirname(managed.activeSignals));
  return managed;
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const parent = path.dirname(filePath);
  const stat = await lstat(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_spool_parent_unsafe");
  }
  const body = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(body) > MAX_FILE_BYTES) {
    throw new Error("operational_spool_payload_too_large");
  }
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${createHash("sha256")
      .update(`${filePath}:${Date.now()}:${process.hrtime.bigint()}`)
      .digest("hex")
      .slice(0, 12)}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(body, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const existing = await lstat(filePath).catch(() => null);
    if (existing?.isSymbolicLink()) {
      throw new Error("operational_spool_target_symlink");
    }
    await rename(temporary, filePath);
    await chmod(filePath, 0o600);
    await syncDirectory(parent);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function safeReadJson(filePath: string): Promise<unknown> {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("operational_spool_file_unsafe");
  }
  if (stat.size < 2 || stat.size > MAX_FILE_BYTES) {
    throw new Error("operational_spool_file_size_invalid");
  }
  const body = await readFile(filePath, "utf8");
  return JSON.parse(body) as unknown;
}

function validateLocalDeliveryAttempt(
  value: unknown,
): LocalDeliveryAttempt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_spool_attempt_invalid");
  }
  const raw = value as Record<string, unknown>;
  const attemptNumber = Number(raw.attemptNumber);
  if (
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber < 1 ||
    attemptNumber > 100 ||
    (raw.deliveryResult !== "delivered" &&
      raw.deliveryResult !== "retryable_failure" &&
      raw.deliveryResult !== "terminal_failure") ||
    (raw.httpStatus !== null &&
      (!Number.isSafeInteger(raw.httpStatus) ||
        Number(raw.httpStatus) < 100 ||
        Number(raw.httpStatus) > 599)) ||
    (raw.errorCode !== null &&
      (typeof raw.errorCode !== "string" ||
        !/^[a-z0-9._:-]{1,100}$/.test(raw.errorCode)))
  ) {
    throw new Error("operational_spool_attempt_invalid");
  }
  return {
    attemptNumber,
    deliveryResult: raw.deliveryResult,
    httpStatus: raw.httpStatus === null ? null : Number(raw.httpStatus),
    errorCode: raw.errorCode as string | null,
    attemptedAt: iso(
      String(raw.attemptedAt),
      "operational_spool_attempted_at_invalid",
    ),
  };
}

function validateDeliveryState(value: unknown): DeliveryState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_spool_delivery_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(raw.attemptCount) ||
    Number(raw.attemptCount) < 0 ||
    Number(raw.attemptCount) > 100 ||
    (raw.lastErrorCode !== null &&
      (typeof raw.lastErrorCode !== "string" ||
        !/^[a-z0-9._:-]{1,100}$/.test(raw.lastErrorCode)))
  ) {
    throw new Error("operational_spool_delivery_invalid");
  }
  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts.map(validateLocalDeliveryAttempt)
    : [];
  let previous = 0;
  for (const attempt of attempts) {
    if (
      attempt.attemptNumber <= previous ||
      attempt.attemptNumber > Number(raw.attemptCount)
    ) {
      throw new Error("operational_spool_attempt_sequence_invalid");
    }
    previous = attempt.attemptNumber;
  }
  return {
    attemptCount: Number(raw.attemptCount),
    nextAttemptAt: iso(
      String(raw.nextAttemptAt),
      "operational_next_attempt_invalid",
    ),
    lastErrorCode: raw.lastErrorCode as string | null,
    attempts,
  };
}

function validateSpoolItem(value: unknown): OperationalSpoolItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_spool_item_invalid");
  }
  const raw = value as Record<string, unknown>;
  const delivery = validateDeliveryState(raw.delivery);
  if (raw.schemaVersion === 1) {
    return {
      schemaVersion: 1,
      alert: validateOperationalAlertEvidence(
        raw.alert as OperationalAlertEvidence,
      ),
      delivery,
    };
  }
  if (raw.schemaVersion === 2) {
    return {
      schemaVersion: 2,
      signal: validateOperationalSignalEvidence(
        raw.signal as OperationalSignalEvidence,
      ),
      delivery,
    };
  }
  throw new Error("operational_spool_item_invalid");
}

function spoolIdentity(item: OperationalSpoolItem): string {
  return item.schemaVersion === 1 ? item.alert.alertId : item.signal.signalId;
}

function spoolPayload(
  item: OperationalSpoolItem,
): OperationalAlertEvidence | OperationalSignalEvidence {
  return item.schemaVersion === 1 ? item.alert : item.signal;
}

export async function writeOperationalLastRun(
  stateDirectory: string,
  raw: OperationalJobRunEvidence,
): Promise<void> {
  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const run = validateOperationalJobRunEvidence(raw);
  await atomicWriteJson(managed.lastRun, {
    schemaVersion: 1,
    run,
    resultHash: hashOperationalEvidence(run),
  });
}

async function findExistingSpoolFile(
  managed: ManagedOperationalSpoolDirectories,
  fileName: string,
): Promise<string | null> {
  for (const directory of [
    managed.pending,
    managed.delivered,
    managed.quarantine,
  ]) {
    const candidate = path.join(directory, fileName);
    if (await lstat(candidate).catch(() => null)) return candidate;
  }
  return null;
}

async function enqueueSpoolItem(
  managed: ManagedOperationalSpoolDirectories,
  item: OperationalSpoolItem,
): Promise<{ replayed: boolean; filePath: string }> {
  const identity = spoolIdentity(item);
  const fileName = spoolFileName(identity);
  const existingPath = await findExistingSpoolFile(managed, fileName);
  if (existingPath) {
    let parsed: OperationalSpoolItem;
    try {
      parsed = validateSpoolItem(await safeReadJson(existingPath));
    } catch {
      throw new Error("operational_spool_archive_corrupt");
    }
    if (
      spoolIdentity(parsed) !== identity ||
      hashOperationalEvidence(spoolPayload(parsed)) !==
        hashOperationalEvidence(spoolPayload(item))
    ) {
      throw new Error("operational_spool_identity_conflict");
    }
    return { replayed: true, filePath: existingPath };
  }
  const filePath = path.join(managed.pending, fileName);
  await atomicWriteJson(filePath, item);
  return { replayed: false, filePath };
}

export async function enqueueOperationalAlert(
  stateDirectory: string,
  raw: OperationalAlertEvidence,
): Promise<{ replayed: boolean; filePath: string }> {
  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const alert = validateOperationalAlertEvidence(raw);
  return enqueueSpoolItem(managed, {
    schemaVersion: 1,
    alert,
    delivery: {
      attemptCount: 0,
      nextAttemptAt: alert.occurredAt,
      lastErrorCode: null,
      attempts: [],
    },
  });
}

export async function enqueueOperationalSignal(
  stateDirectory: string,
  raw: OperationalSignalEvidence,
): Promise<{ replayed: boolean; filePath: string }> {
  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const signal = validateOperationalSignalEvidence(raw);
  return enqueueSpoolItem(managed, {
    schemaVersion: 2,
    signal,
    delivery: {
      attemptCount: 0,
      nextAttemptAt: signal.occurredAt,
      lastErrorCode: null,
      attempts: [],
    },
  });
}

export function operationalDeliveryRetryDelayMs(
  attemptNumber: number,
  identity: string,
): number {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 100) {
    throw new Error("operational_retry_attempt_invalid");
  }
  if (typeof identity !== "string" || identity.length < 8 || identity.length > 220) {
    throw new Error("operational_retry_identity_invalid");
  }
  const exponential = Math.min(
    60 * 60_000,
    15_000 * 2 ** Math.max(0, attemptNumber - 1),
  );
  const entropy =
    Number.parseInt(
      createHash("sha256")
        .update(`operational-delivery-jitter-v1:${identity}:${attemptNumber}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) / 0xffff_ffff;
  const jittered = Math.round(exponential * (0.8 + entropy * 0.4));
  return Math.min(60 * 60_000, Math.max(1_000, jittered));
}

async function moveFile(
  source: string,
  destinationDirectory: string,
): Promise<void> {
  const destination = path.join(destinationDirectory, path.basename(source));
  const existing = await lstat(destination).catch(() => null);
  if (existing) {
    throw new Error("operational_spool_destination_conflict");
  }
  await rename(source, destination);
  await chmod(destination, 0o600);
  await syncDirectory(path.dirname(source));
  if (path.dirname(source) !== destinationDirectory) {
    await syncDirectory(destinationDirectory);
  }
}

async function persistSpoolItemTx(
  client: PoolClient,
  item: OperationalSpoolItem,
): Promise<void> {
  if (item.schemaVersion === 1) {
    await persistOperationalAlertTx(client, item.alert);
  } else {
    await persistOperationalSignalTx(client, item.signal);
  }
  for (const attempt of item.delivery.attempts) {
    if (item.schemaVersion === 1) {
      await persistOperationalAlertDeliveryAttemptTx(client, {
        alertId: item.alert.alertId,
        ...attempt,
        evidence: {
          provider: "webhook",
          responseBodyBytes: MAX_RESPONSE_BODY_BYTES,
        },
      });
    } else {
      await persistOperationalSignalDeliveryAttemptTx(client, {
        signalId: item.signal.signalId,
        ...attempt,
        evidence: {
          provider: "webhook",
          responseBodyBytes: MAX_RESPONSE_BODY_BYTES,
        },
      });
    }
  }
}

async function bestEffortReconcileSpoolEvidence(
  managed: ManagedOperationalSpoolDirectories,
  limit = 200,
): Promise<void> {
  const candidates: OperationalSpoolItem[] = [];
  for (const directory of [
    managed.pending,
    managed.delivered,
    managed.quarantine,
  ]) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && SAFE_FILE_RE.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (candidates.length >= limit) break;
      try {
        candidates.push(
          validateSpoolItem(
            await safeReadJson(path.join(directory, entry.name)),
          ),
        );
      } catch {
        // Invalid local evidence is handled by the delivery/quarantine path.
      }
    }
    if (candidates.length >= limit) break;
  }
  if (candidates.length === 0) return;

  try {
    await withTx(async (client) => {
      for (const item of candidates) {
        await persistSpoolItemTx(client, item);
      }
    });
  } catch {
    logger.warn("[ops-alert-spool] evidence reconciliation unavailable", {
      code: "operational_evidence_reconciliation_unavailable",
      selected: candidates.length,
    });
  }
}

function deliveryErrorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "webhook_timeout";
  }
  return "webhook_network_error";
}

export async function deliverOperationalAlerts(
  config: OperationalAlertDeliveryConfig,
): Promise<OperationalAlertDeliverySummary> {
  const managed = await ensureOperationalSpoolDirectories(config.stateDirectory);
  const webhookUrl = validateWebhookUrl(config.webhookUrl);
  const bearerToken = validateBearerToken(config.bearerToken);
  const limit = boundedInteger(
    config.limit,
    20,
    1,
    100,
    "operational_alert_limit_invalid",
  );
  const timeoutMs = boundedInteger(
    config.timeoutMs,
    10_000,
    1_000,
    30_000,
    "operational_alert_timeout_invalid",
  );
  const maxAttempts = boundedInteger(
    config.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
    1,
    100,
    "operational_alert_max_attempts_invalid",
  );
  const now = config.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("operational_alert_clock_invalid");
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const entries = (await readdir(managed.pending, { withFileTypes: true }))
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);
  const summary: OperationalAlertDeliverySummary = {
    selected: entries.length,
    delivered: 0,
    retryable: 0,
    quarantined: 0,
    skippedUntilLater: 0,
  };

  for (const entry of entries) {
    const filePath = path.join(managed.pending, entry.name);
    if (!SAFE_FILE_RE.test(entry.name)) {
      await moveFile(filePath, managed.quarantine);
      summary.quarantined += 1;
      continue;
    }
    let item: OperationalSpoolItem;
    try {
      item = validateSpoolItem(await safeReadJson(filePath));
    } catch {
      await moveFile(filePath, managed.quarantine);
      summary.quarantined += 1;
      continue;
    }
    if (Date.parse(item.delivery.nextAttemptAt) > now.getTime()) {
      summary.skippedUntilLater += 1;
      continue;
    }

    const identity = spoolIdentity(item);
    const attemptNumber = item.delivery.attemptCount + 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let deliveryResult:
      | "delivered"
      | "retryable_failure"
      | "terminal_failure";
    let httpStatus: number | null = null;
    let errorCode: string | null = null;
    try {
      const response = await fetchImpl(webhookUrl, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TecPey-Ops-Delivery/2.0",
          "Idempotency-Key": identity,
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
        body: JSON.stringify(spoolPayload(item)),
      });
      httpStatus = response.status;
      if (response.status >= 200 && response.status < 300) {
        deliveryResult = "delivered";
      } else if (
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        deliveryResult = "retryable_failure";
        errorCode = `webhook_http_${response.status}`;
      } else {
        deliveryResult = "terminal_failure";
        errorCode = `webhook_http_${response.status}`;
      }
    } catch (error) {
      deliveryResult = "retryable_failure";
      errorCode = deliveryErrorCode(error);
    } finally {
      clearTimeout(timeout);
    }

    const attemptedAt = now.toISOString();
    const attempt: LocalDeliveryAttempt = {
      attemptNumber,
      deliveryResult,
      httpStatus,
      errorCode,
      attemptedAt,
    };
    const finalAttempt =
      deliveryResult === "delivered" ||
      deliveryResult === "terminal_failure" ||
      attemptNumber >= maxAttempts;
    const updated: OperationalSpoolItem = {
      ...item,
      delivery: {
        attemptCount: attemptNumber,
        nextAttemptAt: finalAttempt
          ? attemptedAt
          : new Date(
              now.getTime() +
                operationalDeliveryRetryDelayMs(attemptNumber, identity),
            ).toISOString(),
        lastErrorCode: errorCode,
        attempts: [...item.delivery.attempts, attempt],
      },
    };
    await atomicWriteJson(filePath, updated);

    if (deliveryResult === "delivered") {
      await moveFile(filePath, managed.delivered);
      summary.delivered += 1;
      continue;
    }
    if (deliveryResult === "terminal_failure" || attemptNumber >= maxAttempts) {
      await moveFile(filePath, managed.quarantine);
      summary.quarantined += 1;
      continue;
    }
    summary.retryable += 1;
  }

  await bestEffortReconcileSpoolEvidence(managed);
  return summary;
}

function incidentStatePath(
  managed: ManagedOperationalSpoolDirectories,
  source: string,
): string {
  return path.join(managed.activeSignals, activeSignalFileName(source));
}

function incidentSignal(
  state: OperationalSignalIncidentState,
): OperationalSignalEvidence {
  return validateOperationalSignalEvidence({
    schemaVersion: 1,
    signalId: `${state.source}:${state.incidentId}:${state.sequence}`,
    incidentId: state.incidentId,
    sequence: state.sequence,
    source: state.source,
    sourceUnit: state.sourceUnit,
    hostName: state.hostName,
    phase: state.pendingPhase,
    severity: state.severity,
    occurredAt: state.lastObservedAt,
    fingerprint: state.fingerprint,
    reasonCodes: state.reasonCodes,
    details: state.details,
  });
}

function validateIncidentState(value: unknown): OperationalSignalIncidentState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_signal_incident_state_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1 ||
    !UUID_RE.test(String(raw.incidentId)) ||
    !Number.isSafeInteger(raw.sequence) ||
    Number(raw.sequence) < 1 ||
    Number(raw.sequence) > 1_000_000 ||
    !Number.isSafeInteger(raw.lastEmittedSequence) ||
    Number(raw.lastEmittedSequence) < 0 ||
    Number(raw.lastEmittedSequence) > Number(raw.sequence)
  ) {
    throw new Error("operational_signal_incident_state_invalid");
  }
  const state: OperationalSignalIncidentState = {
    schemaVersion: 1,
    source: String(raw.source),
    sourceUnit: String(raw.sourceUnit),
    hostName: String(raw.hostName),
    incidentId: String(raw.incidentId).toLowerCase(),
    sequence: Number(raw.sequence),
    lastEmittedSequence: Number(raw.lastEmittedSequence),
    pendingPhase: raw.pendingPhase as OperationalSignalPhase,
    severity: raw.severity as OperationalSignalSeverity,
    fingerprint: String(raw.fingerprint),
    reasonCodes: Array.isArray(raw.reasonCodes)
      ? raw.reasonCodes.map(String)
      : [],
    details:
      raw.details && typeof raw.details === "object" && !Array.isArray(raw.details)
        ? (raw.details as Record<string, OperationalSignalDetailValue>)
        : {},
    openedAt: iso(
      String(raw.openedAt),
      "operational_signal_incident_opened_at_invalid",
    ),
    lastObservedAt: iso(
      String(raw.lastObservedAt),
      "operational_signal_incident_observed_at_invalid",
    ),
  };
  incidentSignal(state);
  return state;
}

async function readIncidentState(
  filePath: string,
): Promise<OperationalSignalIncidentState | null> {
  const stat = await lstat(filePath).catch(() => null);
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("operational_signal_incident_state_unsafe");
  }
  return validateIncidentState(await safeReadJson(filePath));
}

async function emitIncidentState(
  stateDirectory: string,
  filePath: string,
  state: OperationalSignalIncidentState,
): Promise<{
  state: OperationalSignalIncidentState;
  replayed: boolean;
}> {
  const queued = await enqueueOperationalSignal(
    stateDirectory,
    incidentSignal(state),
  );
  const emittedState: OperationalSignalIncidentState = {
    ...state,
    lastEmittedSequence: state.sequence,
  };
  await atomicWriteJson(filePath, emittedState);
  return { state: emittedState, replayed: queued.replayed };
}

function observationFingerprint(
  input: OperationalSignalObservation,
): string {
  return hashOperationalEvidence({
    authority: "operational-signal-incident-v1",
    source: input.source,
    status: input.status,
    reasonCodes: [...input.reasonCodes].sort(),
  });
}

function observationSeverity(
  status: OperationalSignalObservation["status"],
): "warning" | "critical" {
  return status === "warning" ? "warning" : "critical";
}

function nextIncidentState(
  current: OperationalSignalIncidentState | null,
  input: OperationalSignalObservation,
  phase: "opened" | "updated",
): OperationalSignalIncidentState {
  const fingerprint = observationFingerprint(input);
  return {
    schemaVersion: 1,
    source: input.source,
    sourceUnit: input.sourceUnit,
    hostName: input.hostName,
    incidentId: current?.incidentId ?? randomUUID(),
    sequence: current ? current.sequence + 1 : 1,
    lastEmittedSequence: current?.lastEmittedSequence ?? 0,
    pendingPhase: phase,
    severity: observationSeverity(input.status),
    fingerprint,
    reasonCodes: [...input.reasonCodes],
    details: input.details,
    openedAt: current?.openedAt ?? input.observedAt,
    lastObservedAt: input.observedAt,
  };
}

export async function reconcileOperationalSignalIncident(
  stateDirectory: string,
  raw: OperationalSignalObservation,
): Promise<OperationalSignalIncidentResult> {
  const observedAt = iso(
    raw.observedAt,
    "operational_signal_observation_time_invalid",
  );
  const probe = validateOperationalSignalEvidence({
    schemaVersion: 1,
    signalId: `${raw.source}:${"00000000-0000-4000-8000-000000000000"}:1`,
    incidentId: "00000000-0000-4000-8000-000000000000",
    sequence: 1,
    source: raw.source,
    sourceUnit: raw.sourceUnit,
    hostName: raw.hostName,
    phase: raw.status === "healthy" ? "recovered" : "opened",
    severity: raw.status === "healthy" ? "info" : observationSeverity(raw.status),
    occurredAt: observedAt,
    fingerprint: hashOperationalEvidence({
      authority: "operational-signal-observation-validation-v1",
      source: raw.source,
      status: raw.status,
      reasonCodes: [...raw.reasonCodes].sort(),
    }),
    reasonCodes:
      raw.status === "healthy" ? ["recovered"] : [...raw.reasonCodes],
    details: raw.details,
  });
  const input: OperationalSignalObservation = {
    source: probe.source,
    sourceUnit: probe.sourceUnit,
    hostName: probe.hostName,
    status: raw.status,
    observedAt,
    reasonCodes:
      raw.status === "healthy" ? [] : probe.reasonCodes,
    details: probe.details,
  };

  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const filePath = incidentStatePath(managed, input.source);
  let current = await readIncidentState(filePath);

  if (input.status === "healthy") {
    if (!current) {
      return {
        emitted: false,
        replayed: false,
        phase: null,
        incidentId: null,
        sequence: null,
      };
    }
    if (current.lastEmittedSequence < current.sequence) {
      const emitted = await emitIncidentState(stateDirectory, filePath, current);
      current = emitted.state;
    }
    if (current.pendingPhase === "recovered") {
      const queued = await enqueueOperationalSignal(
        stateDirectory,
        incidentSignal(current),
      );
      await rm(filePath, { force: true });
      await syncDirectory(path.dirname(filePath));
      return {
        emitted: true,
        replayed: queued.replayed,
        phase: "recovered",
        incidentId: current.incidentId,
        sequence: current.sequence,
      };
    }
    const recovery: OperationalSignalIncidentState = {
      ...current,
      sequence: current.sequence + 1,
      lastEmittedSequence: current.sequence,
      pendingPhase: "recovered",
      severity: "info",
      fingerprint: hashOperationalEvidence({
        authority: "operational-signal-incident-v1",
        source: input.source,
        status: "healthy",
        reasonCodes: ["recovered"],
      }),
      reasonCodes: ["recovered"],
      details: input.details,
      lastObservedAt: input.observedAt,
    };
    await atomicWriteJson(filePath, recovery);
    const emitted = await emitIncidentState(
      stateDirectory,
      filePath,
      recovery,
    );
    await rm(filePath, { force: true });
    await syncDirectory(path.dirname(filePath));
    return {
      emitted: true,
      replayed: emitted.replayed,
      phase: "recovered",
      incidentId: recovery.incidentId,
      sequence: recovery.sequence,
    };
  }

  const fingerprint = observationFingerprint(input);
  if (!current) {
    const opened = nextIncidentState(null, input, "opened");
    await atomicWriteJson(filePath, opened);
    const emitted = await emitIncidentState(stateDirectory, filePath, opened);
    return {
      emitted: true,
      replayed: emitted.replayed,
      phase: "opened",
      incidentId: opened.incidentId,
      sequence: opened.sequence,
    };
  }

  if (current.pendingPhase === "recovered") {
    if (current.lastEmittedSequence < current.sequence) {
      await emitIncidentState(stateDirectory, filePath, current);
    }
    await rm(filePath, { force: true });
    await syncDirectory(path.dirname(filePath));
    current = null;
  }

  if (!current) {
    const reopened = nextIncidentState(null, input, "opened");
    await atomicWriteJson(filePath, reopened);
    const emitted = await emitIncidentState(
      stateDirectory,
      filePath,
      reopened,
    );
    return {
      emitted: true,
      replayed: emitted.replayed,
      phase: "opened",
      incidentId: reopened.incidentId,
      sequence: reopened.sequence,
    };
  }

  if (current.lastEmittedSequence < current.sequence) {
    const emitted = await emitIncidentState(stateDirectory, filePath, current);
    current = emitted.state;
  }

  if (current.fingerprint === fingerprint) {
    return {
      emitted: false,
      replayed: false,
      phase: null,
      incidentId: current.incidentId,
      sequence: current.sequence,
    };
  }

  const updated = nextIncidentState(current, input, "updated");
  await atomicWriteJson(filePath, updated);
  const emitted = await emitIncidentState(stateDirectory, filePath, updated);
  return {
    emitted: true,
    replayed: emitted.replayed,
    phase: "updated",
    incidentId: updated.incidentId,
    sequence: updated.sequence,
  };
}
