import { readFile } from "node:fs/promises";

const STATUS_PATH =
  "docs/launch/generated/protected-recovery-reconciliation-execution-status-20260823.json";
const HISTORICAL_CANDIDATE_SHA = "79c48a16cb685a88315a44e103b3758cf7845d65";
const REMAINING_OPEN_BLOCKERS = [
  "NOG-01",
  "NOG-02",
  "NOG-05",
  "NOG-07",
  "NOG-08",
  "NOG-09",
];
const REQUIRED_DOMAINS = {
  academy: { tablesCovered: 5, records: 0 },
  tradingArena: { tablesCovered: 6, records: 0 },
  mentorAi: { tablesCovered: 5, records: 0 },
  exchangeLedger: {
    tablesCovered: 8,
    records: 0,
    financialChecks: 5,
    financialDivergences: 0,
  },
  notificationsOperationalJobs: { tablesCovered: 10, records: 55 },
  tenantPrincipalIsolation: {
    tablesCovered: 52,
    records: 1,
    tenantRegistryTables: 52,
    orphanTenantRows: 0,
    orphanWorkspaceRows: 0,
    principalBindingMismatches: 0,
  },
};

const files = {
  status: STATUS_PATH,
  request: "docs/launch/generated/recovery-reconciliation-evidence-request-20260812.json",
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  verifier: "scripts/verify-protected-recovery-reconciliation-evidence.mjs",
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
  "protected-recovery-reconciliation-execution-status-observation",
);
requireEqual(
  "status.decision",
  status.decision,
  "NO_GO_NOG_05_ACCEPTED_REMAINING_BLOCKERS_OPEN",
);
requirePattern(
  "status.releaseLineage.currentMainSha",
  status.releaseLineage?.currentMainSha,
  shaPattern,
);
requireEqual(
  "status.releaseLineage.currentMainSha",
  status.releaseLineage?.currentMainSha,
  status.releaseLineage?.workflowDefinitionHeadSha,
);
requireEqual(
  "status.releaseLineage.protectedStagingEvidenceTargetSha",
  status.releaseLineage?.protectedStagingEvidenceTargetSha,
  HISTORICAL_CANDIDATE_SHA,
);
requireEqual("status.releaseLineage.runtimeCandidatePreserved", status.releaseLineage?.runtimeCandidatePreserved, true);

requireEqual("status.workflow.name", status.workflow?.name, "Protected Staging Recovery Reconciliation Evidence");
requireEqual(
  "status.workflow.path",
  status.workflow?.path,
  ".github/workflows/protected-staging-recovery-reconciliation-evidence.yml",
);
requireEqual("status.workflow.event", status.workflow?.event, "workflow_dispatch");
requireEqual("status.workflow.githubEnvironment", status.workflow?.githubEnvironment, "staging");
requireEqual("status.workflow.evidenceEnvironment", status.workflow?.evidenceEnvironment, "protected-staging");
requireEqual("status.workflow.runId", status.workflow?.runId, 32659459702);
requirePattern("status.workflow.runUrl", status.workflow?.runUrl, governedRunPattern);
requireEqual("status.workflow.jobId", status.workflow?.jobId, 97243296235);
requireEqual("status.workflow.runConclusion", status.workflow?.runConclusion, "success");
requireEqual(
  "status.workflow.selectedReleaseSha",
  status.workflow?.selectedReleaseSha,
  HISTORICAL_CANDIDATE_SHA,
);
requireEqual("status.workflow.operator", status.workflow?.operator, "github:tecpey");
requireEqual(
  "status.workflow.independentReviewer",
  status.workflow?.independentReviewer,
  "github:xrayman6zfm-ux",
);
if (status.workflow?.operator === status.workflow?.independentReviewer) {
  failures.push("status.workflow.independentReviewer: reviewer must differ from operator");
}
requireEqual(
  "status.workflow.independentReviewConfirmed",
  status.workflow?.independentReviewConfirmed,
  true,
);

requireEqual("status.artifact.id", status.artifact?.id, 9498352217);
requireEqual(
  "status.artifact.name",
  status.artifact?.name,
  `protected-staging-recovery-reconciliation-${HISTORICAL_CANDIDATE_SHA}`,
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

requireEqual("status.recovery.authority", status.recovery?.authority, "tecpey-protected-recovery-reconciliation-v1");
requireEqual(
  "status.recovery.evidenceClass",
  status.recovery?.evidenceClass,
  "protected-staging-domain-recovery-reconciliation",
);
requireEqual("status.recovery.sourceSha", status.recovery?.sourceSha, HISTORICAL_CANDIDATE_SHA);
requirePattern("status.recovery.imageDigest", status.recovery?.imageDigest, sha256Pattern);
requirePattern("status.recovery.migrationPlanHash", `sha256:${status.recovery?.migrationPlanHash}`, sha256Pattern);
requirePattern("status.recovery.backupDigest", status.recovery?.backupDigest, sha256Pattern);
requireEqual("status.recovery.measuredRtoSeconds", status.recovery?.measuredRtoSeconds, 5);
requireEqual("status.recovery.maximumRtoSeconds", status.recovery?.maximumRtoSeconds, 900);
requireEqual("status.recovery.rtoDisposition", status.recovery?.rtoDisposition, "passed");
requireEqual("status.recovery.finalDisposition", status.recovery?.finalDisposition, "accepted");

for (const [domain, expected] of Object.entries(REQUIRED_DOMAINS)) {
  const observed = status.domainReconciliation?.[domain];
  requireEqual(`status.domainReconciliation.${domain}.disposition`, observed?.disposition, "accepted");
  for (const [field, value] of Object.entries(expected)) {
    requireEqual(`status.domainReconciliation.${domain}.${field}`, observed?.[field], value);
  }
}

for (const [field, expected] of Object.entries({
  countsAndHashesOnly: true,
  rawRowsRecorded: false,
  rawSecretsRecorded: false,
  connectionUrlsRecorded: false,
  hostIdentifiersRecorded: false,
  rawLogsRecorded: false,
})) {
  requireEqual(`status.privacyBoundary.${field}`, status.privacyBoundary?.[field], expected);
}

requireEqual("request.selectedSha", request.selectedSha, candidate.currentCandidate?.sha);
requireEqual("request.relatedBlockers", request.relatedBlockers?.includes("NOG-05"), true);
requireEqual(
  "request.decision",
  request.decision,
  "NO_GO_RECOVERY_RECONCILIATION_EVIDENCE_MISSING",
);
requireEqual(
  "request.status",
  request.status,
  "blocked_pending_protected_staging_restore_and_domain_reconciliation",
);
requireEqual("request.requiredEvidenceShape.finalDisposition", request.requiredEvidenceShape?.finalDisposition, "accepted");

const nog05 = register.blockers?.find((entry) => entry.id === "NOG-05");
requireEqual("register.NOG-05.status", nog05?.status, "open");
requireEqual(
  "register.NOG-05.executionState",
  nog05?.executionState,
  "blocked_pending_protected_staging_restore_and_domain_reconciliation",
);
if (nog05?.evidence || nog05?.selectedSha || nog05?.workflowRunUrl || nog05?.artifactDigest) {
  failures.push("register.NOG-05: open blocker must not claim current-candidate accepted evidence");
}

for (const [label, entries] of [
  ["register.acceptedEvidence", register.acceptedEvidence],
  ["candidate.acceptedEvidence", candidate.acceptedEvidence],
]) {
  const accepted = entries?.find((entry) => entry.id === "NOG-05");
  if (accepted) {
    failures.push(`${label}.NOG-05: historical evidence must not appear as active accepted evidence`);
  }
}

const executionRequest = register.executionRequests?.find(
  (entry) => Array.isArray(entry.ids) && entry.ids.length === 1 && entry.ids[0] === "NOG-05",
);
requireEqual(
  "register.NOG-05.executionRequest.status",
  executionRequest?.status,
  "blocked_pending_protected_staging_restore_and_domain_reconciliation",
);
requireEqual(
  "register.NOG-05.executionRequest.selectedSha",
  executionRequest?.selectedSha,
  candidate.currentCandidate?.sha,
);
requireEqual(
  "register.NOG-05.executionRequest.machineReadableRequest",
  executionRequest?.machineReadableRequest,
  files.request,
);
requireEqual(
  "register.NOG-05.executionRequest.historicalExecutionStatusObservation",
  executionRequest?.historicalExecutionStatusObservation,
  STATUS_PATH,
);
requireEqual(
  "register.historicalAcceptedEvidence.priorCandidateSha",
  register.historicalAcceptedEvidence?.priorCandidateSha,
  HISTORICAL_CANDIDATE_SHA,
);
requireEqual(
  "register.historicalAcceptedEvidence.recoveryReconciliation",
  register.historicalAcceptedEvidence?.recoveryReconciliation,
  STATUS_PATH,
);
requireArrayExact("register.remainingOpenBlockers", register.remainingOpenBlockers, REMAINING_OPEN_BLOCKERS);
requireArrayExact(
  "register.openBlockerTrackingIssues",
  Object.keys(register.openBlockerTrackingIssues ?? {}),
  REMAINING_OPEN_BLOCKERS,
);

for (const [name, command] of [
  [
    "launch:recovery-reconciliation-evidence:check",
    "node scripts/check-protected-recovery-reconciliation-execution-status.mjs",
  ],
  [
    "ops:recovery:protected-evidence:verify",
    "node scripts/verify-protected-recovery-reconciliation-evidence.mjs",
  ],
]) {
  requireEqual(`package ${name}`, packageJson.scripts?.[name], command);
}
if (
  !packageJson.scripts?.["launch:decision:check"]?.includes(
    "npm run launch:recovery-reconciliation-evidence:check",
  )
) {
    failures.push("package.json: launch:decision:check must enforce the NOG-05 evidence boundary");
  }

for (const invariant of [
  "NOG-05 remains open",
  HISTORICAL_CANDIDATE_SHA,
]) {
  requireText("packet", source.packet, invariant);
}
for (const invariant of [
  "NO-GO until restore and reconciliation evidence is accepted",
]) {
  requireText("checklist", source.checklist, invariant);
}
for (const invariant of [
  "protected staging recovery reconciliation remains required for NOG-05",
  HISTORICAL_CANDIDATE_SHA,
]) {
  requireText("candidate ledger", source.candidateHuman, invariant);
}
for (const invariant of [
  "Protected recovery reconciliation evidence authority guard",
  "npm run launch:recovery-reconciliation-evidence:check",
]) {
  requireText("workflow", source.workflow, invariant);
}
requireText("verifier", source.verifier, "verifyProtectedRecoveryReconciliationEvidence");

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
  console.error("Protected recovery reconciliation execution status failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Historical protected recovery evidence passed for ${HISTORICAL_CANDIDATE_SHA}; NOG-05 remains open for current candidate ${candidate.currentCandidate.sha}.`,
);
