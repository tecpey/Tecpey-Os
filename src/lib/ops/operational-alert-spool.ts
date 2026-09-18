import "server-only";

import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { withTx } from "@/lib/db";
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
  hashOperationalSignalEvidence,
  persistOperationalSignalDeliveryAttemptTx,
  persistOperationalSignalTx,
  validateOperationalSignalEvidence,
  type OperationalSignalEvidence,
} from "@/lib/ops/operational-signal-evidence";

const MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_ATTEMPTS = 10;
const MAX_RESPONSE_BODY_BYTES = 0;
const SAFE_FILE_RE = /^[0-9a-f]{64}\.json$/;

type OperationalSpoolAttempt = {
  attemptNumber: number;
  deliveryResult: "delivered" | "retryable_failure" | "terminal_failure";
  httpStatus: number | null;
  errorCode: string | null;
  attemptedAt: string;
};

type OperationalSpoolDelivery = {
  attemptCount: number;
  nextAttemptAt: string;
  lastErrorCode: string | null;
  attemptHistory: OperationalSpoolAttempt[];
};

export type OperationalAlertSpoolItem = {
  schemaVersion: 1;
  alert: OperationalAlertEvidence;
  delivery: OperationalSpoolDelivery;
};

export type OperationalSignalSpoolItem = {
  schemaVersion: 2;
  signal: OperationalSignalEvidence;
  delivery: OperationalSpoolDelivery;
};

type OperationalSpoolItem =
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
  const testHttpAllowed = process.env.NODE_ENV === "test" &&
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

function spoolFileName(alertId: string): string {
  return `${createHash("sha256").update(alertId).digest("hex")}.json`;
}

function directories(stateDirectory: string) {
  const root = normalizedAbsoluteDirectory(stateDirectory);
  return {
    root,
    lastRun: path.join(root, "community-challenge-finalization-last-run.json"),
    pending: path.join(root, "alerts", "pending"),
    delivered: path.join(root, "alerts", "delivered"),
    quarantine: path.join(root, "alerts", "quarantine"),
  };
}

type ManagedDirectories = ReturnType<typeof directories>;

async function assertManagedDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_spool_directory_unsafe");
  }
  await chmod(directory, 0o700);
}

export async function ensureOperationalSpoolDirectories(
  stateDirectory: string,
): Promise<ManagedDirectories> {
  const managed = directories(stateDirectory);
  await assertManagedDirectory(managed.root);
  await assertManagedDirectory(path.dirname(managed.pending));
  await assertManagedDirectory(managed.pending);
  await assertManagedDirectory(managed.delivered);
  await assertManagedDirectory(managed.quarantine);
  return managed;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function serializedJson(value: unknown): string {
  const content = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
    throw new Error("operational_spool_payload_too_large");
  }
  return content;
}

async function writeTemporaryJson(
  parent: string,
  filePath: string,
  value: unknown,
): Promise<string> {
  const stat = await lstat(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_spool_parent_unsafe");
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
    await handle.writeFile(serializedJson(value), { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temporary;
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const parent = path.dirname(filePath);
  const temporary = await writeTemporaryJson(parent, filePath, value);
  try {
    const existing = await lstat(filePath).catch(() => null);
    if (existing?.isSymbolicLink()) {
      throw new Error("operational_spool_target_symlink");
    }
    await rename(temporary, filePath);
    await syncDirectory(parent);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function atomicCreateJson(
  filePath: string,
  value: unknown,
): Promise<boolean> {
  const parent = path.dirname(filePath);
  const temporary = await writeTemporaryJson(parent, filePath, value);
  try {
    try {
      await link(temporary, filePath);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        return false;
      }
      throw error;
    }
    await syncDirectory(parent);
    return true;
  } finally {
    await rm(temporary, { force: true });
    await syncDirectory(parent);
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
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as unknown;
}

function validatedAttemptHistory(raw: unknown): OperationalSpoolAttempt[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 100) {
    throw new Error("operational_spool_attempt_history_invalid");
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("operational_spool_attempt_history_invalid");
    }
    const attempt = entry as Record<string, unknown>;
    const attemptNumber = Number(attempt.attemptNumber);
    if (
      !Number.isSafeInteger(attemptNumber) ||
      attemptNumber !== index + 1 ||
      (attempt.deliveryResult !== "delivered" &&
        attempt.deliveryResult !== "retryable_failure" &&
        attempt.deliveryResult !== "terminal_failure") ||
      (attempt.httpStatus !== null &&
        (!Number.isSafeInteger(attempt.httpStatus) ||
          Number(attempt.httpStatus) < 100 ||
          Number(attempt.httpStatus) > 599)) ||
      (attempt.errorCode !== null &&
        (typeof attempt.errorCode !== "string" ||
          !/^[a-z0-9._:-]{1,100}$/.test(attempt.errorCode)))
    ) {
      throw new Error("operational_spool_attempt_history_invalid");
    }
    return {
      attemptNumber,
      deliveryResult: attempt.deliveryResult,
      httpStatus: attempt.httpStatus === null ? null : Number(attempt.httpStatus),
      errorCode: attempt.errorCode as string | null,
      attemptedAt: iso(
        String(attempt.attemptedAt),
        "operational_spool_attempted_at_invalid",
      ),
    };
  });
}

function validatedDelivery(
  raw: Record<string, unknown>,
): OperationalAlertSpoolItem["delivery"] {
  const attemptHistory = validatedAttemptHistory(raw.attemptHistory);
  if (
    !Number.isSafeInteger(raw.attemptCount) ||
    Number(raw.attemptCount) < 0 ||
    Number(raw.attemptCount) > 100 ||
    Number(raw.attemptCount) !== attemptHistory.length ||
    (raw.lastErrorCode !== null &&
      (typeof raw.lastErrorCode !== "string" ||
       !/^[a-z0-9._:-]{1,100}$/.test(raw.lastErrorCode)))
  ) {
    throw new Error("operational_spool_delivery_invalid");
  }
  return {
    attemptCount: Number(raw.attemptCount),
    nextAttemptAt: iso(
      String(raw.nextAttemptAt),
      "operational_next_attempt_invalid",
    ),
    lastErrorCode: raw.lastErrorCode as string | null,
    attemptHistory,
  };
}

function validateSpoolItem(value: unknown): OperationalSpoolItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_spool_item_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (
    !raw.delivery ||
    typeof raw.delivery !== "object" ||
    Array.isArray(raw.delivery)
  ) {
    throw new Error("operational_spool_item_invalid");
  }
  const delivery = validatedDelivery(raw.delivery as Record<string, unknown>);
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

async function findExistingAlertFile(
  managed: ManagedDirectories,
  fileName: string,
): Promise<string | null> {
  for (const directory of [managed.pending, managed.delivered, managed.quarantine]) {
    const candidate = path.join(directory, fileName);
    if (await lstat(candidate).catch(() => null)) return candidate;
  }
  return null;
}

export async function enqueueOperationalAlert(
  stateDirectory: string,
  raw: OperationalAlertEvidence,
): Promise<{ replayed: boolean; filePath: string }> {
  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const alert = validateOperationalAlertEvidence(raw);
  const fileName = spoolFileName(alert.alertId);
  const existingPath = await findExistingAlertFile(managed, fileName);
  if (existingPath) {
    let parsed: OperationalSpoolItem;
    try {
      parsed = validateSpoolItem(await safeReadJson(existingPath));
    } catch {
      throw new Error("operational_spool_archive_corrupt");
    }
    if (
      parsed.schemaVersion !== 1 ||
      hashOperationalEvidence(parsed.alert) !== hashOperationalEvidence(alert)
    ) {
      throw new Error("operational_spool_identity_conflict");
    }
    return { replayed: true, filePath: existingPath };
  }
  const filePath = path.join(managed.pending, fileName);
  const item: OperationalAlertSpoolItem = {
    schemaVersion: 1,
    alert,
    delivery: {
      attemptCount: 0,
      nextAttemptAt: alert.occurredAt,
      lastErrorCode: null,
      attemptHistory: [],
    },
  };
  const created = await atomicCreateJson(filePath, item);
  if (!created) {
    return enqueueOperationalAlert(stateDirectory, alert);
  }
  return { replayed: false, filePath };
}

export async function enqueueOperationalSignal(
  stateDirectory: string,
  raw: OperationalSignalEvidence,
): Promise<{ replayed: boolean; filePath: string }> {
  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const signal = validateOperationalSignalEvidence(raw);
  const fileName = spoolFileName(signal.signalId);
  const existingPath = await findExistingAlertFile(managed, fileName);
  if (existingPath) {
    let parsed: OperationalSpoolItem;
    try {
      parsed = validateSpoolItem(await safeReadJson(existingPath));
    } catch {
      throw new Error("operational_spool_archive_corrupt");
    }
    if (
      parsed.schemaVersion !== 2 ||
      parsed.signal.signalId !== signal.signalId ||
      parsed.signal.fingerprint !== signal.fingerprint ||
      parsed.signal.dedupeBucketAt !== signal.dedupeBucketAt
    ) {
      throw new Error("operational_spool_identity_conflict");
    }
    return { replayed: true, filePath: existingPath };
  }
  const filePath = path.join(managed.pending, fileName);
  const item: OperationalSignalSpoolItem = {
    schemaVersion: 2,
    signal,
    delivery: {
      attemptCount: 0,
      nextAttemptAt: signal.occurredAt,
      lastErrorCode: null,
      attemptHistory: [],
    },
  };
  const created = await atomicCreateJson(filePath, item);
  if (!created) {
    return enqueueOperationalSignal(stateDirectory, signal);
  }
  return { replayed: false, filePath };
}

function spoolEntity(item: OperationalSpoolItem): {
  id: string;
  payload: OperationalAlertEvidence | OperationalSignalEvidence;
} {
  return item.schemaVersion === 1
    ? { id: item.alert.alertId, payload: item.alert }
    : { id: item.signal.signalId, payload: item.signal };
}

function retryDelayMs(
  attemptNumber: number,
  entityId: string,
  schemaVersion: 1 | 2,
): number {
  const capped = Math.min(
    60 * 60_000,
    15_000 * 2 ** Math.max(0, attemptNumber - 1),
  );
  if (schemaVersion === 1) return capped;
  const entropy = Number.parseInt(
    createHash("sha256")
      .update(`operational-signal-retry-v1:${entityId}:${attemptNumber}`)
      .digest("hex")
      .slice(0, 8),
    16,
  ) / 0xffff_ffff;
  return Math.min(
    60 * 60_000,
    Math.max(15_000, Math.round(capped * (0.8 + entropy * 0.4))),
  );
}

async function moveFile(source: string, destinationDirectory: string): Promise<void> {
  const sourceDirectory = path.dirname(source);
  const destination = path.join(destinationDirectory, path.basename(source));
  const existing = await lstat(destination).catch(() => null);
  if (existing) {
    throw new Error("operational_spool_destination_conflict");
  }
  await rename(source, destination);
  await chmod(destination, 0o600);
  await syncDirectory(destinationDirectory);
  if (sourceDirectory !== destinationDirectory) {
    await syncDirectory(sourceDirectory);
  }
}

async function bestEffortPersistAlert(alert: OperationalAlertEvidence): Promise<void> {
  try {
    const persisted = await withTx((client) => persistOperationalAlertTx(client, alert));
    if (!persisted.enabled) return;
  } catch {
    // The local spool is the outage-safe authority when PostgreSQL is unavailable.
  }
}

async function bestEffortPersistAttempt(input: Parameters<
  typeof persistOperationalAlertDeliveryAttemptTx
>[1]): Promise<void> {
  try {
    const persisted = await withTx((client) =>
      persistOperationalAlertDeliveryAttemptTx(client, input),
    );
    if (!persisted.enabled) return;
  } catch {
    // Delivery remains evidenced by the immutable local spool/archive.
  }
}

async function bestEffortPersistSignal(
  signal: OperationalSignalEvidence,
): Promise<void> {
  try {
    const persisted = await withTx((client) =>
      persistOperationalSignalTx(client, signal),
    );
    if (!persisted.enabled) return;
  } catch {
    // Local spool remains authoritative during database outages.
  }
}

async function bestEffortPersistSignalAttempt(input: Parameters<
  typeof persistOperationalSignalDeliveryAttemptTx
>[1]): Promise<void> {
  try {
    const persisted = await withTx((client) =>
      persistOperationalSignalDeliveryAttemptTx(client, input),
    );
    if (!persisted.enabled) return;
  } catch {
    // Delivery remains evidenced by the immutable local spool/archive.
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
  const limit = boundedInteger(config.limit, 20, 1, 100, "operational_alert_limit_invalid");
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
  if (!Number.isFinite(now.getTime())) throw new Error("operational_alert_clock_invalid");
  const fetchImpl = config.fetchImpl ?? fetch;
  const entries = (await readdir(managed.pending, { withFileTypes: true }))
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .sort((left, right) => left.name.localeCompare(right.name));
  const summary: OperationalAlertDeliverySummary = {
    selected: 0,
    delivered: 0,
    retryable: 0,
    quarantined: 0,
    skippedUntilLater: 0,
  };

  for (const entry of entries) {
    if (summary.selected >= limit) break;
    const filePath = path.join(managed.pending, entry.name);
    if (!SAFE_FILE_RE.test(entry.name)) {
      summary.selected += 1;
      await moveFile(filePath, managed.quarantine);
      summary.quarantined += 1;
      continue;
    }
    let item: OperationalSpoolItem;
    try {
      item = validateSpoolItem(await safeReadJson(filePath));
    } catch {
      summary.selected += 1;
      await moveFile(filePath, managed.quarantine);
      summary.quarantined += 1;
      continue;
    }
    if (Date.parse(item.delivery.nextAttemptAt) > now.getTime()) {
      summary.skippedUntilLater += 1;
      continue;
    }

    summary.selected += 1;
    const entity = spoolEntity(item);
    if (item.schemaVersion === 1) {
      await bestEffortPersistAlert(item.alert);
    } else {
      await bestEffortPersistSignal(item.signal);
    }
    const attemptNumber = item.delivery.attemptCount + 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let deliveryResult: "delivered" | "retryable_failure" | "terminal_failure";
    let httpStatus: number | null = null;
    let errorCode: string | null = null;
    try {
      const response = await fetchImpl(webhookUrl, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TecPey-Ops-Alert/1.0",
          "Idempotency-Key": entity.id,
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
        body: JSON.stringify(entity.payload),
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
    if (item.schemaVersion === 1) {
      await bestEffortPersistAttempt({
        alertId: item.alert.alertId,
        attemptNumber,
        deliveryResult,
        httpStatus,
        errorCode,
        attemptedAt,
        evidence: {
          provider: "webhook",
          responseBodyBytes: MAX_RESPONSE_BODY_BYTES,
        },
      });
    } else {
      await bestEffortPersistSignalAttempt({
        signalId: item.signal.signalId,
        attemptNumber,
        deliveryResult,
        httpStatus,
        errorCode,
        attemptedAt,
        evidence: {
          provider: "webhook",
          responseBodyBytes: MAX_RESPONSE_BODY_BYTES,
        },
      });
    }

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
    const updated: OperationalSpoolItem = {
      ...item,
      delivery: {
        attemptCount: attemptNumber,
        nextAttemptAt: new Date(
          now.getTime() +
            retryDelayMs(attemptNumber, entity.id, item.schemaVersion),
        ).toISOString(),
        lastErrorCode: errorCode,
      },
    };
    await atomicWriteJson(filePath, updated);
    summary.retryable += 1;
  }
  return summary;
}
