const requireText = (failures, source, text, message) => {
  if (!source.includes(text)) failures.push(message);
};
const reject = (failures, source, pattern, message) => {
  if (pattern.test(source)) failures.push(message);
};
export const RECOVERY_MIGRATION_TRIGGER_PATHS = [
  "migrations/**",
  "scripts/run-database-migrations.ts",
  "scripts/run-production-bootstrap.ts",
  "src/lib/db-migrate*.ts",
  "src/lib/db-migration-*.ts",
];
export const PROTECTED_RECOVERY_TRIGGER_PATHS = [
  "scripts/collect-protected-recovery-reconciliation-evidence.mjs",
  "scripts/protected-recovery-reconciliation-collector-policy.mjs",
  "scripts/protected-recovery-reconciliation-collector-policy.test.mjs",
  ".github/workflows/protected-staging-recovery-reconciliation-evidence.yml",
];

export function evaluateOperationalRecoveryAuthority(source) {
  const failures = [];
  const {
    workflow,
    recovery,
    verifier,
    protectedVerifier,
    protectedCollector,
    protectedCollectorPolicy,
    protectedCollectorTest,
    protectedWorkflow,
    runbook,
    reconciliation,
    packageJson,
    containerWorkflow,
  } = source;

  for (const token of [
    "workflow_dispatch:", "pull_request:", "permissions:", "contents: read",
    "cancel-in-progress: false", "timeout-minutes: 25", "git rev-parse HEAD",
    "persist-credentials: false", "TECPEY_RECOVERY_RTO_SECONDS: '300'",
    "npm ci --ignore-scripts --no-audit --no-fund",
    "TECPEY_RECOVERY_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    "test-container-volume-recovery.sh",
    "verify-protected-recovery-reconciliation-evidence.mjs",
    "protected-recovery-reconciliation-evidence.test.mjs",
    "retention-days: 30",
  ]) {
    requireText(failures, workflow, token, `scheduled workflow is missing ${token}`);
  }

  for (const token of [
    "workflow_dispatch:",
    "release_sha:",
    "reviewer_external_identity:",
    "independent_review_confirmed:",
    "environment: staging",
    "runs-on: [self-hosted, linux, x64, tecpey-staging]",
    "timeout-minutes: 30",
    "cancel-in-progress: false",
    "contents: read",
    "ref: ${{ github.sha }}",
    "persist-credentials: false",
    "git -C authority merge-base --is-ancestor",
    "systemctl show tecpey-staging.service --property=WorkingDirectory --value",
    "protected_staging_runtime_identity_invalid",
    "NODE_EXTRA_CA_CERTS",
    "collect-protected-recovery-reconciliation-evidence.mjs",
    "verify-protected-recovery-reconciliation-evidence.mjs",
    "sha256sum --check SHA256SUMS",
    "retention-days: 30",
  ]) {
    requireText(
      failures,
      protectedWorkflow,
      token,
      `protected staging recovery workflow is missing ${token}`,
    );
  }
  reject(
    failures,
    protectedWorkflow,
    /uses:\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@(?![0-9a-f]{40}\b)/,
    "protected staging recovery workflow contains a mutable action reference",
  );
  reject(
    failures,
    protectedWorkflow,
    /continue-on-error:\s*true/,
    "protected staging recovery workflow must fail closed",
  );
  reject(
    failures,
    protectedWorkflow,
    /(?:DATABASE_URL|REDIS_URL).*\b(?:echo|printf)\b|\b(?:echo|printf)\b.*(?:DATABASE_URL|REDIS_URL)/,
    "protected staging recovery workflow must not print connection material",
  );

  for (const token of [
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "SELECT pg_export_snapshot() AS snapshot",
    "--format=custom",
    "--snapshot=${snapshot}",
    "--exit-on-error",
    "postgres_isolated_restore",
    "startIsolatedPostgres",
    "isolatedPostgresBinaries.createdb",
    "PGHOST: socketDirectory",
    "env: isolatedPostgres.env",
    "--auth-local=trust",
    "--auth-host=reject",
    "listen_addresses = ''",
    "!name.startsWith(\"PG\")",
    "postgres_isolated_shutdown",
    "redis_rdb_backup",
    "startIsolatedRedis",
    "redis_source_restore_mismatch",
    "runtime_migration_plan_hash_mismatch",
    "postgres_restored_plan_hash_mismatch",
    "assertSummariesMatch",
    "tenantInvariantCounts",
    "assertFinancialInvariantCounts",
    "reviewer_must_be_independent",
    "independent_review_not_confirmed",
    "counts-and-hashes-only",
    "no-raw-rows",
    "no-secrets-or-connection-urls",
    "verifyProtectedRecoveryReconciliationEvidence",
    "evidence_directory_symlink_escape",
    "protected_restore_rto_exceeded",
  ]) {
    requireText(
      failures,
      protectedCollector,
      token,
      `protected staging recovery collector is missing ${token}`,
    );
  }
  reject(
    failures,
    protectedCollector,
    /console\.(?:log|error)\([^\n]*(?:databaseUrl|redisUrl|DATABASE_URL|REDIS_URL)/,
    "protected staging recovery collector must not log connection material",
  );
  reject(
    failures,
    protectedCollector,
    /\b(?:DROP\s+DATABASE|FLUSHALL|FLUSHDB)\b/i,
    "protected staging recovery collector must not mutate active authorities",
  );

  for (const token of [
    "DOMAIN_TABLES",
    "academy",
    "tradingArena",
    "mentorAi",
    "exchangeLedger",
    "notificationsOperationalJobs",
    "FINANCIAL_INVARIANT_QUERIES",
    "tableFingerprintQuery",
    "md5(to_jsonb(candidate_row)::text)",
    "assertTenantRegistryCoverage",
    "tenant_registry_runtime_drift",
    "assertFinancialInvariantCounts",
    "financial_invariant_divergence",
    "combinedBackupDigest",
  ]) {
    requireText(
      failures,
      protectedCollectorPolicy,
      token,
      `protected staging recovery collector policy is missing ${token}`,
    );
  }
  for (const token of [
    "rejects identifier injection",
    "source/restore drift",
    "tenant registry drift",
    "requires every financial invariant",
    "both backup payloads",
  ]) {
    requireText(
      failures,
      protectedCollectorTest,
      token,
      `protected staging recovery collector tests are missing ${token}`,
    );
  }
  if (!/\n  schedule:\s*\n/.test(workflow)) {
    failures.push("scheduled workflow is missing schedule:");
  }
  for (const migrationPath of RECOVERY_MIGRATION_TRIGGER_PATHS) {
    requireText(
      failures,
      workflow,
      `- ${migrationPath}`,
      `scheduled workflow does not run for migration input ${migrationPath}`,
    );
  }
  for (const protectedPath of PROTECTED_RECOVERY_TRIGGER_PATHS) {
    requireText(
      failures,
      workflow,
      `- ${protectedPath}`,
      `scheduled workflow does not run for protected recovery authority ${protectedPath}`,
    );
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
    'ARTIFACTS_ROOT="$(realpath -m -- artifacts)"',
    'CANONICAL_EVIDENCE_DIR="$(realpath -m -- "$EVIDENCE_DIR")"',
    'EVIDENCE_DIR="$(realpath -e -- "$CANONICAL_EVIDENCE_DIR")"',
    "SOURCE_SHA=\"$(git rev-parse HEAD)\"", "recovery_error=source_sha_mismatch",
  ]) {
    requireText(failures, recovery, token, `recovery script is missing ${token}`);
  }
  if ((recovery.match(/committedAfterBackupAbsent/g) ?? []).length !== 2) {
    failures.push("recovery script must prove committedAfterBackupAbsent for PostgreSQL and Redis");
  }
  const restoreAuthorityBootstrap = recovery.indexOf(
    'run_migrations "$PREFIX-pg-restored" "$EVIDENCE_DIR/restore-authority-bootstrap.log"',
  );
  const postgresRestore = recovery.indexOf(
    'docker exec "$PREFIX-pg-restored" pg_restore',
  );
  if (
    restoreAuthorityBootstrap === -1
    || postgresRestore === -1
    || restoreAuthorityBootstrap > postgresRestore
  ) {
    failures.push("recovery script must bootstrap cluster-global authorities before PostgreSQL ACL restore");
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
    "tecpey-protected-recovery-reconciliation-v1",
    "protected-staging-domain-recovery-reconciliation",
    "DOMAIN_KEYS",
    "Academy",
    "Trading Arena",
    "Mentor AI",
    "Exchange Ledger",
    "Notifications and operational jobs",
    "Tenant and principal isolation",
    "tenantPrincipalIsolation",
    "forbidRawMaterial",
    "rawRows",
    "databaseUrl",
    "counts-and-hashes-only",
    "no-raw-rows",
    "finalDisposition",
    "reviewer_must_be_independent",
    "verifyProtectedRecoveryReconciliationEvidence",
  ]) {
    requireText(
      failures,
      protectedVerifier,
      token,
      `protected recovery verifier is missing ${token}`,
    );
  }

  for (const token of [
    "Automated repository evidence", "Protected staging evidence",
    "Independent operator", "Do not close #110", "Recovery command",
    "Reconciliation query", "Halt condition", "RPO", "RTO",
  ]) {
    requireText(failures, runbook, token, `runbook is missing ${token}`);
  }

  for (const token of [
    "Recovery reconciliation contract", "issue #110", "protected staging restore",
    "Domain reconciliation matrix", "Academy", "Trading Arena", "Mentor AI",
    "Exchange Ledger", "Notifications and operational jobs",
    "Tenant and principal isolation", "Financial conservation", "localStorage",
    "sessionStorage", "queryDigest", "rowCounts", "sourceSha",
    "migrationPlanHash", "backupBoundary", "operator", "reviewer",
    "disposition", "Do not store raw rows",
    "Deleting a domain row, weakening halt conditions",
  ]) {
    requireText(failures, reconciliation, token, `reconciliation contract is missing ${token}`);
  }
  reject(
    failures,
    reconciliation,
    /production\s+restore\s+is\s+accepted|raw\s+customer\s+data\s+may\s+be\s+stored/i,
    "reconciliation contract must not allow destructive restore or raw customer data",
  );

  requireText(
    failures,
    packageJson,
    '"ops:recovery:check": "node scripts/check-operational-recovery-authority.mjs"',
    "package scripts must expose the recovery authority check",
  );
  requireText(
    failures,
    packageJson,
    '"test:ops-recovery-authority": "npm run ops:recovery:check && node --test scripts/operational-recovery-authority-policy.test.mjs scripts/operational-recovery-evidence.test.mjs scripts/protected-recovery-reconciliation-evidence.test.mjs scripts/protected-recovery-reconciliation-collector-policy.test.mjs && NODE_ENV=test node --import tsx --test src/tests/wallet/rpc-client-failover.test.ts"',
    "package scripts must expose negative authority tests",
  );
  requireText(
    failures,
    packageJson,
    '"ops:recovery:protected-evidence:collect": "node scripts/collect-protected-recovery-reconciliation-evidence.mjs"',
    "package scripts must expose the protected recovery evidence collector",
  );
  requireText(
    failures,
    packageJson,
    '"ops:recovery:protected-evidence:verify": "node scripts/verify-protected-recovery-reconciliation-evidence.mjs"',
    "package scripts must expose the protected recovery evidence verifier",
  );
  requireText(
    failures,
    containerWorkflow,
    'test-container-volume-recovery.sh "tecpey-candidate:$CANDIDATE_SHA"',
    "container recovery must use the exact candidate migration image",
  );
  return failures;
}
