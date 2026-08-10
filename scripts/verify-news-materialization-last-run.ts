import { createHash, timingSafeEqual } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import {
  NEWS_MATERIALIZATION_JOB,
  type NewsMaterializationLastRun,
} from "../src/lib/news-materialization-worker";
import {
  hashOperationalEvidence,
  validateOperationalJobRunEvidence,
} from "../src/lib/ops/operational-job-evidence";

const MAX_LAST_RUN_BYTES = 64 * 1024;
const SENSITIVE_TOKENS = [
  "DATABASE_URL",
  "postgres://",
  "postgresql://",
  "TECPEY_OPS_ALERT_BEARER_TOKEN",
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "studentId",
  "tenantId",
  "principalId",
  "authorization",
  "bearer ",
];

function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function absolutePath(name: string): string {
  const value = path.normalize(required(name));
  if (
    !path.isAbsolute(value) ||
    value === path.parse(value).root ||
    value.length > 500 ||
    value.includes("\0")
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return value;
}

function boundedDuration(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name.toLowerCase()}_invalid`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return parsed;
}

function optionalLocales(name: string): Set<string> | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const locales = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (locales.length === 0) throw new Error(`${name.toLowerCase()}_invalid`);
  for (const locale of locales) {
    if (locale !== "fa" && locale !== "en") throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return new Set(locales);
}

async function safeRead(filePath: string): Promise<string> {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 2 || stat.size > MAX_LAST_RUN_BYTES) {
    throw new Error("news_materialization_last_run_file_unsafe");
  }
  return readFile(filePath, "utf8");
}

function rejectSensitiveMaterial(content: string): void {
  const lower = content.toLowerCase();
  for (const token of SENSITIVE_TOKENS) {
    if (lower.includes(token.toLowerCase())) {
      throw new Error("news_materialization_last_run_sensitive_material");
    }
  }
}

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("news_materialization_last_run_shape_invalid");
  }
}

function verifyDigest(run: NewsMaterializationLastRun["run"], resultHash: unknown): void {
  if (typeof resultHash !== "string" || !/^[0-9a-f]{64}$/.test(resultHash)) {
    throw new Error("news_materialization_last_run_hash_invalid");
  }
  const expected = Buffer.from(resultHash, "hex");
  const actual = Buffer.from(hashOperationalEvidence(run), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("news_materialization_last_run_hash_mismatch");
  }
}

function verifyLastRun(
  raw: unknown,
  options: {
    maxAgeMs: number;
    expectedLocales: Set<string> | null;
  },
): {
  runId: string;
  status: string;
  completedAt: string;
  latestSnapshotGeneratedAt: string | null;
  localeCount: number;
  insertedHistoryItems: number;
} {
  assertObject(raw);
  if (raw.schemaVersion !== 1) throw new Error("news_materialization_last_run_version_invalid");
  assertObject(raw.freshness);
  const run = validateOperationalJobRunEvidence(raw.run);
  if (run.jobName !== NEWS_MATERIALIZATION_JOB) {
    throw new Error("news_materialization_last_run_job_invalid");
  }
  if (run.schedulerUnit !== "tecpey-news-materialization.service") {
    throw new Error("news_materialization_last_run_unit_invalid");
  }
  if (run.resultStatus !== "succeeded") {
    throw new Error("news_materialization_last_run_not_successful");
  }
  verifyDigest(run, raw.resultHash);

  const generatedAt = new Date(String(raw.freshness.generatedAt));
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new Error("news_materialization_freshness_generated_at_invalid");
  }
  if (Date.now() - generatedAt.getTime() > options.maxAgeMs) {
    throw new Error("news_materialization_last_run_stale");
  }
  if (raw.freshness.jobName !== NEWS_MATERIALIZATION_JOB) {
    throw new Error("news_materialization_freshness_job_invalid");
  }
  if (!Array.isArray(raw.freshness.locales)) {
    throw new Error("news_materialization_freshness_locales_invalid");
  }
  if (typeof raw.freshness.insertedHistoryItems !== "number") {
    throw new Error("news_materialization_freshness_inserted_invalid");
  }
  if (raw.freshness.insertedHistoryItems < 1) {
    throw new Error("news_materialization_freshness_empty");
  }
  if (options.expectedLocales) {
    const observed = new Set(
      raw.freshness.locales
        .map((entry) => (typeof entry?.locale === "string" ? entry.locale : ""))
        .filter(Boolean),
    );
    for (const locale of options.expectedLocales) {
      if (!observed.has(locale)) throw new Error("news_materialization_freshness_locale_missing");
    }
  }

  return {
    runId: run.runId,
    status: run.resultStatus,
    completedAt: run.completedAt,
    latestSnapshotGeneratedAt:
      typeof raw.freshness.latestSnapshotGeneratedAt === "string"
        ? raw.freshness.latestSnapshotGeneratedAt
        : null,
    localeCount: raw.freshness.locales.length,
    insertedHistoryItems: raw.freshness.insertedHistoryItems,
  };
}

async function main(): Promise<void> {
  const filePath = absolutePath("TECPEY_NEWS_MATERIALIZATION_LAST_RUN_FILE");
  const content = await safeRead(filePath);
  rejectSensitiveMaterial(content);
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("news_materialization_last_run_json_invalid");
  }
  const result = verifyLastRun(raw, {
    maxAgeMs: boundedDuration(
      "TECPEY_NEWS_MATERIALIZATION_MAX_AGE_MS",
      30 * 60_000,
      7 * 24 * 60 * 60_000,
    ),
    expectedLocales: optionalLocales("TECPEY_NEWS_MATERIALIZATION_EXPECTED_LOCALES"),
  });
  console.log(JSON.stringify({
    ok: true,
    ...result,
    evidenceFile: path.basename(filePath),
    evidenceSha256: createHash("sha256").update(content).digest("hex"),
  }));
}

void main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,160}$/.test(error.message)
    ? error.message
    : "news_materialization_last_run_verification_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
