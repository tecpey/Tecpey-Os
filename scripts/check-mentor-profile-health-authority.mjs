import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};
const requirePattern = (label, body, pattern, message) => {
  if (!pattern.test(body)) failures.push(`${label}: ${message}`);
};

const health = await source("src/lib/mentor-profile-health.ts");
for (const needle of [
  "MENTOR_PROFILE_HEALTH_POLICY_VERSION",
  "warningReadyAgeSeconds",
  "criticalReadyAgeSeconds",
  "warningBacklogDepth",
  "criticalBacklogDepth",
  "criticalLeaseOverdueSeconds",
  "mentor_profile_update_dead_letters",
  "unresolved_terminal_failures",
  "unresolved_dead_letters",
  "mentor_profile_dead_letter_resolutions",
  "available_at <= NOW()",
  "lease_expires_at <= NOW()",
  "terminal_projection_failure",
  "dead_letter_present",
  "retryable_failure_present",
]) {
  requireText("health", health, needle, `missing operational health invariant: ${needle}`);
}
requirePattern(
  "health",
  health,
  /mentorProfileHealthAlertMetadata[\s\S]*pending:[\s\S]*processing:[\s\S]*unresolvedDeadLetters:/,
  "alert metadata must be aggregate operational evidence only",
);
for (const forbidden of ["studentId", "tenantId", "workspaceId", "conversation", "prompt"]) {
  if (health.includes(forbidden)) {
    failures.push(`health: sensitive/high-cardinality alert field forbidden: ${forbidden}`);
  }
}

for (const [label, pattern] of [
  ["resolvedDeadLetters", /\bresolvedDeadLetters\b/],
  ["deadLettersTotal", /\bdeadLettersTotal\b/],
  ["resolved_dead_letters", /\bresolved_dead_letters\b/],
  ["dead_letters_total", /\bdead_letters_total\b/],
]) {
  if (pattern.test(health)) {
    failures.push(`health: unbounded historical metric forbidden from hot probe: ${label}`);
  }
}

const resolution = await source("src/lib/mentor-profile-dead-letter-resolution.ts");
for (const needle of [
  "resolveMentorProfileDeadLettersAfterRepairTx",
  "exactDeadLetterIds",
  "deadLetterIds: readonly string[]",
  "dl.id = ANY($2::uuid[])",
  "mentor_profile_resolution_snapshot_mismatch",
  "ON CONFLICT (dead_letter_id) DO NOTHING",
  "recomputed_current_state",
  "clock_timestamp() AS now",
]) {
  requireText("resolution", resolution, needle, `incident resolution invariant missing: ${needle}`);
}

const reconciliation = await source("src/lib/mentor-profile-reconciliation.ts");
for (const needle of [
  "resolveMentorProfileDeadLettersAfterRepair",
  "unresolved_dead_letters",
  "repairRunId",
  "repairStartedAt",
  "resolvedDeadLetters",
  "mentorProfileRepairBoundary",
  "clock_timestamp() AS repair_started_at",
  "MENTOR_PROFILE_DEAD_LETTER_SNAPSHOT_LIMIT",
  "array_agg(id::text ORDER BY created_at, id)",
  "deadLetterIds: boundary.deadLetterIds",
  "needsMentorProfileRepair",
  "OR COALESCE(unresolved.unresolved_dead_letters::integer, 0) > 0",
  "unresolvedDeadLetters: Number.parseInt(row.unresolved_dead_letters, 10)",
]) {
  requireText("reconciliation", reconciliation, needle, `repair integration missing: ${needle}`);
}

requirePattern(
  "reconciliation",
  reconciliation,
  /export function needsMentorProfileRepair\([\s\S]*input\.unresolvedDeadLetters > 0 \|\|[\s\S]*needsMentorProfileRefresh\(input\)/,
  "unresolved dead letters must independently keep a learner in the repair decision",
);
requirePattern(
  "reconciliation",
  reconciliation,
  /needsMentorProfileRepair\(\{[\s\S]*unresolvedDeadLetters: Number\.parseInt\(row\.unresolved_dead_letters, 10\)/,
  "the reconciliation candidate filter must pass unresolved dead-letter evidence into the governed repair decision",
);

const recomputeIndex = reconciliation.indexOf("await applyMentorProfileUpdate");
const resolutionIndex = reconciliation.indexOf(
  "await resolveMentorProfileDeadLettersAfterRepair",
);
if (
  recomputeIndex < 0 ||
  resolutionIndex < 0 ||
  recomputeIndex > resolutionIndex
) {
  failures.push(
    "reconciliation: dead-letter resolution must occur only after successful current-state recompute",
  );
}

const migration = await source("src/lib/db-migrate-mentor-profile-dead-letter-resolution.ts");
for (const needle of [
  "0107_mentor_profile_dead_letter_resolution.sql",
  "mentor_profile_dead_letter_resolutions",
  "dead_letter_id UUID NOT NULL UNIQUE",
  "mentor_profile_dead_letter_resolution_scope_fk",
  "student_fingerprint",
  "mentor_profile_dead_letters_resolution_scope_key",
  "mentor_profile_dead_letter_resolutions is append-only",
]) {
  requireText("migration", migration, needle, `resolution migration invariant missing: ${needle}`);
}

const registry = await source("src/lib/db-migration-registry.ts");
requireText(
  "registry",
  registry,
  "migration-step-091",
  "resolution migration must be in the canonical migration ledger",
);
requireText(
  "registry",
  registry,
  "runMentorProfileDeadLetterResolutionMigrations",
  "resolution migration runner must be governed",
);

const tenantRegistry = await source("docs/security/tenant-scoped-table-registry.json");
requireText(
  "tenant-registry",
  tenantRegistry,
  '"table": "mentor_profile_dead_letter_resolutions"',
  "resolution ledger must be in the tenant-scoped table registry",
);

const worker = await source("scripts/run-mentor-profile-worker.ts");
for (const needle of [
  "loadMentorProfileHealthSnapshot",
  "evaluateMentorProfileHealth",
  "MENTOR_PROFILE_BACKLOG",
  "MENTOR_PROFILE_PROJECTION_STALLED",
  "mentorProfileHealthAlertMetadata",
]) {
  requireText("worker", worker, needle, `worker health integration missing: ${needle}`);
}

const alerts = await source("src/lib/alerts.ts");
requireText(
  "alerts",
  alerts,
  '"MENTOR_PROFILE_BACKLOG"',
  "warning alert type is missing",
);
requireText(
  "alerts",
  alerts,
  '"MENTOR_PROFILE_PROJECTION_STALLED"',
  "critical alert type is missing",
);
requirePattern(
  "alerts",
  alerts,
  /MENTOR_PROFILE_BACKLOG:\s*"warning"/,
  "backlog alert must remain warning severity",
);
requirePattern(
  "alerts",
  alerts,
  /MENTOR_PROFILE_PROJECTION_STALLED:\s*"critical"/,
  "stalled projection alert must remain critical severity",
);

const probe = await source("scripts/check-mentor-profile-health.ts");
for (const needle of [
  "loadMentorProfileHealthSnapshot",
  "evaluateMentorProfileHealth",
  "mentorProfileHealthAlertMetadata",
  'evaluation.status === "healthy" ? 0',
  'evaluation.status === "warning" ? 1',
  "process.exitCode = 3",
]) {
  requireText("probe", probe, needle, `one-shot health probe missing: ${needle}`);
}

const installer = await source("scripts/install-mentor-profile-worker.sh");
for (const needle of [
  "mentor_profile_health_bundle_missing",
  "tecpey-mentor-profile-health.service",
  "tecpey-mentor-profile-health.timer",
  "systemd-analyze verify",
  "systemctl start tecpey-mentor-profile-health.service",
  "systemctl enable --now tecpey-mentor-profile-health.timer",
  "systemctl is-enabled --quiet tecpey-mentor-profile-health.timer",
  "systemctl is-active --quiet tecpey-mentor-profile-health.timer",
]) {
  requireText("installer", installer, needle, `Mentor watchdog installer invariant missing: ${needle}`);
}
for (const forbidden of [
  'RUN_USER="root"',
  "chmod 777",
  "set -x",
  'cat "$ENV_FILE"',
  'source "$ENV_FILE"',
]) {
  if (installer.includes(forbidden)) {
    failures.push(`installer: forbidden unsafe behavior: ${forbidden}`);
  }
}

const healthService = await source("deploy/systemd/tecpey-mentor-profile-health.service.in");
for (const needle of [
  "Type=oneshot",
  "ExecStart=@@NPM_BIN@@ run mentor:profiles:health",
  "SuccessExitStatus=1",
  "TimeoutStartSec=45s",
  "NoNewPrivileges=true",
  "ProtectSystem=strict",
  "CapabilityBoundingSet=",
  "ReadOnlyPaths=@@APP_DIR@@",
]) {
  requireText("health-service", healthService, needle, `health service invariant missing: ${needle}`);
}

const healthTimer = await source("deploy/systemd/tecpey-mentor-profile-health.timer");
for (const needle of [
  "OnBootSec=30s",
  "OnUnitActiveSec=1min",
  "RandomizedDelaySec=5s",
  "FixedRandomDelay=true",
  "AccuracySec=1s",
  "Unit=tecpey-mentor-profile-health.service",
]) {
  requireText("health-timer", healthTimer, needle, `health timer invariant missing: ${needle}`);
}
for (const forbidden of [
  "Persistent=true",
  "OnCalendar=",
  "OnActiveSec=",
]) {
  if (healthTimer.includes(forbidden)) {
    failures.push(`health-timer: unsupported or redundant timer semantics forbidden: ${forbidden}`);
  }
}

const runbook = await source("docs/operations/MENTOR_PROFILE_PROJECTION_RUNBOOK.md");
for (const needle of [
  "independent health probe",
  "tecpey-mentor-profile-health.timer",
  "SuccessExitStatus=1",
  "Watchdog failure drill",
  "independent failure detector",
  "durable incident delivery",
]) {
  requireText("runbook", runbook, needle, `watchdog runbook invariant missing: ${needle}`);
}

const bundleCreator = await source("scripts/create-support-deployment-bundle.sh");
const bundleVerifier = await source("scripts/verify-support-deployment-bundle.mjs");
for (const needle of [
  "deploy/systemd/tecpey-mentor-profile-worker.service.in",
  "deploy/systemd/tecpey-mentor-profile-health.service.in",
  "deploy/systemd/tecpey-mentor-profile-health.timer",
  "scripts/install-mentor-profile-worker.sh",
  "docs/operations/MENTOR_PROFILE_PROJECTION_RUNBOOK.md",
]) {
  requireText("bundle-creator", bundleCreator, needle, `support bundle manifest missing Mentor watchdog asset: ${needle}`);
  requireText("bundle-verifier", bundleVerifier, needle, `support bundle verifier missing Mentor watchdog asset: ${needle}`);
}

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
if (!scripts["mentor:profiles:health:check"]) {
  failures.push("package: mentor:profiles:health:check is missing");
}
if (!scripts["test:mentor-profile-health"]) {
  failures.push("package: test:mentor-profile-health is missing");
}
if (!scripts["mentor:profiles:health"]?.includes("dist/check-mentor-profile-health.cjs")) {
  failures.push("package: production Mentor health probe is missing");
}
if (!scripts["mentor:profiles:health:dev"]?.includes("scripts/check-mentor-profile-health.ts")) {
  failures.push("package: developer Mentor health probe is missing");
}
if (!scripts["build:server"]?.includes("scripts/check-mentor-profile-health.ts")) {
  failures.push("package: Mentor health probe is missing from the production server bundle");
}
if (!scripts["test:mentor-profile-outbox"]?.includes("mentor-profile-health")) {
  failures.push("package: projection test suite must include Mentor health evidence");
}
if (!scripts["mentor:profiles:authority:check"]?.includes("mentor:profiles:health:check")) {
  failures.push("package: profile projection authority must enforce health authority");
}

if (failures.length) {
  console.error("Mentor profile operational health authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Mentor profile operational health authority check passed.");
