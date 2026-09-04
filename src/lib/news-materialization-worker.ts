import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  rm,
} from "node:fs/promises";
import { hostname as osHostname } from "node:os";
import path from "node:path";
import type { PoolClient } from "pg";
import type { ContentLocale } from "./content-growth";
import {
  buildNewsAutomationBatch,
  type RawNewsInput,
} from "./news-automation";
import {
  materializeNewsAutomationDecisions,
  type MaterializedNewsSnapshot,
} from "./news-materialization";
import {
  persistMaterializedNewsSnapshotTx,
  type NewsMaterializationSourceMode,
} from "./news-materialization-persistence";
import {
  hashOperationalEvidence,
  validateOperationalJobRunEvidence,
  type OperationalJobRunEvidence,
} from "./ops/operational-job-evidence";

export const NEWS_MATERIALIZATION_JOB = "news-materialization";
export const NEWS_MATERIALIZATION_UNIT = "tecpey-news-materialization.service";
const MAX_LAST_RUN_BYTES = 64 * 1024;
const REASON_RE = /^[a-z0-9._:-]{3,100}$/;

export type NewsMaterializationWorkerInput = {
  snapshotId: string;
  locale: ContentLocale;
  fetchedAt: string;
  sourceMode: NewsMaterializationSourceMode;
  rawInputs: RawNewsInput[];
  historyLimit?: number;
  topCoinLimit?: number;
};

export type NewsMaterializationWorkerResult = {
  skipped: boolean;
  locale: ContentLocale;
  sourceMode: NewsMaterializationSourceMode;
  fetchedAt: string;
  rawInputCount: number;
  publishable: number;
  needsReview: number;
  rejected: number;
  persisted?: {
    replayed: boolean;
    snapshotId: string;
    snapshotHash: string;
    insertedHistoryItems: number;
  };
};

export type NewsMaterializationSchedulerFailure = {
  locale?: ContentLocale;
  reasonCode: string;
};

export type NewsMaterializationFreshnessReport = {
  schemaVersion: 1;
  jobName: typeof NEWS_MATERIALIZATION_JOB;
  generatedAt: string;
  latestSnapshotGeneratedAt: string | null;
  freshnessAgeMs: number | null;
  localeCount: number;
  rawInputCount: number;
  publishableCount: number;
  needsReviewCount: number;
  rejectedCount: number;
  insertedHistoryItems: number;
  replayedSnapshotCount: number;
  skippedLocaleCount: number;
  locales: Array<{
    locale: ContentLocale;
    sourceMode: NewsMaterializationSourceMode;
    fetchedAt: string;
    skipped: boolean;
    rawInputCount: number;
    publishable: number;
    needsReview: number;
    rejected: number;
    snapshotId: string | null;
    insertedHistoryItems: number;
    replayed: boolean;
  }>;
};

export type NewsMaterializationLastRun = {
  schemaVersion: 1;
  run: OperationalJobRunEvidence;
  resultHash: string;
  freshness: NewsMaterializationFreshnessReport;
};

export function buildNewsMaterializationIdempotencyKey({
  locale,
  sourceMode,
  fetchedAt,
}: {
  locale: ContentLocale;
  sourceMode: NewsMaterializationSourceMode;
  fetchedAt: string;
}): string {
  const normalizedFetchedAt = new Date(fetchedAt).toISOString().replace(".000Z", "Z");
  return `crypto-news:materialize:${sourceMode}:${locale}:${normalizedFetchedAt}`;
}

export function buildNewsMaterializationWorkerSnapshot(
  input: NewsMaterializationWorkerInput,
): MaterializedNewsSnapshot | null {
  if (input.rawInputs.length === 0) return null;
  const decisions = buildNewsAutomationBatch(input.rawInputs);
  return materializeNewsAutomationDecisions(decisions, {
    locale: input.locale,
    generatedAt: input.fetchedAt,
    historyLimit: input.historyLimit ?? 24,
    topCoinLimit: input.topCoinLimit ?? 5,
  });
}

export async function runNewsMaterializationWorkerTx(
  client: PoolClient,
  input: NewsMaterializationWorkerInput,
): Promise<NewsMaterializationWorkerResult> {
  const snapshot = buildNewsMaterializationWorkerSnapshot(input);
  if (!snapshot) {
    return {
      skipped: true,
      locale: input.locale,
      sourceMode: input.sourceMode,
      fetchedAt: input.fetchedAt,
      rawInputCount: 0,
      publishable: 0,
      needsReview: 0,
      rejected: 0,
    };
  }

  const persisted = await persistMaterializedNewsSnapshotTx(client, {
    snapshotId: input.snapshotId,
    idempotencyKey: buildNewsMaterializationIdempotencyKey(input),
    sourceMode: input.sourceMode,
    snapshot,
  });

  return {
    skipped: false,
    locale: input.locale,
    sourceMode: input.sourceMode,
    fetchedAt: input.fetchedAt,
    rawInputCount: input.rawInputs.length,
    publishable: snapshot.publishable,
    needsReview: snapshot.needsReview,
    rejected: snapshot.rejected,
    persisted,
  };
}

function iso(value: string, code: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(code);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(code);
  return normalized;
}

function boundedHost(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 1 ||
    normalized.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error("news_materialization_host_invalid");
  }
  return normalized;
}

function reasonCode(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return REASON_RE.test(normalized) ? normalized : "news_materialization_failure";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function fingerprintNewsMaterializationFailure(
  failure: NewsMaterializationSchedulerFailure,
): string {
  return createHash("sha256")
    .update(
      [
        "tecpey-news-materialization-failure-v1",
        failure.locale ?? "global",
        reasonCode(failure.reasonCode),
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 24);
}

export function buildNewsMaterializationFreshnessReport({
  completedAt,
  results,
}: {
  completedAt: string;
  results: NewsMaterializationWorkerResult[];
}): NewsMaterializationFreshnessReport {
  const generatedAt = iso(completedAt, "news_materialization_completed_at_invalid");
  const latestSnapshotGeneratedAt = results
    .filter((result) => !result.skipped && result.persisted)
    .map((result) => result.fetchedAt)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const freshnessAgeMs = latestSnapshotGeneratedAt === null
    ? null
    : Math.max(0, Date.parse(generatedAt) - Date.parse(latestSnapshotGeneratedAt));

  return {
    schemaVersion: 1,
    jobName: NEWS_MATERIALIZATION_JOB,
    generatedAt,
    latestSnapshotGeneratedAt,
    freshnessAgeMs,
    localeCount: results.length,
    rawInputCount: results.reduce((sum, result) => sum + result.rawInputCount, 0),
    publishableCount: results.reduce((sum, result) => sum + result.publishable, 0),
    needsReviewCount: results.reduce((sum, result) => sum + result.needsReview, 0),
    rejectedCount: results.reduce((sum, result) => sum + result.rejected, 0),
    insertedHistoryItems: results.reduce(
      (sum, result) => sum + (result.persisted?.insertedHistoryItems ?? 0),
      0,
    ),
    replayedSnapshotCount: results.filter((result) => result.persisted?.replayed === true).length,
    skippedLocaleCount: results.filter((result) => result.skipped).length,
    locales: results.map((result) => ({
      locale: result.locale,
      sourceMode: result.sourceMode,
      fetchedAt: iso(result.fetchedAt, "news_materialization_fetched_at_invalid"),
      skipped: result.skipped,
      rawInputCount: result.rawInputCount,
      publishable: result.publishable,
      needsReview: result.needsReview,
      rejected: result.rejected,
      snapshotId: result.persisted?.snapshotId ?? null,
      insertedHistoryItems: result.persisted?.insertedHistoryItems ?? 0,
      replayed: result.persisted?.replayed === true,
    })),
  };
}

export function buildNewsMaterializationRunEvidence({
  runId,
  hostName,
  startedAt,
  completedAt,
  results,
  failures = [],
  schedulerUnit = NEWS_MATERIALIZATION_UNIT,
}: {
  runId: string;
  hostName?: string;
  startedAt: string;
  completedAt: string;
  results: NewsMaterializationWorkerResult[];
  failures?: NewsMaterializationSchedulerFailure[];
  schedulerUnit?: string;
}): OperationalJobRunEvidence {
  const normalizedFailures = failures.map((failure) => ({
    locale: failure.locale,
    reasonCode: reasonCode(failure.reasonCode),
  }));
  const authorityUnavailable = normalizedFailures.some(
    (failure) =>
      failure.reasonCode.includes("database_unavailable") ||
      failure.reasonCode.includes("authority_unavailable"),
  );
  const selectedCount = results.reduce((sum, result) => sum + result.rawInputCount, 0);
  const finalizedCompletedCount = results.reduce((sum, result) => sum + result.publishable, 0);
  const finalizedNotCompletedCount = results.reduce(
    (sum, result) => sum + result.needsReview + result.rejected,
    0,
  );
  const failureBearingFailures = normalizedFailures.filter(
    (failure) => !failure.reasonCode.startsWith("news_feed_stale_"),
  );
  const failureFingerprints = uniqueSorted(
    failureBearingFailures.map(fingerprintNewsMaterializationFailure),
  );
  const reasonCodes = uniqueSorted(normalizedFailures.map((failure) => failure.reasonCode));
  const resultStatus: OperationalJobRunEvidence["resultStatus"] =
    authorityUnavailable && results.length === 0
      ? "authority_unavailable"
      : failureFingerprints.length > 0
        ? "partial_failure"
        : "succeeded";

  return validateOperationalJobRunEvidence({
    runId,
    jobName: NEWS_MATERIALIZATION_JOB,
    schedulerUnit,
    hostName: boundedHost(hostName ?? osHostname()),
    resultStatus,
    startedAt: iso(startedAt, "news_materialization_started_at_invalid"),
    completedAt: iso(completedAt, "news_materialization_completed_at_invalid"),
    batchesProcessed: results.length,
    selectedCount,
    finalizedCompletedCount,
    finalizedNotCompletedCount,
    failureCount: failureFingerprints.length,
    drainLimitReached: false,
    failureFingerprints,
    reasonCodes,
  });
}

function normalizeStateDirectory(value: string): string {
  const normalized = path.normalize(value.trim());
  if (
    !path.isAbsolute(normalized) ||
    normalized === path.parse(normalized).root ||
    normalized.length < 2 ||
    normalized.length > 500 ||
    normalized.includes("\0")
  ) {
    throw new Error("news_materialization_state_dir_invalid");
  }
  return normalized;
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const parent = path.dirname(filePath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("news_materialization_state_parent_unsafe");
  }
  await chmod(parent, 0o700);
  const content = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(content) > MAX_LAST_RUN_BYTES) {
    throw new Error("news_materialization_last_run_too_large");
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
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const existing = await lstat(filePath).catch(() => null);
    if (existing?.isSymbolicLink()) {
      throw new Error("news_materialization_last_run_symlink");
    }
    await rename(temporary, filePath);
    await chmod(filePath, 0o600);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function writeNewsMaterializationLastRun(
  stateDirectory: string,
  run: OperationalJobRunEvidence,
  freshness: NewsMaterializationFreshnessReport,
): Promise<string> {
  const root = normalizeStateDirectory(stateDirectory);
  const validRun = validateOperationalJobRunEvidence(run);
  const filePath = path.join(root, "news-materialization-last-run.json");
  await atomicWriteJson(filePath, {
    schemaVersion: 1,
    run: validRun,
    resultHash: hashOperationalEvidence(validRun),
    freshness,
  } satisfies NewsMaterializationLastRun);
  return filePath;
}
