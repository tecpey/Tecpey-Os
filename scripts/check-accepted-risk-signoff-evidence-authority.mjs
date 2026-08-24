import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";
import { acceptedRiskSignoffEvidenceOriginFindings } from "./accepted-risk-signoff-evidence-origin.mjs";
import { verifyAcceptedRiskSignoffEvidence } from "./verify-accepted-risk-signoff-evidence.mjs";

const EVIDENCE_PATH =
  "docs/launch/generated/accepted-risk-signoff-execution-status-20260823.json";
const REQUEST_PATH =
  "docs/launch/generated/accepted-risk-signoff-evidence-20260812.json";
const SELECTED_SHA = "79c48a16cb685a88315a44e103b3758cf7845d65";
const REQUIRED_RISKS = ["R-01", "R-02", "R-04", "R-05", "R-06", "R-07", "R-08", "R-09", "R-10"];
const REQUIRED_APPROVAL_OWNERS = [
  "github:tecpey",
  "github:mvexhiiii",
  "github:xrayman6zfm-ux",
];
const ISSUE_URL = "https://github.com/tecpey/Tecpey-Os/issues/409";
const REQUIRED_APPROVAL_COMMENTS = {
  "github:tecpey": {
    id: 5388723104,
    url: `${ISSUE_URL}#issuecomment-5388723104`,
    digest: "sha256:06e2e2a2ece28f7d794295dfcd0036c426a5bf7b80ea97cb74486c78b7b8f015",
  },
  "github:xrayman6zfm-ux": {
    id: 5388727231,
    url: `${ISSUE_URL}#issuecomment-5388727231`,
    digest: "sha256:49cbec23a19663d96c5b24d8099e8a01e32c7a31c65b219014c00da64b023f21",
  },
  "github:mvexhiiii": {
    id: 5388733838,
    url: `${ISSUE_URL}#issuecomment-5388733838`,
    digest: "sha256:d742c7fa80ffb40a42f9c12524cbbb2005051e11fcae6ebcf70dbe7fd6ee9913",
  },
};

const files = {
  evidence: EVIDENCE_PATH,
  request: REQUEST_PATH,
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  promotion: "docs/launch/generated/candidate-promotion-state-20260821.json",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  acceptedRisks: "docs/LAUNCH_ACCEPTED_RISKS.md",
  goRequest: "docs/launch/generated/go-approval-matrix-evidence-request-20260812.json",
  originVerifier: "scripts/accepted-risk-signoff-evidence-origin.mjs",
  verifier: "scripts/verify-accepted-risk-signoff-evidence.mjs",
  verifierTest: "scripts/accepted-risk-signoff-evidence.test.mjs",
  packageJson: "package.json",
  workflow: ".github/workflows/ci.yml",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])),
);
const evidence = JSON.parse(source.evidence);
const request = JSON.parse(source.request);
const register = JSON.parse(source.register);
const candidate = JSON.parse(source.candidate);
const promotion = JSON.parse(source.promotion);
const goRequest = JSON.parse(source.goRequest);
const packageJson = JSON.parse(source.packageJson);
const failures = [];
const originVerificationMode =
  process.argv.includes("--static-only")
  || process.env.TECPEY_ACCEPTED_RISK_ORIGIN_VERIFICATION === "static-only"
    ? "static-only"
    : "required";

function normalized(value) {
  return String(value).replace(/\s+/g, " ");
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) failures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function requireArrayExact(label, actual, expected) {
  if (!Array.isArray(actual) || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    failures.push(`${label} must equal ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireText(label, text, token) {
  if (!normalized(text).includes(normalized(token))) failures.push(`${label} is missing ${token}`);
}

try {
  verifyAcceptedRiskSignoffEvidence(evidence, SELECTED_SHA);
} catch (error) {
  failures.push(`accepted-risk verifier failed: ${error instanceof Error ? error.message : String(error)}`);
}
if (originVerificationMode === "required") {
  failures.push(...(await acceptedRiskSignoffEvidenceOriginFindings({
    evidence,
    selectedSha: SELECTED_SHA,
    token: process.env.GITHUB_TOKEN,
  })));
}

requireEqual("request.schemaVersion", request.schemaVersion, 2);
try {
  verifyAcceptedRiskSignoffEvidence(request.requiredArtifact, SELECTED_SHA);
} catch (error) {
  failures.push(
    `request requiredArtifact verifier failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}
if (JSON.stringify(request.requiredArtifact) !== JSON.stringify(evidence)) {
  failures.push("request.requiredArtifact must mirror the complete canonical schema-v2 execution artifact");
}
requireEqual(
  "request.requiredArtifactOriginVerification.provider",
  request.requiredArtifactOriginVerification?.provider,
  "github-rest-api",
);
requireEqual(
  "request.requiredArtifactOriginVerification.endpointTemplate",
  request.requiredArtifactOriginVerification?.endpointTemplate,
  "https://api.github.com/repos/tecpey/Tecpey-Os/issues/comments/{acceptanceEvidenceCommentId}",
);
requireEqual(
  "request.requiredArtifactOriginVerification.requiredCredentialEnvironment",
  request.requiredArtifactOriginVerification?.requiredCredentialEnvironment,
  "GITHUB_TOKEN",
);
requireEqual(
  "request.requiredArtifactOriginVerification.failureMode",
  request.requiredArtifactOriginVerification?.failureMode,
  "fail-closed",
);
requireArrayExact(
  "request.requiredArtifactOriginVerification.requiredBindings",
  request.requiredArtifactOriginVerification?.requiredBindings,
  [
    "remote-comment-id-matches-acceptanceEvidenceCommentId",
    "remote-html-url-matches-acceptanceEvidenceUrl",
    "remote-issue-is-409",
    "remote-author-matches-approvalOwnerExternalIdentity",
    "sha256-exact-remote-body-matches-evidenceDigest",
    "body-attests-exact-candidate-scope-register-risks-review-dates-roles-decision-attestation-and-conditions",
  ],
);

requireEqual("candidate.currentCandidate.sha", candidate.currentCandidate?.sha, SELECTED_SHA);
requireEqual("evidence.sourceSha", evidence.sourceSha, candidate.currentCandidate?.sha);
requireEqual("evidence.riskRegister.path", evidence.riskRegister?.path, files.acceptedRisks);
requireEqual("evidence.riskRegister.candidateSha", evidence.riskRegister?.candidateSha, SELECTED_SHA);
requireArrayExact("evidence.riskRegister.coveredRisks", evidence.riskRegister?.coveredRisks, REQUIRED_RISKS);

const registerDigest = `sha256:${createHash("sha256").update(source.acceptedRisks, "utf8").digest("hex")}`;
requireEqual("evidence.riskRegister.digest", evidence.riskRegister?.digest, registerDigest);
failures.push(...evaluateAcceptedRiskRegisterAuthority(source.acceptedRisks, { referenceDate: new Date() }));

const approvalOwners = [...new Set(
  Object.values(evidence.riskOwnerSignoffs ?? {}).map((entry) => entry.approvalOwnerExternalIdentity),
)];
requireArrayExact("evidence approval owners", approvalOwners, REQUIRED_APPROVAL_OWNERS);
for (const signoff of Object.values(evidence.riskOwnerSignoffs ?? {})) {
  const expectedComment = REQUIRED_APPROVAL_COMMENTS[signoff.approvalOwnerExternalIdentity];
  requireEqual(`${signoff.risk}.acceptanceEvidenceType`, signoff.acceptanceEvidenceType, "github-issue-comment");
  requireEqual(`${signoff.risk}.acceptanceEvidenceCommentId`, signoff.acceptanceEvidenceCommentId, expectedComment?.id);
  requireEqual(`${signoff.risk}.acceptanceEvidenceUrl`, signoff.acceptanceEvidenceUrl, expectedComment?.url);
  requireEqual(`${signoff.risk}.evidenceDigest`, signoff.evidenceDigest, expectedComment?.digest);
}
requireEqual("evidence.releaseOwner.externalIdentity", evidence.releaseOwner?.externalIdentity, "github:tecpey");
requireEqual("evidence.reviewer.externalIdentity", evidence.reviewer?.externalIdentity, "github:xrayman6zfm-ux");

const nog08 = register.blockers?.find((entry) => entry.id === "NOG-08");
requireEqual("NOG-08.status", nog08?.status, "accepted");
requireEqual("NOG-08.executionState", nog08?.executionState, "accepted_exact_candidate_accepted_risk_owner_signoff");
requireEqual("NOG-08.evidence", nog08?.evidence, EVIDENCE_PATH);
requireEqual("NOG-08.selectedSha", nog08?.selectedSha, SELECTED_SHA);
requireEqual("NOG-08.approvalEvidenceUrl", nog08?.approvalEvidenceUrl, ISSUE_URL);
requireArrayExact("NOG-08.approvalOwners", nog08?.approvalOwners, REQUIRED_APPROVAL_OWNERS);
requireEqual("NOG-08.riskRegisterDigest", nog08?.riskRegisterDigest, registerDigest);

const registerAccepted = register.acceptedEvidence?.find((entry) => entry.id === "NOG-08");
const candidateAccepted = candidate.acceptedEvidence?.find((entry) => entry.id === "NOG-08");
for (const [label, accepted] of [["register", registerAccepted], ["candidate", candidateAccepted]]) {
  requireEqual(`${label}.NOG-08.status`, accepted?.status, "accepted");
  requireEqual(`${label}.NOG-08.evidence`, accepted?.evidence, EVIDENCE_PATH);
  requireEqual(`${label}.NOG-08.selectedSha`, accepted?.selectedSha, SELECTED_SHA);
  requireEqual(`${label}.NOG-08.riskRegisterDigest`, accepted?.riskRegisterDigest, registerDigest);
  requireArrayExact(`${label}.NOG-08.approvalOwners`, accepted?.approvalOwners, REQUIRED_APPROVAL_OWNERS);
}

requireArrayExact("register.remainingOpenBlockers", register.remainingOpenBlockers, ["NOG-09"]);
requireArrayExact("promotion.stillOpenBlockers", promotion.stillOpenBlockers, ["NOG-09"]);
requireArrayExact("register.recommendedNextSlice.ids", register.recommendedNextSlice?.ids, ["NOG-09"]);
requireEqual("register.acceptedRiskSignoffEvidence", register.acceptedRiskSignoffEvidence, EVIDENCE_PATH);
requireEqual("candidate.activeInputs.acceptedRiskSignoffEvidence", candidate.activeInputs?.acceptedRiskSignoffEvidence, EVIDENCE_PATH);
requireArrayExact(
  "candidate.requiredNextEvidence",
  candidate.requiredNextEvidence,
  ["Go approval matrix for the current candidate that passes scripts/verify-go-approval-matrix-evidence.mjs"],
);

const nog09 = register.blockers?.find((entry) => entry.id === "NOG-09");
requireEqual("NOG-09.status", nog09?.status, "open");
requireEqual("NOG-09.executionState", nog09?.executionState, "blocked_pending_final_go_approval_matrix");
if (register.acceptedEvidence?.some((entry) => entry.id === "NOG-09")) failures.push("register.acceptedEvidence must not accept NOG-09");
if (candidate.acceptedEvidence?.some((entry) => entry.id === "NOG-09")) failures.push("candidate.acceptedEvidence must not accept NOG-09");
requireEqual("goRequest.selectedSha", goRequest.selectedSha, SELECTED_SHA);

for (const [label, text] of [
  ["candidate ledger", source.candidateHuman],
  ["packet", source.packet],
  ["checklist", source.checklist],
]) {
  requireText(label, text, "NOG-08");
  requireText(label, text, "accepted");
  requireText(label, text, "NOG-09");
  requireText(label, text, "NO-GO");
}

for (const invariant of [
  "acceptedRiskSignoffEvidenceOriginFindings",
  "issues/comments",
  "origin.bodyDigest",
  "origin.author",
  "approval body is missing",
  "accepted-risk approval origin verification requires GITHUB_TOKEN",
]) requireText("origin verifier", source.originVerifier, invariant);
for (const invariant of [
  "verifyAcceptedRiskSignoffEvidence",
  "accepted-risk-register-approved-for-controlled-soft-launch-only",
  "accepted_risk_signoff_independence_invalid",
]) requireText("verifier", source.verifier, invariant);
for (const invariant of [
  "accepts complete accepted-risk owner signoff evidence",
  "attests immutable accepted-risk issue comments by author and body digest",
  "rejects edited or wrongly attributed accepted-risk approval comments",
  "rejects stale review date",
  "rejects operator self-approval",
]) requireText("verifier test", source.verifierTest, invariant);

requireEqual(
  "package launch:accepted-risk-evidence:check",
  packageJson.scripts?.["launch:accepted-risk-evidence:check"],
  "node scripts/check-accepted-risk-signoff-evidence-authority.mjs",
);
requireEqual(
  "package test:accepted-risk-signoff-evidence",
  packageJson.scripts?.["test:accepted-risk-signoff-evidence"],
  "node --test scripts/accepted-risk-signoff-evidence.test.mjs",
);
requireText("package", source.packageJson, "npm run launch:accepted-risk-evidence:check");
requireText("package", source.packageJson, "npm run test:accepted-risk-signoff-evidence");
requireText("workflow", source.workflow, "Accepted-risk signoff evidence authority guard");
requireText("workflow", source.workflow, "npm run launch:accepted-risk-evidence:check");
requireText(
  "workflow",
  source.workflow,
  "Accepted-risk signoff evidence authority guard env: GITHUB_TOKEN: ${{ github.token }} run: npm run launch:accepted-risk-evidence:check",
);

const serializedEvidence = JSON.stringify(evidence);
for (const forbidden of [
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
]) {
  if (forbidden.test(serializedEvidence)) {
    failures.push(`${EVIDENCE_PATH}: evidence must not contain secrets, connection strings or host identifiers`);
  }
}

if (failures.length > 0) {
  console.error("Accepted-risk signoff evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Accepted-risk signoff evidence authority passed for ${SELECTED_SHA}: NOG-08 is accepted from three attributable owners; controlled launch remains NO-GO on NOG-09.`,
);
