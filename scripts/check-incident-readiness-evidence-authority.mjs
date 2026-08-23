import { readFile } from "node:fs/promises";

const REQUEST_PATH = "docs/launch/generated/incident-readiness-evidence-request-20260812.json";
const PROTECTED_STAGING_BLOCKERS = ["NOG-01", "NOG-02"];
const REQUIRED_OPEN_BLOCKERS = ["NOG-07", "NOG-08", "NOG-09"];
const REQUIRED_RUNBOOK_MODES = [
  "Database",
  "Redis",
  "Migration",
  "Alert delivery",
  "Provider",
  "Worker",
  "Reconciliation",
];

const files = {
  request: REQUEST_PATH,
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  contract: "docs/operations/INCIDENT_READINESS_CONTRACT.md",
  operationsRunbook: "docs/OPERATIONS_RUNBOOK.md",
  verifier: "scripts/verify-incident-readiness-evidence.mjs",
  verifierTest: "scripts/incident-readiness-evidence.test.mjs",
  packageJson: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])),
);

const request = JSON.parse(source.request);
const register = JSON.parse(source.register);
const candidate = JSON.parse(source.candidate);
const packageJson = JSON.parse(source.packageJson);
const failures = [];

function normalized(value) {
  return String(value).replace(/\s+/g, " ");
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireArrayIncludes(label, values, expected) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    failures.push(`${label} must include ${expected}`);
  }
}

function requireArrayNotIncludes(label, values, forbidden) {
  if (!Array.isArray(values) || values.includes(forbidden)) {
    failures.push(`${label} must not include ${forbidden}`);
  }
}

function requireText(label, text, token) {
  if (!normalized(text).includes(normalized(token))) {
    failures.push(`${label} is missing ${token}`);
  }
}

function rejectText(label, text, token) {
  if (normalized(text).includes(normalized(token))) {
    failures.push(`${label} contains forbidden claim ${token}`);
  }
}

requireEqual("request.schemaVersion", request.schemaVersion, 1);
requireEqual("request.evidenceClass", request.evidenceClass, "incident-readiness-evidence-request");
requireEqual("request.decision", request.decision, "NO_GO_NOG_07_INCIDENT_READINESS_EVIDENCE_REQUIRED");
requireEqual("request.executionState", request.executionState, "blocked_pending_protected_staging_incident_drill");
requireEqual("request.selectedSha", request.selectedSha, candidate.currentCandidate?.sha);
requireEqual("request.blocker", request.blocker, "NOG-07");
requireEqual("request.status", request.status, "open");
requireEqual("request.requiredEnvironment", request.requiredEnvironment, "protected-staging");
requireEqual("request.verifier", request.verifier, "scripts/verify-incident-readiness-evidence.mjs");
requireEqual("request.requiredArtifact.authority", request.requiredArtifact?.authority, "tecpey-incident-readiness-v1");
requireEqual("request.requiredArtifact.evidenceClass", request.requiredArtifact?.evidenceClass, "protected-staging-incident-readiness");
requireEqual("request.requiredArtifact.sourceSha", request.requiredArtifact?.sourceSha, candidate.currentCandidate?.sha);
requireEqual("request.requiredArtifact.alertProbes.requiredCount", request.requiredArtifact?.alertProbes?.requiredCount, 2);
requireEqual(
  "request.requiredArtifact.alertProbes.maximumLatencySeconds",
  request.requiredArtifact?.alertProbes?.maximumLatencySeconds,
  300,
);
requireEqual("request.requiredArtifact.alertQueueState.pendingAlertCount", request.requiredArtifact?.alertQueueState?.pendingAlertCount, 0);
requireEqual("request.requiredArtifact.alertQueueState.quarantineCount", request.requiredArtifact?.alertQueueState?.quarantineCount, 0);
requireEqual(
  "request.requiredArtifact.acknowledgementDrill.insideSupportWindowTargetSeconds",
  request.requiredArtifact?.acknowledgementDrill?.insideSupportWindowTargetSeconds,
  900,
);
requireEqual(
  "request.requiredArtifact.acknowledgementDrill.outsideSupportWindowTargetSeconds",
  request.requiredArtifact?.acknowledgementDrill?.outsideSupportWindowTargetSeconds,
  3600,
);

for (const blocker of [...PROTECTED_STAGING_BLOCKERS, ...REQUIRED_OPEN_BLOCKERS]) {
  requireArrayIncludes("request.notAcceptedForBlockers", request.notAcceptedForBlockers, blocker);
}

const protectedStagingStatuses = PROTECTED_STAGING_BLOCKERS.map(
  (blocker) => register.blockers?.find((entry) => entry.id === blocker)?.status,
);
const protectedStagingOpen = protectedStagingStatuses.every((status) => status === "open");
const protectedStagingAccepted = protectedStagingStatuses.every((status) => status === "accepted");
if (!protectedStagingOpen && !protectedStagingAccepted) {
  failures.push(
    `NOG-01/NOG-02 statuses must transition atomically as both open or both accepted, got ${JSON.stringify(
      protectedStagingStatuses,
    )}`,
  );
}

for (const blocker of REQUIRED_OPEN_BLOCKERS) {
  const registerBlocker = register.blockers?.find((entry) => entry.id === blocker);
  requireEqual(`${blocker}.status`, registerBlocker?.status, "open");
}
requireArrayNotIncludes(
  "register.acceptedEvidence",
  register.acceptedEvidence?.map((entry) => entry.id),
  "NOG-07",
);
requireArrayNotIncludes(
  "candidate.acceptedEvidence",
  candidate.acceptedEvidence?.map((entry) => entry.id),
  "NOG-07",
);

const nog07 = register.blockers?.find((entry) => entry.id === "NOG-07");
requireEqual("NOG-07.executionState", nog07?.executionState, "blocked_pending_protected_staging_incident_drill");
requireEqual("NOG-07.executionRequest", nog07?.executionRequest, REQUEST_PATH);
requireEqual("NOG-07.verifier", nog07?.verifier, "scripts/verify-incident-readiness-evidence.mjs");
for (const prerequisite of ["NOG-01", "NOG-02"]) {
  requireArrayIncludes("NOG-07.prerequisiteBlockers", nog07?.prerequisiteBlockers, prerequisite);
  requireArrayIncludes("request.prerequisiteBlockers", request.prerequisiteBlockers, prerequisite);
}

for (const mode of REQUIRED_RUNBOOK_MODES) {
  requireArrayIncludes("request.requiredArtifact.runbookCoverage", request.requiredArtifact?.runbookCoverage, mode);
  requireText("contract", source.contract, mode);
  requireText("operations runbook", source.operationsRunbook, `Incident: ${mode}`);
}

for (const [name, command] of [
  ["launch:incident-readiness-evidence:check", "node scripts/check-incident-readiness-evidence-authority.mjs"],
  ["ops:incident-readiness:evidence:verify", "node scripts/verify-incident-readiness-evidence.mjs"],
  ["test:incident-readiness-evidence", "node --test scripts/incident-readiness-evidence.test.mjs"],
]) {
  requireEqual(`package ${name}`, packageJson.scripts?.[name], command);
  const guard = request.guardCommands?.find((entry) => entry.name === name);
  requireEqual(`request guard ${name}`, guard?.command.startsWith(command), true);
}

if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run launch:incident-readiness-evidence:check")) {
  failures.push("package.json: launch:decision:check must enforce incident readiness evidence authority");
}
if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run test:incident-readiness-evidence")) {
  failures.push("package.json: launch:decision:check must run incident readiness verifier tests");
}

for (const invariant of [
  REQUEST_PATH,
  "scripts/verify-incident-readiness-evidence.mjs",
  "tecpey-incident-readiness-v1",
  "protected-staging-incident-readiness",
  "alertProbes",
  "acknowledgementDrill",
  "runbookCoverage",
  "reviewer must differ from operator, incidentCommander and sreOwner",
  "NOG-07 is not accepted by this request",
]) {
  requireText("request", source.request, invariant);
}

for (const invariant of [
  "verifyIncidentReadinessEvidence",
  "tecpey-incident-readiness-v1",
  "protected-staging-incident-readiness",
  "RUNBOOK_FAILURE_MODES",
  "synthetic-critical-alert",
  "pendingAlertCountAfterProbe",
  "quarantineCountAfterProbe",
  "inside-support-window",
  "outside-support-window",
  "reviewer_must_be_independent",
  "no-secrets-or-connection-urls",
  "no-host-ips",
]) {
  requireText("verifier", source.verifier, invariant);
}

for (const invariant of [
  "accepts protected staging incident readiness evidence",
  "rejects missing critical alert probes",
  "rejects slow alert delivery",
  "rejects P0 acknowledgement misses",
  "rejects missing runbook coverage",
]) {
  requireText("verifier test", source.verifierTest, invariant);
}

for (const invariant of [
  "Machine-readable evidence artifact",
  "npm run ops:incident-readiness:evidence:verify",
  "tecpey-incident-readiness-v1",
  "two protected-staging P0 synthetic probes",
  "DB, Redis, migration, alert-delivery, provider, worker and reconciliation",
  "NOG-07 remains open",
]) {
  requireText("contract", source.contract, invariant);
}

for (const invariant of [
  "Incident readiness evidence request",
  "NOG-07 remains open",
  "scripts/verify-incident-readiness-evidence.mjs",
]) {
  requireText("packet", source.packet, invariant);
}

for (const invariant of [
  "Incident readiness",
  "docs/launch/generated/incident-readiness-evidence-request-20260812.json",
  "scripts/verify-incident-readiness-evidence.mjs",
]) {
  requireText("candidate ledger", source.candidateHuman, invariant);
  requireText("checklist", source.checklist, invariant);
}

for (const invariant of [
  "incidentReadinessEvidenceRequest",
  REQUEST_PATH,
  "scripts/verify-incident-readiness-evidence.mjs",
]) {
  requireText("candidate json", source.candidate, invariant);
}

for (const forbidden of [
  "NOG-07 accepted",
  "GO_APPROVED",
  "Status:** GO",
  "24/7 production support is ready",
  "real-money operational readiness is approved",
]) {
  rejectText("request", source.request, forbidden);
  rejectText("packet", source.packet, forbidden);
  rejectText("checklist", source.checklist, forbidden);
}

const serializedRequest = JSON.stringify(request);
for (const forbidden of [
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
]) {
  if (forbidden.test(serializedRequest)) {
    failures.push(`${REQUEST_PATH}: request must not contain secrets, connection strings or host identifiers`);
  }
}

if (failures.length > 0) {
  console.error("Incident readiness evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Incident readiness evidence authority passed: NOG-07 remains open until protected staging alert probes, queue state, P0 acknowledgement and runbook coverage pass the machine verifier.",
);
