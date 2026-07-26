import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import {
  DATABASE_MIGRATION_FILENAMES,
  DATABASE_MIGRATION_EXPECTATIONS,
  DATABASE_MIGRATION_PLAN_HASH,
  DATABASE_MIGRATION_REGISTRY,
  computeMigrationPlanHash,
  migrationEntryChecksum,
  type MigrationRegistryEntry,
  validateMigrationRegistry,
} from "../../lib/db-migration-registry";
import { canonicalMigrationChecksum } from "../../lib/db-migration-content";
import { PINNED_DATABASE_MIGRATION_PLAN_HASH } from "../../lib/db-migration-governance";
import {
  assertMigrationReady,
  checkMigrationReadiness,
} from "../../lib/db-migration-readiness";
import { migrationLedgerDigest } from "../../lib/db-migration-plan";

const noOp = async () => {};

function mockReadinessClient(
  stateRows: unknown[],
  ledgerRows: Array<{ filename: string; checksum: string }>,
  runtimeLedgerRows = DATABASE_MIGRATION_EXPECTATIONS.map((entry) => ({
    identity: entry.identity,
    sequence: entry.sequence,
    ordinal: entry.ordinal,
    migration_id: entry.migrationId,
    expected_checksum: entry.checksum,
    owner: entry.owner,
    domain: entry.domain,
  })),
): PoolClient {
  return {
    query: async (sql: string) => {
      if (sql.includes("_migration_runtime_state")) return { rows: stateRows };
      if (sql.includes("_migration_runtime_ledger")) return { rows: runtimeLedgerRows };
      if (sql.includes("_migrations")) return { rows: ledgerRows };
      throw new Error(`unexpected_query:${sql}`);
    },
  } as unknown as PoolClient;
}

describe("canonical database migration registry", () => {
  it("has a deterministic contiguous order, unique identities, and unique filenames", () => {
    assert.doesNotThrow(() => validateMigrationRegistry());
    assert.equal(DATABASE_MIGRATION_PLAN_HASH.length, 64);
    assert.equal(DATABASE_MIGRATION_PLAN_HASH, PINNED_DATABASE_MIGRATION_PLAN_HASH);
    assert.equal(new Set(DATABASE_MIGRATION_FILENAMES).size, DATABASE_MIGRATION_FILENAMES.length);
    assert.deepEqual(
      DATABASE_MIGRATION_REGISTRY.map((migration) => migration.sequence),
      Array.from({ length: DATABASE_MIGRATION_REGISTRY.length }, (_, index) => index + 1),
    );
  });

  it("binds SQL content, entry checksums, and the pinned plan fingerprint", () => {
    const first = DATABASE_MIGRATION_REGISTRY[0];
    const changedContent = `${first.migrations[0].content}\nSELECT 1;`;
    const changedMigration = {
      ...first.migrations[0],
      content: changedContent,
      checksum: canonicalMigrationChecksum(changedContent),
    };
    assert.notEqual(changedMigration.checksum, first.migrations[0].checksum);
    const changedMigrations = [changedMigration, ...first.migrations.slice(1)];
    const changedRegistry: MigrationRegistryEntry[] = [
      { ...first, migrations: changedMigrations, checksum: migrationEntryChecksum(changedMigrations) },
      ...DATABASE_MIGRATION_REGISTRY.slice(1),
    ];
    assert.notEqual(computeMigrationPlanHash(changedRegistry), DATABASE_MIGRATION_PLAN_HASH);
  });

  it("rejects duplicate identities, sequences, filenames, and unresolved dependencies", () => {
    const validMigrations = [{
      identity: "0001_valid.sql",
      content: "SELECT 1",
      checksum: canonicalMigrationChecksum("SELECT 1"),
      acceptsHistoricalChecksumPrefix: false,
      compatibleHistoricalChecksums: [],
    }];
    const valid: MigrationRegistryEntry = {
      sequence: 1,
      id: "migration-step-001",
      owner: "platform-infrastructure",
      domain: "platform-core",
      checksum: migrationEntryChecksum(validMigrations),
      migrations: validMigrations,
      filenames: ["0001_valid.sql"],
      dependsOn: [],
      run: noOp,
    };
    const nextMigrations = [{
      identity: "0002_valid.sql",
      content: "SELECT 2",
      checksum: canonicalMigrationChecksum("SELECT 2"),
      acceptsHistoricalChecksumPrefix: false,
      compatibleHistoricalChecksums: [],
    }];
    const next: MigrationRegistryEntry = {
      ...valid,
      sequence: 2,
      id: "migration-step-002",
      migrations: nextMigrations,
      filenames: ["0002_valid.sql"],
      checksum: migrationEntryChecksum(nextMigrations),
      dependsOn: ["migration-step-001"],
    };
    assert.doesNotThrow(() => validateMigrationRegistry([valid, next]));
    const cases: readonly MigrationRegistryEntry[][] = [
      [valid, { ...next, id: "migration-step-001" }],
      [valid, { ...next, sequence: 1 }],
      [valid, { ...next, migrations: validMigrations, filenames: valid.filenames, checksum: valid.checksum }],
      [valid, { ...next, dependsOn: [] }],
      [valid, { ...next, dependsOn: ["migration-step-002"] }],
      [valid, { ...next, dependsOn: ["migration-step-999"] }],
      [{ ...valid, dependsOn: ["migration-step-999"] }],
    ];
    for (const registry of cases) assert.throws(() => validateMigrationRegistry(registry));
  });
});
describe("database schema readiness", () => {
  const ledger = DATABASE_MIGRATION_EXPECTATIONS.map((entry) => ({
    filename: entry.identity,
    checksum: entry.acceptsHistoricalChecksumPrefix ? entry.checksum.slice(0, 16) : entry.checksum,
  }));
  const currentState = {
    status: "current",
    plan_hash: DATABASE_MIGRATION_PLAN_HASH,
    ledger_digest: migrationLedgerDigest(ledger),
    runner_id: "00000000-0000-4000-8000-000000000001",
    started_at: new Date("2026-01-01T00:00:00.000Z"),
    finished_at: new Date("2026-01-01T00:00:01.000Z"),
    updated_at: new Date("2026-01-01T00:00:01.000Z"),
    error_code: null,
  };

  it("reports a current schema only when plan and ledger evidence agree", async () => {
    const readiness = await checkMigrationReadiness(mockReadinessClient([currentState], ledger));
    assert.equal(readiness.status, "current");
    assert.doesNotThrow(() => assertMigrationReady(readiness));
  });

  it("distinguishes running, failed, outdated, and uninitialized states", async () => {
    const running = await checkMigrationReadiness(mockReadinessClient([
      { ...currentState, status: "running", ledger_digest: null, finished_at: null },
    ], ledger), { now: new Date("2026-01-01T00:00:02.000Z") });
    const failed = await checkMigrationReadiness(mockReadinessClient([
      { ...currentState, status: "failed", error_code: "migration_failed" },
    ], ledger));
    const outdated = await checkMigrationReadiness(mockReadinessClient([
      { ...currentState, plan_hash: "b".repeat(64) },
    ], ledger));
    const uninitialized = await checkMigrationReadiness(mockReadinessClient([], []));

    assert.equal(running.status, "migration_running");
    assert.equal(failed.status, "migration_failed");
    assert.equal(outdated.status, "outdated");
    assert.equal(uninitialized.status, "uninitialized");
    for (const state of [running, failed, outdated, uninitialized]) {
      assert.throws(() => assertMigrationReady(state), /database_schema_not_ready/);
    }
  });

  it("classifies stale running evidence as a recoverable migration failure", async () => {
    const readiness = await checkMigrationReadiness(mockReadinessClient([
      { ...currentState, status: "running", ledger_digest: null, finished_at: null },
    ], ledger), {
      now: new Date("2026-01-01T00:10:01.000Z"),
      runningStaleAfterMs: 600_000,
    });
    assert.equal(readiness.status, "migration_failed");
    assert.equal(readiness.errorCode, "migration_runner_stale");
  });

  it("detects ledger checksum or membership drift", async () => {
    const modified = ledger.map((row, index) => index === 0 ? { ...row, checksum: "b".repeat(16) } : row);
    const missing = ledger.slice(1);
    assert.equal(
      (await checkMigrationReadiness(mockReadinessClient([currentState], modified))).status,
      "outdated",
    );
    const missingReadiness = await checkMigrationReadiness(
      mockReadinessClient([currentState], missing),
    );
    assert.equal(missingReadiness.status, "outdated");
    assert.match(missingReadiness.errorCode ?? "", /migration_missing:/);
  });

  it("limits legacy checksum compatibility to explicitly governed migrations", async () => {
    const fullOnlyIndex = DATABASE_MIGRATION_EXPECTATIONS.findIndex(
      (entry) => !entry.acceptsHistoricalChecksumPrefix,
    );
    const truncated = ledger.map((row, index) =>
      index === fullOnlyIndex ? { ...row, checksum: row.checksum.slice(0, 16) } : row);
    const rejected = await checkMigrationReadiness(mockReadinessClient([currentState], truncated));
    assert.equal(rejected.status, "outdated");
    assert.match(rejected.errorCode ?? "", /migration_checksum_mismatch/);

    const tenantIndex = DATABASE_MIGRATION_EXPECTATIONS.findIndex(
      (entry) => entry.identity === "0046_tenant_principal_isolation_foundation.sql",
    );
    const historicalTenant = ledger.map((row, index) => index === tenantIndex ? {
      ...row,
      checksum: "0fb4eb3a3bd8deede63dc53edb211ef6bc12d7c329f48e93a918070cbd0167be",
    } : row);
    const historicalState = {
      ...currentState,
      ledger_digest: migrationLedgerDigest(historicalTenant),
    };
    assert.equal(
      (await checkMigrationReadiness(mockReadinessClient([historicalState], historicalTenant))).status,
      "current",
    );
  });

  it("reports bounded identity, sequence, checksum, and unexpected-ledger diagnostics", async () => {
    const runtimeLedger = DATABASE_MIGRATION_EXPECTATIONS.map((entry) => ({
      identity: entry.identity,
      sequence: entry.sequence,
      ordinal: entry.ordinal,
      migration_id: entry.migrationId,
      expected_checksum: entry.checksum,
      owner: entry.owner,
      domain: entry.domain,
    }));
    const sequenceDrift = runtimeLedger.map((row, index) => index === 0 ? { ...row, sequence: 99 } : row);
    const identityDrift = runtimeLedger.map((row, index) => index === 0 ? { ...row, migration_id: "migration-step-999" } : row);
    const checksumDrift = runtimeLedger.map((row, index) => index === 0 ? { ...row, expected_checksum: "b".repeat(64) } : row);

    assert.match(
      (await checkMigrationReadiness(mockReadinessClient([currentState], ledger, sequenceDrift))).errorCode ?? "",
      /migration_sequence_mismatch/,
    );
    assert.match(
      (await checkMigrationReadiness(mockReadinessClient([currentState], ledger, identityDrift))).errorCode ?? "",
      /migration_step_identity_mismatch/,
    );
    assert.match(
      (await checkMigrationReadiness(mockReadinessClient([currentState], ledger, checksumDrift))).errorCode ?? "",
      /migration_expected_checksum_mismatch/,
    );
    const unexpected = [
      ...ledger.slice(0, -1),
      { filename: "9999_unexpected.sql", checksum: "c".repeat(64) },
    ];
    const unexpectedReadiness = await checkMigrationReadiness(
      mockReadinessClient([currentState], unexpected),
    );
    assert.equal(unexpectedReadiness.status, "outdated");
    assert.equal(unexpectedReadiness.errorCode, "migration_unexpected:9999_unexpected.sql");
  });
});
