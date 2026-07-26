import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { emitAlert } from "./alerts";
import {
  DATABASE_MIGRATION_FILENAMES,
  DATABASE_MIGRATION_PLAN_HASH,
  DATABASE_MIGRATION_REGISTRY,
  validateMigrationRegistry,
} from "./db-migration-registry";
import { logger } from "./logger";

export const DATABASE_MIGRATION_LOCK_NAME = "tecpey_schema_migrations_v2";
export const DATABASE_MIGRATION_LOCK_KEYS = [-1414350421, 1297109073] as const;
export const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_INTERVAL_MS = 100;

export type MigrationRunOptions = Readonly<{
  lockTimeoutMs?: number;
  runnerId?: string;
}>;

type LedgerRow = { filename: string; checksum: string };

function boundedLockTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_MIGRATION_LOCK_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 300_000) {
    throw new Error("migration_lock_timeout_invalid");
  }
  return timeout;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function ensureMigrationControlTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migration_runtime_state (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      status TEXT NOT NULL CHECK (status IN ('running', 'current', 'failed')),
      plan_hash TEXT NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
      ledger_digest TEXT CHECK (ledger_digest IS NULL OR ledger_digest ~ '^[0-9a-f]{64}$'),
      runner_id UUID NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      error_code TEXT,
      error_detail TEXT
    )
  `);
}

async function acquireMigrationLock(client: PoolClient, timeoutMs: number): Promise<number> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS acquired",
      [...DATABASE_MIGRATION_LOCK_KEYS],
    );
    if (result.rows[0]?.acquired === true) return Date.now() - startedAt;
    await wait(Math.min(LOCK_POLL_INTERVAL_MS, timeoutMs - (Date.now() - startedAt)));
  }
  throw new Error(`migration_lock_timeout:${timeoutMs}`);
}

async function releaseMigrationLock(client: PoolClient): Promise<void> {
  const result = await client.query<{ released: boolean }>(
    "SELECT pg_advisory_unlock($1, $2) AS released",
    [...DATABASE_MIGRATION_LOCK_KEYS],
  );
  if (result.rows[0]?.released !== true) throw new Error("migration_lock_release_failed");
}

export function migrationLedgerDigest(rows: readonly LedgerRow[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...rows].sort((a, b) => a.filename.localeCompare(b.filename))))
    .digest("hex");
}

async function readAndValidateLedger(client: PoolClient): Promise<LedgerRow[]> {
  const result = await client.query<LedgerRow>(
    "SELECT filename, checksum FROM _migrations ORDER BY filename",
  );
  const expected = new Set(DATABASE_MIGRATION_FILENAMES);
  const actual = new Set<string>();
  for (const row of result.rows) {
    if (actual.has(row.filename)) throw new Error(`migration_ledger_duplicate:${row.filename}`);
    if (!expected.has(row.filename)) throw new Error(`migration_ledger_unregistered:${row.filename}`);
    if (!/^[0-9a-f]{16}(?:[0-9a-f]{48})?$/.test(row.checksum)) {
      throw new Error(`migration_ledger_checksum_invalid:${row.filename}`);
    }
    actual.add(row.filename);
  }
  for (const filename of expected) {
    if (!actual.has(filename)) throw new Error(`migration_ledger_missing:${filename}`);
  }
  return result.rows;
}

async function hasCurrentMigrationEvidence(client: PoolClient): Promise<boolean> {
  try {
    const state = await client.query<{
      status: string;
      plan_hash: string;
      ledger_digest: string | null;
    }>(
      `SELECT status, plan_hash, ledger_digest
         FROM _migration_runtime_state WHERE singleton = TRUE LIMIT 1`,
    );
    const row = state.rows[0];
    if (row?.status !== "current" || row.plan_hash !== DATABASE_MIGRATION_PLAN_HASH) return false;
    return row.ledger_digest === migrationLedgerDigest(await readAndValidateLedger(client));
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return false;
    if (error instanceof Error && /^migration_ledger_(missing|unregistered):/.test(error.message)) {
      return false;
    }
    throw error;
  }
}

async function recordRunning(client: PoolClient, runnerId: string): Promise<void> {
  await client.query(
    `INSERT INTO _migration_runtime_state
       (singleton, status, plan_hash, ledger_digest, runner_id, started_at, finished_at, updated_at, error_code, error_detail)
     VALUES (TRUE, 'running', $1, NULL, $2, NOW(), NULL, NOW(), NULL, NULL)
     ON CONFLICT (singleton) DO UPDATE SET
       status = 'running', plan_hash = EXCLUDED.plan_hash, ledger_digest = NULL,
       runner_id = EXCLUDED.runner_id, started_at = EXCLUDED.started_at,
       finished_at = NULL, updated_at = NOW(), error_code = NULL, error_detail = NULL`,
    [DATABASE_MIGRATION_PLAN_HASH, runnerId],
  );
}

async function recordCurrent(client: PoolClient, runnerId: string, digest: string): Promise<void> {
  await client.query(
    `UPDATE _migration_runtime_state
        SET status = 'current', ledger_digest = $1, finished_at = NOW(), updated_at = NOW()
      WHERE singleton = TRUE AND runner_id = $2`,
    [digest, runnerId],
  );
}

async function recordFailure(client: PoolClient, runnerId: string, error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error);
  const code = detail.split(":", 1)[0].slice(0, 120);
  await client.query(
    `UPDATE _migration_runtime_state
        SET status = 'failed', finished_at = NOW(), updated_at = NOW(),
            error_code = $1, error_detail = $2
      WHERE singleton = TRUE AND runner_id = $3`,
    [code, detail.slice(0, 500), runnerId],
  );
}

export async function applyDatabaseMigrations(client: PoolClient): Promise<void> {
  validateMigrationRegistry();
  for (const migration of DATABASE_MIGRATION_REGISTRY) await migration.run(client);
}

export async function applyDatabaseMigrationsWithLock(
  client: PoolClient,
  options: MigrationRunOptions = {},
): Promise<void> {
  validateMigrationRegistry();
  await ensureMigrationControlTable(client);
  const timeoutMs = boundedLockTimeout(options.lockTimeoutMs);
  const runnerId = options.runnerId ?? randomUUID();
  const waitMs = await acquireMigrationLock(client, timeoutMs);
  logger.info("[db-migrate] bounded migration lock acquired", { runnerId, waitMs, timeoutMs });

  let alreadyCurrent = false;
  let runningRecorded = false;
  let originalError: unknown;
  try {
    alreadyCurrent = await hasCurrentMigrationEvidence(client);
    if (!alreadyCurrent) {
      await recordRunning(client, runnerId);
      runningRecorded = true;
    }
    await applyDatabaseMigrations(client);
    const ledger = await readAndValidateLedger(client);
    if (!alreadyCurrent) await recordCurrent(client, runnerId, migrationLedgerDigest(ledger));
  } catch (error) {
    originalError = error;
    try {
      if (!runningRecorded) await recordRunning(client, runnerId);
      await recordFailure(client, runnerId, error);
    } catch (stateError) {
      originalError = new AggregateError([error, stateError], "migration_failed_and_state_record_failed");
    }
    emitAlert("MIGRATION_FAILED", "Canonical database migration plan failed", {
      runnerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await releaseMigrationLock(client);
  } catch (releaseError) {
    originalError = originalError
      ? new AggregateError([originalError, releaseError], "migration_failed_and_lock_release_failed")
      : releaseError;
  }
  if (originalError) throw originalError;
}
