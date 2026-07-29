import "server-only";

import { Pool, type PoolClient } from "pg";
import type { CommunityChallengeHostDatabaseEvidence } from "@/lib/ops/community-challenge-host-collector";
import type { HostEvidenceLatestRun } from "@/lib/ops/community-challenge-host-evidence";

const MIGRATION_FILENAME = "0050_operational_job_evidence.sql";
const JOB_NAME = "community-challenge-finalization";

function validateDatabaseUrl(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    value.length > 4_096 ||
    value.includes("CHANGE_ME") ||
    /[\r\n\u0000]/.test(value)
  ) {
    throw new Error("host_evidence_database_url_invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("host_evidence_database_url_invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("host_evidence_database_url_invalid");
  }
  return value;
}

function integer(value: unknown, code: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 1_000_000) {
    throw new Error(code);
  }
  return number;
}

function iso(value: unknown, code: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error(code);
  return date.toISOString();
}

function parseLatestRun(row: Record<string, unknown> | undefined): HostEvidenceLatestRun | null {
  if (!row) return null;
  const resultStatus = row.result_status;
  if (
    resultStatus !== "succeeded" &&
    resultStatus !== "partial_failure" &&
    resultStatus !== "authority_unavailable"
  ) {
    throw new Error("host_evidence_database_run_invalid");
  }
  const runId = String(row.run_id ?? "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId)) {
    throw new Error("host_evidence_database_run_invalid");
  }
  return {
    runId,
    resultStatus,
    startedAt: iso(row.started_at, "host_evidence_database_run_invalid"),
    completedAt: iso(row.completed_at, "host_evidence_database_run_invalid"),
    batchesProcessed: integer(row.batches_processed, "host_evidence_database_run_invalid"),
    selectedCount: integer(row.selected_count, "host_evidence_database_run_invalid"),
    finalizedCompletedCount: integer(
      row.finalized_completed_count,
      "host_evidence_database_run_invalid",
    ),
    finalizedNotCompletedCount: integer(
      row.finalized_not_completed_count,
      "host_evidence_database_run_invalid",
    ),
    failureCount: integer(row.failure_count, "host_evidence_database_run_invalid"),
    drainLimitReached: row.drain_limit_reached === true,
  };
}

async function queryEvidence(client: PoolClient): Promise<CommunityChallengeHostDatabaseEvidence> {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    const migration = await client.query<{ applied: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM _migrations
          WHERE filename = $1
       ) AS applied`,
      [MIGRATION_FILENAME],
    );
    const latest = await client.query<Record<string, unknown>>(
      `SELECT run_id::text,
              result_status,
              started_at,
              completed_at,
              batches_processed,
              selected_count,
              finalized_completed_count,
              finalized_not_completed_count,
              failure_count,
              drain_limit_reached
         FROM platform_operational_job_runs
        WHERE job_name = $1
        ORDER BY completed_at DESC, run_id DESC
        LIMIT 1`,
      [JOB_NAME],
    );
    await client.query("COMMIT");
    return {
      migration0050Applied: migration.rows[0]?.applied === true,
      latestRun: parseLatestRun(latest.rows[0]),
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original read-only evidence failure.
    }
    throw error;
  }
}

export async function readCommunityChallengeHostDatabaseEvidence(
  databaseUrl: string,
): Promise<CommunityChallengeHostDatabaseEvidence> {
  const pool = new Pool({
    connectionString: validateDatabaseUrl(databaseUrl),
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
    application_name: "tecpey-staging-host-evidence",
  });
  pool.on("error", () => {
    // The caller reports one controlled code; raw connection details stay private.
  });
  try {
    const client = await pool.connect();
    try {
      return await queryEvidence(client);
    } finally {
      client.release();
    }
  } catch {
    throw new Error("host_evidence_database_unavailable");
  } finally {
    await pool.end();
  }
}
