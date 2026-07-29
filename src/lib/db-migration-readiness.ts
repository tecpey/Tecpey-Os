import type { PoolClient } from "pg";
import {
  DATABASE_MIGRATION_FILENAMES,
  DATABASE_MIGRATION_EXPECTATIONS,
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

export const DEFAULT_MIGRATION_RUNNING_STALE_AFTER_MS = 10 * 60_000;

export type MigrationReadinessOptions = Readonly<{
  now?: Date;
  runningStaleAfterMs?: number;
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
  updated_at: Date | string;
  error_code: string | null;
};

type LedgerRow = { filename: string; checksum: string };
type RuntimeLedgerRow = {
  identity: string;
  sequence: number;
  ordinal: number;
  migration_id: string;
  expected_checksum: string;
  owner: string;
  domain: string;
};

function boundedDiagnostic(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 240);
}

function checksumMatches(
  actual: string,
  expected: string,
  acceptsHistoricalChecksumPrefix: boolean,
  compatibleHistoricalChecksums: readonly string[],
): boolean {
  return actual === expected ||
    (acceptsHistoricalChecksumPrefix && actual.length === 16 && expected.startsWith(actual)) ||
    compatibleHistoricalChecksums.includes(actual);
}

function iso(value: Date | string | null): string | undefined {
  if (value === null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function checkMigrationReadiness(
  client: PoolClient,
  options: MigrationReadinessOptions = {},
): Promise<MigrationReadiness> {
  validateMigrationRegistry();
  const expected = DATABASE_MIGRATION_FILENAMES.length;
  let state: StateRow | undefined;
  let ledger: LedgerRow[];
  let runtimeLedger: RuntimeLedgerRow[];
  try {
    const stateResult = await client.query<StateRow>(
      `SELECT status, plan_hash, ledger_digest, runner_id, started_at, finished_at, updated_at, error_code
         FROM _migration_runtime_state WHERE singleton = TRUE LIMIT 1`,
    );
    state = stateResult.rows[0];
    const ledgerResult = await client.query<LedgerRow>(
      "SELECT filename, checksum FROM _migrations ORDER BY filename",
    );
    ledger = ledgerResult.rows;
    const runtimeLedgerResult = await client.query<RuntimeLedgerRow>(
      `SELECT identity, sequence, ordinal, migration_id, expected_checksum, owner, domain
         FROM _migration_runtime_ledger ORDER BY sequence, ordinal`,
    );
    runtimeLedger = runtimeLedgerResult.rows;
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
  if (state.status === "running") {
    const staleAfterMs = options.runningStaleAfterMs ?? DEFAULT_MIGRATION_RUNNING_STALE_AFTER_MS;
    if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1_000 || staleAfterMs > 86_400_000) {
      throw new Error("migration_running_stale_threshold_invalid");
    }
    const updatedAt = new Date(state.updated_at).getTime();
    const now = (options.now ?? new Date()).getTime();
    if (!Number.isFinite(updatedAt) || now - updatedAt >= staleAfterMs) {
      return { status: "migration_failed", ...evidence, errorCode: "migration_runner_stale" };
    }
    return { status: "migration_running", ...evidence };
  }
  if (state.status === "failed") return { status: "migration_failed", ...evidence };

  const expectedFiles = new Set(DATABASE_MIGRATION_FILENAMES);
  const expectedByIdentity = new Map(
    DATABASE_MIGRATION_EXPECTATIONS.map((expectation) => [expectation.identity, expectation]),
  );
  const filenames = new Set(ledger.map((row) => row.filename));
  let mismatch: string | undefined;
  if (filenames.size !== ledger.length) mismatch = "migration_duplicate_identity";
  for (const row of ledger) {
    if (mismatch) break;
    const expectedMigration = expectedByIdentity.get(row.filename);
    if (!expectedMigration) mismatch = `migration_unexpected:${row.filename}`;
    else if (!/^[0-9a-f]{16}(?:[0-9a-f]{48})?$/.test(row.checksum)) {
      mismatch = `migration_checksum_format:${row.filename}`;
    } else if (!checksumMatches(
      row.checksum,
      expectedMigration.checksum,
      expectedMigration.acceptsHistoricalChecksumPrefix,
      expectedMigration.compatibleHistoricalChecksums,
    )) {
      mismatch = `migration_checksum_mismatch:${row.filename}`;
    }
  }
  if (!mismatch) {
    for (const identity of expectedFiles) {
      if (!filenames.has(identity)) {
        mismatch = `migration_missing:${identity}`;
        break;
      }
    }
  }
  if (!mismatch && ledger.length !== expectedFiles.size) mismatch = "migration_membership_mismatch";
  if (!mismatch) {
    const expectedRuntimeIdentities = new Set(
      DATABASE_MIGRATION_EXPECTATIONS.map((expectation) => expectation.identity),
    );
    const unexpectedRuntime = runtimeLedger.find(
      (row) => !expectedRuntimeIdentities.has(row.identity),
    );
    if (unexpectedRuntime) mismatch = `migration_runtime_unexpected:${unexpectedRuntime.identity}`;
  }
  if (!mismatch) {
    for (const [index, expectedMigration] of DATABASE_MIGRATION_EXPECTATIONS.entries()) {
      const actual = runtimeLedger[index];
      if (!actual || actual.identity !== expectedMigration.identity) {
        mismatch = `migration_identity_mismatch:${expectedMigration.identity}`;
      } else if (actual.sequence !== expectedMigration.sequence) {
        mismatch = `migration_sequence_mismatch:${expectedMigration.identity}`;
      } else if (actual.ordinal !== expectedMigration.ordinal) {
        mismatch = `migration_ordinal_mismatch:${expectedMigration.identity}`;
      } else if (actual.migration_id !== expectedMigration.migrationId) {
        mismatch = `migration_step_identity_mismatch:${expectedMigration.identity}`;
      } else if (actual.expected_checksum !== expectedMigration.checksum) {
        mismatch = `migration_expected_checksum_mismatch:${expectedMigration.identity}`;
      } else if (actual.owner !== expectedMigration.owner || actual.domain !== expectedMigration.domain) {
        mismatch = `migration_ownership_mismatch:${expectedMigration.identity}`;
      }
      if (mismatch) break;
    }
  }
  if (!mismatch && runtimeLedger.length !== DATABASE_MIGRATION_EXPECTATIONS.length) {
    mismatch = "migration_runtime_membership_mismatch";
  }
  const digestMatches = state.ledger_digest === migrationLedgerDigest(ledger);
  if (state.plan_hash !== DATABASE_MIGRATION_PLAN_HASH) mismatch ??= "migration_plan_mismatch";
  if (!digestMatches) mismatch ??= "migration_ledger_digest_mismatch";
  if (mismatch) {
    return { status: "outdated", ...evidence, errorCode: boundedDiagnostic(mismatch) };
  }
  return { status: "current", ...evidence };
}

export function assertMigrationReady(readiness: MigrationReadiness): void {
  if (readiness.status !== "current") {
    throw new Error(`database_schema_not_ready:${readiness.status}`);
  }
}
