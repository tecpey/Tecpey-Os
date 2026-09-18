import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};
const rejectText = (label, body, needle, message) => {
  if (body.includes(needle)) failures.push(`${label}: ${message}`);
};

const requirePattern = (label, body, pattern, message) => {
  if (!pattern.test(body)) failures.push(`${label}: ${message}`);
};
const requireOccurrenceCount = (label, body, needle, expected, message) => {
  const count = body.split(needle).length - 1;
  if (count !== expected) failures.push(`${label}: ${message} (expected=${expected}, actual=${count})`);
};

const migration = await source("src/lib/db-migrate-operational-signal-evidence.ts");
for (const needle of [
  "0109_operational_signal_evidence.sql",
  "platform_operational_signals",
  "platform_operational_signal_delivery_attempts",
  "operational signal evidence is append-only",
  "signal_id TEXT PRIMARY KEY",
  "dedupe_bucket_at TIMESTAMPTZ NOT NULL",
  "fingerprint CHAR(64) NOT NULL",
  "payload_hash CHAR(64) NOT NULL",
]) {
  requireText("migration", migration, needle, `missing signal schema invariant: ${needle}`);
}

requirePattern(
  "migration",
  migration,
  /evidence->>'attemptHash'\s*~\s*'\^\[0-9a-f\]\{64\}\
const registry = await source("src/lib/db-migration-registry.ts");
for (const needle of [
  "migration-step-093",
  "runOperationalSignalEvidenceMigrations",
  "OPERATIONAL_SIGNAL_EVIDENCE_MIGRATION",
]) {
  requireText("registry", registry, needle, `missing governed migration wiring: ${needle}`);
}

const evidence = await source("src/lib/ops/operational-signal-evidence.ts");
for (const needle of [
  "createOperationalSignalEvidence",
  "operational-signal-fingerprint-v1",
  "operational_signal_fingerprint_mismatch",
  "operational_signal_time_not_canonical",
  "operational_signal_id_mismatch",
  "derivedSignalId",
  "FORBIDDEN_ATTRIBUTE_KEY_RE",
  "ALLOWED_STRING_ATTRIBUTE_KEYS",
  "FORBIDDEN_REASON_CODE_RE",
  "dedupeWindowSeconds",
  "Date.parse(dedupeBucketAt) > Date.parse(occurredAt)",
  "attributes.length",
]) {
  if (needle === "attributes.length") continue;
  requireText("evidence", evidence, needle, `missing signal evidence invariant: ${needle}`);
}
for (const forbidden of [
  '"studentId"',
  '"tenantId"',
  '"workspaceId"',
  '"conversation"',
  '"prompt"',
]) {
  rejectText(
    "evidence",
    evidence,
    forbidden,
    `generic signal evidence must not define high-cardinality field ${forbidden}`,
  );
}

const spool = await source("src/lib/ops/operational-alert-spool.ts");
for (const needle of [
  "OperationalAlertSpoolItem",
  "schemaVersion: 1",
  "OperationalSignalSpoolItem",
  "schemaVersion: 2",
  "enqueueOperationalAlert",
  "enqueueOperationalSignal",
  "operational-signal-retry-v1",
  "persistOperationalSignalTx",
  "persistOperationalSignalDeliveryAttemptTx",
  '"Idempotency-Key": entity.id',
  "parsed.signal.fingerprint !== signal.fingerprint",
  "parsed.signal.dedupeBucketAt !== signal.dedupeBucketAt",
  "atomicCreateJson",
  "await link(temporary, filePath)",
  "await syncDirectory(parent)",
  "await syncDirectory(destinationDirectory)",
  "if (summary.selected >= limit) break",
  "summary.skippedUntilLater += 1",
  "attemptHistory",
  "databaseMirrorComplete",
  "mirrorSpoolItemToDatabase",
  "reconcileArchiveDirectory",
  "Journal the webhook outcome before any archive move",
]) {
  requireText("spool", spool, needle, `missing backward-compatible spool invariant: ${needle}`);
}

const journalIndex = spool.indexOf("await atomicWriteJson(filePath, journaled)");
const deliveredMoveIndex = spool.indexOf("await moveFile(filePath, managed.delivered)");
const quarantineMoveIndex = spool.indexOf("await moveFile(filePath, managed.quarantine)", journalIndex);
if (
  journalIndex < 0 ||
  deliveredMoveIndex < 0 ||
  quarantineMoveIndex < 0 ||
  journalIndex > deliveredMoveIndex ||
  journalIndex > quarantineMoveIndex
) {
  failures.push(
    "spool: delivery outcome must be crash-durably journaled before delivered/quarantine archival",
  );
}

const health = await source("scripts/check-mentor-profile-health.ts");
for (const needle of [
  "enqueueOperationalSignal",
  "createOperationalSignalEvidence",
  "mentor.profile.projection_stalled",
  "mentor.profile.authority_unavailable",
  "mentor.profile.health_probe_failed",
  "TECPEY_OPS_STATE_DIR",
  "dedupeWindowSeconds: 900",
]) {
  requireText("health", health, needle, `health-to-spool wiring missing: ${needle}`);
}
const criticalEvaluationIndex = health.indexOf('evaluation.status === "critical"');
const criticalEnqueueIndex = health.indexOf("await enqueueCriticalSignal", criticalEvaluationIndex);
const exitAssignmentIndex = health.indexOf("process.exitCode =", criticalEvaluationIndex);
if (
  criticalEvaluationIndex < 0 ||
  criticalEnqueueIndex < 0 ||
  exitAssignmentIndex < 0 ||
  criticalEnqueueIndex > exitAssignmentIndex
) {
  failures.push("health: critical signal must be durably enqueued before probe exit status is assigned");
}

const alertEnv = await source("scripts/check-operational-alert-delivery-env.ts");
for (const needle of [
  "TECPEY_OPS_STATE_DIR",
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "databaseRequired: false",
]) {
  requireText("alert-env", alertEnv, needle, `alert preflight missing: ${needle}`);
}
rejectText(
  "alert-env",
  alertEnv,
  'required("DATABASE_URL")',
  "alert delivery preflight must remain usable during database outage",
);

const alertService = await source("deploy/systemd/tecpey-ops-alert-delivery.service.in");
requireText(
  "alert-service",
  alertService,
  "ExecStartPre=@@NPM_BIN@@ run ops:alerts:env-check",
  "alert service must use independent preflight",
);
for (const needle of [
  "ProtectSystem=strict",
  "ReadOnlyPaths=@@APP_DIR@@",
  "ReadWritePaths=@@STATE_DIR@@",
  "NoNewPrivileges=true",
]) {
  requireText("alert-service", alertService, needle, `alert service hardening missing: ${needle}`);
}

const healthService = await source("deploy/systemd/tecpey-mentor-profile-health.service.in");
for (const needle of [
  "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
  "ProtectSystem=strict",
  "ReadOnlyPaths=@@APP_DIR@@",
  "ReadWritePaths=@@STATE_DIR@@",
]) {
  requireText("health-service", healthService, needle, `health service spool boundary missing: ${needle}`);
}

const installer = await source("scripts/install-mentor-profile-worker.sh");

for (const [needle, expected] of [
  ["render_service() {", 1],
  ['if [[ "$DRY_RUN" == "1" ]]', 1],
  ["systemctl daemon-reload", 1],
  ["printf 'installed=1", 1],
]) {
  requireOccurrenceCount(
    "installer",
    installer,
    needle,
    expected,
    `installer top-level block duplicated or missing: ${needle}`,
  );
}
for (const needle of [
  "STATE_DIR=",
  "ops_alert_https_webhook_missing",
  "operational_alert_delivery_bundle_missing",
  "operational_alert_preflight_bundle_missing",
  "tecpey-ops-alert-delivery.service",
  "tecpey-ops-alert-delivery.timer",
  "install -d -m 0700",
  "systemctl enable --now tecpey-ops-alert-delivery.timer",
]) {
  requireText("installer", installer, needle, `Mentor durable delivery install invariant missing: ${needle}`);
}

const recoveryPolicy = await source(
  "scripts/protected-recovery-reconciliation-collector-policy.mjs",
);
for (const table of [
  '"platform_operational_signals"',
  '"platform_operational_signal_delivery_attempts"',
]) {
  requireText(
    "recovery-policy",
    recoveryPolicy,
    table,
    `protected recovery must fingerprint ${table}`,
  );
}

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
for (const [name, needle] of [
  ["build:server", "scripts/deliver-operational-alerts.ts"],
  ["build:server", "scripts/check-operational-alert-delivery-env.ts"],
  ["ops:alerts:deliver", "dist/deliver-operational-alerts.cjs"],
  ["ops:alerts:env-check", "dist/check-operational-alert-delivery-env.cjs"],
  ["test:operational-signals", "operational-signal-spool.integration.ts"],
  ["test:operational-signals", "operational-signal-evidence-postgres.integration.ts"],
  ["mentor:profiles:authority:check", "ops:signals:check"],
]) {
  if (typeof scripts[name] !== "string" || !scripts[name].includes(needle)) {
    failures.push(`package: missing ${name} -> ${needle}`);
  }
}
if (scripts["ops:alerts:deliver"]?.includes("tsx")) {
  failures.push("package: production alert delivery must not depend on tsx");
}

const spoolTest = await source("src/tests/security/operational-signal-spool.integration.ts");
for (const needle of [
  "deduplicates",
  "sameBucketReplay",
  "operational_signal_id_mismatch",
  "Idempotency-Key",
  "deterministic bounded jitter",
  "studentId",
  "opaque-user-123",
  "student_lookup_failed",
  "concurrent same-bucket enqueue",
  "[false, true]",
  "future-backoff files starve a due signal",
  "summary.skippedUntilLater",
  "attemptHistory",
  'deliveryResult: "delivered"',
  'deliveryResult: "retryable_failure"',
]) {
  requireText("spool-test", spoolTest, needle, `signal spool proof missing: ${needle}`);
}

const postgresTest = await source(
  "src/tests/security/operational-signal-evidence-postgres.integration.ts",
);
for (const needle of [
  "replayed",
  "append-only",
  "platform_operational_signals",
  "platform_operational_signal_delivery_attempts",
]) {
  requireText("postgres-test", postgresTest, needle, `signal PostgreSQL proof missing: ${needle}`);
}

if (failures.length) {
  console.error("Operational signal authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Operational signal authority passed: legacy schema-v1 alerts and generic schema-v2 signals share one private durable spool, generic signals use derived low-cardinality identity, critical Mentor health is spooled before failure exit, delivery remains database-independent, and PostgreSQL evidence is append-only.",
);
[\s\S]*?\)\s*\n\);[\s\S]*?CREATE OR REPLACE FUNCTION tecpey_reject_operational_signal_mutation/,
  "delivery attempt evidence CHECK must be syntactically closed before immutable trigger definition",
);
requireOccurrenceCount(
  "migration",
  migration,
  "export async function runOperationalSignalEvidenceMigrations",
  1,
  "migration runner must appear exactly once",
);
requireOccurrenceCount(
  "migration",
  migration,
  "CREATE OR REPLACE FUNCTION tecpey_reject_operational_signal_mutation",
  1,
  "immutable trigger function must appear exactly once",
);

const registry = await source("src/lib/db-migration-registry.ts");
for (const needle of [
  "migration-step-093",
  "runOperationalSignalEvidenceMigrations",
  "OPERATIONAL_SIGNAL_EVIDENCE_MIGRATION",
]) {
  requireText("registry", registry, needle, `missing governed migration wiring: ${needle}`);
}

const evidence = await source("src/lib/ops/operational-signal-evidence.ts");
for (const needle of [
  "createOperationalSignalEvidence",
  "operational-signal-fingerprint-v1",
  "operational_signal_fingerprint_mismatch",
  "operational_signal_time_not_canonical",
  "operational_signal_id_mismatch",
  "derivedSignalId",
  "FORBIDDEN_ATTRIBUTE_KEY_RE",
  "dedupeWindowSeconds",
  "attributes.length",
]) {
  if (needle === "attributes.length") continue;
  requireText("evidence", evidence, needle, `missing signal evidence invariant: ${needle}`);
}
for (const forbidden of [
  '"studentId"',
  '"tenantId"',
  '"workspaceId"',
  '"conversation"',
  '"prompt"',
]) {
  rejectText(
    "evidence",
    evidence,
    forbidden,
    `generic signal evidence must not define high-cardinality field ${forbidden}`,
  );
}

const spool = await source("src/lib/ops/operational-alert-spool.ts");
for (const needle of [
  "OperationalAlertSpoolItem",
  "schemaVersion: 1",
  "OperationalSignalSpoolItem",
  "schemaVersion: 2",
  "enqueueOperationalAlert",
  "enqueueOperationalSignal",
  "operational-signal-retry-v1",
  "persistOperationalSignalTx",
  "persistOperationalSignalDeliveryAttemptTx",
  '"Idempotency-Key": entity.id',
]) {
  requireText("spool", spool, needle, `missing backward-compatible spool invariant: ${needle}`);
}

const health = await source("scripts/check-mentor-profile-health.ts");
for (const needle of [
  "enqueueOperationalSignal",
  "createOperationalSignalEvidence",
  "mentor.profile.projection_stalled",
  "mentor.profile.authority_unavailable",
  "mentor.profile.health_probe_failed",
  "TECPEY_OPS_STATE_DIR",
  "dedupeWindowSeconds: 900",
]) {
  requireText("health", health, needle, `health-to-spool wiring missing: ${needle}`);
}
const criticalEvaluationIndex = health.indexOf('evaluation.status === "critical"');
const criticalEnqueueIndex = health.indexOf("await enqueueCriticalSignal", criticalEvaluationIndex);
const exitAssignmentIndex = health.indexOf("process.exitCode =", criticalEvaluationIndex);
if (
  criticalEvaluationIndex < 0 ||
  criticalEnqueueIndex < 0 ||
  exitAssignmentIndex < 0 ||
  criticalEnqueueIndex > exitAssignmentIndex
) {
  failures.push("health: critical signal must be durably enqueued before probe exit status is assigned");
}

const alertEnv = await source("scripts/check-operational-alert-delivery-env.ts");
for (const needle of [
  "TECPEY_OPS_STATE_DIR",
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "databaseRequired: false",
]) {
  requireText("alert-env", alertEnv, needle, `alert preflight missing: ${needle}`);
}
rejectText(
  "alert-env",
  alertEnv,
  'required("DATABASE_URL")',
  "alert delivery preflight must remain usable during database outage",
);

const alertService = await source("deploy/systemd/tecpey-ops-alert-delivery.service.in");
requireText(
  "alert-service",
  alertService,
  "ExecStartPre=@@NPM_BIN@@ run ops:alerts:env-check",
  "alert service must use independent preflight",
);
for (const needle of [
  "ProtectSystem=strict",
  "ReadOnlyPaths=@@APP_DIR@@",
  "ReadWritePaths=@@STATE_DIR@@",
  "NoNewPrivileges=true",
]) {
  requireText("alert-service", alertService, needle, `alert service hardening missing: ${needle}`);
}

const healthService = await source("deploy/systemd/tecpey-mentor-profile-health.service.in");
for (const needle of [
  "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
  "ProtectSystem=strict",
  "ReadOnlyPaths=@@APP_DIR@@",
  "ReadWritePaths=@@STATE_DIR@@",
]) {
  requireText("health-service", healthService, needle, `health service spool boundary missing: ${needle}`);
}

const installer = await source("scripts/install-mentor-profile-worker.sh");
for (const needle of [
  "STATE_DIR=",
  "ops_alert_https_webhook_missing",
  "operational_alert_delivery_bundle_missing",
  "operational_alert_preflight_bundle_missing",
  "tecpey-ops-alert-delivery.service",
  "tecpey-ops-alert-delivery.timer",
  "install -d -m 0700",
  "systemctl enable --now tecpey-ops-alert-delivery.timer",
]) {
  requireText("installer", installer, needle, `Mentor durable delivery install invariant missing: ${needle}`);
}

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
for (const [name, needle] of [
  ["build:server", "scripts/deliver-operational-alerts.ts"],
  ["build:server", "scripts/check-operational-alert-delivery-env.ts"],
  ["ops:alerts:deliver", "dist/deliver-operational-alerts.cjs"],
  ["ops:alerts:env-check", "dist/check-operational-alert-delivery-env.cjs"],
  ["test:operational-signals", "operational-signal-spool.integration.ts"],
  ["test:operational-signals", "operational-signal-evidence-postgres.integration.ts"],
  ["mentor:profiles:authority:check", "ops:signals:check"],
]) {
  if (typeof scripts[name] !== "string" || !scripts[name].includes(needle)) {
    failures.push(`package: missing ${name} -> ${needle}`);
  }
}
if (scripts["ops:alerts:deliver"]?.includes("tsx")) {
  failures.push("package: production alert delivery must not depend on tsx");
}

const spoolTest = await source("src/tests/security/operational-signal-spool.integration.ts");
for (const needle of [
  "deduplicates",
  "sameBucketReplay",
  "operational_signal_id_mismatch",
  "Idempotency-Key",
  "deterministic bounded jitter",
  "studentId",
]) {
  requireText("spool-test", spoolTest, needle, `signal spool proof missing: ${needle}`);
}

const postgresTest = await source(
  "src/tests/security/operational-signal-evidence-postgres.integration.ts",
);
for (const needle of [
  "replayed",
  "append-only",
  "platform_operational_signals",
  "platform_operational_signal_delivery_attempts",
]) {
  requireText("postgres-test", postgresTest, needle, `signal PostgreSQL proof missing: ${needle}`);
}

if (failures.length) {
  console.error("Operational signal authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Operational signal authority passed: legacy schema-v1 alerts and generic schema-v2 signals share one private durable spool, generic signals use derived low-cardinality identity, critical Mentor health is spooled before failure exit, delivery remains database-independent, and PostgreSQL evidence is append-only.",
);
