import assert from "node:assert/strict";
import test from "node:test";
import { verifyOperationalRecoveryEvidence } from "./verify-operational-recovery-evidence.mjs";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);
const migration = {
  status: "ok",
  migrationsBefore: 0,
  migrationsAfter: 52,
  schema: "current",
  planHash: HASH,
};
const valid = {
  schemaVersion: 1,
  authority: "tecpey-operational-recovery-drill-v1",
  environment: "ephemeral-ci",
  sourceSha: SHA,
  imageId: `sha256:${"c".repeat(64)}`,
  startedAt: "2026-07-29T10:00:00Z",
  completedAt: "2026-07-29T10:01:00Z",
  objectives: {
    maximumRecoverySeconds: 300,
    backupDurationMs: 10_000,
    recoveryDurationMs: 40_000,
    totalDurationMs: 60_000,
    rpoBoundary: "all-probe-writes-committed-before-backup-are-present-and-later-writes-are-absent",
  },
  postgres: {
    sourceMigration: migration,
    restoredMigration: { ...migration, migrationsBefore: 52 },
    committedBeforeBackupPresent: true,
    committedAfterBackupAbsent: true,
    backupSha256: "d".repeat(64),
  },
  redis: {
    committedBeforeBackupPresent: true,
    committedAfterBackupAbsent: true,
    backupSha256: "e".repeat(64),
  },
};

test("accepts bounded exact-head RPO/RTO evidence", () => {
  assert.equal(verifyOperationalRecoveryEvidence(structuredClone(valid), SHA).sourceSha, SHA);
});

test("rejects schema drift after restore", () => {
  const evidence = structuredClone(valid);
  evidence.postgres.restoredMigration.planHash = "f".repeat(64);
  assert.throws(
    () => verifyOperationalRecoveryEvidence(evidence, SHA),
    /postgres_plan_hash_mismatch/,
  );
});

test("rejects a restored late write and an exceeded RTO", () => {
  const lateWrite = structuredClone(valid);
  lateWrite.redis.committedAfterBackupAbsent = false;
  assert.throws(
    () => verifyOperationalRecoveryEvidence(lateWrite, SHA),
    /redis_restore_evidence_invalid/,
  );

  const slow = structuredClone(valid);
  slow.objectives.recoveryDurationMs = 300_001;
  assert.throws(
    () => verifyOperationalRecoveryEvidence(slow, SHA),
    /evidence_objective_invalid/,
  );
});

test("rejects stale-head evidence and ungoverned fields", () => {
  assert.throws(
    () => verifyOperationalRecoveryEvidence(structuredClone(valid), "f".repeat(40)),
    /evidence_source_sha_invalid/,
  );
  const extra = structuredClone(valid);
  extra.operatorToken = "forbidden";
  assert.throws(
    () => verifyOperationalRecoveryEvidence(extra, SHA),
    /evidence_keys_invalid/,
  );
});
