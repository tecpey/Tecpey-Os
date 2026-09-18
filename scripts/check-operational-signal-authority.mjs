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
  "incident_id CHAR(64)",
  "condition_fingerprint CHAR(64)",
  "platform_operational_signals_incident_lifecycle_idx",
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
  "tecpey-operational-condition-key-v2",
  "tecpey-operational-condition-fingerprint-v2",
  "tecpey-operational-signal-id-v2",
  "tecpey-operational-incident-generation-v2",
  "sourceUnit: input.sourceUnit",
  "reasonCodes",
  "measurements",
  "operational_signal_measurement_value_invalid",
  "operational_signal_reason_cardinality_forbidden",
  "operational_signal_measurement_cardinality_forbidden",
  "operational_signal_type_cardinality_forbidden",
  "operational_signal_component_cardinality_forbidden",
  "operational_signal_resolution_binding_required",
  "FORBIDDEN_CARDINALITY_SEGMENTS",
  "LONG_IDENTIFIER_RE",
  "persistOperationalSignalTx",
  "operational_signal_payload_conflict",
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

const evidenceTest = await source(
  "src/tests/security/operational-signal-evidence.test.ts",
);
for (const needle of [
  "reject user-scoped and high-cardinality dimensions",
  "student_123456",
  "tenant_id",
  "trace_0123456789abcdef",
  "resolved evidence cannot exist without explicit incident binding",
]) {
  requireText("evidence-test", evidenceTest, needle, `privacy/cardinality proof missing: ${needle}`);
}

const spool = await source("src/lib/ops/operational-signal-spool.ts");
for (const needle of [
  '"signals", "pending"',
  '"signals", "delivered"',
  '"signals", "quarantine"',
  "operationalSignalRetryDelayMs",
  "operationalSignalRetryAfterDelayMs",
  'response.headers.get("retry-after")',
  "Math.max(",
  "tecpey-operational-signal-retry-v1",
  "operational_signal_webhook_https_required",
  "operational_signal_spool_payload_conflict",
  "hashOperationalSignalEvidence(existing.signal)",
  "bestEffortPersistSignal",
  "bestEffortPersistAttempt",
  "syncDirectory",
  "attempts: Object.freeze([...item.attempts, attempt])",
  "deferredDueToBatchLimit",
  "due.sort(",
  "quarantineUnsafeEntry",
  "realpath",
  "operational_signal_state_directory_alias_forbidden",
  "assertNoSymlinkedAncestors",
  "recoveredDeliveredArchives",
  "recoveredQuarantinedArchives",
  'lastAttempt?.deliveryResult === "delivered"',
]) {
  requireText("spool", spool, needle, `signal spool invariant missing: ${needle}`);
}
const idempotencyHeader = ["Idempotency", "Key"].join("-");
requireText(
  "spool",
  spool,
  `"${idempotencyHeader}": item.signal.signalId`,
  "webhook delivery must retain the stable signal idempotency header",
);
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
requirePattern(
  "spool",
  spool,
  /atomicReplaceJson\(filePath, updated\)[\s\S]*bestEffortPersistAttempt\(attempt\)[\s\S]*moveFile\(filePath, managed\.(delivered|quarantine)\)/,
  "local attempt evidence must be fsync-persisted before terminal archive movement",
);
requirePattern(
  "spool",
  spool,
  /due\.sort\([\s\S]*due\.slice\(0, limit\)/,
  "delivery batching must select due work before applying the batch limit",
);

const spoolTest = await source(
  "src/tests/security/operational-signal-spool.integration.ts",
);
for (const needle of [
  "accepts exact replay and rejects same-id payload drift",
  "publishes exactly one immutable payload under concurrent exact replay",
  "due signals before future retries",
  "honors bounded Retry-After",
  'headers: { "Retry-After": "120" }',
  "archived.attempts",
  "retried.attempts",
  "stat(target)",
  "without redelivering",
  "symlinked ancestor",
  'error.code === "ENOENT"',
]) {
  requireText("spool-test", spoolTest, needle, `durability/fairness proof missing: ${needle}`);
}

const lifecycle = await source(
  "src/lib/ops/operational-condition-signal.ts",
);
for (const needle of [
  "tecpey-operational-condition-state-v2",
  "signals: Object.freeze",
  "await atomicWriteState(input.filePath, pendingState)",
  "enqueueSequence",
  "await atomicWriteState(input.filePath, committed)",
  "recoverPending",
  '"condition_changed"',
  '"condition_recovered"',
  "randomBytes(32)",
]) {
  requireText("lifecycle", lifecycle, needle, `incident lifecycle invariant missing: ${needle}`);
}
requirePattern(
  "lifecycle",
  lifecycle,
  /await atomicWriteState\(input\.filePath, pendingState\)[\s\S]*await enqueueSequence\([\s\S]*await atomicWriteState\(input\.filePath, committed\)/,
  "transition intent must be fsync-persisted before spool enqueue and committed afterward",
);

const lifecycleTest = await source(
  "src/tests/security/operational-condition-signal-v2.test.ts",
);
for (const needle of [
  "same-hour recurrence",
  "write-ahead pending transition replays the exact signal",
  "cause-change crash after resolving the old incident",
  "simulated_second_enqueue_crash",
  "seenDuringRecovery[0], seenBeforeCrash[0]",
  "warning or healthy observation never opens",
]) {
  requireText("lifecycle-test", lifecycleTest, needle, `incident lifecycle proof missing: ${needle}`);
}

const health = await source("scripts/check-mentor-profile-health.ts");
for (const needle of [
  "transitionOperationalConditionSignal",
  "mentor_profile_database_unavailable",
  "mentor_profile_database_authority_failed",
  '"mentor_profile_projection"',
  '"mentor_profile_database_authority"',
  '"mentor_profile_health_probe"',
  "TECPEY_OPS_STATE_DIR",
  "status: evaluation.status",
]) {
  requireText("health", health, needle, `health-to-signal lifecycle wiring missing: ${needle}`);
}
if (
  health.includes("enqueueOperationalSignal(") ||
  health.includes("createOperationalSignalEvidence(")
) {
  failures.push(
    "health: independent probe must delegate incident identity/lifecycle to operational-condition-signal",
  );
}

const mentorWorker = await source("scripts/run-mentor-profile-worker.ts");
if (mentorWorker.includes("emitAlert(")) {
  failures.push(
    "mentor-worker: worker must remain telemetry-only; the independent probe is the sole incident producer",
  );
}
for (const needle of [
  "[mentor-profile-worker] health",
  "sole durable incident producer",
]) {
  requireText("mentor-worker", mentorWorker, needle, `worker telemetry boundary missing: ${needle}`);
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

const installEnvironment = await source(
  "src/lib/ops/operational-install-environment.ts",
);
for (const needle of [
  "parseSystemdEnvironmentFile",
  "rejectDuplicateKeys: true",
  "DATABASE_URL",
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "operational_install_environment_file_unsafe",
]) {
  requireText(
    "install-environment",
    installEnvironment,
    needle,
    `installer env authority missing: ${needle}`,
  );
}

const installEnvironmentCli = await source(
  "scripts/check-operational-installer-env.ts",
);
requireText(
  "install-environment-cli",
  installEnvironmentCli,
  "TECPEY_INSTALL_ENV_FILE",
  "bundled installer env preflight must require the exact env-file path",
);

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
const schedulerInstaller = await source(
  "scripts/install-community-challenge-scheduler.sh",
);
for (const [label, body] of [
  ["mentor-installer", installer],
  ["scheduler-installer", schedulerInstaller],
]) {
  for (const needle of [
    "dist/check-operational-installer-env.cjs",
    "ops:installer:env-check",
    "TECPEY_INSTALL_ENV_FILE",
  ]) {
    requireText(label, body, needle, `governed env preflight wiring missing: ${needle}`);
  }
  if (body.includes("read_env_value()")) {
    failures.push(`${label}: ad-hoc Bash env parsing must remain forbidden`);
  }
}

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
  ["build:server", "scripts/check-operational-installer-env.ts"],
  ["ops:installer:env-check", "dist/check-operational-installer-env.cjs"],
  ["ops:alerts:deliver:prod", "dist/deliver-operational-alerts.cjs"],
  ["ops:delivery:env-check", "dist/check-operational-delivery-env.cjs"],
  ["test:ops-signals", "operational-signal"],
  ["test:ops-signals", "operational-condition-signal-v2.test.ts"],
  ["test:ops-signals", "mentor-profile-operational-installer.test.ts"],
  ["test:ops-signals", "operational-install-environment.test.ts"],
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
  "signals/conditions",
  "write-ahead transition",
  "same condition recurs after recovery",
  "sole governed producer",
  "Retry-After",
  "never shortens the local jittered backoff",
  "immutable signal payload hash matches exactly",
  "high-cardinality segments",
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
