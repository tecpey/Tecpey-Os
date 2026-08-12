import { readFile } from "node:fs/promises";

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const OWNER_KEYS = [
  "incidentCommander",
  "technicalOwner",
  "sreOwner",
  "securityOwner",
  "productOwner",
];

const RUNBOOK_FAILURE_MODES = {
  database: "Database",
  redis: "Redis",
  migration: "Migration",
  alertDelivery: "Alert delivery",
  provider: "Provider",
  worker: "Worker",
  reconciliation: "Reconciliation",
};

const FORBIDDEN_KEYS = new Set([
  "credentials",
  "credential",
  "customerdatas",
  "customerdata",
  "databaseurl",
  "hostip",
  "ipaddress",
  "privatekey",
  "providerpayload",
  "prompttranscript",
  "rawlogs",
  "rawlog",
  "rawrows",
  "rawrow",
  "secret",
  "secrets",
  "token",
  "tokens",
  "webhookurl",
]);

const FORBIDDEN_STRING_PATTERNS = [
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL\s*=/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bsk-[A-Za-z0-9_-]{12,}/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /https?:\/\/[^\s"]+/i,
];

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}_must_be_object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${path}_keys_invalid`);
  }
}

function assertIso(value, path) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${path}_timestamp_invalid`);
  }
}

function secondsBetween(startedAt, completedAt, path) {
  assertIso(startedAt, `${path}_started_at`);
  assertIso(completedAt, `${path}_completed_at`);
  const seconds = Math.floor((Date.parse(completedAt) - Date.parse(startedAt)) / 1000);
  if (seconds < 0) throw new Error(`${path}_timestamp_order_invalid`);
  return seconds;
}

function assertParticipant(value, path) {
  exactKeys(value, ["role", "externalIdentity"], path);
  for (const key of ["role", "externalIdentity"]) {
    if (typeof value[key] !== "string" || value[key].trim().length < 3) {
      throw new Error(`${path}_${key}_invalid`);
    }
  }
}

function assertDigest(value, path) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${path}_digest_invalid`);
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim().length < 8) {
    throw new Error(`${path}_invalid`);
  }
}

function forbidRawMaterial(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => forbidRawMaterial(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error(`${path}_contains_forbidden_material`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
    if (FORBIDDEN_KEYS.has(normalizedKey)) {
      throw new Error(`${path}_${key}_forbidden`);
    }
    forbidRawMaterial(entry, `${path}.${key}`);
  }
}

function verifySupportWindow(value) {
  exactKeys(value, ["timezone", "dailyStart", "dailyEnd", "coverage"], "supportWindow");
  if (
    value.timezone !== "Asia/Tehran"
    || value.dailyStart !== "09:00"
    || value.dailyEnd !== "23:00"
    || value.coverage !== "every-day-controlled-launch"
  ) {
    throw new Error("support_window_invalid");
  }
}

function verifyIncidentOwners(value) {
  exactKeys(value, OWNER_KEYS, "incidentOwners");
  for (const key of OWNER_KEYS) {
    assertParticipant(value[key], `incidentOwners_${key}`);
  }
}

function verifyAlertProbe(value, index) {
  exactKeys(value, [
    "probeId",
    "severity",
    "alertType",
    "triggeredAt",
    "deliveredAt",
    "latencySeconds",
    "deliveryChannelDigest",
    "pendingAlertCountAfterProbe",
    "quarantineCountAfterProbe",
    "disposition",
  ], `alertProbes_${index}`);

  assertNonEmptyString(value.probeId, `alertProbes_${index}_probe_id`);
  if (value.severity !== "P0" || value.alertType !== "synthetic-critical-alert") {
    throw new Error(`alertProbes_${index}_identity_invalid`);
  }
  const measuredSeconds = secondsBetween(value.triggeredAt, value.deliveredAt, `alertProbes_${index}`);
  if (
    !Number.isInteger(value.latencySeconds)
    || value.latencySeconds < 0
    || value.latencySeconds > 300
    || measuredSeconds > 300
    || value.latencySeconds > measuredSeconds
  ) {
    throw new Error(`alertProbes_${index}_latency_invalid`);
  }
  assertDigest(value.deliveryChannelDigest, `alertProbes_${index}_delivery_channel`);
  if (value.pendingAlertCountAfterProbe !== 0 || value.quarantineCountAfterProbe !== 0) {
    throw new Error(`alertProbes_${index}_queue_state_invalid`);
  }
  if (value.disposition !== "accepted") {
    throw new Error(`alertProbes_${index}_disposition_invalid`);
  }
}

function verifyAlertQueueState(value) {
  exactKeys(value, ["checkedAt", "pendingAlertCount", "quarantineCount", "queryDigest"], "alertQueueState");
  assertIso(value.checkedAt, "alertQueueState_checked_at");
  if (value.pendingAlertCount !== 0 || value.quarantineCount !== 0) {
    throw new Error("alert_queue_state_invalid");
  }
  assertDigest(value.queryDigest, "alertQueueState_query");
}

function verifyAcknowledgementDrill(value, owners) {
  exactKeys(value, [
    "drillId",
    "severity",
    "declaredAt",
    "supportWindowContext",
    "ackTargetSeconds",
    "incidentCommander",
    "incidentCommanderAcknowledgedAt",
    "incidentCommanderLatencySeconds",
    "sreOwner",
    "sreAcknowledgedAt",
    "sreLatencySeconds",
    "disposition",
  ], "acknowledgementDrill");

  assertNonEmptyString(value.drillId, "acknowledgementDrill_drill_id");
  if (value.severity !== "P0") throw new Error("acknowledgement_drill_severity_invalid");
  if (!["inside-support-window", "outside-support-window"].includes(value.supportWindowContext)) {
    throw new Error("acknowledgement_drill_support_window_invalid");
  }
  const expectedTarget = value.supportWindowContext === "inside-support-window" ? 900 : 3600;
  if (value.ackTargetSeconds !== expectedTarget) {
    throw new Error("acknowledgement_drill_target_invalid");
  }
  const commanderMeasured = secondsBetween(
    value.declaredAt,
    value.incidentCommanderAcknowledgedAt,
    "acknowledgementDrill_incident_commander",
  );
  const sreMeasured = secondsBetween(value.declaredAt, value.sreAcknowledgedAt, "acknowledgementDrill_sre");
  if (
    value.incidentCommander !== owners.incidentCommander.externalIdentity
    || value.sreOwner !== owners.sreOwner.externalIdentity
    || !Number.isInteger(value.incidentCommanderLatencySeconds)
    || !Number.isInteger(value.sreLatencySeconds)
    || value.incidentCommanderLatencySeconds > commanderMeasured
    || value.sreLatencySeconds > sreMeasured
    || commanderMeasured > expectedTarget
    || sreMeasured > expectedTarget
  ) {
    throw new Error("acknowledgement_drill_latency_invalid");
  }
  if (value.disposition !== "accepted") throw new Error("acknowledgement_drill_disposition_invalid");
}

function verifyRunbook(value, key, expected) {
  exactKeys(value, [
    "failureMode",
    "firstResponder",
    "escalationPath",
    "rollbackHaltCondition",
    "userCommunicationOwner",
    "evidenceDigest",
    "disposition",
  ], `runbookCoverage_${key}`);
  if (value.failureMode !== expected) throw new Error(`runbookCoverage_${key}_failure_mode_invalid`);
  for (const field of ["firstResponder", "escalationPath", "rollbackHaltCondition", "userCommunicationOwner"]) {
    assertNonEmptyString(value[field], `runbookCoverage_${key}_${field}`);
  }
  assertDigest(value.evidenceDigest, `runbookCoverage_${key}_evidence`);
  if (value.disposition !== "accepted") throw new Error(`runbookCoverage_${key}_disposition_invalid`);
}

export function verifyIncidentReadinessEvidence(value, expectedSha) {
  forbidRawMaterial(value);
  exactKeys(value, [
    "schemaVersion",
    "authority",
    "evidenceClass",
    "environment",
    "sourceSha",
    "supportWindow",
    "incidentOwners",
    "alertProbes",
    "alertQueueState",
    "acknowledgementDrill",
    "runbookCoverage",
    "operator",
    "reviewer",
    "privacyBoundary",
    "finalDisposition",
  ], "evidence");

  if (
    value.schemaVersion !== 1
    || value.authority !== "tecpey-incident-readiness-v1"
    || value.evidenceClass !== "protected-staging-incident-readiness"
    || value.environment !== "protected-staging"
  ) {
    throw new Error("evidence_identity_invalid");
  }
  if (!COMMIT_SHA.test(value.sourceSha) || value.sourceSha !== expectedSha) {
    throw new Error("evidence_source_sha_invalid");
  }

  verifySupportWindow(value.supportWindow);
  verifyIncidentOwners(value.incidentOwners);

  if (!Array.isArray(value.alertProbes) || value.alertProbes.length !== 2) {
    throw new Error("alert_probes_count_invalid");
  }
  const seenProbeIds = new Set();
  value.alertProbes.forEach((probe, index) => {
    verifyAlertProbe(probe, index);
    if (seenProbeIds.has(probe.probeId)) throw new Error("alert_probe_ids_must_be_unique");
    seenProbeIds.add(probe.probeId);
  });
  verifyAlertQueueState(value.alertQueueState);
  verifyAcknowledgementDrill(value.acknowledgementDrill, value.incidentOwners);

  exactKeys(value.runbookCoverage, Object.keys(RUNBOOK_FAILURE_MODES), "runbookCoverage");
  for (const [key, expected] of Object.entries(RUNBOOK_FAILURE_MODES)) {
    verifyRunbook(value.runbookCoverage[key], key, expected);
  }

  assertParticipant(value.operator, "operator");
  assertParticipant(value.reviewer, "reviewer");
  const forbiddenReviewerMatches = new Set([
    value.operator.externalIdentity,
    value.incidentOwners.incidentCommander.externalIdentity,
    value.incidentOwners.sreOwner.externalIdentity,
  ]);
  if (forbiddenReviewerMatches.has(value.reviewer.externalIdentity)) {
    throw new Error("reviewer_must_be_independent");
  }

  if (
    !Array.isArray(value.privacyBoundary)
    || !value.privacyBoundary.includes("redacted-evidence-only")
    || !value.privacyBoundary.includes("no-secrets-or-connection-urls")
    || !value.privacyBoundary.includes("no-host-ips")
    || !value.privacyBoundary.includes("no-raw-logs")
    || !value.privacyBoundary.includes("no-customer-data")
  ) {
    throw new Error("privacy_boundary_invalid");
  }
  if (value.finalDisposition !== "accepted") throw new Error("final_disposition_invalid");
  return value;
}

async function main() {
  const [file, flag, expectedSha] = process.argv.slice(2);
  if (!file || flag !== "--expected-sha" || !COMMIT_SHA.test(expectedSha ?? "")) {
    throw new Error("usage: verify-incident-readiness-evidence.mjs <file> --expected-sha <sha>");
  }
  const value = JSON.parse(await readFile(file, "utf8"));
  verifyIncidentReadinessEvidence(value, expectedSha);
  process.stdout.write(`Incident readiness evidence verified for ${expectedSha}.\n`);
}

if (process.argv[1]?.endsWith("verify-incident-readiness-evidence.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
