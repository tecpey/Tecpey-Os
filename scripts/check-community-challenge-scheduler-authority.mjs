import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const paths = {
  inventory: "docs/security/social-arena-evidence-inventory.json",
  migration: "src/lib/db-migrate-operational-job-evidence.ts",
  migrationPlan: "src/lib/db-migration-plan.ts",
  evidence: "src/lib/ops/operational-job-evidence.ts",
  spool: "src/lib/ops/operational-alert-spool.ts",
  orchestrator: "src/lib/ops/community-challenge-finalization-job.ts",
  runner: "scripts/run-community-challenge-finalization-scheduled.ts",
  delivery: "scripts/deliver-operational-alerts.ts",
  envCheck: "scripts/check-community-challenge-scheduler-env.ts",
  installer: "scripts/install-community-challenge-scheduler.sh",
  finalizerService: "deploy/systemd/tecpey-community-challenge-finalizer.service.in",
  finalizerTimer: "deploy/systemd/tecpey-community-challenge-finalizer.timer",
  alertService: "deploy/systemd/tecpey-ops-alert-delivery.service.in",
  alertTimer: "deploy/systemd/tecpey-ops-alert-delivery.timer",
  runbook: "docs/operations/COMMUNITY_CHALLENGE_SCHEDULER_RUNBOOK.md",
  package: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const normalized = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, value.replace(/\s+/g, " ")]),
);
const inventory = JSON.parse(source.inventory);
const failures = [];

function requireText(target, token, reason) {
  if (!normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${paths[target]}: ${reason}`);
  }
}

function rejectText(target, token, reason) {
  if (normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${paths[target]}: ${reason}`);
  }
}

function requireInventory(collection, authorityPath, reason) {
  if (!inventory[collection]?.some((entry) => entry.path === authorityPath)) {
    failures.push(`${paths.inventory}: ${reason}: ${authorityPath}`);
  }
}

if (
  inventory.schemaVersion !== 1 ||
  inventory.issue !== 168 ||
  inventory.followUpIssue !== 221 ||
  inventory.operationalFollowUpIssue !== 223
) {
  failures.push(`${paths.inventory}: Product and operational follow-up linkage is invalid`);
}
if (
  typeof inventory.policy?.operationalFinalization !== "string" ||
  !inventory.policy.operationalFinalization.includes("repository merge alone is not proof")
) {
  failures.push(`${paths.inventory}: operational activation boundary is missing`);
}
for (const authorityPath of [
  "src/lib/db-migrate-operational-job-evidence.ts",
  "src/lib/ops/operational-job-evidence.ts",
  "src/lib/ops/community-challenge-finalization-job.ts",
  "src/lib/ops/operational-alert-spool.ts",
  "scripts/run-community-challenge-finalization-scheduled.ts",
  "scripts/deliver-operational-alerts.ts",
  "scripts/install-community-challenge-scheduler.sh",
]) {
  requireInventory("canonicalAuthorities", authorityPath, "missing operational authority");
}
for (const protectedPath of [
  "src/lib/ops/operational-job-evidence.ts",
  "src/lib/ops/community-challenge-finalization-job.ts",
  "src/lib/ops/operational-alert-spool.ts",
]) {
  if (!inventory.protectedAuthoritySurfaces?.includes(protectedPath)) {
    failures.push(`${paths.inventory}: missing protected operational surface ${protectedPath}`);
  }
}

for (const invariant of [
  'FILENAME = "0050_operational_job_evidence.sql"',
  "platform_operational_job_runs",
  "platform_operational_alerts",
  "platform_operational_alert_delivery_attempts",
  "operational evidence is append-only",
  "result_status IN ('succeeded', 'partial_failure', 'authority_unavailable')",
  "delivery_result IN ('delivered', 'retryable_failure', 'terminal_failure')",
]) {
  requireText("migration", invariant, `operational migration is missing ${invariant}`);
}
requireText(
  "migrationPlan",
  "runOperationalJobEvidenceMigrations",
  "canonical migration plan must execute migration 0050",
);

for (const invariant of [
  'import "server-only"',
  "hashOperationalEvidence",
  "validateOperationalJobRunEvidence",
  "validateOperationalAlertEvidence",
  "persistOperationalJobRunTx",
  "persistOperationalAlertTx",
  "persistOperationalAlertDeliveryAttemptTx",
  "operational_run_identity_conflict",
  "operational_alert_identity_conflict",
  "operational_attempt_identity_conflict",
]) {
  requireText("evidence", invariant, `operational evidence authority is missing ${invariant}`);
}
for (const forbidden of [
  "DATABASE_URL",
  "TECPEY_OPS_ALERT_BEARER_TOKEN",
  "studentId",
  "tenantId",
  "principalId",
  "rawError",
  "errorStack",
  "localStorage",
  "sessionStorage",
]) {
  rejectText("evidence", forbidden, `operational evidence must not include ${forbidden}`);
}

for (const invariant of [
  'import "server-only"',
  "MAX_FILE_BYTES = 64 * 1024",
  "mode: 0o700",
  'open(temporary, "wx", 0o600)',
  "await handle.sync()",
  "await rename(temporary, filePath)",
  "isSymbolicLink()",
  'parsed.protocol !== "https:"',
  '"Idempotency-Key": item.alert.alertId',
  'Authorization: `Bearer ${bearerToken}`',
  "response.status === 408",
  "response.status === 429",
  "response.status >= 500",
  "retryDelayMs",
  "findExistingAlertFile",
  "managed.pending, managed.delivered, managed.quarantine",
  "operational_spool_destination_conflict",
  "managed.quarantine",
  "managed.delivered",
]) {
  requireText("spool", invariant, `alert spool is missing ${invariant}`);
}
for (const forbidden of [
  "response.text(",
  "response.json(",
  "console.log(item",
  "console.error(item",
  "localStorage",
  "sessionStorage",
]) {
  rejectText("spool", forbidden, `alert spool contains forbidden behavior ${forbidden}`);
}

for (const invariant of [
  "finalizeEndedOfficialJournalChallenges",
  "maxBatches",
  "drainLimitReached",
  "database_authority_unavailable",
  "database_authority_unavailable_after_progress",
  "operational_evidence_unavailable",
  "persistOperationalJobRunTx",
  "writeOperationalLastRun",
  "enqueueOperationalAlert",
  "exitCode: 0 | 1 | 2",
]) {
  requireText("orchestrator", invariant, `scheduler orchestrator is missing ${invariant}`);
}
for (const forbidden of [
  "studentId",
  "tenantId",
  "principalId",
  "localStorage",
  "sessionStorage",
]) {
  rejectText("orchestrator", forbidden, `scheduler orchestrator contains forbidden identity ${forbidden}`);
}

for (const invariant of [
  "TECPEY_OPS_STATE_DIR",
  "COMMUNITY_CHALLENGE_FINALIZATION_BATCH",
  "COMMUNITY_CHALLENGE_FINALIZATION_MAX_BATCHES",
  "process.exitCode = result.exitCode",
]) {
  requireText("runner", invariant, `scheduled runner is missing ${invariant}`);
}
for (const invariant of [
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "TECPEY_OPS_ALERT_BEARER_TOKEN",
  "TECPEY_OPS_ALERT_TIMEOUT_MS",
  "deliverOperationalAlerts",
  "summary.retryable > 0 || summary.quarantined > 0",
]) {
  requireText("delivery", invariant, `alert delivery runner is missing ${invariant}`);
}
for (const invariant of [
  'parsed.protocol !== "https:"',
  "DATABASE_URL",
  "TECPEY_OPS_STATE_DIR",
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "COMMUNITY_CHALLENGE_FINALIZATION_MAX_BATCHES",
]) {
  requireText("envCheck", invariant, `scheduler environment gate is missing ${invariant}`);
}
for (const target of ["runner", "delivery", "envCheck"]) {
  for (const forbidden of [
    "console.log(process.env",
    "console.error(process.env",
    "DATABASE_URL:",
    "TECPEY_OPS_ALERT_BEARER_TOKEN:",
  ]) {
    rejectText(target, forbidden, `${paths[target]} may expose secret material: ${forbidden}`);
  }
}

for (const invariant of [
  "set -Eeuo pipefail",
  '[[ "$RUN_USER" != "root" ]]',
  "environment_file_world_access_forbidden",
  "environment_file_unsafe",
  "state_directory_symlink_forbidden",
  "systemd-analyze verify",
  "TECPEY_DRY_RUN",
  "systemctl enable --now tecpey-community-challenge-finalizer.timer",
  "systemctl enable --now tecpey-ops-alert-delivery.timer",
  "ops_alert_https_webhook_missing",
]) {
  requireText("installer", invariant, `installer is missing ${invariant}`);
}
for (const forbidden of [
  "cat \"$ENV_FILE\"",
  "source \"$ENV_FILE\"",
  "eval ",
  "chmod 777",
  "RUN_USER=\"root\"",
]) {
  rejectText("installer", forbidden, `installer contains forbidden behavior ${forbidden}`);
}

for (const target of ["finalizerService", "alertService"]) {
  for (const invariant of [
    "Type=oneshot",
    "EnvironmentFile=@@ENV_FILE@@",
    "Environment=NODE_ENV=production",
    "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
    "ExecStartPre=@@NPM_BIN@@ run ops:scheduler:env-check",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "PrivateDevices=true",
    "ProtectSystem=strict",
    "ProtectHome=read-only",
    "ProtectKernelTunables=true",
    "ProtectKernelModules=true",
    "ProtectControlGroups=true",
    "RestrictSUIDSGID=true",
    "LockPersonality=true",
    "CapabilityBoundingSet=",
    "ReadOnlyPaths=@@APP_DIR@@",
    "ReadWritePaths=@@STATE_DIR@@",
  ]) {
    requireText(target, invariant, `${paths[target]} is missing ${invariant}`);
  }
  rejectText(target, "User=root", `${paths[target]} must not run as root`);
  const environmentFileIndex = source[target].indexOf("EnvironmentFile=@@ENV_FILE@@");
  const fixedStateIndex = source[target].indexOf("Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@");
  if (environmentFileIndex < 0 || fixedStateIndex < 0 || environmentFileIndex > fixedStateIndex) {
    failures.push(`${paths[target]}: fixed state directory must override EnvironmentFile`);
  }
}
requireText(
  "finalizerService",
  "OnFailure=tecpey-ops-alert-delivery.service",
  "finalizer failure must trigger alert delivery",
);
for (const invariant of [
  "OnCalendar=*-*-* *:05:00 UTC",
  "Persistent=true",
  "RandomizedDelaySec=60",
  "Unit=tecpey-community-challenge-finalizer.service",
]) {
  requireText("finalizerTimer", invariant, `finalizer timer is missing ${invariant}`);
}
for (const invariant of [
  "OnBootSec=2min",
  "OnUnitActiveSec=5min",
  "Unit=tecpey-ops-alert-delivery.service",
]) {
  requireText("alertTimer", invariant, `alert timer is missing ${invariant}`);
}

for (const command of [
  '"community:challenge:finalize:scheduled"',
  '"ops:alerts:deliver"',
  '"ops:scheduler:env-check"',
  '"ops:scheduler:install"',
  '"ops:scheduler:check"',
  '"test:ops-scheduler"',
]) {
  requireText("package", command, `package command missing ${command}`);
}
for (const testFile of [
  "community-challenge-scheduler.integration.ts",
  "operational-alert-spool.integration.ts",
  "operational-job-evidence-postgres.integration.ts",
  "community-challenge-scheduler-installer.test.ts",
]) {
  requireText("package", testFile, `permanent scheduler test missing ${testFile}`);
}

for (const invariant of [
  "systemctl list-timers",
  "journalctl -u tecpey-community-challenge-finalizer.service",
  "community-challenge-finalization-last-run.json",
  "authority_unavailable",
  "partial_failure",
  "Rollback",
]) {
  requireText("runbook", invariant, `operations runbook is missing ${invariant}`);
}

try {
  execFileSync("bash", ["-n", paths.installer], { stdio: "pipe" });
} catch {
  failures.push(`${paths.installer}: bash syntax validation failed`);
}

if (failures.length > 0) {
  console.error("Community challenge scheduler authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Community challenge scheduler authority passed: hourly persistent finalization, immutable PostgreSQL evidence, outage-safe atomic alert spool, lifecycle-wide deduplication, HTTPS delivery, hardened systemd units and guarded installation remain enforced.",
);
