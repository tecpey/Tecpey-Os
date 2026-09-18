import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};

const freshness = await source("src/lib/mentor-profile-freshness.ts");
for (const needle of [
  "MENTOR_PROFILE_FRESHNESS_CALIBRATION_VERSION",
  "processed_at - created_at",
  "o.created_at <=",
  "processed_at IS NULL",
  "missedTargetCount",
  "withinTargetRatio",
  "percentile_cont(0.50)",
  "percentile_cont(0.95)",
  '"insufficient_data"',
  '"invalid_evidence"',
]) {
  requireText("freshness", freshness, needle, `calibration invariant missing: ${needle}`);
}
for (const forbidden of [
  "student_id",
  "tenant_id",
  "workspace_id",
  "conversation",
  "prompt",
]) {
  if (freshness.includes(forbidden)) {
    failures.push(`freshness: high-cardinality/PII field forbidden: ${forbidden}`);
  }
}

const migration = await source(
  "src/lib/db-migrate-mentor-profile-freshness-observability.ts",
);
for (const needle of [
  "0108_mentor_profile_freshness_observability.sql",
  "mentor_profile_update_outbox_freshness_window_idx",
  "created_at DESC",
  "INCLUDE (processed_at)",
]) {
  requireText("migration", migration, needle, `observability index invariant missing: ${needle}`);
}
if (migration.includes("WHERE status = 'processed'")) {
  failures.push(
    "migration: freshness index must cover the matured-event denominator, not only successful rows",
  );
}

const registry = await source("src/lib/db-migration-registry.ts");
for (const needle of [
  "migration-step-092",
  "runMentorProfileFreshnessObservabilityMigrations",
]) {
  requireText("registry", registry, needle, `canonical migration wiring missing: ${needle}`);
}

const postgresTest = await source(
  "src/tests/security/mentor-profile-freshness-postgres.test.ts",
);
for (const needle of [
  "matured pending sample",
  "snapshot.missedTargetCount",
  "snapshot.withinTargetCount + snapshot.missedTargetCount",
]) {
  requireText("postgres-test", postgresTest, needle, `anti-survivorship proof missing: ${needle}`);
}

const runner = await source(
  "scripts/collect-mentor-profile-freshness-calibration.ts",
);
for (const needle of [
  "MENTOR_PROFILE_FRESHNESS_LOOKBACK_SECONDS",
  "MENTOR_PROFILE_FRESHNESS_TARGET_SECONDS",
  "MENTOR_PROFILE_FRESHNESS_MIN_SAMPLES",
  "loadMentorProfileFreshnessSnapshot",
  "evaluateMentorProfileFreshnessCalibration",
]) {
  requireText("runner", runner, needle, `calibration runner invariant missing: ${needle}`);
}

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
for (const [name, needle] of [
  ["build:server", "scripts/collect-mentor-profile-freshness-calibration.ts"],
  ["mentor:profiles:freshness", "dist/collect-mentor-profile-freshness-calibration.cjs"],
  ["mentor:profiles:freshness:dev", "scripts/collect-mentor-profile-freshness-calibration.ts"],
  ["test:mentor-profile-freshness", "mentor-profile-freshness"],
]) {
  if (typeof scripts[name] !== "string" || !scripts[name].includes(needle)) {
    failures.push(`package: missing ${name} -> ${needle}`);
  }
}
if (!scripts["mentor:profiles:authority:check"]?.includes("mentor:profiles:freshness:check")) {
  failures.push("package: projection authority must compose freshness calibration authority");
}

const runbook = await source("docs/operations/MENTOR_PROFILE_PROJECTION_RUNBOOK.md");
for (const needle of [
  "Freshness calibration evidence",
  "mentor:profiles:freshness",
  "p50",
  "p95",
  "not an SLO",
  "multi-window",
]) {
  requireText("runbook", runbook, needle, `freshness runbook invariant missing: ${needle}`);
}

if (failures.length) {
  console.error("Mentor profile freshness calibration authority failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Mentor profile freshness calibration authority passed.");
