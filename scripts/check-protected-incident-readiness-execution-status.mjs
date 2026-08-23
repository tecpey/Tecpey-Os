import { readFile } from "node:fs/promises";

const STATUS_PATH =
  "docs/launch/generated/protected-incident-readiness-execution-status-20260823.json";
const REMAINING_OPEN_BLOCKERS = ["NOG-08", "NOG-09"];
const REQUIRED_RUNBOOKS = [
  "database",
  "redis",
  "migration",
  "alertDelivery",
  "provider",
  "worker",
  "reconciliation",
];

const files = {
  status: STATUS_PATH,
  request: "docs/launch/generated/incident-readiness-evidence-request-20260812.json",
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  verifier: "scripts/verify-incident-readiness-evidence.mjs",
  packageJson: "package.json",
  workflow: ".github/workflows/ci.yml",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const status = JSON.parse(source.status);
const request = JSON.parse(source.request);
const register = JSON.parse(source.register);
const candidate = JSON.parse(source.candidate);
const packageJson = JSON.parse(source.packageJson);
const failures = [];
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const sha256Pattern = /^sha256:[0-9a-f]{64}$/;
const governedRunPattern =
  /^https:\/\/github\.com\/tecpey\/Tecpey-Os\/actions\/runs\/[1-9][0-9]*$/;

function normalized(value) {
  return String(value).replace(/\s+/g, " ");
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requirePattern(label, value, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    failures.push(`${label}: invalid value ${JSON.stringify(value)}`);
  }
}

function requireArrayExact(label, actual, expected) {
  if (!Array.isArray(actual)) {
    failures.push(`${label}: expected array`);
    return;
  }
  const actualSet = new Set(actual);
  if (
    actual.length !== expected.length ||
    actualSet.size !== actual.length ||
    expected.some((entry) => !actualSet.has(entry))
  ) {
    failures.push(`${label}: expected exactly ${expected.join(", ")}`);
  }
}

function requireText(label, text, token) {
  if (!normalized(text).includes(normalized(token))) {
    failures.push(`${label}: missing ${token}`);
  }
}

requireEqual("status.schemaVersion", status.schemaVersion, 1);
requireEqual(
  "status.evidenceClass",
  status.evidenceClass,
  "protected-incident-readiness-execution-status-observation",
);
requireEqual(
  "status.decision",
  status.decision,
  "NO_GO_NOG_07_ACCEPTED_REMAINING_BLOCKERS_OPEN",
);
requireArrayExact("status.relatedBlockers", status.relatedBlockers, ["NOG-07"]);
requirePattern("status.releaseLineage.currentMainSha", status.releaseLineage?.currentMainSha, shaPattern);
requireEqual(
  "status.releaseLineage.currentMainSha",
  status.releaseLineage?.currentMainSha,
  status.releaseLineage?.workflowDefinitionHeadSha,
);
requireEqual(
  "status.releaseLineage.protectedStagingEvidenceTargetSha",
  status.releaseLineage?.protectedStagingEvidenceTargetSha,
  candidate.currentCandidate?.sha,
);
requireEqual("status.releaseLineage.runtimeCandidatePreserved", status.releaseLineage?.runtimeCandidatePreserved, true);

requireEqual("status.workflow.name", status.workflow?.name, "Protected Staging Incident Readiness Evidence");
requireEqual(
  "status.workflow.path",
  status.workflow?.path,
  ".github/workflows/protected-staging-incident-readiness-evidence.yml",
);
requireEqual("status.workflow.event", status.workflow?.event, "workflow_dispatch");
requireEqual("status.workflow.githubEnvironment", status.workflow?.githubEnvironment, "staging");
requireEqual("status.workflow.evidenceEnvironment", status.workflow?.evidenceEnvironment, "protected-staging");
requireEqual("status.workflow.runId", status.workflow?.runId, 32663989309);
requirePattern("status.workflow.runUrl", status.workflow?.runUrl, governedRunPattern);
requireEqual("status.workflow.jobId", status.workflow?.jobId, 97254429079);
requireEqual("status.workflow.runConclusion", status.workflow?.runConclusion, "success");
requireEqual("status.workflow.selectedReleaseSha", status.workflow?.selectedReleaseSha, candidate.currentCandidate?.sha);
requireEqual("status.workflow.operator", status.workflow?.operator, "github:tecpey");
requireEqual("status.workflow.incidentCommander", status.workflow?.incidentCommander, "github:tecpey");
requireEqual("status.workflow.sreOwner", status.workflow?.sreOwner, "github:tecpey");
requireEqual("status.workflow.independentReviewer", status.workflow?.independentReviewer, "github:xrayman6zfm-ux");
if (status.workflow?.operator === status.workflow?.independentReviewer) {
  failures.push("status.workflow.independentReviewer: reviewer must differ from operator");
}
requireEqual("status.workflow.independentReviewConfirmed", status.workflow?.independentReviewConfirmed, true);
requireEqual("status.workflow.acknowledgementsConfirmed", status.workflow?.acknowledgementsConfirmed, true);

requireEqual("status.artifact.id", status.artifact?.id, 9500016153);
requireEqual(
  "status.artifact.name",
  status.artifact?.name,
  `protected-staging-incident-readiness-${candidate.currentCandidate?.sha}`,
);
requireEqual(
  "status.artifact.zipDigest",
  status.artifact?.zipDigest,
  "sha256:e9bf68a588571fcf8cf91b22ff8fbf1fe92734cced0321e286ad27921591a8a5",
);
requireEqual(
  "status.artifact.evidenceFileDigest",
  status.artifact?.evidenceFileDigest,
  "sha256:e5f0682f3c9ad88b12241136c6f3b24ec01f44b1c4ca4edd4e181e30306ea1c0",
);
requirePattern("status.artifact.zipDigest", status.artifact?.zipDigest, sha256Pattern);
requirePattern("status.artifact.evidenceFileDigest", status.artifact?.evidenceFileDigest, sha256Pattern);
requireEqual("status.artifact.detachedDigestDisposition", status.artifact?.detachedDigestDisposition, "verified");
requireEqual("status.artifact.offlineVerifierDisposition", status.artifact?.offlineVerifierDisposition, "passed");
requireEqual("status.artifact.contentDisposition", status.artifact?.contentDisposition, "json_and_sha256sums_only");
requireEqual(
  "status.artifact.disposition",
  status.artifact?.disposition,
  "accepted_exact_candidate_artifact_and_detached_digest",
);

requireEqual("status.incidentReadiness.authority", status.incidentReadiness?.authority, "tecpey-incident-readiness-v1");
requireEqual(
  "status.incidentReadiness.evidenceClass",
  status.incidentReadiness?.evidenceClass,
  "protected-staging-incident-readiness",
);
requireEqual("status.incidentReadiness.sourceSha", status.incidentReadiness?.sourceSha, candidate.currentCandidate?.sha);
requireEqual("status.incidentReadiness.supportWindow.timezone", status.incidentReadiness?.supportWindow?.timezone, "Asia/Tehran");
requireEqual("status.incidentReadiness.supportWindow.dailyStart", status.incidentReadiness?.supportWindow?.dailyStart, "09:00");
requireEqual("status.incidentReadiness.supportWindow.dailyEnd", status.incidentReadiness?.supportWindow?.dailyEnd, "23:00");
requireEqual("status.incidentReadiness.alertProbeCount", status.incidentReadiness?.alertProbeCount, 2);
requireEqual("status.incidentReadiness.maximumAllowedLatencySeconds", status.incidentReadiness?.maximumAllowedLatencySeconds, 300);
requireEqual("status.incidentReadiness.observedMaximumLatencySeconds", status.incidentReadiness?.observedMaximumLatencySeconds, 1);
requirePattern("status.incidentReadiness.deliveryChannelDigest", status.incidentReadiness?.deliveryChannelDigest, digestPattern);

const probes = status.incidentReadiness?.alertProbes;
requireEqual("status.incidentReadiness.alertProbes.length", probes?.length, 2);
for (const [index, expectedLatency] of [1, 0].entries()) {
  const probe = probes?.[index];
  requireEqual(`status.incidentReadiness.alertProbes[${index}].latencySeconds`, probe?.latencySeconds, expectedLatency);
  requireEqual(`status.incidentReadiness.alertProbes[${index}].pendingAlertCountAfterProbe`, probe?.pendingAlertCountAfterProbe, 0);
  requireEqual(`status.incidentReadiness.alertProbes[${index}].quarantineCountAfterProbe`, probe?.quarantineCountAfterProbe, 0);
  requireEqual(`status.incidentReadiness.alertProbes[${index}].disposition`, probe?.disposition, "accepted");
}
requireEqual("status.incidentReadiness.alertQueueState.pendingAlertCount", status.incidentReadiness?.alertQueueState?.pendingAlertCount, 0);
requireEqual("status.incidentReadiness.alertQueueState.quarantineCount", status.incidentReadiness?.alertQueueState?.quarantineCount, 0);
requirePattern("status.incidentReadiness.alertQueueState.queryDigest", status.incidentReadiness?.alertQueueState?.queryDigest, digestPattern);

const drill = status.incidentReadiness?.acknowledgementDrill;
requireEqual("status.incidentReadiness.acknowledgementDrill.severity", drill?.severity, "P0");
requireEqual("status.incidentReadiness.acknowledgementDrill.supportWindowContext", drill?.supportWindowContext, "outside-support-window");
requireEqual("status.incidentReadiness.acknowledgementDrill.ackTargetSeconds", drill?.ackTargetSeconds, 3600);
requireEqual("status.incidentReadiness.acknowledgementDrill.incidentCommander", drill?.incidentCommander, "github:tecpey");
requireEqual("status.incidentReadiness.acknowledgementDrill.incidentCommanderLatencySeconds", drill?.incidentCommanderLatencySeconds, 0);
requireEqual("status.incidentReadiness.acknowledgementDrill.sreOwner", drill?.sreOwner, "github:tecpey");
requireEqual("status.incidentReadiness.acknowledgementDrill.sreLatencySeconds", drill?.sreLatencySeconds, 0);
requireEqual("status.incidentReadiness.acknowledgementDrill.disposition", drill?.disposition, "accepted");

requireArrayExact(
  "status.incidentReadiness.runbookCoverage",
  Object.keys(status.incidentReadiness?.runbookCoverage ?? {}),
  REQUIRED_RUNBOOKS,
);
for (const runbook of REQUIRED_RUNBOOKS) {
  requirePattern(
    `status.incidentReadiness.runbookCoverage.${runbook}`,
    status.incidentReadiness?.runbookCoverage?.[runbook],
    digestPattern,
  );
}
requireEqual("status.incidentReadiness.finalDisposition", status.incidentReadiness?.finalDisposition, "accepted");

for (const [field, expected] of Object.entries({
  redactedEvidenceOnly: true,
  rawSecretsRecorded: false,
  connectionUrlsRecorded: false,
  hostIdentifiersRecorded: false,
  rawLogsRecorded: false,
  customerDataRecorded: false,
})) {
  requireEqual(`status.privacyBoundary.${field}`, status.privacyBoundary?.[field], expected);
}

requireEqual("request.selectedSha", request.selectedSha, candidate.currentCandidate?.sha);
requireEqual("request.blocker", request.blocker, "NOG-07");
requireEqual("request.requiredArtifact.finalDisposition", request.requiredArtifact?.finalDisposition, "accepted");

const nog07 = register.blockers?.find((entry) => entry.id === "NOG-07");
requireEqual("register.NOG-07.status", nog07?.status, "accepted");
requireEqual("register.NOG-07.evidence", nog07?.evidence, STATUS_PATH);
requireEqual("register.NOG-07.selectedSha", nog07?.selectedSha, candidate.currentCandidate?.sha);
requireEqual("register.NOG-07.workflowRunUrl", nog07?.workflowRunUrl, status.workflow?.runUrl);
requireEqual("register.NOG-07.artifactDigest", nog07?.artifactDigest, status.artifact?.zipDigest);

for (const [label, entries] of [
  ["register.acceptedEvidence", register.acceptedEvidence],
  ["candidate.acceptedEvidence", candidate.acceptedEvidence],
]) {
  const accepted = entries?.find((entry) => entry.id === "NOG-07");
  requireEqual(`${label}.NOG-07.status`, accepted?.status, "accepted");
  requireEqual(`${label}.NOG-07.evidence`, accepted?.evidence, STATUS_PATH);
  requireEqual(`${label}.NOG-07.selectedSha`, accepted?.selectedSha, candidate.currentCandidate?.sha);
  requireEqual(`${label}.NOG-07.artifactDigest`, accepted?.artifactDigest, status.artifact?.zipDigest);
}

const executionRequest = register.executionRequests?.find(
  (entry) => Array.isArray(entry.ids) && entry.ids.length === 1 && entry.ids[0] === "NOG-07",
);
requireEqual(
  "register.NOG-07.executionRequest.status",
  executionRequest?.status,
  "accepted_exact_candidate_protected_incident_readiness",
);
requireEqual("register.NOG-07.executionRequest.evidence", executionRequest?.evidence, STATUS_PATH);
requireArrayExact("register.remainingOpenBlockers", register.remainingOpenBlockers, REMAINING_OPEN_BLOCKERS);
requireArrayExact(
  "register.openBlockerTrackingIssues",
  Object.keys(register.openBlockerTrackingIssues ?? {}),
  REMAINING_OPEN_BLOCKERS,
);

for (const [name, command] of [
  [
    "launch:incident-readiness-evidence:check",
    "node scripts/check-protected-incident-readiness-execution-status.mjs",
  ],
  ["ops:incident-readiness:evidence:verify", "node scripts/verify-incident-readiness-evidence.mjs"],
]) {
  requireEqual(`package ${name}`, packageJson.scripts?.[name], command);
}
if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run launch:incident-readiness-evidence:check")) {
  failures.push("package.json: launch:decision:check must enforce NOG-07 accepted evidence authority");
}

for (const invariant of [
  "NOG-07 is accepted",
  "32663989309",
  "sha256:e9bf68a588571fcf8cf91b22ff8fbf1fe92734cced0321e286ad27921591a8a5",
  STATUS_PATH,
  "NOG-08 and NOG-09 remain open",
]) {
  requireText("packet", source.packet, invariant);
}
for (const invariant of ["Accepted for NOG-07", "32663989309", STATUS_PATH]) {
  requireText("checklist", source.checklist, invariant);
}
for (const invariant of ["Protected incident readiness evidence", STATUS_PATH, "Accepted for NOG-07"]) {
  requireText("candidate ledger", source.candidateHuman, invariant);
}
for (const invariant of [
  "Protected incident readiness evidence authority guard",
  "npm run launch:incident-readiness-evidence:check",
]) {
  requireText("workflow", source.workflow, invariant);
}
requireText("verifier", source.verifier, "verifyIncidentReadinessEvidence");

const serializedStatus = JSON.stringify(status);
for (const forbidden of [
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
]) {
  if (forbidden.test(serializedStatus)) {
    failures.push(`${STATUS_PATH}: status must not contain secrets, connection strings or host identifiers`);
  }
}

if (failures.length > 0) {
  console.error("Protected incident readiness execution status failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Protected incident readiness execution status passed for ${candidate.currentCandidate.sha}; NOG-07 is accepted and controlled launch remains NO-GO on NOG-08/NOG-09.`,
);
