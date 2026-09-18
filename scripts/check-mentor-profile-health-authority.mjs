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
  /mentorProfileHealthAlertMetadata[\s\S]*pending:[\s\S]*processing:[\s\S]*deadLetters:/,
  "alert metadata must be aggregate operational evidence only",
);
for (const forbidden of ["studentId", "tenantId", "workspaceId", "conversation", "prompt"]) {
  if (health.includes(forbidden)) {
    failures.push(`health: sensitive/high-cardinality alert field forbidden: ${forbidden}`);
  }
}

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

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
if (!scripts["mentor:profiles:health:check"]) {
  failures.push("package: mentor:profiles:health:check is missing");
}
if (!scripts["test:mentor-profile-health"]) {
  failures.push("package: test:mentor-profile-health is missing");
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
