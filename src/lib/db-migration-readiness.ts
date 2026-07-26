import type { PoolClient } from "pg";
import {
  DATABASE_MIGRATION_FILENAMES,
  DATABASE_MIGRATION_PLAN_HASH,
  validateMigrationRegistry,
} from "./db-migration-registry";
import { migrationLedgerDigest } from "./db-migration-plan";

export type MigrationReadinessStatus =
  | "current"
  | "migration_running"
  | "migration_failed"
  | "outdated"
  | "uninitialized";

export type MigrationReadiness = Readonly<{
  status: MigrationReadinessStatus;
  planHash: string;
  applied: number | null;
  expected: number;
  runnerId?: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
}>;

export function failedMigrationReadiness(errorCode: string): MigrationReadiness {
  return {
    status: "migration_failed",
    planHash: DATABASE_MIGRATION_PLAN_HASH,
    applied: null,
    expected: DATABASE_MIGRATION_FILENAMES.length,
    errorCode,
  };
}

type StateRow = {
  status: "running" | "current" | "failed";
  plan_hash: string;
  ledger_digest: string | null;
  runner_id: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  error_code: string | null;
};

type LedgerRow = { filename: string; checksum: string };

function iso(value: Date | string | null): string | undefined {
  if (value === null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function checkMigrationReadiness(client: PoolClient): Promise<MigrationReadiness> {
  validateMigrationRegistry();
  const expected = DATABASE_MIGRATION_FILENAMES.length;
  let state: StateRow | undefined;
  let ledger: LedgerRow[];
  try {
    const stateResult = await client.query<StateRow>(
      `SELECT status, plan_hash, ledger_digest, runner_id, started_at, finished_at, error_code
         FROM _migration_runtime_state WHERE singleton = TRUE LIMIT 1`,
    );
    state = stateResult.rows[0];
    const ledgerResult = await client.query<LedgerRow>(
      "SELECT filename, checksum FROM _migrations ORDER BY filename",
    );
    ledger = ledgerResult.rows;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") {
      let applied = 0;
      try {
        const ledgerResult = await client.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM _migrations",
        );
        applied = ledgerResult.rows[0]?.count ?? 0;
      } catch (ledgerError) {
        if ((ledgerError as { code?: string }).code !== "42P01") throw ledgerError;
      }
      return { status: "uninitialized", planHash: DATABASE_MIGRATION_PLAN_HASH, applied, expected };
    }
    throw error;
  }

  if (!state) {
    return { status: "uninitialized", planHash: DATABASE_MIGRATION_PLAN_HASH, applied: ledger.length, expected };
  }
  const evidence = {
    planHash: DATABASE_MIGRATION_PLAN_HASH,
    applied: ledger.length,
    expected,
    runnerId: state.runner_id,
    startedAt: iso(state.started_at),
    finishedAt: iso(state.finished_at),
    errorCode: state.error_code ?? undefined,
  };
  if (state.status === "running") return { status: "migration_running", ...evidence };
  if (state.status === "failed") return { status: "migration_failed", ...evidence };

  const expectedFiles = new Set(DATABASE_MIGRATION_FILENAMES);
  const filenames = new Set(ledger.map((row) => row.filename));
  const ledgerValid =
    ledger.length === expectedFiles.size &&
    filenames.size === ledger.length &&
    ledger.every(
      (row) => expectedFiles.has(row.filename) && /^[0-9a-f]{16}(?:[0-9a-f]{48})?$/.test(row.checksum),
    );
  const digestMatches = state.ledger_digest === migrationLedgerDigest(ledger);
  if (state.plan_hash !== DATABASE_MIGRATION_PLAN_HASH || !ledgerValid || !digestMatches) {
    return { status: "outdated", ...evidence };
  }
  return { status: "current", ...evidence };
}

export function assertMigrationReady(readiness: MigrationReadiness): void {
  if (readiness.status !== "current") {
    throw new Error(`database_schema_not_ready:${readiness.status}`);
  }
}
