import { readFile } from "node:fs/promises";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";

const EVIDENCE_PATH = "docs/launch/generated/accepted-risk-signoff-evidence-20260812.json";
const REQUIRED_RISKS = ["R-01", "R-02", "R-04", "R-05", "R-06", "R-07", "R-08", "R-09", "R-10"];
const REMAINING_BLOCKERS = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08", "NOG-09"];
const REFERENCE_DATE = process.env.TECPEY_ACCEPTED_RISK_REFERENCE_DATE ?? new Date().toISOString();

const files = {
  evidence: EVIDENCE_PATH,
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  acceptedRisks: "docs/LAUNCH_ACCEPTED_RISKS.md",
  packageJson: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])),
);

const evidence = JSON.parse(source.evidence);
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

function requireArrayIncludesText(label, values, expected) {
  if (!Array.isArray(values) || !values.some((value) => normalized(value).includes(normalized(expected)))) {
    failures.push(`${label} must include text ${expected}`);
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

requireEqual("evidence.schemaVersion", evidence.schemaVersion, 1);
requireEqual("evidence.evidenceClass", evidence.evidenceClass, "accepted-risk-signoff-evidence-request");
requireEqual(
  "evidence.decision",
  evidence.decision,
  "NO_GO_NOG_08_OWNER_APPROVAL_REQUIRED",
);
requireEqual("evidence.executionState", evidence.executionState, "prepared_owner_approval_required");
requireEqual("evidence.selectedSha", evidence.selectedSha, candidate.currentCandidate?.sha);
requireEqual("evidence.sourcePullRequest", evidence.sourcePullRequest, 395);
requireEqual("evidence.observedVia.provider", evidence.observedVia?.provider, "repository-local-authority");
requireEqual("evidence.reviewFreshness.enforcedBy", evidence.reviewFreshness?.enforcedBy, "scripts/accepted-risk-register-authority-policy.mjs");
requireEqual("evidence.reviewFreshness.earliestReviewDate", evidence.reviewFreshness?.earliestReviewDate, "2026-08-16");
requireEqual("evidence.requiredOwnerApprovalEvidence.blocker", evidence.requiredOwnerApprovalEvidence?.blocker, "NOG-08");
requireEqual("evidence.requiredOwnerApprovalEvidence.required", evidence.requiredOwnerApprovalEvidence?.required, true);
requireEqual(
  "evidence.requiredOwnerApprovalEvidence.requiredBeforeStatus",
  evidence.requiredOwnerApprovalEvidence?.requiredBeforeStatus,
  "accepted",
);
requireEqual("evidence.requiredOwnerApprovalEvidence.currentEvidenceUrl", evidence.requiredOwnerApprovalEvidence?.currentEvidenceUrl, null);
requireEqual("evidence.requiredOwnerApprovalEvidence.currentState", evidence.requiredOwnerApprovalEvidence?.currentState, "missing");
for (const invariant of [
  "externally attributable repository-owner approval URL",
  "signed Go/No-Go approval matrix URL",
  "GitHub PR review approval by the accountable owner",
]) {
  requireArrayIncludes("evidence.requiredOwnerApprovalEvidence.allowedEvidence", evidence.requiredOwnerApprovalEvidence?.allowedEvidence, invariant);
}
requireEqual(
  "package launch:accepted-risk-evidence:check",
  packageJson.scripts?.["launch:accepted-risk-evidence:check"],
  "node scripts/check-accepted-risk-signoff-evidence-authority.mjs",
);

const guard = evidence.observedVia?.guardCommands?.find(
  (entry) => entry.name === "launch:accepted-risk-evidence:check",
);
requireEqual(
  "evidence guard launch:accepted-risk-evidence:check",
  guard?.command,
  "node scripts/check-accepted-risk-signoff-evidence-authority.mjs",
);
requireEqual("evidence guard disposition", guard?.disposition, "pass_no_acceptance_without_owner_approval");

requireArrayNotIncludes("evidence.acceptedForBlockers", evidence.acceptedForBlockers, "NOG-08");
requireArrayIncludes("evidence.notAcceptedForBlockers", evidence.notAcceptedForBlockers, "NOG-08");
const nog08 = register.blockers?.find((entry) => entry.id === "NOG-08");
requireEqual("NOG-08.status", nog08?.status, "open");
requireEqual("NOG-08.evidence", nog08?.evidence, EVIDENCE_PATH);
requireArrayNotIncludes(
  "register.acceptedEvidence",
  register.acceptedEvidence?.map((entry) => entry.id),
  "NOG-08",
);
requireArrayNotIncludes(
  "candidate.acceptedEvidence",
  candidate.acceptedEvidence?.map((entry) => entry.id),
  "NOG-08",
);

for (const blocker of REMAINING_BLOCKERS) {
  const registerBlocker = register.blockers?.find((entry) => entry.id === blocker);
  requireEqual(`${blocker}.status`, registerBlocker?.status, "open");
  requireArrayIncludes("evidence.notAcceptedForBlockers", evidence.notAcceptedForBlockers, blocker);
}

for (const risk of REQUIRED_RISKS) {
  requireArrayIncludes("evidence.riskRegisterCoverage", evidence.riskRegisterCoverage, risk);
}

for (const invariant of [
  "NOG-08 is not accepted by this artifact because externally attributable owner sign-off evidence is still missing",
  "owner approval evidence must be attached before NOG-08 can move to accepted",
  "Real-money Exchange, custody, deposits, withdrawals, public rewards, enterprise and white-label activation remain NO-GO",
]) {
  requireArrayIncludesText("evidence.acceptanceBoundary", evidence.acceptanceBoundary, invariant);
}

for (const invariant of [
  "protected staging evidence",
  "recovery reconciliation evidence",
  "incident readiness evidence",
  "Go approval matrix",
  "accepted-risk owner sign-off",
  "NOG-08 closure evidence",
  "real-money Exchange activation",
]) {
  requireArrayIncludes("evidence.notAcceptedAs", evidence.notAcceptedAs, invariant);
}

failures.push(...evaluateAcceptedRiskRegisterAuthority(source.acceptedRisks, { referenceDate: REFERENCE_DATE }));

for (const invariant of [
  EVIDENCE_PATH,
  "Accepted-risk owner sign-off evidence",
  "Owner sign-off evidence for NOG-08 is still missing",
  "Go remains blocked by protected staging, recovery reconciliation, incident readiness, accepted-risk owner sign-off and approval evidence.",
]) {
  requireText("packet", source.packet, invariant);
}

for (const invariant of [
  "Accepted-risk owner sign-off evidence",
  "accepted-risk owner sign-off evidence",
]) {
  requireText("candidate ledger", source.candidateHuman, invariant);
}

for (const invariant of [
  "Accepted-risk owner sign-off evidence is missing",
  "Go remains blocked by protected staging, recovery reconciliation, incident readiness, accepted-risk owner sign-off and approvals.",
]) {
  requireText("checklist", source.checklist, invariant);
}

for (const forbidden of [
  "GO_APPROVED",
  "Status:** GO",
  "authorizes production deployment",
  "real-money Exchange is approved",
  "custody is approved",
]) {
  rejectText("evidence", source.evidence, forbidden);
  rejectText("packet", source.packet, forbidden);
  rejectText("checklist", source.checklist, forbidden);
}

if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run launch:accepted-risk-evidence:check")) {
  failures.push("package.json: launch:decision:check must enforce accepted-risk evidence authority");
}

if (failures.length > 0) {
  console.error("Accepted-risk signoff evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Accepted-risk signoff evidence authority passed: NOG-08 remains open until owner sign-off evidence is attached; stale review dates and false acceptance are blocked.",
);
