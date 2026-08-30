import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";
import { acceptedRiskSignoffEvidenceOriginFindings } from "./accepted-risk-signoff-evidence-origin.mjs";
import { verifyAcceptedRiskSignoffEvidence } from "./verify-accepted-risk-signoff-evidence.mjs";

const HISTORICAL_EVIDENCE_PATH =
  "docs/launch/generated/accepted-risk-signoff-execution-status-20260823.json";
const REQUEST_PATH = "docs/launch/generated/accepted-risk-signoff-evidence-20260812.json";
const HISTORICAL_CANDIDATE_SHA = "79c48a16cb685a88315a44e103b3758cf7845d65";
const CURRENT_REVIEW_REFERENCE_DATE = "2026-08-30";
const CURRENT_MINIMUM_REVIEW_DATE = "2026-09-06";
const OPEN_BLOCKERS = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08", "NOG-09"];
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
  historicalEvidence: HISTORICAL_EVIDENCE_PATH,
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
const historicalEvidence = JSON.parse(source.historicalEvidence);
const request = JSON.parse(source.request);
const register = JSON.parse(source.register);
const candidate = JSON.parse(source.candidate);
const promotion = JSON.parse(source.promotion);
const goRequest = JSON.parse(source.goRequest);
const packageJson = JSON.parse(source.packageJson);
const currentCandidateSha = candidate.currentCandidate?.sha;
const failures = [];
const currentRegisterDigest = `sha256:${createHash("sha256")
  .update(source.acceptedRisks, "utf8")
  .digest("hex")}`;
let historicalAcceptedRiskRegister = null;
try {
  historicalAcceptedRiskRegister = execFileSync(
    "git",
    ["show", `${HISTORICAL_CANDIDATE_SHA}:${files.acceptedRisks}`],
    {
      encoding: "utf8",
      maxBuffer: 512 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
} catch {
  failures.push(
    `historical accepted-risk source is unavailable at ${HISTORICAL_CANDIDATE_SHA}:${files.acceptedRisks}`,
  );
}
const originVerificationMode =
  process.argv.includes("--static-only")
  || process.env.TECPEY_ACCEPTED_RISK_ORIGIN_VERIFICATION === "static-only"
    ? "static-only"
    : "required";

function normalized(value) {
  return String(value).replace(/\s+/g, " ");
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireArrayExact(label, actual, expected) {
  if (!Array.isArray(actual) || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    failures.push(`${label} must equal ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireText(label, text, token) {
  if (!normalized(text).includes(normalized(token))) failures.push(`${label} is missing ${token}`);
}

function requireNoActiveAcceptance(label, entries, blocker) {
  if (entries?.some((entry) => entry.id === blocker)) {
    failures.push(`${label}.${blocker} must not treat historical evidence as current accepted evidence`);
  }
}

try {
  verifyAcceptedRiskSignoffEvidence(historicalEvidence, HISTORICAL_CANDIDATE_SHA);
} catch (error) {
  failures.push(`historical accepted-risk verifier failed: ${error instanceof Error ? error.message : String(error)}`);
}
if (originVerificationMode === "required") {
  failures.push(...(await acceptedRiskSignoffEvidenceOriginFindings({
    evidence: historicalEvidence,
    selectedSha: HISTORICAL_CANDIDATE_SHA,
    token: process.env.GITHUB_TOKEN,
  })));
}

requireEqual("historical evidence sourceSha", historicalEvidence.sourceSha, HISTORICAL_CANDIDATE_SHA);
requireEqual("historical evidence risk register path", historicalEvidence.riskRegister?.path, files.acceptedRisks);
requireEqual(
  "historical evidence risk register candidate",
  historicalEvidence.riskRegister?.candidateSha,
  HISTORICAL_CANDIDATE_SHA,
);
requireArrayExact(
  "historical evidence covered risks",
  historicalEvidence.riskRegister?.coveredRisks,
  REQUIRED_RISKS,
);
const historicalRegisterDigest = historicalAcceptedRiskRegister
  ? `sha256:${createHash("sha256").update(historicalAcceptedRiskRegister, "utf8").digest("hex")}`
  : null;
requireEqual(
  "historical evidence risk register digest",
  historicalEvidence.riskRegister?.digest,
  historicalRegisterDigest,
);
if (historicalAcceptedRiskRegister) {
  failures.push(
    ...evaluateAcceptedRiskRegisterAuthority(historicalAcceptedRiskRegister, {
      referenceDate: historicalEvidence.riskRegister?.referenceDate,
    }).map((failure) => `historical register: ${failure}`),
  );
}
failures.push(...evaluateAcceptedRiskRegisterAuthority(source.acceptedRisks, { referenceDate: new Date() }));

const approvalOwners = [...new Set(
  Object.values(historicalEvidence.riskOwnerSignoffs ?? {})
    .map((entry) => entry.approvalOwnerExternalIdentity),
)];
requireArrayExact("historical evidence approval owners", approvalOwners, REQUIRED_APPROVAL_OWNERS);
for (const signoff of Object.values(historicalEvidence.riskOwnerSignoffs ?? {})) {
  const expectedComment = REQUIRED_APPROVAL_COMMENTS[signoff.approvalOwnerExternalIdentity];
  requireEqual(`${signoff.risk}.candidateSha`, signoff.candidateSha, HISTORICAL_CANDIDATE_SHA);
  requireEqual(`${signoff.risk}.acceptanceEvidenceType`, signoff.acceptanceEvidenceType, "github-issue-comment");
  requireEqual(`${signoff.risk}.acceptanceEvidenceCommentId`, signoff.acceptanceEvidenceCommentId, expectedComment?.id);
  requireEqual(`${signoff.risk}.acceptanceEvidenceUrl`, signoff.acceptanceEvidenceUrl, expectedComment?.url);
  requireEqual(`${signoff.risk}.evidenceDigest`, signoff.evidenceDigest, expectedComment?.digest);
}
requireEqual("historical evidence release owner", historicalEvidence.releaseOwner?.externalIdentity, "github:tecpey");
requireEqual(
  "historical evidence independent reviewer",
  historicalEvidence.reviewer?.externalIdentity,
  "github:xrayman6zfm-ux",
);

requireEqual("request.schemaVersion", request.schemaVersion, 2);
requireEqual("request.evidenceClass", request.evidenceClass, "accepted-risk-signoff-evidence-request");
requireEqual("request.decision", request.decision, "NO_GO_NOG_08_OWNER_APPROVAL_REQUIRED");
requireEqual("request.executionState", request.executionState, "prepared_owner_approval_required");
requireEqual("request.status", request.status, "open");
requireEqual("request.blocker", request.blocker, "NOG-08");
requireEqual(
  "request.reviewFreshness.referenceDate",
  request.reviewFreshness?.referenceDate,
  CURRENT_REVIEW_REFERENCE_DATE,
);
requireEqual(
  "request.reviewFreshness.earliestReviewDate",
  request.reviewFreshness?.earliestReviewDate,
  CURRENT_MINIMUM_REVIEW_DATE,
);
requireEqual("request.selectedSha", request.selectedSha, currentCandidateSha);
requireEqual("request.sourceBranch", request.sourceBranch, "main");
requireEqual("request.sourcePullRequest", request.sourcePullRequest, 568);
requireArrayExact("request.acceptedForBlockers", request.acceptedForBlockers, []);
requireArrayExact("request.notAcceptedForBlockers", request.notAcceptedForBlockers, OPEN_BLOCKERS);
requireEqual("request.requiredArtifact.schemaVersion", request.requiredArtifact?.schemaVersion, 2);
requireEqual(
  "request.requiredArtifact.authority",
  request.requiredArtifact?.authority,
  "tecpey-accepted-risk-owner-signoff-v1",
);
requireEqual("request.requiredArtifact.sourceSha", request.requiredArtifact?.sourceSha, currentCandidateSha);
requireEqual(
  "request.requiredArtifact.releaseScope.candidateSha",
  request.requiredArtifact?.releaseScope?.candidateSha,
  currentCandidateSha,
);
requireEqual(
  "request.requiredArtifact.riskRegister.candidateSha",
  request.requiredArtifact?.riskRegister?.candidateSha,
  currentCandidateSha,
);
requireEqual(
  "request.requiredArtifact.riskRegister.digest",
  request.requiredArtifact?.riskRegister?.digest,
  currentRegisterDigest,
);
requireArrayExact(
  "request.requiredArtifact.riskRegister.coveredRisks",
  request.requiredArtifact?.riskRegister?.coveredRisks,
  REQUIRED_RISKS,
);
requireEqual(
  "request.requiredArtifact.riskRegister.referenceDate",
  request.requiredArtifact?.riskRegister?.referenceDate,
  CURRENT_REVIEW_REFERENCE_DATE,
);
requireEqual(
  "request.requiredArtifact.riskRegister.minimumReviewDate",
  request.requiredArtifact?.riskRegister?.minimumReviewDate,
  CURRENT_MINIMUM_REVIEW_DATE,
);
requireArrayExact(
  "request.requiredArtifact.riskOwnerSignoffs",
  Object.keys(request.requiredArtifact?.riskOwnerSignoffs ?? {}),
  [],
);
requireArrayExact(
  "request.requiredArtifact.requiredRiskOwnerSignoffRisks",
  request.requiredArtifact?.requiredRiskOwnerSignoffRisks,
  REQUIRED_RISKS,
);
requireEqual(
  "request.requiredArtifact.collectionState",
  request.requiredArtifact?.collectionState,
  "missing_current_candidate_owner_approvals",
);
requireEqual("request.requiredArtifact.finalDisposition", request.requiredArtifact?.finalDisposition, "accepted");
requireEqual("request.requiredOwnerApprovalEvidence.required", request.requiredOwnerApprovalEvidence?.required, true);
requireEqual(
  "request.requiredOwnerApprovalEvidence.requiredBeforeStatus",
  request.requiredOwnerApprovalEvidence?.requiredBeforeStatus,
  "accepted",
);
requireEqual(
  "request.requiredOwnerApprovalEvidence.currentEvidenceUrl",
  request.requiredOwnerApprovalEvidence?.currentEvidenceUrl,
  null,
);
requireEqual("request.requiredOwnerApprovalEvidence.currentState", request.requiredOwnerApprovalEvidence?.currentState, "missing");
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
requireEqual("request.requiredArtifactOriginVerification.failureMode", request.requiredArtifactOriginVerification?.failureMode, "fail-closed");
requireEqual("request.historicalAcceptedEvidence.selectedSha", request.historicalAcceptedEvidence?.selectedSha, HISTORICAL_CANDIDATE_SHA);

requireEqual("candidate.currentCandidate.sha", currentCandidateSha, promotion.currentAcceptedCandidateSha);
requireEqual("candidate.decision", candidate.decision, "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE");
requireEqual("promotion.status", promotion.status, "promoted_exact_candidate_evidence");
requireEqual("promotion.protectedExecutionAllowed", promotion.protectedExecutionAllowed, true);
requireArrayExact("promotion.stillOpenBlockers", promotion.stillOpenBlockers, OPEN_BLOCKERS);
requireEqual("register.decision", register.decision, "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE");
requireArrayExact("register.remainingOpenBlockers", register.remainingOpenBlockers, OPEN_BLOCKERS);
requireArrayExact("register.openBlockerTrackingIssues", Object.keys(register.openBlockerTrackingIssues ?? {}), OPEN_BLOCKERS);

const nog08 = register.blockers?.find((entry) => entry.id === "NOG-08");
requireEqual("NOG-08.status", nog08?.status, "open");
requireEqual("NOG-08.executionState", nog08?.executionState, "blocked_pending_accepted_risk_owner_signoff_artifact");
requireEqual("NOG-08.evidence request", nog08?.evidence, REQUEST_PATH);
requireNoActiveAcceptance("register.acceptedEvidence", register.acceptedEvidence, "NOG-08");
requireNoActiveAcceptance("candidate.acceptedEvidence", candidate.acceptedEvidence, "NOG-08");

const executionRequest = register.executionRequests?.find(
  (entry) => Array.isArray(entry.ids) && entry.ids.length === 1 && entry.ids[0] === "NOG-08",
);
requireEqual(
  "register.NOG-08.executionRequest.status",
  executionRequest?.status,
  "blocked_pending_accepted_risk_owner_signoff_artifact",
);
requireEqual("register.NOG-08.executionRequest.selectedSha", executionRequest?.selectedSha, currentCandidateSha);
requireEqual("register.NOG-08.executionRequest.machineReadableRequest", executionRequest?.machineReadableRequest, REQUEST_PATH);
requireEqual(
  "register.NOG-08.executionRequest.historicalExecutionStatusObservation",
  executionRequest?.historicalExecutionStatusObservation,
  HISTORICAL_EVIDENCE_PATH,
);
requireEqual(
  "register.historicalAcceptedEvidence.priorCandidateSha",
  register.historicalAcceptedEvidence?.priorCandidateSha,
  HISTORICAL_CANDIDATE_SHA,
);
requireEqual(
  "register.historicalAcceptedEvidence.acceptedRisks",
  register.historicalAcceptedEvidence?.acceptedRisks,
  HISTORICAL_EVIDENCE_PATH,
);
requireEqual("register.acceptedRiskSignoffEvidence", register.acceptedRiskSignoffEvidence, REQUEST_PATH);
requireEqual("candidate.activeInputs.acceptedRiskSignoffEvidence", candidate.activeInputs?.acceptedRiskSignoffEvidence, REQUEST_PATH);
requireEqual(
  "candidate required next accepted-risk evidence",
  candidate.requiredNextEvidence?.some((entry) => entry.includes("accepted-risk owner sign-off evidence")),
  true,
);
requireEqual("goRequest.selectedSha", goRequest.selectedSha, currentCandidateSha);
requireEqual("goRequest.status", goRequest.status, "open");

for (const [label, text] of [
  ["candidate ledger", source.candidateHuman],
  ["packet", source.packet],
  ["checklist", source.checklist],
]) {
  requireText(label, text, "NOG-08");
  requireText(label, text, "owner sign-off evidence");
  requireText(label, text, "NO-GO");
}
requireText("candidate ledger", source.candidateHuman, HISTORICAL_CANDIDATE_SHA);
requireText("packet", source.packet, HISTORICAL_CANDIDATE_SHA);
requireText("checklist", source.checklist, "historical packet must never be copied or relabelled");

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
  console.error("Accepted-risk signoff evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Historical accepted-risk evidence passed for ${HISTORICAL_CANDIDATE_SHA}; NOG-08 remains open for current candidate ${currentCandidateSha}.`,
);
