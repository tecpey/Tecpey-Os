import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { goApprovalMatrixEvidenceOriginFindings } from "./go-approval-matrix-evidence-origin.mjs";
import { verifyGoApprovalMatrixEvidence } from "./verify-go-approval-matrix-evidence.mjs";

const SELECTED_SHA = "79c48a16cb685a88315a44e103b3758cf7845d65";
const BASE_MAIN_SHA = "ffa005707250f95dd975b4a973626580fc6871ab";
const REQUEST_PATH = "docs/launch/generated/go-approval-matrix-evidence-request-20260812.json";
const EVIDENCE_PATH = "docs/launch/generated/go-approval-matrix-execution-status-20260824.json";
const ISSUE_URL = "https://github.com/tecpey/Tecpey-Os/issues/410";
const PROPOSED_OPEN_BLOCKERS = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08", "NOG-09"];

const REQUIRED_APPROVALS = {
  ceo: { role: "CEO", owner: "github:tecpey", id: 5391626720, digest: "sha256:27ecd2ddd60cb240aeb657508e29e047cc708f58ff844e195031549401a47438" },
  ctoOrChiefArchitect: { role: "CTO or Chief Architect", owner: "github:mvexhiiii", id: 5391640345, digest: "sha256:c154a67c3f2154e60608928e851477f8bfb2045780578d551554eb42e5c1ac0e" },
  security: { role: "Security", owner: "github:mvexhiiii", id: 5391640345, digest: "sha256:c154a67c3f2154e60608928e851477f8bfb2045780578d551554eb42e5c1ac0e" },
  product: { role: "Product", owner: "github:tecpey", id: 5391626720, digest: "sha256:27ecd2ddd60cb240aeb657508e29e047cc708f58ff844e195031549401a47438" },
  compliance: { role: "Compliance", owner: "github:tecpey", id: 5391626720, digest: "sha256:27ecd2ddd60cb240aeb657508e29e047cc708f58ff844e195031549401a47438" },
  sre: { role: "SRE", owner: "github:mvexhiiii", id: 5391640345, digest: "sha256:c154a67c3f2154e60608928e851477f8bfb2045780578d551554eb42e5c1ac0e" },
  qa: { role: "QA", owner: "github:tecpeysup", id: 5391646913, digest: "sha256:aab3471303eee769582a0ff27dcb959986a2f65a0a7a5ae74b4cb9bf817e9d0b" },
};

const PREREQUISITE_FILES = {
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
  evidence: EVIDENCE_PATH,
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
  ...Object.fromEntries(Object.entries(PREREQUISITE_FILES).map(([id, path]) => [`prerequisite:${id}`, path])),
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])),
);
const request = JSON.parse(source.request);
const evidence = JSON.parse(source.evidence);
const register = JSON.parse(source.register);
const candidate = JSON.parse(source.candidate);
const promotion = JSON.parse(source.promotion);
const packageJson = JSON.parse(source.packageJson);
const failures = [];

function normalized(value) {
  return String(value).replace(/\s+/g, " ");
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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

try {
  verifyGoApprovalMatrixEvidence(evidence, SELECTED_SHA);
} catch (error) {
  failures.push(`canonical artifact verifier failed: ${error instanceof Error ? error.message : String(error)}`);
}

const staticOnly = process.argv.includes("--static-only")
  || process.env.TECPEY_GO_APPROVAL_EVIDENCE_ORIGIN_MODE === "static-only";
if (!staticOnly) {
  failures.push(...(await goApprovalMatrixEvidenceOriginFindings({
    evidence,
    selectedSha: SELECTED_SHA,
    token: process.env.GITHUB_TOKEN,
  })));
}

requireEqual("request.schemaVersion", request.schemaVersion, 2);
requireEqual("request.decision", request.decision, "GO_NOG_09_EXACT_CANDIDATE_MATRIX_ACCEPTED");
requireEqual("request.executionState", request.executionState, "accepted_exact_candidate_go_approval_matrix");
requireEqual("request.selectedSha", request.selectedSha, SELECTED_SHA);
requireEqual("request.status", request.status, "accepted");
requireEqual("request.requiredArtifact.path", request.requiredArtifact?.path, EVIDENCE_PATH);
requireEqual("request.requiredArtifact.schemaVersion", request.requiredArtifact?.schemaVersion, 2);
requireEqual("request.requiredArtifact.sourceSha", request.requiredArtifact?.sourceSha, SELECTED_SHA);
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

requireEqual("evidence.sourceSha", evidence.sourceSha, SELECTED_SHA);
requireEqual("evidence.releaseOwner.externalIdentity", evidence.releaseOwner?.externalIdentity, "github:tecpey");
requireEqual("evidence.operator.externalIdentity", evidence.operator?.externalIdentity, "protected-staging:operator");
requireEqual("evidence.reviewer.externalIdentity", evidence.reviewer?.externalIdentity, "github:tecpeysup");
for (const [key, expected] of Object.entries(REQUIRED_APPROVALS)) {
  const approval = evidence.approvalMatrix?.[key];
  requireEqual(`${key}.role`, approval?.role, expected.role);
  requireEqual(`${key}.approver`, approval?.approverExternalIdentity, expected.owner);
  requireEqual(`${key}.type`, approval?.approvalEvidenceType, "github-issue-comment");
  requireEqual(`${key}.commentId`, approval?.approvalEvidenceCommentId, expected.id);
  requireEqual(`${key}.url`, approval?.approvalEvidenceUrl, `${ISSUE_URL}#issuecomment-${expected.id}`);
  requireEqual(`${key}.digest`, approval?.evidenceDigest, expected.digest);
}

for (const [id, path] of Object.entries(PREREQUISITE_FILES)) {
  const prerequisite = evidence.prerequisiteEvidence?.[id];
  const expectedDigest = sha256(source[`prerequisite:${id}`]);
  requireEqual(`${id}.evidenceDigest`, prerequisite?.evidenceDigest, expectedDigest);
  requireEqual(
    `${id}.evidenceUrl`,
    prerequisite?.evidenceUrl,
    `https://github.com/tecpey/Tecpey-Os/blob/${BASE_MAIN_SHA}/${path}`,
  );
  const accepted = register.acceptedEvidence?.find((entry) => entry.id === id);
  requireEqual(`${id}.registerAccepted`, accepted?.status, "accepted");
  requireEqual(`${id}.selectedSha`, accepted?.selectedSha, SELECTED_SHA);
}

requireEqual("candidate.currentCandidate.sha", candidate.currentCandidate?.sha, SELECTED_SHA);
requireEqual("candidate.decision", candidate.decision, "GO_APPROVED_FOR_CONTROLLED_SOFT_LAUNCH_ONLY");
requireEqual("register.decision", register.decision, "GO_APPROVED_FOR_CONTROLLED_SOFT_LAUNCH_ONLY");
requireArrayExact("register.remainingOpenBlockers", register.remainingOpenBlockers, []);
requireEqual("promotion.status", promotion.status, "pending_evidence_recollection");
requireEqual("promotion.currentAcceptedCandidateSha", promotion.currentAcceptedCandidateSha, SELECTED_SHA);
requireEqual("promotion.protectedExecutionAllowed", promotion.protectedExecutionAllowed, false);
if (!/^[0-9a-f]{40}$/.test(promotion.proposedCandidate?.sha ?? "")) {
  failures.push("promotion.proposedCandidate.sha: expected exact lowercase 40-character SHA");
} else if (promotion.proposedCandidate.sha === SELECTED_SHA) {
  failures.push("promotion.proposedCandidate.sha: pending promotion must differ from the accepted candidate");
}
requireArrayExact(
  "promotion.stillOpenBlockers",
  promotion.stillOpenBlockers,
  PROPOSED_OPEN_BLOCKERS,
);
requireArrayExact("candidate.requiredNextEvidence", candidate.requiredNextEvidence, []);
requireArrayExact("register.recommendedNextSlice.ids", register.recommendedNextSlice?.ids, []);
requireEqual("candidate.activeInputs.goApprovalMatrixEvidence", candidate.activeInputs?.goApprovalMatrixEvidence, EVIDENCE_PATH);
requireEqual("register.goApprovalMatrixEvidence", register.goApprovalMatrixEvidence, EVIDENCE_PATH);

const nog09 = register.blockers?.find((entry) => entry.id === "NOG-09");
const registerAccepted = register.acceptedEvidence?.find((entry) => entry.id === "NOG-09");
const candidateAccepted = candidate.acceptedEvidence?.find((entry) => entry.id === "NOG-09");
for (const [label, entry] of [["blocker", nog09], ["register", registerAccepted], ["candidate", candidateAccepted]]) {
  requireEqual(`${label}.NOG-09.status`, entry?.status, "accepted");
  requireEqual(`${label}.NOG-09.evidence`, entry?.evidence, EVIDENCE_PATH);
  requireEqual(`${label}.NOG-09.selectedSha`, entry?.selectedSha, SELECTED_SHA);
  requireArrayExact(`${label}.NOG-09.approvalOwners`, entry?.approvalOwners, ["github:tecpey", "github:mvexhiiii", "github:tecpeysup"]);
  requireEqual(`${label}.NOG-09.independentReviewer`, entry?.independentReviewer, "github:tecpeysup");
}
requireEqual("NOG-09.executionState", nog09?.executionState, "accepted_exact_candidate_go_approval_matrix");
requireEqual("NOG-09.trackingIssue", nog09?.trackingIssue, ISSUE_URL);

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
  ["checklist", source.checklist],
]) {
  requireText(label, text, "NOG-09");
  requireText(label, text, "accepted");
  requireText(label, text, "controlled soft launch");
  requireText(label, text, "Exchange");
  requireText(label, text, "disabled");
}

for (const [label, value] of [[EVIDENCE_PATH, evidence], [REQUEST_PATH, request]]) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    /postgres(?:ql)?:\/\//i,
    /DATABASE_URL/i,
    /BEGIN [A-Z ]*PRIVATE KEY/i,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  ]) {
    if (forbidden.test(serialized)) failures.push(`${label}: evidence must not contain secrets, connection strings or host identifiers`);
  }
}

if (failures.length > 0) {
  console.error("Go approval matrix evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Go approval matrix evidence authority passed for ${SELECTED_SHA}: NOG-09 is accepted from attributable live-origin approvals; only the controlled soft launch scope is approved.`,
);
