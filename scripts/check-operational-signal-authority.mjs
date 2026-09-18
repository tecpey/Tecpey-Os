import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};
const requirePattern = (label, body, pattern, message) => {
  if (!pattern.test(body)) failures.push(`${label}: ${message}`);
};

const migration = await source("src/lib/db-migrate-operational-signal-envelope.ts");
for (const needle of [
  "0109_operational_signal_envelope.sql",
  "platform_operational_signals",
  "platform_operational_signal_delivery_attempts",
  "incident_key CHAR(64)",
  "dedupe_window_start",
  "dedupe_window_seconds",
  "platform_operational_signals_immutable",
  "platform_operational_signal_delivery_attempts_immutable",
  "tecpey_reject_operational_evidence_mutation",
]) {
  requireText("migration", migration, needle, `missing signal migration invariant: ${needle}`);
}

const evidence = await source("src/lib/ops/operational-signal-evidence.ts");
for (const needle of [
  "tecpey-operational-signal-incident-v1",
  "tecpey-operational-signal-dedupe-v1",
  "sourceUnit: input.sourceUnit",
  "reasonCodes",
  "measurements",
  "operational_signal_measurement_value_invalid",
  "persistOperationalSignalTx",
  "persistOperationalSignalDeliveryAttemptTx",
]) {
  requireText("evidence", evidence, needle, `signal evidence invariant missing: ${needle}`);
}
requireText(
  "evidence",
  evidence,
  'export type OperationalSignalMeasurement = number | boolean | null;',
  "signal measurements must remain numeric/boolean/null only",
);
if (/OperationalSignalMeasurement\s*=\s*[^;]*\bstring\b/.test(evidence)) {
  failures.push("evidence: free-text measurement values are forbidden");
}

const spool = await source("src/lib/ops/operational-signal-spool.ts");
for (const needle of [
  '"signals", "pending"',
  '"signals", "delivered"',
  '"signals", "quarantine"',
  "operationalSignalRetryDelayMs",
  "tecpey-operational-signal-retry-v1",
  '"Idempotency-Key": item.signal.signalId',
  "operational_signal_webhook_https_required",
  "bestEffortPersistSignal",
  "bestEffortPersistAttempt",
]) {
  requireText("spool", spool, needle, `signal spool invariant missing: ${needle}`);
}
requirePattern(
  "spool",
  spool,
  /response\.status === 408[\s\S]*response\.status === 425[\s\S]*response\.status === 429[\s\S]*response\.status >= 500/,
  "transient HTTP classes must remain retryable",
);
requirePattern(
  "spool",
  spool,
  /deliveryResult === "terminal_failure"[\s\S]*moveFile\(filePath, managed\.quarantine\)/,
  "terminal delivery failures must quarantine",
);

const health = await source("scripts/check-mentor-profile-health.ts");
for (const needle of [
  "enqueueOperationalSignal",
  "createOperationalSignalEvidence",
  "mentor_profile_database_unavailable",
  'evaluation.status === "critical"',
  "TECPEY_OPS_STATE_DIR",
  "MENTOR_PROFILE_CRITICAL_SIGNAL_WINDOW_SECONDS",
]) {
  requireText("health", health, needle, `health-to-signal wiring missing: ${needle}`);
}
if (
  /if\s*\(evaluation\.status === "warning"\)\s*\{[\s\S]*?enqueueCriticalSignal/.test(
    health,
  )
) {
  failures.push("health: explicit warning branch must not enter the durable critical signal rail");
}

const delivery = await source("scripts/deliver-operational-alerts.ts");
for (const needle of [
  "deliverOperationalAlerts",
  "deliverOperationalSignals",
  "alerts.retryable",
  "signals.retryable",
]) {
  requireText("delivery", delivery, needle, `shared delivery drain missing: ${needle}`);
}

const deliveryEnv = await source("scripts/check-operational-delivery-env.ts");
for (const needle of [
  "TECPEY_OPS_STATE_DIR",
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "TECPEY_OPS_ALERT_BATCH_SIZE",
  "TECPEY_OPS_ALERT_TIMEOUT_MS",
  "TECPEY_OPS_ALERT_MAX_ATTEMPTS",
]) {
  requireText("delivery-env", deliveryEnv, needle, `delivery preflight missing: ${needle}`);
}
for (const forbidden of [
  "DATABASE_URL",
  "COMMUNITY_CHALLENGE_FINALIZATION_BATCH",
  "COMMUNITY_CHALLENGE_FINALIZATION_MAX_BATCHES",
]) {
  if (deliveryEnv.includes(forbidden)) {
    failures.push(`delivery-env: outage rail must not depend on ${forbidden}`);
  }
}

const healthService = await source(
  "deploy/systemd/tecpey-mentor-profile-health.service.in",
);
for (const needle of [
  "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
  "ReadWritePaths=@@STATE_DIR@@",
  "ProtectSystem=strict",
  "NoNewPrivileges=true",
]) {
  requireText("health-service", healthService, needle, `health service hardening missing: ${needle}`);
}

const deliveryService = await source(
  "deploy/systemd/tecpey-ops-alert-delivery.service.in",
);
for (const needle of [
  "ops:delivery:env-check",
  "ops:alerts:deliver:prod",
  "ReadWritePaths=@@STATE_DIR@@",
  "ProtectSystem=strict",
]) {
  requireText("delivery-service", deliveryService, needle, `delivery service invariant missing: ${needle}`);
}

const deliveryTimer = await source(
  "deploy/systemd/tecpey-ops-alert-delivery.timer",
);
for (const needle of [
  "OnBootSec=30s",
  "OnUnitActiveSec=1min",
  "RandomizedDelaySec=5s",
  "FixedRandomDelay=true",
  "AccuracySec=1s",
]) {
  requireText("delivery-timer", deliveryTimer, needle, `delivery timer invariant missing: ${needle}`);
}
if (deliveryTimer.includes("Persistent=true") || deliveryTimer.includes("OnCalendar=")) {
  failures.push("delivery-timer: monotonic delivery timer must not claim calendar persistence");
}

const installer = await source("scripts/install-mentor-profile-worker.sh");
for (const needle of [
  "TECPEY_OPS_STATE_DIR:-/var/lib/tecpey/ops",
  "dist/deliver-operational-alerts.cjs",
  "dist/check-operational-delivery-env.cjs",
  "tecpey-ops-alert-delivery.service",
  "tecpey-ops-alert-delivery.timer",
  "install -d -m 0700 -o",
  "durable_signal_delivery=verified",
]) {
  requireText("installer", installer, needle, `Mentor installer operational rail missing: ${needle}`);
}

const registry = await source("src/lib/db-migration-registry.ts");
for (const needle of [
  "migration-step-093",
  "0109_operational_signal_envelope.sql",
  "runOperationalSignalEnvelopeMigrations",
]) {
  requireText("registry", registry, needle, `canonical migration wiring missing: ${needle}`);
}

const recovery = await source(
  "scripts/protected-recovery-reconciliation-collector-policy.mjs",
);
for (const table of [
  "platform_operational_signals",
  "platform_operational_signal_delivery_attempts",
]) {
  requireText("recovery", recovery, table, `protected recovery inventory missing ${table}`);
}

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
for (const [name, needle] of [
  ["build:server", "scripts/deliver-operational-alerts.ts"],
  ["build:server", "scripts/check-operational-delivery-env.ts"],
  ["ops:alerts:deliver:prod", "dist/deliver-operational-alerts.cjs"],
  ["ops:delivery:env-check", "dist/check-operational-delivery-env.cjs"],
  ["test:ops-signals", "operational-signal"],
  ["test:ops-signals", "mentor-profile-operational-installer.test.ts"],
]) {
  if (typeof scripts[name] !== "string" || !scripts[name].includes(needle)) {
    failures.push(`package: missing ${name} -> ${needle}`);
  }
}
if (!scripts["ops:scheduler:check"]?.includes("ops:signals:check")) {
  failures.push("package: scheduler authority must compose operational signal authority");
}
if (!scripts["mentor:profiles:authority:check"]?.includes("ops:signals:check")) {
  failures.push("package: Mentor profile authority must compose operational signal authority");
}

const runbook = await source("docs/operations/MENTOR_PROFILE_PROJECTION_RUNBOOK.md");
for (const needle of [
  "Durable critical signal rail",
  "signals/pending",
  "signals/delivered",
  "signals/quarantine",
  "first observation",
  "PostgreSQL outage",
]) {
  requireText("runbook", runbook, needle, `operational signal runbook invariant missing: ${needle}`);
}

try {
  execFileSync("bash", ["-n", "scripts/install-mentor-profile-worker.sh"], {
    stdio: "pipe",
  });
} catch {
  failures.push("installer: bash syntax validation failed");
}

if (failures.length) {
  console.error("Operational signal authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Operational signal authority check passed.");
