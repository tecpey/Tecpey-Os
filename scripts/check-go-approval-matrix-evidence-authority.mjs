import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { goApprovalMatrixEvidenceOriginFindings } from "./go-approval-matrix-evidence-origin.mjs";
import { verifyGoApprovalMatrixEvidence } from "./verify-go-approval-matrix-evidence.mjs";

const HISTORICAL_CANDIDATE_SHA = "79c48a16cb685a88315a44e103b3758cf7845d65";
const HISTORICAL_BASE_MAIN_SHA = "ffa005707250f95dd975b4a973626580fc6871ab";
const REQUEST_PATH = "docs/launch/generated/go-approval-matrix-evidence-request-20260812.json";
const HISTORICAL_EVIDENCE_PATH =
  "docs/launch/generated/go-approval-matrix-execution-status-20260824.json";
const ISSUE_URL = "https://github.com/tecpey/Tecpey-Os/issues/410";
const OPEN_BLOCKERS = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08", "NOG-09"];
const REQUIRED_PREREQUISITES = [
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

const REQUIRED_APPROVALS = {
  ceo: {
    role: "CEO",
    owner: "github:tecpey",
    id: 5391626720,
    digest: "sha256:27ecd2ddd60cb240aeb657508e29e047cc708f58ff844e195031549401a47438",
  },
  ctoOrChiefArchitect: {
    role: "CTO or Chief Architect",
    owner: "github:mvexhiiii",
    id: 5391640345,
    digest: "sha256:c154a67c3f2154e60608928e851477f8bfb2045780578d551554eb42e5c1ac0e",
  },
  security: {
    role: "Security",
    owner: "github:mvexhiiii",
    id: 5391640345,
    digest: "sha256:c154a67c3f2154e60608928e851477f8bfb2045780578d551554eb42e5c1ac0e",
  },
  product: {
    role: "Product",
    owner: "github:tecpey",
    id: 5391626720,
    digest: "sha256:27ecd2ddd60cb240aeb657508e29e047cc708f58ff844e195031549401a47438",
  },
  compliance: {
    role: "Compliance",
    owner: "github:tecpey",
    id: 5391626720,
    digest: "sha256:27ecd2ddd60cb240aeb657508e29e047cc708f58ff844e195031549401a47438",
  },
  sre: {
    role: "SRE",
    owner: "github:mvexhiiii",
    id: 5391640345,
    digest: "sha256:c154a67c3f2154e60608928e851477f8bfb2045780578d551554eb42e5c1ac0e",
  },
  qa: {
    role: "QA",
    owner: "github:tecpeysup",
    id: 5391646913,
    digest: "sha256:aab3471303eee769582a0ff27dcb959986a2f65a0a7a5ae74b4cb9bf817e9d0b",
  },
};

const HISTORICAL_PREREQUISITE_FILES = {
  "NOG-01": "docs/launch/generated/protected-staging-execution-status-20260812.json",
  "NOG-02": "docs/launch/generated/protected-staging-execution-status-20260812.json",
  "NOG-03": "docs/launch/generated/runtime-image-digest-evidence-20260812.json",
  "NOG-04": "docs/launch/generated/exact-head-workflow-evidence-20260812.json",
  "NOG-05": "docs/launch/generated/protected-recovery-reconciliation-execution-status-20260823.json",
  "NOG-06": "docs/launch/generated/rollback-volume-restore-evidence-20260812.json",
  "NOG-07": "docs/launch/generated/protected-incident-readiness-execution-status-20260823.json",
  "NOG-08": "docs/launch/generated/accepted-risk-signoff-execution-status-20260823.json",
  "NOG-10": "docs/launch/generated/disabled-capability-attestation-evidence-20260812.json",
  "NOG-11": "docs/launch/generated/disabled-capability-attestation-evidence-20260812.json",
  "NOG-12": "docs/launch/generated/disabled-capability-attestation-evidence-20260812.json",
};

const files = {
  request: REQUEST_PATH,
  historicalEvidence: HISTORICAL_EVIDENCE_PATH,
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  promotion: "docs/launch/generated/candidate-promotion-state-20260821.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  verifier: "scripts/verify-go-approval-matrix-evidence.mjs",
  originVerifier: "scripts/go-approval-matrix-evidence-origin.mjs",
  verifierTest: "scripts/go-approval-matrix-evidence.test.mjs",
  packageJson: "package.json",
  workflow: ".github/workflows/ci.yml",
  ...Object.fromEntries(
    Object.entries(HISTORICAL_PREREQUISITE_FILES).map(([id, path]) => [`prerequisite:${id}`, path]),
  ),
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])),
);
const request = JSON.parse(source.request);
const historicalEvidence = JSON.parse(source.historicalEvidence);
const register = JSON.parse(source.register);
const candidate = JSON.parse(source.candidate);
const promotion = JSON.parse(source.promotion);
const packageJson = JSON.parse(source.packageJson);
const currentCandidateSha = candidate.currentCandidate?.sha;
const failures = [];

function normalized(value) {
  return String(value).replace(/\s+/g, " ");
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireArrayExact(label, actual, expected) {
  if (!Array.isArray(actual) || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    failures.push(`${label}: expected exactly ${expected.join(", ")}`);
  }
}

function requireText(label, text, token) {
  if (!normalized(text).includes(normalized(token))) failures.push(`${label}: missing ${token}`);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function requireNoActiveAcceptance(label, entries, blocker) {
  if (entries?.some((entry) => entry.id === blocker)) {
    failures.push(`${label}.${blocker}: historical evidence must not be active for the current candidate`);
  }
}

try {
  verifyGoApprovalMatrixEvidence(historicalEvidence, HISTORICAL_CANDIDATE_SHA);
} catch (error) {
  failures.push(`historical artifact verifier failed: ${error instanceof Error ? error.message : String(error)}`);
}

const staticOnly = process.argv.includes("--static-only")
  || process.env.TECPEY_GO_APPROVAL_EVIDENCE_ORIGIN_MODE === "static-only";
if (!staticOnly) {
  failures.push(...(await goApprovalMatrixEvidenceOriginFindings({
    evidence: historicalEvidence,
    selectedSha: HISTORICAL_CANDIDATE_SHA,
    token: process.env.GITHUB_TOKEN,
  })));
}

requireEqual("historical evidence sourceSha", historicalEvidence.sourceSha, HISTORICAL_CANDIDATE_SHA);
requireEqual("historical evidence release owner", historicalEvidence.releaseOwner?.externalIdentity, "github:tecpey");
requireEqual("historical evidence operator", historicalEvidence.operator?.externalIdentity, "protected-staging:operator");
requireEqual("historical evidence reviewer", historicalEvidence.reviewer?.externalIdentity, "github:tecpeysup");
for (const [key, expected] of Object.entries(REQUIRED_APPROVALS)) {
  const approval = historicalEvidence.approvalMatrix?.[key];
  requireEqual(`${key}.role`, approval?.role, expected.role);
  requireEqual(`${key}.approver`, approval?.approverExternalIdentity, expected.owner);
  requireEqual(`${key}.type`, approval?.approvalEvidenceType, "github-issue-comment");
  requireEqual(`${key}.commentId`, approval?.approvalEvidenceCommentId, expected.id);
  requireEqual(`${key}.url`, approval?.approvalEvidenceUrl, `${ISSUE_URL}#issuecomment-${expected.id}`);
  requireEqual(`${key}.digest`, approval?.evidenceDigest, expected.digest);
}
for (const [id, path] of Object.entries(HISTORICAL_PREREQUISITE_FILES)) {
  const prerequisite = historicalEvidence.prerequisiteEvidence?.[id];
  requireEqual(`${id}.historical evidence digest`, prerequisite?.evidenceDigest, sha256(source[`prerequisite:${id}`]));
  requireEqual(
    `${id}.historical evidence URL`,
    prerequisite?.evidenceUrl,
    `https://github.com/tecpey/Tecpey-Os/blob/${HISTORICAL_BASE_MAIN_SHA}/${path}`,
  );
}

requireEqual("request.schemaVersion", request.schemaVersion, 2);
requireEqual("request.evidenceClass", request.evidenceClass, "go-approval-matrix-evidence-request");
requireEqual("request.decision", request.decision, "NO_GO_NOG_09_GO_APPROVAL_MATRIX_REQUIRED");
requireEqual("request.executionState", request.executionState, "blocked_pending_final_go_approval_matrix");
requireEqual("request.selectedSha", request.selectedSha, currentCandidateSha);
requireEqual("request.status", request.status, "open");
requireEqual("request.blocker", request.blocker, "NOG-09");
requireArrayExact("request.notAcceptedForBlockers", request.notAcceptedForBlockers, OPEN_BLOCKERS);
requireArrayExact(
  "request.prerequisiteBlockers",
  request.prerequisiteBlockers,
  ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08"],
);
requireEqual("request.requiredArtifact.schemaVersion", request.requiredArtifact?.schemaVersion, 2);
requireEqual("request.requiredArtifact.authority", request.requiredArtifact?.authority, "tecpey-go-approval-matrix-v1");
requireEqual("request.requiredArtifact.sourceSha", request.requiredArtifact?.sourceSha, currentCandidateSha);
requireEqual(
  "request.requiredArtifact.launchScopeId",
  request.requiredArtifact?.launchScopeId,
  "controlled-public-fa-en-academy-mentor-arena",
);
requireArrayExact(
  "request.requiredArtifact.requiredPrerequisiteBlockers",
  request.requiredArtifact?.requiredPrerequisiteBlockers,
  REQUIRED_PREREQUISITES,
);
requireArrayExact(
  "request.requiredArtifact.approvalRoles",
  request.requiredArtifact?.approvalRoles,
  REQUIRED_APPROVAL_ROLES,
);
requireEqual(
  "request.requiredArtifact.finalDisposition",
  request.requiredArtifact?.finalDisposition,
  "approved_for_controlled_soft_launch",
);
requireEqual(
  "request.requiredArtifactOriginVerification.endpointTemplate",
  request.requiredArtifactOriginVerification?.endpointTemplate,
  "https://api.github.com/repos/tecpey/Tecpey-Os/issues/comments/{approvalEvidenceCommentId}",
);
requireEqual(
  "request.requiredArtifactOriginVerification.requiredCredentialEnvironment",
  request.requiredArtifactOriginVerification?.requiredCredentialEnvironment,
  "GITHUB_TOKEN",
);
requireEqual("request.requiredArtifactOriginVerification.failureMode", request.requiredArtifactOriginVerification?.failureMode, "fail-closed");
requireEqual("request.historicalAcceptedEvidence.selectedSha", request.historicalAcceptedEvidence?.selectedSha, HISTORICAL_CANDIDATE_SHA);
requireEqual("request.historicalAcceptedEvidence.evidence", request.historicalAcceptedEvidence?.evidence, HISTORICAL_EVIDENCE_PATH);

requireEqual("candidate.currentCandidate.sha", currentCandidateSha, promotion.currentAcceptedCandidateSha);
requireEqual("candidate.decision", candidate.decision, "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE");
requireEqual("register.decision", register.decision, "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE");
requireEqual("promotion.status", promotion.status, "promoted_exact_candidate_evidence");
requireEqual("promotion.protectedExecutionAllowed", promotion.protectedExecutionAllowed, true);
requireArrayExact("promotion.stillOpenBlockers", promotion.stillOpenBlockers, OPEN_BLOCKERS);
requireArrayExact("register.remainingOpenBlockers", register.remainingOpenBlockers, OPEN_BLOCKERS);
requireArrayExact("register.openBlockerTrackingIssues", Object.keys(register.openBlockerTrackingIssues ?? {}), OPEN_BLOCKERS);
requireArrayExact("register.recommendedNextSlice.ids", register.recommendedNextSlice?.ids, ["NOG-01", "NOG-02"]);
requireEqual("candidate.activeInputs.goApprovalMatrixEvidenceRequest", candidate.activeInputs?.goApprovalMatrixEvidenceRequest, REQUEST_PATH);
requireEqual(
  "candidate required next Go approval matrix",
  candidate.requiredNextEvidence?.some((entry) => entry.includes("Go approval matrix")),
  true,
);

const nog09 = register.blockers?.find((entry) => entry.id === "NOG-09");
requireEqual("NOG-09.status", nog09?.status, "open");
requireEqual("NOG-09.executionState", nog09?.executionState, "blocked_pending_final_go_approval_matrix");
requireEqual("NOG-09.executionRequest", nog09?.executionRequest, REQUEST_PATH);
requireEqual("NOG-09.trackingIssue", nog09?.trackingIssue, ISSUE_URL);
requireNoActiveAcceptance("register.acceptedEvidence", register.acceptedEvidence, "NOG-09");
requireNoActiveAcceptance("candidate.acceptedEvidence", candidate.acceptedEvidence, "NOG-09");

const executionRequest = register.executionRequests?.find(
  (entry) => Array.isArray(entry.ids) && entry.ids.length === 1 && entry.ids[0] === "NOG-09",
);
requireEqual(
  "register.NOG-09.executionRequest.status",
  executionRequest?.status,
  "blocked_pending_final_go_approval_matrix",
);
requireEqual("register.NOG-09.executionRequest.selectedSha", executionRequest?.selectedSha, currentCandidateSha);
requireEqual("register.NOG-09.executionRequest.machineReadableRequest", executionRequest?.machineReadableRequest, REQUEST_PATH);
requireEqual(
  "register.NOG-09.executionRequest.historicalExecutionStatusObservation",
  executionRequest?.historicalExecutionStatusObservation,
  HISTORICAL_EVIDENCE_PATH,
);
requireEqual(
  "register.historicalAcceptedEvidence.priorCandidateSha",
  register.historicalAcceptedEvidence?.priorCandidateSha,
  HISTORICAL_CANDIDATE_SHA,
);
requireEqual(
  "register.historicalAcceptedEvidence.goApprovalMatrix",
  register.historicalAcceptedEvidence?.goApprovalMatrix,
  HISTORICAL_EVIDENCE_PATH,
);

requireEqual(
  "package launch:go-approval-matrix-evidence:check",
  packageJson.scripts?.["launch:go-approval-matrix-evidence:check"],
  "node scripts/check-go-approval-matrix-evidence-authority.mjs",
);
requireEqual(
  "package test:go-approval-matrix-evidence",
  packageJson.scripts?.["test:go-approval-matrix-evidence"],
  "node --test scripts/go-approval-matrix-evidence.test.mjs",
);
requireEqual(
  "package ops:go-approval-matrix:evidence:verify",
  packageJson.scripts?.["ops:go-approval-matrix:evidence:verify"],
  "node scripts/verify-go-approval-matrix-evidence.mjs",
);
requireText("workflow", source.workflow, "Go approval matrix evidence authority guard");
requireText("workflow", source.workflow, "GITHUB_TOKEN: ${{ github.token }}");
requireText("workflow", source.workflow, "npm run launch:go-approval-matrix-evidence:check");

for (const token of [
  "goApprovalMatrixEvidenceOriginFindings",
  "issues/comments",
  "origin.bodyDigest",
  "origin.author",
  "origin.updated_at",
  "Go approval matrix origin verification requires GITHUB_TOKEN",
]) requireText("origin verifier", source.originVerifier, token);
for (const token of [
  "accepts complete Go approval matrix evidence",
  "attests immutable Go approval issue comments by author and body digest",
  "rejects Go approval origin verification without GitHub token",
  "rejects edited or wrongly attributed Go approval comments",
  "rejects stale candidate SHA",
  "rejects pending prerequisites",
  "rejects rejected approvals",
  "rejects operator self-review",
]) requireText("verifier test", source.verifierTest, token);

for (const [label, text] of [
  ["candidate ledger", source.candidateHuman],
  ["packet", source.packet],
]) {
  requireText(label, text, "NOG-09");
  requireText(label, text, "remains open");
  requireText(label, text, "Go approval matrix");
}
requireText("checklist", source.checklist, "NO-GO until approval evidence is accepted");
requireText("checklist", source.checklist, "historical packet must never be copied or relabelled");
requireText("candidate ledger", source.candidateHuman, HISTORICAL_CANDIDATE_SHA);
requireText("packet", source.packet, HISTORICAL_CANDIDATE_SHA);

for (const [label, value] of [
  [HISTORICAL_EVIDENCE_PATH, historicalEvidence],
  [REQUEST_PATH, request],
]) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    /postgres(?:ql)?:\/\//i,
    /DATABASE_URL/i,
    /BEGIN [A-Z ]*PRIVATE KEY/i,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  ]) {
    if (forbidden.test(serialized)) {
      failures.push(`${label}: evidence must not contain secrets, connection strings or host identifiers`);
    }
  }
}

if (failures.length > 0) {
  console.error("Go approval matrix evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Historical Go approval matrix passed for ${HISTORICAL_CANDIDATE_SHA}; NOG-09 remains open for current candidate ${currentCandidateSha}.`,
);
