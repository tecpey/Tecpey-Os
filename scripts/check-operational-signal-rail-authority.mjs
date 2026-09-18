import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};
const forbidText = (label, body, needle, message) => {
  if (body.includes(needle)) failures.push(`${label}: ${message}`);
};

const migration = await source("src/lib/db-migrate-operational-signal-evidence.ts");
for (const needle of [
  "0109_operational_signal_evidence.sql",
  "platform_operational_signals",
  "platform_operational_signal_delivery_attempts",
  "incident_id UUID NOT NULL",
  "UNIQUE (incident_id, sequence)",
  "platform_operational_signals_immutable",
  "platform_operational_signal_delivery_attempts_immutable",
  "tecpey_reject_operational_evidence_mutation",
]) {
  requireText("migration", migration, needle, `missing signal evidence invariant: ${needle}`);
}

const registry = await source("src/lib/db-migration-registry.ts");
for (const needle of [
  "migration-step-093",
  "OPERATIONAL_SIGNAL_EVIDENCE_MIGRATION",
  "runOperationalSignalEvidenceMigrations",
]) {
  requireText("registry", registry, needle, `canonical signal migration missing: ${needle}`);
}

const evidence = await source("src/lib/ops/operational-signal-evidence.ts");
for (const needle of [
  "validateOperationalSignalEvidence",
  "persistOperationalSignalTx",
  "persistOperationalSignalDeliveryAttemptTx",
  "operational_signal_identity_invalid",
  "operational_signal_phase_severity_invalid",
  "operational_signal_details_invalid",
  "ON CONFLICT (signal_id) DO NOTHING",
  "operational_signal_identity_conflict",
  "operational_signal_attempt_identity_conflict",
]) {
  requireText("evidence", evidence, needle, `signal evidence guard missing: ${needle}`);
}
for (const forbidden of [
  "studentId",
  "tenantId",
  "workspaceId",
  "conversationContent",
  "rawPrompt",
  "privateKey",
  "seedPhrase",
]) {
  forbidText(
    "evidence",
    evidence,
    forbidden,
    `high-cardinality/private field forbidden from generic signal envelope: ${forbidden}`,
  );
}

const spool = await source("src/lib/ops/operational-alert-spool.ts");
for (const needle of [
  "schemaVersion: 2",
  "enqueueOperationalSignal",
  "reconcileOperationalSignalIncident",
  "activeSignals",
  "operational-signal-incident-v1",
  "lastEmittedSequence",
  "pendingPhase",
  "operationalDeliveryRetryDelayMs",
  "operational-delivery-jitter-v1",
  "persistOperationalSignalTx",
  "persistOperationalSignalDeliveryAttemptTx",
  "bestEffortReconcileSpoolEvidence",
  "persistSpoolItemTx",
  "attempts: [...item.delivery.attempts, attempt]",
  "assertNoSymlinkedAncestors",
  "await realpath(managed.root)",
  "await syncDirectory(parent)",
  "await syncDirectory(path.dirname(source))",
  "quarantineUnsafeEntry",
  "recoveredDeliveredArchives",
  "deferredDueToBatchLimit",
  "due.sort(",
  'lastAttempt?.deliveryResult === "delivered"',
]) {
  requireText("spool", spool, needle, `durable signal spool invariant missing: ${needle}`);
}
requireText(
  "spool",
  spool,
  'phase: "recovered"',
  "healthy state must emit explicit incident recovery evidence",
);
requireText(
  "spool",
  spool,
  'Idempotency-Key": identity',
  "webhook delivery must carry stable idempotency identity",
);

if (spool.includes("await bestEffortPersistItem(item)")) {
  failures.push(
    "spool: PostgreSQL persistence must not sit on the webhook critical path",
  );
}
const webhookIndex = spool.indexOf("const response = await fetchImpl");
const reconciliationIndex = spool.indexOf(
  "await bestEffortReconcileSpoolEvidence(managed)",
);
if (
  webhookIndex < 0 ||
  reconciliationIndex < 0 ||
  webhookIndex > reconciliationIndex
) {
  failures.push(
    "spool: local webhook delivery must occur before best-effort database evidence reconciliation",
  );
}

const probe = await source("scripts/check-mentor-profile-health.ts");
for (const needle of [
  "TECPEY_OPS_STATE_DIR",
  "reconcileOperationalSignalIncident",
  '"authority_unavailable"',
  '"mentor_profile_database_unavailable"',
  '"mentor_profile_database_query_failed"',
  "recordAuthorityUnavailable",
  'source: SOURCE',
  'sourceUnit: SOURCE_UNIT',
  "detailsFromSnapshot",
]) {
  requireText("health-probe", probe, needle, `health signal integration missing: ${needle}`);
}

const worker = await source("scripts/run-mentor-profile-worker.ts");
forbidText(
  "worker",
  worker,
  "emitAlert(",
  "worker must not retain a parallel best-effort Mentor notification rail",
);

const envCheck = await source("scripts/check-operational-alert-delivery-env.mjs");
for (const needle of [
  "TECPEY_OPS_STATE_DIR",
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "TECPEY_OPS_ALERT_BATCH_SIZE",
  "TECPEY_OPS_ALERT_TIMEOUT_MS",
  "TECPEY_OPS_ALERT_MAX_ATTEMPTS",
  'parsed.protocol !== "https:"',
]) {
  requireText("delivery-env", envCheck, needle, `delivery env authority missing: ${needle}`);
}
forbidText(
  "delivery-env",
  envCheck,
  "DATABASE_URL",
  "outage-safe signal delivery preflight must not depend on PostgreSQL",
);

const deliveryService = await source(
  "deploy/systemd/tecpey-ops-alert-delivery.service.in",
);
for (const needle of [
  "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
  "ExecStartPre=@@NPM_BIN@@ run ops:alerts:env-check",
  "ExecStart=@@NPM_BIN@@ run ops:alerts:deliver",
  "ReadWritePaths=@@STATE_DIR@@",
  "NoNewPrivileges=true",
  "ProtectSystem=strict",
]) {
  requireText("delivery-service", deliveryService, needle, `delivery service invariant missing: ${needle}`);
}

const healthService = await source(
  "deploy/systemd/tecpey-mentor-profile-health.service.in",
);
for (const needle of [
  "RequiresMountsFor=@@STATE_DIR@@",
  "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
  "ReadWritePaths=@@STATE_DIR@@",
]) {
  requireText("health-service", healthService, needle, `health spool authority missing: ${needle}`);
}

const installer = await source("scripts/install-mentor-profile-worker.sh");
for (const needle of [
  'STATE_DIR="${TECPEY_OPS_STATE_DIR:-/var/lib/tecpey/ops}"',
  "state_directory_symlink_forbidden",
  "operational_alert_delivery_bundle_missing",
  "operational_installer_env_bundle_missing",
  "TECPEY_INSTALL_ENV_FILE",
  "ops:installer:env-check",
  "operational_install_environment_invalid",
  "tecpey-ops-alert-delivery.service",
  "tecpey-ops-alert-delivery.timer",
  'install -d -m 0700 -o "$RUN_USER" -g "$RUN_GROUP" "$STATE_DIR"',
  "systemctl enable --now tecpey-ops-alert-delivery.timer",
  "systemctl start tecpey-ops-alert-delivery.service",
]) {
  requireText("installer", installer, needle, `Mentor durable signal installer invariant missing: ${needle}`);
}
forbidText(
  "installer",
  installer,
  "read_env_value()",
  "installer must use the governed systemd EnvironmentFile parser, not ad-hoc shell parsing",
);

const installEnvironment = await source(
  "src/lib/ops/operational-install-environment.ts",
);
for (const needle of [
  "parseSystemdEnvironmentFile",
  "rejectDuplicateKeys: true",
  "operational_install_database_url_invalid",
  "operational_install_webhook_invalid",
  "operational_install_environment_file_unsafe",
]) {
  requireText(
    "installer-env",
    installEnvironment,
    needle,
    `governed installer environment invariant missing: ${needle}`,
  );
}

const systemdEnvironment = await source(
  "src/lib/ops/systemd-environment-file.ts",
);
requireText(
  "systemd-env",
  systemdEnvironment,
  "rejectDuplicateKeys?: boolean",
  "systemd EnvironmentFile parser must support strict duplicate-key authority",
);

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
for (const [name, needle] of [
  ["build:server", "scripts/deliver-operational-alerts.ts"],
  ["build:server", "scripts/check-operational-installer-env.ts"],
  ["ops:installer:env-check", "dist/check-operational-installer-env.cjs"],
  ["ops:alerts:deliver", "dist/deliver-operational-alerts.cjs"],
  ["ops:alerts:env-check", "check-operational-alert-delivery-env.mjs"],
  ["ops:scheduler:check", "ops:signals:authority:check"],
  ["mentor:profiles:authority:check", "ops:signals:authority:check"],
  ["test:ops-scheduler", "test:ops-signal-rail"],
]) {
  if (typeof scripts[name] !== "string" || !scripts[name].includes(needle)) {
    failures.push(`package: missing ${name} -> ${needle}`);
  }
}
for (const name of [
  "ops:signals:authority:check",
  "test:ops-signal-rail",
]) {
  if (typeof scripts[name] !== "string" || scripts[name].trim() === "") {
    failures.push(`package: missing operational signal command ${name}`);
  }
}
forbidText(
  "package",
  scripts["ops:alerts:deliver"] ?? "",
  "--import tsx",
  "production alert delivery must not depend on tsx/devDependencies",
);

const spoolTest = await source(
  "src/tests/security/operational-signal-spool.integration.ts",
);
for (const needle of [
  "opens, deduplicates, updates and recovers one incident",
  "database authority loss",
  "operational_spool_identity_conflict",
  "deterministic capped jitter",
  "rejects a state root that traverses a symlinked ancestor",
  "replays the exact incident transition after a restart-like interruption",
]) {
  requireText("spool-test", spoolTest, needle, `signal spool proof missing: ${needle}`);
}

const alertSpoolTest = await source(
  "src/tests/security/operational-alert-spool.integration.ts",
);
for (const needle of [
  "future retries cannot starve ready alerts",
  "without webhook redelivery",
  "mode & 0o777, 0o644",
]) {
  requireText(
    "alert-spool-test",
    alertSpoolTest,
    needle,
    `alert spool hardening proof missing: ${needle}`,
  );
}

const postgresTest = await source(
  "src/tests/security/operational-signal-evidence-postgres.integration.ts",
);
for (const needle of [
  "replays exact signal evidence",
  "idempotent signal delivery attempts",
  "append-only",
]) {
  requireText("postgres-test", postgresTest, needle, `signal PostgreSQL proof missing: ${needle}`);
}

if (failures.length) {
  console.error("Operational signal rail authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Operational signal rail authority check passed.");
