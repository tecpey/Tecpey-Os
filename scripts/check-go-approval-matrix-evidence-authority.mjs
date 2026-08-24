import { readFile } from "node:fs/promises";

const REQUEST_PATH = "docs/launch/generated/go-approval-matrix-evidence-request-20260812.json";
const PROTECTED_STAGING_BLOCKERS = ["NOG-01", "NOG-02"];
const REQUIRED_OPEN_BLOCKERS = ["NOG-09"];
const REQUIRED_PREREQUISITE_BLOCKERS = [
  "NOG-01",
  "NOG-02",
  "NOG-03",
  "NOG-04",
  "NOG-05",
  "NOG-06",
  "NOG-07",
  "NOG-08",
  "NOG-10",
  "NOG-11",
  "NOG-12",
];
const REQUIRED_APPROVAL_ROLES = [
  "CEO",
  "CTO or Chief Architect",
  "Security",
  "Product",
  "Compliance",
  "SRE",
  "QA",
];

const files = {
  request: REQUEST_PATH,
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  verifier: "scripts/verify-go-approval-matrix-evidence.mjs",
  verifierTest: "scripts/go-approval-matrix-evidence.test.mjs",
  packageJson: "package.json",
  workflow: ".github/workflows/ci.yml",
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
  if (actual !== expected) failures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function requireArrayIncludes(label, values, expected) {
  if (!Array.isArray(values) || !values.includes(expected)) failures.push(`${label} must include ${expected}`);
}

function requireArrayNotIncludes(label, values, forbidden) {
  if (!Array.isArray(values) || values.includes(forbidden)) failures.push(`${label} must not include ${forbidden}`);
}

function requireText(label, text, token) {
  if (!normalized(text).includes(normalized(token))) failures.push(`${label} is missing ${token}`);
}

function rejectText(label, text, token) {
  if (normalized(text).includes(normalized(token))) failures.push(`${label} contains forbidden claim ${token}`);
}

requireEqual("request.schemaVersion", request.schemaVersion, 1);
requireEqual("request.evidenceClass", request.evidenceClass, "go-approval-matrix-evidence-request");
requireEqual("request.decision", request.decision, "NO_GO_NOG_09_GO_APPROVAL_MATRIX_REQUIRED");
requireEqual("request.executionState", request.executionState, "blocked_pending_final_go_approval_matrix");
requireEqual("request.selectedSha", request.selectedSha, candidate.currentCandidate?.sha);
requireEqual("request.blocker", request.blocker, "NOG-09");
requireEqual("request.status", request.status, "open");
requireEqual("request.requiredEnvironment", request.requiredEnvironment, "release-control");
requireEqual("request.verifier", request.verifier, "scripts/verify-go-approval-matrix-evidence.mjs");
requireEqual("request.requiredArtifact.authority", request.requiredArtifact?.authority, "tecpey-go-approval-matrix-v1");
requireEqual(
  "request.requiredArtifact.evidenceClass",
  request.requiredArtifact?.evidenceClass,
  "controlled-soft-launch-go-approval-matrix",
);
requireEqual("request.requiredArtifact.sourceSha", request.requiredArtifact?.sourceSha, candidate.currentCandidate?.sha);
requireEqual(
  "request.requiredArtifact.launchScopeId",
  request.requiredArtifact?.launchScopeId,
  "controlled-public-fa-en-academy-mentor-arena",
);
requireEqual("request.requiredArtifact.finalDisposition", request.requiredArtifact?.finalDisposition, "approved_for_controlled_soft_launch");

for (const role of REQUIRED_APPROVAL_ROLES) {
  requireArrayIncludes("request.requiredArtifact.approvalRoles", request.requiredArtifact?.approvalRoles, role);
}

for (const blocker of REQUIRED_PREREQUISITE_BLOCKERS) {
  requireArrayIncludes(
    "request.requiredArtifact.requiredPrerequisiteBlockers",
    request.requiredArtifact?.requiredPrerequisiteBlockers,
    blocker,
  );
}

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

const nog08 = register.blockers?.find((entry) => entry.id === "NOG-08");
requireEqual("NOG-08.status", nog08?.status, "accepted");
requireEqual(
  "NOG-08.executionState",
  nog08?.executionState,
  "accepted_exact_candidate_accepted_risk_owner_signoff",
);
requireEqual(
  "NOG-08.evidence",
  nog08?.evidence,
  "docs/launch/generated/accepted-risk-signoff-execution-status-20260823.json",
);
requireArrayIncludes(
  "register.acceptedEvidence",
  register.acceptedEvidence?.map((entry) => entry.id),
  "NOG-08",
);
requireArrayIncludes(
  "candidate.acceptedEvidence",
  candidate.acceptedEvidence?.map((entry) => entry.id),
  "NOG-08",
);

requireArrayNotIncludes(
  "register.acceptedEvidence",
  register.acceptedEvidence?.map((entry) => entry.id),
  "NOG-09",
);
requireArrayNotIncludes(
  "candidate.acceptedEvidence",
  candidate.acceptedEvidence?.map((entry) => entry.id),
  "NOG-09",
);

const nog09 = register.blockers?.find((entry) => entry.id === "NOG-09");
requireEqual("NOG-09.executionState", nog09?.executionState, "blocked_pending_final_go_approval_matrix");
requireEqual("NOG-09.executionRequest", nog09?.executionRequest, REQUEST_PATH);
requireEqual("NOG-09.verifier", nog09?.verifier, "scripts/verify-go-approval-matrix-evidence.mjs");
for (const prerequisite of ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08"]) {
  requireArrayIncludes("NOG-09.prerequisiteBlockers", nog09?.prerequisiteBlockers, prerequisite);
  requireArrayIncludes("request.prerequisiteBlockers", request.prerequisiteBlockers, prerequisite);
}

for (const [name, command] of [
  ["launch:go-approval-matrix-evidence:check", "node scripts/check-go-approval-matrix-evidence-authority.mjs"],
  ["ops:go-approval-matrix:evidence:verify", "node scripts/verify-go-approval-matrix-evidence.mjs"],
  ["test:go-approval-matrix-evidence", "node --test scripts/go-approval-matrix-evidence.test.mjs"],
]) {
  requireEqual(`package ${name}`, packageJson.scripts?.[name], command);
  const guard = request.guardCommands?.find((entry) => entry.name === name);
  requireEqual(`request guard ${name}`, guard?.command.startsWith(command), true);
}

if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run launch:go-approval-matrix-evidence:check")) {
  failures.push("package.json: launch:decision:check must enforce Go approval matrix evidence authority");
}
if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run test:go-approval-matrix-evidence")) {
  failures.push("package.json: launch:decision:check must run Go approval matrix verifier tests");
}

for (const invariant of [
  REQUEST_PATH,
  "scripts/verify-go-approval-matrix-evidence.mjs",
  "tecpey-go-approval-matrix-v1",
  "controlled-soft-launch-go-approval-matrix",
  "CEO",
  "CTO or Chief Architect",
  "Security",
  "Product",
  "Compliance",
  "SRE",
  "QA",
  "NOG-09 is not accepted by this request",
]) {
  requireText("request", source.request, invariant);
}

for (const invariant of [
  "verifyGoApprovalMatrixEvidence",
  "REQUIRED_APPROVAL_ROLES",
  "REQUIRED_PREREQUISITE_BLOCKERS",
  "controlled-public-fa-en-academy-mentor-arena",
  "approved-for-controlled-soft-launch-only",
  "approval_matrix_independence_invalid",
  "no-secrets-or-connection-urls",
  "no-host-ips",
]) {
  requireText("verifier", source.verifier, invariant);
}

for (const invariant of [
  "accepts complete Go approval matrix evidence",
  "rejects stale candidate SHA",
  "rejects pending prerequisites",
  "rejects rejected approvals",
  "rejects operator self-review",
]) {
  requireText("verifier test", source.verifierTest, invariant);
}

for (const invariant of [
  "Go approval matrix evidence request",
  "NOG-09 remains open",
  "scripts/verify-go-approval-matrix-evidence.mjs",
]) {
  requireText("packet", source.packet, invariant);
}

for (const invariant of [
  "Go approval matrix",
  "docs/launch/generated/go-approval-matrix-evidence-request-20260812.json",
  "scripts/verify-go-approval-matrix-evidence.mjs",
]) {
  requireText("candidate ledger", source.candidateHuman, invariant);
  requireText("checklist", source.checklist, invariant);
}

for (const invariant of [
  "goApprovalMatrixEvidenceRequest",
  REQUEST_PATH,
  "scripts/verify-go-approval-matrix-evidence.mjs",
]) {
  requireText("candidate json", source.candidate, invariant);
}

for (const invariant of [
  "Go approval matrix evidence authority guard",
  "npm run launch:go-approval-matrix-evidence:check",
]) {
  requireText("workflow", source.workflow, invariant);
}

for (const forbidden of [
  "NOG-09 accepted",
  "GO_APPROVED",
  "Status:** GO",
  "real-money Exchange is approved",
  "custody is approved",
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
  console.error("Go approval matrix evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Go approval matrix evidence authority passed: NOG-09 remains open until the exact candidate has complete role approvals, prerequisite evidence digests and independent review.",
);
