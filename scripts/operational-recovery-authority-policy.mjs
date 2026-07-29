const requireText = (failures, source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const reject = (failures, source, pattern, message) => {
  if (pattern.test(source)) failures.push(message);
};

export function evaluateOperationalRecoveryAuthority(source) {
  const failures = [];
  const { workflow, recovery, verifier, runbook, packageJson, containerWorkflow } = source;

  for (const token of [
    "workflow_dispatch:", "pull_request:", "permissions:", "contents: read",
    "cancel-in-progress: false", "timeout-minutes: 25", "git rev-parse HEAD",
    "persist-credentials: false", "TECPEY_RECOVERY_RTO_SECONDS: '300'",
    "TECPEY_RECOVERY_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    "test-container-volume-recovery.sh", "retention-days: 30",
  ]) {
    requireText(failures, workflow, token, `scheduled workflow is missing ${token}`);
  }
  if (!/\n  schedule:\s*\n/.test(workflow)) {
    failures.push("scheduled workflow is missing schedule:");
  }
  reject(
    failures,
    workflow,
    /uses:\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@(?![0-9a-f]{40}\b)/,
    "scheduled workflow contains a mutable action reference",
  );
  reject(failures, workflow, /permissions:\s*\n\s+contents:\s+write/, "workflow must not write contents");
  reject(failures, workflow, /continue-on-error:\s*true/, "recovery failures must fail closed");
  reject(failures, workflow, /\n\s+GITHUB_SHA:/, "reserved GitHub environment variables must not be overridden");

  for (const token of [
    "MIGRATION_IMAGE=", "dist/run-database-migrations.cjs", "SOURCE_PLAN_HASH",
    "RESTORED_PLAN_HASH", "test \"$SOURCE_PLAN_HASH\" = \"$RESTORED_PLAN_HASH\"",
    "recovery:before-backup", "recovery:after-backup",
    "committedBeforeBackupPresent", "committedAfterBackupAbsent",
    "MAX_RECOVERY_SECONDS", "recovery_error=rto_exceeded",
    "backup-digests.sha256", "verify-operational-recovery-evidence.mjs",
    "recovery_error=evidence_dir_must_be_under_artifacts",
    "SOURCE_SHA=\"$(git rev-parse HEAD)\"", "recovery_error=source_sha_mismatch",
  ]) {
    requireText(failures, recovery, token, `recovery script is missing ${token}`);
  }
  if ((recovery.match(/committedAfterBackupAbsent/g) ?? []).length !== 2) {
    failures.push("recovery script must prove committedAfterBackupAbsent for PostgreSQL and Redis");
  }
  reject(failures, recovery, /\brm\s+-rf\b/, "recovery script must not recursively delete evidence paths");
  reject(failures, recovery, /CHANGE_ME|production-password|customer/i, "recovery drill may not embed production material");

  for (const token of [
    "exactKeys", "expectedSha", "postgres_plan_hash_mismatch",
    "evidence_rpo_boundary_invalid", "recoveryDurationMs > maximumRecoverySeconds * 1000",
    "committedAfterBackupAbsent !== true",
  ]) {
    requireText(failures, verifier, token, `evidence verifier is missing ${token}`);
  }

  for (const token of [
    "Automated repository evidence", "Protected staging evidence",
    "Independent operator", "Do not close #110", "Recovery command",
    "Reconciliation query", "Halt condition", "RPO", "RTO",
  ]) {
    requireText(failures, runbook, token, `runbook is missing ${token}`);
  }

  requireText(
    failures,
    packageJson,
    '"ops:recovery:check": "node scripts/check-operational-recovery-authority.mjs"',
    "package scripts must expose the recovery authority check",
  );
  requireText(
    failures,
    packageJson,
    '"test:ops-recovery-authority": "npm run ops:recovery:check && node --test scripts/operational-recovery-authority-policy.test.mjs scripts/operational-recovery-evidence.test.mjs"',
    "package scripts must expose negative authority tests",
  );
  requireText(
    failures,
    containerWorkflow,
    'test-container-volume-recovery.sh "tecpey-candidate:$CANDIDATE_SHA"',
    "container recovery must use the exact candidate migration image",
  );
  return failures;
}
