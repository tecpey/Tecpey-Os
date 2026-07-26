import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import {
  DATABASE_MIGRATION_FILENAMES,
  DATABASE_MIGRATION_PLAN_HASH,
  DATABASE_MIGRATION_REGISTRY,
  type MigrationRegistryEntry,
  validateMigrationRegistry,
} from "../../lib/db-migration-registry";
import {
  assertMigrationReady,
  checkMigrationReadiness,
} from "../../lib/db-migration-readiness";
import { migrationLedgerDigest } from "../../lib/db-migration-plan";

const noOp = async () => {};

function mockReadinessClient(
  stateRows: unknown[],
  ledgerRows: Array<{ filename: string; checksum: string }>,
): PoolClient {
  return {
    query: async (sql: string) => {
      if (sql.includes("_migration_runtime_state")) return { rows: stateRows };
      if (sql.includes("_migrations")) return { rows: ledgerRows };
      throw new Error(`unexpected_query:${sql}`);
    },
  } as unknown as PoolClient;
}

describe("canonical database migration registry", () => {
  it("has a deterministic contiguous order, unique identities, and unique filenames", () => {
    assert.doesNotThrow(() => validateMigrationRegistry());
    assert.equal(DATABASE_MIGRATION_PLAN_HASH.length, 64);
    assert.equal(new Set(DATABASE_MIGRATION_FILENAMES).size, DATABASE_MIGRATION_FILENAMES.length);
    assert.deepEqual(
      DATABASE_MIGRATION_REGISTRY.map((migration) => migration.sequence),
      Array.from({ length: DATABASE_MIGRATION_REGISTRY.length }, (_, index) => index + 1),
    );
  });

  it("rejects duplicate identities, sequences, filenames, and unresolved dependencies", () => {
    const valid: MigrationRegistryEntry = {
      sequence: 1,
      id: "migration-step-001",
      filenames: ["0001_valid.sql"],
      dependsOn: [],
      run: noOp,
    };
    const cases: readonly MigrationRegistryEntry[][] = [
      [valid, { ...valid, sequence: 2 }],
      [valid, { ...valid, id: "migration-step-002" }],
      [valid, { ...valid, sequence: 2, id: "migration-step-002" }],
      [{ ...valid, dependsOn: ["migration-step-999"] }],
    ];
    for (const registry of cases) assert.throws(() => validateMigrationRegistry(registry));
  });
});
describe("database schema readiness", () => {
  const ledger = DATABASE_MIGRATION_FILENAMES.map((filename) => ({
    filename,
    checksum: "a".repeat(16),
  }));
  const currentState = {
    status: "current",
    plan_hash: DATABASE_MIGRATION_PLAN_HASH,
    ledger_digest: migrationLedgerDigest(ledger),
    runner_id: "00000000-0000-4000-8000-000000000001",
    started_at: new Date("2026-01-01T00:00:00.000Z"),
    finished_at: new Date("2026-01-01T00:00:01.000Z"),
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
    ], ledger));
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

  it("detects ledger checksum or membership drift", async () => {
    const modified = ledger.map((row, index) => index === 0 ? { ...row, checksum: "b".repeat(16) } : row);
    const missing = ledger.slice(1);
    assert.equal(
      (await checkMigrationReadiness(mockReadinessClient([currentState], modified))).status,
      "outdated",
    );
    assert.equal(
      (await checkMigrationReadiness(mockReadinessClient([currentState], missing))).status,
      "outdated",
    );
  });
});
