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
  "resolved_dead_letters",
  "dead_letters_total",
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

const resolution = await source("src/lib/mentor-profile-dead-letter-resolution.ts");
for (const needle of [
  "resolveMentorProfileDeadLettersAfterRepairTx",
  "dl.created_at <= $2::timestamptz",
  "ON CONFLICT (dead_letter_id) DO NOTHING",
  "recomputed_current_state",
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
]) {
  requireText("reconciliation", reconciliation, needle, `repair integration missing: ${needle}`);
}

const migration = await source("src/lib/db-migrate-mentor-profile-dead-letter-resolution.ts");
for (const needle of [
  "0107_mentor_profile_dead_letter_resolution.sql",
  "mentor_profile_dead_letter_resolutions",
  "dead_letter_id UUID NOT NULL UNIQUE",
  "mentor_profile_dead_letter_resolution_scope_fk",
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
