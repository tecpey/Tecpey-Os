import { readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");
const requireText = (label, body, needle, message) => {
  if (!body.includes(needle)) failures.push(`${label}: ${message}`);
};
const requirePattern = (label, body, pattern, message) => {
  if (!pattern.test(body)) failures.push(`${label}: ${message}`);
};
const rejectText = (label, body, needle, message) => {
  if (body.includes(needle)) failures.push(`${label}: ${message}`);
};

const migration = await source("src/lib/db-migrate-operational-signal-envelope.ts");
for (const needle of [
  "0109_operational_signal_envelope.sql",
  "platform_operational_signals",
  "platform_operational_signal_delivery_attempts",
  "incident_id UUID NOT NULL",
  "condition_fingerprint CHAR(64) NOT NULL",
  "UNIQUE (incident_id, lifecycle)",
  "platform_operational_signals_immutable",
  "platform_operational_signal_attempts_immutable",
  "tecpey_reject_operational_evidence_mutation",
]) {
  requireText("migration", migration, needle, `missing generic signal invariant: ${needle}`);
}

const registry = await source("src/lib/db-migration-registry.ts");
for (const needle of [
  "migration-step-093",
  "OPERATIONAL_SIGNAL_ENVELOPE_MIGRATION",
  "runOperationalSignalEnvelopeMigrations",
]) {
  requireText("registry", registry, needle, `canonical step 093 wiring missing: ${needle}`);
}

const evidence = await source("src/lib/ops/operational-job-evidence.ts");
for (const needle of [
  "OperationalSignalEvidence",
  "validateOperationalSignalEvidence",
  "persistOperationalSignalTx",
  "persistOperationalSignalDeliveryAttemptTx",
  "operational_signal_identity_conflict",
  "operational_signal_attempt_identity_conflict",
  "conditionFingerprint",
  "reasonCodes",
  "counters",
  "gauges",
]) {
  requireText("evidence", evidence, needle, `generic signal evidence missing: ${needle}`);
}
for (const forbidden of [
  "studentId",
  "tenantId",
  "workspaceId",
  "conversationContent",
  "rawPrompt",
  "portfolio",
  "kyc",
  "seedPhrase",
  "privateKey",
]) {
  if (evidence.includes(forbidden)) {
    failures.push(`evidence: forbidden sensitive/high-cardinality signal field: ${forbidden}`);
  }
}
requirePattern(
  "evidence",
  evidence,
  /entries\.length > 32/,
  "numeric signal maps must remain bounded",
);
requirePattern(
  "evidence",
  evidence,
  /lifecycle === "firing"[\s\S]*reasonCodes\.length === 0/,
  "firing signals must require bounded reason evidence",
);
requirePattern(
  "evidence",
  evidence,
  /lifecycle === "resolved"[\s\S]*condition_recovered/,
  "resolution signals must carry explicit recovery evidence",
);

const spool = await source("src/lib/ops/operational-alert-spool.ts");
const idempotencyHeaderInvariant = ["Idempotency", "Key"].join("-");
for (const needle of [
  "OperationalAlertSpoolItem",
  "OperationalSignalSpoolItem",
  "schemaVersion: 1",
  "schemaVersion: 2",
  "enqueueOperationalAlert",
  "enqueueOperationalSignal",
  "persistOperationalSignalTx",
  "persistOperationalSignalDeliveryAttemptTx",
  idempotencyHeaderInvariant,
  "operational-delivery-jitter-v1",
  "retryAfterDelayMs",
  'response.headers.get("retry-after")',
  "MAX_RETRY_DELAY_MS",
  "operational_spool_identity_conflict",
  "operational_spool_archive_corrupt",
]) {
  requireText("spool", spool, needle, `durable spool invariant missing: ${needle}`);
}
requirePattern(
  "spool",
  spool,
  /Math\.max\(backoffMs, retryAfterMs \?\? 0\)/,
  "server Retry-After must not shorten local bounded backoff",
);
requirePattern(
  "spool",
  spool,
  /await handle\.sync\(\)[\s\S]*await rename\(temporary, filePath\)/,
  "local spool writes must fsync before atomic rename",
);
requireText(
  "spool",
  spool,
  "The local spool is the outage-safe authority when PostgreSQL is unavailable.",
  "PostgreSQL outage fallback authority must remain explicit",
);

const condition = await source("src/lib/ops/operational-condition-signal.ts");
for (const needle of [
  "transitionOperationalConditionSignal",
  "signals",
  "active",
  "conditionFingerprint",
  "condition_recovered",
  "condition_changed",
  "enqueueOperationalSignal",
  "await writeState(filePath, next)",
]) {
  requireText("condition", condition, needle, `condition lifecycle invariant missing: ${needle}`);
}
const spoolIndex = condition.indexOf(
  "await enqueueOperationalSignal(input.stateDirectory, firing)",
);
const stateIndex = condition.indexOf("await writeState(filePath, next)");
if (spoolIndex < 0 || stateIndex < 0 || spoolIndex > stateIndex) {
  failures.push(
    "condition: firing signal must be spooled before active state is committed",
  );
}

const probe = await source("scripts/check-mentor-profile-health.ts");
for (const needle of [
  "TECPEY_OPS_STATE_DIR",
  'condition: "database-authority"',
  'condition: "health-probe"',
  'condition: "projection-health"',
  "transitionOperationalConditionSignal",
  "mentor_profile_database_unavailable",
  "process.exitCode = 3",
]) {
  requireText("probe", probe, needle, `Mentor durable health integration missing: ${needle}`);
}
requirePattern(
  "probe",
  probe,
  /stateDirectory\(\);[\s\S]*hostName\(\);[\s\S]*loadMentorProfileHealthSnapshot/,
  "local durable state authority must be validated before PostgreSQL health query",
);

const alertEnv = await source("scripts/check-operational-alert-delivery-env.ts");
for (const needle of [
  "TECPEY_OPS_STATE_DIR",
  "TECPEY_OPS_ALERT_WEBHOOK_URL",
  "TECPEY_OPS_ALERT_BATCH_SIZE",
  "TECPEY_OPS_ALERT_TIMEOUT_MS",
  "TECPEY_OPS_ALERT_MAX_ATTEMPTS",
]) {
  requireText("alert-env", alertEnv, needle, `generic delivery preflight missing: ${needle}`);
}
for (const forbidden of ["DATABASE_URL", "COMMUNITY_CHALLENGE"]) {
  rejectText(
    "alert-env",
    alertEnv,
    forbidden,
    `generic alert delivery preflight must remain dependency-independent: ${forbidden}`,
  );
}

const alertService = await source("deploy/systemd/tecpey-ops-alert-delivery.service.in");
for (const needle of [
  "ExecStartPre=@@NPM_BIN@@ run ops:alerts:env-check",
  "ExecStart=@@NPM_BIN@@ run ops:alerts:deliver",
  "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
  "ReadWritePaths=@@STATE_DIR@@",
  "NoNewPrivileges=true",
  "ProtectSystem=strict",
  "CapabilityBoundingSet=",
]) {
  requireText("alert-service", alertService, needle, `alert delivery service missing: ${needle}`);
}

const alertTimer = await source("deploy/systemd/tecpey-ops-alert-delivery.timer");
for (const needle of [
  "OnBootSec=2min",
  "OnUnitActiveSec=5min",
  "RandomizedDelaySec=30s",
  "FixedRandomDelay=true",
  "Unit=tecpey-ops-alert-delivery.service",
]) {
  requireText("alert-timer", alertTimer, needle, `alert retry timer missing: ${needle}`);
}

const mentorService = await source("deploy/systemd/tecpey-mentor-profile-health.service.in");
for (const needle of [
  "OnFailure=tecpey-ops-alert-delivery.service",
  "Environment=TECPEY_OPS_STATE_DIR=@@STATE_DIR@@",
  "ReadWritePaths=@@STATE_DIR@@",
  "SuccessExitStatus=1",
]) {
  requireText("mentor-health-service", mentorService, needle, `Mentor health service rail wiring missing: ${needle}`);
}

const mentorInstaller = await source("scripts/install-mentor-profile-worker.sh");
for (const needle of [
  "operational_alert_delivery_bundle_missing",
  "operational_alert_env_check_bundle_missing",
  "ops_alert_https_webhook_missing",
  "state_directory_symlink_forbidden",
  "tecpey-ops-alert-delivery.service",
  "tecpey-ops-alert-delivery.timer",
  "durable_alert_delivery=verified",
  "systemctl enable --now tecpey-ops-alert-delivery.timer",
]) {
  requireText("mentor-installer", mentorInstaller, needle, `Mentor installer durable rail missing: ${needle}`);
}

const communityInstaller = await source(
  "scripts/install-community-challenge-scheduler.sh",
);
for (const needle of [
  "operational_alert_delivery_bundle_missing",
  "operational_alert_env_check_bundle_missing",
]) {
  requireText(
    "community-installer",
    communityInstaller,
    needle,
    `legacy scheduler installer must verify generic delivery bundle: ${needle}`,
  );
}

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
for (const [name, needle] of [
  ["build:server", "scripts/deliver-operational-alerts.ts"],
  ["build:server", "scripts/check-operational-alert-delivery-env.ts"],
  ["ops:alerts:deliver", "node --conditions=react-server dist/deliver-operational-alerts.cjs"],
  ["ops:alerts:env-check", "node dist/check-operational-alert-delivery-env.cjs"],
]) {
  if (typeof scripts[name] !== "string" || !scripts[name].includes(needle)) {
    failures.push(`package: missing production rail wiring ${name} -> ${needle}`);
  }
}
for (const name of ["ops:alerts:deliver", "ops:alerts:env-check"]) {
  if (/tsx|--import/.test(scripts[name] ?? "")) {
    failures.push(`package: production alert rail must not depend on tsx: ${name}`);
  }
}
if (!scripts["test:ops-signals"]?.includes("operational-condition-signal.test.ts")) {
  failures.push("package: generic condition lifecycle tests are not wired");
}
if (!scripts["test:ops-signals"]?.includes("operational-alert-spool.integration.ts")) {
  failures.push("package: generic spool integration tests are not wired");
}
if (!scripts["test:ops-signals"]?.includes("operational-job-evidence-postgres.integration.ts")) {
  failures.push("package: generic PostgreSQL signal tests are not wired");
}

const runbook = await source("docs/operations/MENTOR_PROFILE_PROJECTION_RUNBOOK.md");
for (const needle of [
  "Durable critical signal rail",
  "at-least-once",
  "Idempotency-Key",
  "database-authority",
  "health-probe",
  "projection-health",
  "quarantine",
  "condition_recovered",
]) {
  requireText("runbook", runbook, needle, `durable signal operations contract missing: ${needle}`);
}

if (failures.length) {
  console.error("Operational signal authority failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Operational signal authority passed: backward-compatible local spool, generic immutable signals, outage-independent delivery, idempotent retries, bounded jitter, condition lifecycle and Mentor critical health wiring remain enforced.",
);
