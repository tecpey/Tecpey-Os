import { readFile } from "node:fs/promises";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";

const EVIDENCE_PATH = "docs/launch/generated/accepted-risk-signoff-evidence-20260812.json";
const REQUIRED_RISKS = ["R-01", "R-02", "R-04", "R-05", "R-06", "R-07", "R-08", "R-09", "R-10"];
const PROTECTED_STAGING_BLOCKERS = ["NOG-01", "NOG-02"];
const REQUIRED_OPEN_BLOCKERS = ["NOG-07", "NOG-08", "NOG-09"];
const REQUIRED_RISK_CONDITIONS = [
  "exact candidate SHA accepted",
  "controlled public FA/EN, Academy, Mentor and virtual Arena only",
  "risk thresholds and rollback triggers from docs/LAUNCH_ACCEPTED_RISKS.md accepted",
  "real-money Exchange remains disabled",
  "custody deposits withdrawals remain disabled",
  "enterprise white-label public rewards remain disabled",
];
const REFERENCE_DATE = process.env.TECPEY_ACCEPTED_RISK_REFERENCE_DATE ?? new Date().toISOString();

const files = {
  evidence: EVIDENCE_PATH,
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  candidateHuman: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  acceptedRisks: "docs/LAUNCH_ACCEPTED_RISKS.md",
  verifier: "scripts/verify-accepted-risk-signoff-evidence.mjs",
  verifierTest: "scripts/accepted-risk-signoff-evidence.test.mjs",
  packageJson: "package.json",
  workflow: ".github/workflows/ci.yml",
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

function requireAnyText(label, text, tokens) {
  if (!tokens.some((token) => normalized(text).includes(normalized(token)))) {
    failures.push(`${label} is missing one of: ${tokens.join(" | ")}`);
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
requireEqual("evidence.requestPath", evidence.requestPath, EVIDENCE_PATH);
requireEqual("evidence.blocker", evidence.blocker, "NOG-08");
requireEqual("evidence.status", evidence.status, "open");
requireEqual("evidence.requiredEnvironment", evidence.requiredEnvironment, "release-control");
requireEqual("evidence.verifier", evidence.verifier, "scripts/verify-accepted-risk-signoff-evidence.mjs");
requireEqual("evidence.requiredArtifact.authority", evidence.requiredArtifact?.authority, "tecpey-accepted-risk-owner-signoff-v1");
requireEqual(
  "evidence.requiredArtifact.evidenceClass",
  evidence.requiredArtifact?.evidenceClass,
  "controlled-soft-launch-accepted-risk-owner-signoff",
);
requireEqual("evidence.requiredArtifact.sourceSha", evidence.requiredArtifact?.sourceSha, candidate.currentCandidate?.sha);
requireEqual(
  "evidence.requiredArtifact.launchScopeId",
  evidence.requiredArtifact?.launchScopeId,
  "controlled-public-fa-en-academy-mentor-arena",
);
requireEqual(
  "evidence.requiredArtifact.riskRegister.minimumReviewDate",
  evidence.requiredArtifact?.riskRegister?.minimumReviewDate,
  "2026-08-16",
);
requireEqual(
  "evidence.requiredArtifact.riskOwnerSignoffs.requiredForEveryCoveredRisk",
  evidence.requiredArtifact?.riskOwnerSignoffs?.requiredForEveryCoveredRisk,
  true,
);
requireEqual(
  "evidence.requiredArtifact.riskOwnerSignoffs.minimumDistinctApprovalOwners",
  evidence.requiredArtifact?.riskOwnerSignoffs?.minimumDistinctApprovalOwners,
  3,
);
requireEqual("evidence.requiredArtifact.finalDisposition", evidence.requiredArtifact?.finalDisposition, "accepted");
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
  "owner sign-off artifact that passes scripts/verify-accepted-risk-signoff-evidence.mjs",
]) {
  requireArrayIncludes("evidence.requiredOwnerApprovalEvidence.allowedEvidence", evidence.requiredOwnerApprovalEvidence?.allowedEvidence, invariant);
}

for (const risk of REQUIRED_RISKS) {
  requireArrayIncludes("evidence.riskRegisterCoverage", evidence.riskRegisterCoverage, risk);
  requireArrayIncludes("evidence.requiredArtifact.riskRegister.coveredRisks", evidence.requiredArtifact?.riskRegister?.coveredRisks, risk);
}

for (const condition of REQUIRED_RISK_CONDITIONS) {
  requireArrayIncludes("evidence.requiredArtifact.approvalConditions", evidence.requiredArtifact?.approvalConditions, condition);
}

for (const [name, command] of [
  ["launch:accepted-risk-evidence:check", "node scripts/check-accepted-risk-signoff-evidence-authority.mjs"],
  ["ops:accepted-risk:evidence:verify", "node scripts/verify-accepted-risk-signoff-evidence.mjs"],
  ["test:accepted-risk-signoff-evidence", "node --test scripts/accepted-risk-signoff-evidence.test.mjs"],
]) {
  requireEqual(`package ${name}`, packageJson.scripts?.[name], command);
  const guard = evidence.guardCommands?.find((entry) => entry.name === name);
  requireEqual(`evidence guard ${name}`, guard?.command.startsWith(command), true);
}

const observedGuard = evidence.observedVia?.guardCommands?.find(
  (entry) => entry.name === "launch:accepted-risk-evidence:check",
);
requireEqual(
  "evidence observed guard launch:accepted-risk-evidence:check",
  observedGuard?.command,
  "node scripts/check-accepted-risk-signoff-evidence-authority.mjs",
);
requireEqual("evidence observed guard disposition", observedGuard?.disposition, "pass_no_acceptance_without_owner_approval");

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

for (const blocker of [...PROTECTED_STAGING_BLOCKERS, ...REQUIRED_OPEN_BLOCKERS]) {
  requireArrayIncludes("evidence.notAcceptedForBlockers", evidence.notAcceptedForBlockers, blocker);
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

for (const invariant of [
  "NOG-08 is not accepted by this artifact because externally attributable owner sign-off evidence is still missing",
  "owner approval evidence must be attached and pass scripts/verify-accepted-risk-signoff-evidence.mjs before NOG-08 can move to accepted",
  "every controlled-launch risk owner sign-off",
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

for (const invariant of [
  "verifyAcceptedRiskSignoffEvidence",
  "tecpey-accepted-risk-owner-signoff-v1",
  "controlled-soft-launch-accepted-risk-owner-signoff",
  "REQUIRED_CONTROLLED_LAUNCH_RISKS",
  "controlled-public-fa-en-academy-mentor-arena",
  "accepted-risk-register-approved-for-controlled-soft-launch-only",
  "accepted_risk_signoff_independence_invalid",
  "no-secrets-or-connection-urls",
  "no-host-ips",
]) {
  requireText("verifier", source.verifier, invariant);
}

for (const invariant of [
  "accepts complete accepted-risk owner signoff evidence",
  "rejects stale candidate SHA",
  "rejects stale review date",
  "rejects rejected owner signoff",
  "rejects operator self-approval",
]) {
  requireText("verifier test", source.verifierTest, invariant);
}

failures.push(...evaluateAcceptedRiskRegisterAuthority(source.acceptedRisks, { referenceDate: REFERENCE_DATE }));

for (const invariant of [
  EVIDENCE_PATH,
  "Accepted-risk owner sign-off evidence",
  "Owner sign-off evidence for NOG-08 is still missing",
]) {
  requireText("packet", source.packet, invariant);
}
requireAnyText("packet", source.packet, [
  "Go remains blocked by protected staging, recovery reconciliation, incident readiness, accepted-risk owner sign-off and approval evidence.",
  "Go remains blocked by recovery reconciliation, incident readiness, accepted-risk owner sign-off and approval evidence.",
  "Go remains blocked by incident readiness, accepted-risk owner sign-off and approval evidence.",
]);

for (const invariant of [
  "Accepted-risk owner sign-off evidence",
  "accepted-risk owner sign-off evidence",
]) {
  requireText("candidate ledger", source.candidateHuman, invariant);
}

requireText("checklist", source.checklist, "Accepted-risk owner sign-off evidence is missing");
requireAnyText("checklist", source.checklist, [
  "Go remains blocked by protected staging, recovery reconciliation, incident readiness, accepted-risk owner sign-off and approvals.",
  "Go remains blocked by recovery reconciliation, incident readiness, accepted-risk owner sign-off and approvals.",
  "Go remains blocked by incident readiness, accepted-risk owner sign-off and approvals.",
]);

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

const serializedEvidence = JSON.stringify(evidence);
for (const forbidden of [
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
]) {
  if (forbidden.test(serializedEvidence)) {
    failures.push(`${files.evidence}: evidence must not contain secrets, connection strings or host identifiers`);
  }
}

if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run launch:accepted-risk-evidence:check")) {
  failures.push("package.json: launch:decision:check must enforce accepted-risk evidence authority");
}
if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run test:accepted-risk-signoff-evidence")) {
  failures.push("package.json: launch:decision:check must run accepted-risk signoff verifier tests");
}

for (const invariant of [
  "Accepted-risk signoff evidence authority guard",
  "npm run launch:accepted-risk-evidence:check",
]) {
  requireText("workflow", source.workflow, invariant);
}

if (failures.length > 0) {
  console.error("Accepted-risk signoff evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Accepted-risk signoff evidence authority passed: NOG-08 remains open until owner sign-off evidence is attached; stale review dates and false acceptance are blocked.",
);
