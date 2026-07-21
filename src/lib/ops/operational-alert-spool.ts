import "server-only";

import { createHash } from "node:crypto";
import {
  chmod,
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

const MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_ATTEMPTS = 10;
const MAX_RESPONSE_BODY_BYTES = 0;
const SAFE_FILE_RE = /^[0-9a-f]{64}\.json$/;

export type OperationalAlertSpoolItem = {
  schemaVersion: 1;
  alert: OperationalAlertEvidence;
  delivery: {
    attemptCount: number;
    nextAttemptAt: string;
    lastErrorCode: string | null;
  };
};

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
): Promise<ReturnType<typeof directories>> {
  const managed = directories(stateDirectory);
  await assertManagedDirectory(managed.root);
  await assertManagedDirectory(path.dirname(managed.pending));
  await assertManagedDirectory(managed.pending);
  await assertManagedDirectory(managed.delivered);
  await assertManagedDirectory(managed.quarantine);
  return managed;
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const parent = path.dirname(filePath);
  const stat = await lstat(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_spool_parent_unsafe");
  }
  const content = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
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
    await handle.writeFile(content, { encoding: "utf8" });
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
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as unknown;
}

function validateSpoolItem(value: unknown): OperationalAlertSpoolItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_spool_item_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1 ||
    !raw.delivery || typeof raw.delivery !== "object" || Array.isArray(raw.delivery)
  ) {
    throw new Error("operational_spool_item_invalid");
  }
  const alert = validateOperationalAlertEvidence(raw.alert as OperationalAlertEvidence);
  const delivery = raw.delivery as Record<string, unknown>;
  if (
    !Number.isSafeInteger(delivery.attemptCount) ||
    Number(delivery.attemptCount) < 0 ||
    Number(delivery.attemptCount) > 100 ||
    (delivery.lastErrorCode !== null &&
      (typeof delivery.lastErrorCode !== "string" ||
       !/^[a-z0-9._:-]{1,100}$/.test(delivery.lastErrorCode)))
  ) {
    throw new Error("operational_spool_delivery_invalid");
  }
  return {
    schemaVersion: 1,
    alert,
    delivery: {
      attemptCount: Number(delivery.attemptCount),
      nextAttemptAt: iso(String(delivery.nextAttemptAt), "operational_next_attempt_invalid"),
      lastErrorCode: delivery.lastErrorCode as string | null,
    },
  };
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

export async function enqueueOperationalAlert(
  stateDirectory: string,
  raw: OperationalAlertEvidence,
): Promise<{ replayed: boolean; filePath: string }> {
  const managed = await ensureOperationalSpoolDirectories(stateDirectory);
  const alert = validateOperationalAlertEvidence(raw);
  const filePath = path.join(managed.pending, spoolFileName(alert.alertId));
  const item: OperationalAlertSpoolItem = {
    schemaVersion: 1,
    alert,
    delivery: {
      attemptCount: 0,
      nextAttemptAt: alert.occurredAt,
      lastErrorCode: null,
    },
  };
  const existing = await lstat(filePath).catch(() => null);
  if (existing) {
    const parsed = validateSpoolItem(await safeReadJson(filePath));
    if (hashOperationalEvidence(parsed.alert) !== hashOperationalEvidence(alert)) {
      throw new Error("operational_spool_identity_conflict");
    }
    return { replayed: true, filePath };
  }
  await atomicWriteJson(filePath, item);
  return { replayed: false, filePath };
}

function retryDelayMs(attemptNumber: number): number {
  return Math.min(60 * 60_000, 15_000 * 2 ** Math.max(0, attemptNumber - 1));
}

async function moveFile(source: string, destinationDirectory: string): Promise<void> {
  const destination = path.join(destinationDirectory, path.basename(source));
  const existing = await lstat(destination).catch(() => null);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("operational_spool_destination_unsafe");
    }
    await rm(source, { force: true });
    return;
  }
  await rename(source, destination);
  await chmod(destination, 0o600);
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
    .filter((entry) => SAFE_FILE_RE.test(entry.name))
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
    let item: OperationalAlertSpoolItem;
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

    await bestEffortPersistAlert(item.alert);
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
          "Idempotency-Key": item.alert.alertId,
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
        body: JSON.stringify(item.alert),
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
    await bestEffortPersistAttempt({
      alertId: item.alert.alertId,
      attemptNumber,
      deliveryResult,
      httpStatus,
      errorCode,
      attemptedAt,
      evidence: { provider: "webhook", responseBodyBytes: MAX_RESPONSE_BODY_BYTES },
    });

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
    const updated: OperationalAlertSpoolItem = {
      ...item,
      delivery: {
        attemptCount: attemptNumber,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(attemptNumber)).toISOString(),
        lastErrorCode: errorCode,
      },
    };
    await atomicWriteJson(filePath, updated);
    summary.retryable += 1;
  }
  return summary;
}
