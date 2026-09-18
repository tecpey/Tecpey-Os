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
  persistOperationalSignalDeliveryAttemptTx,
  persistOperationalSignalTx,
  validateOperationalSignalDeliveryAttempt,
  validateOperationalSignalEvidence,
  type OperationalSignalDeliveryAttempt,
  type OperationalSignalEvidence,
} from "@/lib/ops/operational-signal-evidence";

const TOKEN_RE = /^[A-Za-z0-9._:-]+$/;
const MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_ATTEMPTS = 10;
const MAX_RESPONSE_BODY_BYTES = 0;
const SAFE_FILE_RE = /^[0-9a-f]{64}\.json$/;

export type OperationalSignalSpoolItem = Readonly<{
  schemaVersion: 1;
  signal: OperationalSignalEvidence;
  delivery: Readonly<{
    attemptCount: number;
    nextAttemptAt: string;
    lastErrorCode: string | null;
  }>;
  attempts: readonly OperationalSignalDeliveryAttempt[];
}>;

export type OperationalSignalDeliveryConfig = Readonly<{
  stateDirectory: string;
  webhookUrl: string;
  bearerToken?: string | null;
  limit?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  now?: Date;
  fetchImpl?: typeof fetch;
}>;

export type OperationalSignalDeliverySummary = Readonly<{
  selected: number;
  delivered: number;
  retryable: number;
  quarantined: number;
  skippedUntilLater: number;
  deferredDueToBatchLimit: number;
}>;

function normalizedAbsoluteDirectory(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    value.length > 500 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    throw new Error("operational_signal_state_directory_invalid");
  }
  const normalized = path.normalize(value);
  if (normalized === path.parse(normalized).root) {
    throw new Error("operational_signal_state_directory_unsafe");
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
    throw new Error("operational_signal_webhook_invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("operational_signal_webhook_invalid");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("operational_signal_webhook_invalid");
  }
  const testHttpAllowed =
    process.env.NODE_ENV === "test" &&
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (parsed.protocol !== "https:" && !testHttpAllowed) {
    throw new Error("operational_signal_webhook_https_required");
  }
  return parsed.toString();
}

function validateBearerToken(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (value.length > 2_000 || /[\r\n\u0000]/.test(value)) {
    throw new Error("operational_signal_bearer_invalid");
  }
  return value;
}

function signalFileName(signalId: string): string {
  return `${createHash("sha256").update(signalId).digest("hex")}.json`;
}

function directories(stateDirectory: string) {
  const root = normalizedAbsoluteDirectory(stateDirectory);
  return {
    root,
    pending: path.join(root, "signals", "pending"),
    delivered: path.join(root, "signals", "delivered"),
    quarantine: path.join(root, "signals", "quarantine"),
  };
}

type ManagedDirectories = ReturnType<typeof directories>;

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
    throw new Error("operational_signal_spool_directory_unsafe");
  }
  await chmod(directory, 0o700);
  await syncDirectory(directory);
}

export async function ensureOperationalSignalSpoolDirectories(
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

async function atomicReplaceJson(filePath: string, value: unknown): Promise<void> {
  const parent = path.dirname(filePath);
  const stat = await lstat(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_signal_spool_parent_unsafe");
  }
  const content = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
    throw new Error("operational_signal_spool_payload_too_large");
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
      throw new Error("operational_signal_spool_target_symlink");
    }
    await rename(temporary, filePath);
    await chmod(filePath, 0o600);
    await syncDirectory(parent);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function atomicCreateJson(
  filePath: string,
  value: unknown,
): Promise<"created" | "exists"> {
  const parent = path.dirname(filePath);
  const stat = await lstat(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("operational_signal_spool_parent_unsafe");
  }
  const content = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
    throw new Error("operational_signal_spool_payload_too_large");
  }
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${createHash("sha256")
      .update(`${filePath}:create:${Date.now()}:${process.hrtime.bigint()}`)
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
    await link(temporary, filePath);
    await chmod(filePath, 0o600);
    await syncDirectory(parent);
    await rm(temporary, { force: true });
    await syncDirectory(parent);
    return "created";
  } catch (error) {
    await rm(temporary, { force: true });
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "EEXIST"
    ) {
      return "exists";
    }
    throw error;
  }
}

async function safeReadJson(filePath: string): Promise<unknown> {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("operational_signal_spool_file_unsafe");
  }
  if (stat.size < 2 || stat.size > MAX_FILE_BYTES) {
    throw new Error("operational_signal_spool_file_size_invalid");
  }
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function validateSpoolItem(value: unknown): OperationalSignalSpoolItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operational_signal_spool_item_invalid");
  }
  const raw = value as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1 ||
    !raw.delivery ||
    typeof raw.delivery !== "object" ||
    Array.isArray(raw.delivery)
  ) {
    throw new Error("operational_signal_spool_item_invalid");
  }
  const signal = validateOperationalSignalEvidence(
    raw.signal as OperationalSignalEvidence,
  );
  if (!Array.isArray(raw.attempts) || raw.attempts.length > 100) {
    throw new Error("operational_signal_spool_attempts_invalid");
  }
  const attempts = raw.attempts.map((attempt) =>
    validateOperationalSignalDeliveryAttempt(
      attempt as OperationalSignalDeliveryAttempt,
    ),
  );
  for (const [index, attempt] of attempts.entries()) {
    if (
      attempt.signalId !== signal.signalId ||
      attempt.attemptNumber !== index + 1
    ) {
      throw new Error("operational_signal_spool_attempt_sequence_invalid");
    }
  }
  const delivery = raw.delivery as Record<string, unknown>;
  if (
    !Number.isSafeInteger(delivery.attemptCount) ||
    Number(delivery.attemptCount) < 0 ||
    Number(delivery.attemptCount) > 100 ||
    (delivery.lastErrorCode !== null &&
      (typeof delivery.lastErrorCode !== "string" ||
        !/^[a-z0-9._:-]{1,100}$/.test(delivery.lastErrorCode)))
  ) {
    throw new Error("operational_signal_spool_delivery_invalid");
  }
  if (Number(delivery.attemptCount) !== attempts.length) {
    throw new Error("operational_signal_spool_attempt_count_mismatch");
  }
  return Object.freeze({
    schemaVersion: 1,
    signal,
    delivery: Object.freeze({
      attemptCount: Number(delivery.attemptCount),
      nextAttemptAt: iso(
        String(delivery.nextAttemptAt),
        "operational_signal_next_attempt_invalid",
      ),
      lastErrorCode: delivery.lastErrorCode as string | null,
    }),
    attempts: Object.freeze(attempts),
  });
}

async function findExistingSignalFile(
  managed: ManagedDirectories,
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

export async function enqueueOperationalSignal(
  stateDirectory: string,
  raw: OperationalSignalEvidence,
): Promise<{ replayed: boolean; filePath: string }> {
  const managed = await ensureOperationalSignalSpoolDirectories(stateDirectory);
  const signal = validateOperationalSignalEvidence(raw);
  const fileName = signalFileName(signal.signalId);
  const existingPath = await findExistingSignalFile(managed, fileName);
  if (existingPath) {
    let existing: OperationalSignalSpoolItem;
    try {
      existing = validateSpoolItem(await safeReadJson(existingPath));
    } catch {
      throw new Error("operational_signal_spool_archive_corrupt");
    }
    if (
      existing.signal.signalId !== signal.signalId ||
      existing.signal.incidentKey !== signal.incidentKey ||
      existing.signal.lifecycle !== signal.lifecycle ||
      existing.signal.dedupeWindowStart !== signal.dedupeWindowStart ||
      existing.signal.dedupeWindowSeconds !== signal.dedupeWindowSeconds
    ) {
      throw new Error("operational_signal_spool_identity_conflict");
    }
    return { replayed: true, filePath: existingPath };
  }

  const filePath = path.join(managed.pending, fileName);
  const item: OperationalSignalSpoolItem = Object.freeze({
    schemaVersion: 1,
    signal,
    delivery: Object.freeze({
      attemptCount: 0,
      nextAttemptAt: signal.occurredAt,
      lastErrorCode: null,
    }),
    attempts: Object.freeze([]),
  });
  const created = await atomicCreateJson(filePath, item);
  if (created === "created") {
    return { replayed: false, filePath };
  }

  let raced: OperationalSignalSpoolItem;
  try {
    raced = validateSpoolItem(await safeReadJson(filePath));
  } catch {
    throw new Error("operational_signal_spool_archive_corrupt");
  }
  if (
    raced.signal.signalId !== signal.signalId ||
    raced.signal.incidentKey !== signal.incidentKey ||
    raced.signal.lifecycle !== signal.lifecycle ||
    raced.signal.dedupeWindowStart !== signal.dedupeWindowStart ||
    raced.signal.dedupeWindowSeconds !== signal.dedupeWindowSeconds
  ) {
    throw new Error("operational_signal_spool_identity_conflict");
  }
  return { replayed: true, filePath };
}

export function operationalSignalRetryDelayMs(
  attemptNumber: number,
  signalId: string,
): number {
  const attempt = boundedInteger(
    attemptNumber,
    attemptNumber,
    1,
    100,
    "operational_signal_retry_attempt_invalid",
  );
  if (
    typeof signalId !== "string" ||
    signalId.length < 8 ||
    signalId.length > 220 ||
    !TOKEN_RE.test(signalId)
  ) {
    throw new Error("operational_signal_retry_identity_invalid");
  }
  const exponential = Math.min(
    60 * 60_000,
    15_000 * 2 ** Math.max(0, attempt - 1),
  );
  const entropy =
    Number.parseInt(
      createHash("sha256")
        .update(`tecpey-operational-signal-retry-v1:${signalId}:${attempt}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) / 0xffff_ffff;
  const jittered = Math.round(exponential * (0.8 + entropy * 0.4));
  return Math.min(60 * 60_000, Math.max(15_000, jittered));
}

async function moveFile(
  source: string,
  destinationDirectory: string,
): Promise<void> {
  const sourceStat = await lstat(source);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    throw new Error("operational_signal_spool_move_source_unsafe");
  }
  const destination = path.join(destinationDirectory, path.basename(source));
  const existing = await lstat(destination).catch(() => null);
  if (existing) {
    throw new Error("operational_signal_spool_destination_conflict");
  }
  const sourceDirectory = path.dirname(source);
  await rename(source, destination);
  await chmod(destination, 0o600);
  await syncDirectory(destinationDirectory);
  if (sourceDirectory !== destinationDirectory) {
    await syncDirectory(sourceDirectory);
  }
}

async function bestEffortPersistSignal(
  signal: OperationalSignalEvidence,
): Promise<void> {
  try {
    await withTx((client) => persistOperationalSignalTx(client, signal));
  } catch {
    // The local spool is the outage-safe source of delivery authority.
  }
}

async function bestEffortPersistAttempt(
  input: OperationalSignalDeliveryAttempt,
): Promise<void> {
  try {
    await withTx((client) =>
      persistOperationalSignalDeliveryAttemptTx(client, input),
    );
  } catch {
    // Delivery evidence remains preserved in the local spool/archive.
  }
}

function deliveryErrorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "webhook_timeout";
  }
  return "webhook_network_error";
}

export async function deliverOperationalSignals(
  config: OperationalSignalDeliveryConfig,
): Promise<OperationalSignalDeliverySummary> {
  const managed = await ensureOperationalSignalSpoolDirectories(
    config.stateDirectory,
  );
  const webhookUrl = validateWebhookUrl(config.webhookUrl);
  const bearerToken = validateBearerToken(config.bearerToken);
  const limit = boundedInteger(
    config.limit,
    20,
    1,
    100,
    "operational_signal_limit_invalid",
  );
  const timeoutMs = boundedInteger(
    config.timeoutMs,
    10_000,
    1_000,
    30_000,
    "operational_signal_timeout_invalid",
  );
  const maxAttempts = boundedInteger(
    config.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
    1,
    100,
    "operational_signal_max_attempts_invalid",
  );
  const now = config.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("operational_signal_clock_invalid");
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const entries = (await readdir(managed.pending, { withFileTypes: true }))
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);
  const summary = {
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

    let item: OperationalSignalSpoolItem;
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

    await bestEffortPersistSignal(item.signal);
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
          "User-Agent": "TecPey-Ops-Signal/1.0",
          "Idempotency-Key": item.signal.signalId,
          ...(bearerToken
            ? { Authorization: `Bearer ${bearerToken}` }
            : {}),
        },
        body: JSON.stringify(item.signal),
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

    if (deliveryResult === "delivered") {
      await moveFile(filePath, managed.delivered);
      summary.delivered += 1;
      continue;
    }
    if (
      deliveryResult === "terminal_failure" ||
      attemptNumber >= maxAttempts
    ) {
      await moveFile(filePath, managed.quarantine);
      summary.quarantined += 1;
      continue;
    }

    const updated: OperationalSignalSpoolItem = Object.freeze({
      ...item,
      delivery: Object.freeze({
        attemptCount: attemptNumber,
        nextAttemptAt: new Date(
          now.getTime() +
            operationalSignalRetryDelayMs(
              attemptNumber,
              item.signal.signalId,
            ),
        ).toISOString(),
        lastErrorCode: errorCode,
      }),
    });
    await atomicReplaceJson(filePath, updated);
    summary.retryable += 1;
  }

  return Object.freeze(summary);
}

