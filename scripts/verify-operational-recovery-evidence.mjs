import { readFile } from "node:fs/promises";

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}_must_be_object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${path}_keys_invalid`);
  }
}

function migration(value, path) {
  exactKeys(value, ["status", "migrationsBefore", "migrationsAfter", "schema", "planHash"], path);
  if (value.status !== "ok" || value.schema !== "current" || !SHA256.test(value.planHash)) {
    throw new Error(`${path}_not_current`);
  }
  if (!Number.isInteger(value.migrationsBefore) || !Number.isInteger(value.migrationsAfter)) {
    throw new Error(`${path}_migration_count_invalid`);
  }
  if (value.migrationsBefore < 0 || value.migrationsAfter <= 0) {
    throw new Error(`${path}_migration_count_invalid`);
  }
}

export function verifyOperationalRecoveryEvidence(value, expectedSha) {
  exactKeys(value, [
    "schemaVersion", "authority", "environment", "sourceSha", "imageId",
    "startedAt", "completedAt", "objectives", "postgres", "redis",
  ], "evidence");
  if (
    value.schemaVersion !== 1
    || value.authority !== "tecpey-operational-recovery-drill-v1"
    || value.environment !== "ephemeral-ci"
  ) {
    throw new Error("evidence_identity_invalid");
  }
  if (!COMMIT_SHA.test(value.sourceSha) || value.sourceSha !== expectedSha) {
    throw new Error("evidence_source_sha_invalid");
  }
  if (!IMAGE_ID.test(value.imageId)) throw new Error("evidence_image_id_invalid");
  if (!Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.completedAt))) {
    throw new Error("evidence_timestamp_invalid");
  }
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    throw new Error("evidence_timestamp_order_invalid");
  }

  exactKeys(value.objectives, [
    "maximumRecoverySeconds", "backupDurationMs", "recoveryDurationMs",
    "totalDurationMs", "rpoBoundary",
  ], "objectives");
  const {
    maximumRecoverySeconds, backupDurationMs, recoveryDurationMs, totalDurationMs,
  } = value.objectives;
  if (
    !Number.isInteger(maximumRecoverySeconds)
    || maximumRecoverySeconds <= 0
    || maximumRecoverySeconds > 900
    || !Number.isInteger(backupDurationMs)
    || backupDurationMs < 0
    || !Number.isInteger(recoveryDurationMs)
    || recoveryDurationMs < 0
    || recoveryDurationMs > maximumRecoverySeconds * 1000
    || !Number.isInteger(totalDurationMs)
    || totalDurationMs < recoveryDurationMs
  ) {
    throw new Error("evidence_objective_invalid");
  }
  if (
    value.objectives.rpoBoundary
    !== "all-probe-writes-committed-before-backup-are-present-and-later-writes-are-absent"
  ) {
    throw new Error("evidence_rpo_boundary_invalid");
  }

  exactKeys(value.postgres, [
    "sourceMigration", "restoredMigration", "committedBeforeBackupPresent",
    "committedAfterBackupAbsent", "backupSha256",
  ], "postgres");
  migration(value.postgres.sourceMigration, "postgres_source_migration");
  migration(value.postgres.restoredMigration, "postgres_restored_migration");
  if (value.postgres.sourceMigration.planHash !== value.postgres.restoredMigration.planHash) {
    throw new Error("postgres_plan_hash_mismatch");
  }
  if (
    value.postgres.committedBeforeBackupPresent !== true
    || value.postgres.committedAfterBackupAbsent !== true
    || !SHA256.test(value.postgres.backupSha256)
  ) {
    throw new Error("postgres_restore_evidence_invalid");
  }

  exactKeys(value.redis, [
    "committedBeforeBackupPresent", "committedAfterBackupAbsent", "backupSha256",
  ], "redis");
  if (
    value.redis.committedBeforeBackupPresent !== true
    || value.redis.committedAfterBackupAbsent !== true
    || !SHA256.test(value.redis.backupSha256)
  ) {
    throw new Error("redis_restore_evidence_invalid");
  }
  return value;
}

async function main() {
  const [file, flag, expectedSha] = process.argv.slice(2);
  if (!file || flag !== "--expected-sha" || !COMMIT_SHA.test(expectedSha ?? "")) {
    throw new Error("usage: verify-operational-recovery-evidence.mjs <file> --expected-sha <sha>");
  }
  const value = JSON.parse(await readFile(file, "utf8"));
  verifyOperationalRecoveryEvidence(value, expectedSha);
  process.stdout.write(`Operational recovery evidence verified for ${expectedSha}.\n`);
}

if (process.argv[1]?.endsWith("verify-operational-recovery-evidence.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
