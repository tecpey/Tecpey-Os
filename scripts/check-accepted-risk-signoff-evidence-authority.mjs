import { readFile } from "node:fs/promises";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";

const EVIDENCE_PATH = "docs/launch/generated/accepted-risk-signoff-evidence-20260812.json";
const REQUIRED_RISKS = ["R-01", "R-02", "R-04", "R-05", "R-06", "R-07", "R-08", "R-09", "R-10"];
const REMAINING_BLOCKERS = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-09"];

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
requireEqual("evidence.evidenceClass", evidence.evidenceClass, "accepted-risk-signoff-evidence");
requireEqual(
  "evidence.decision",
  evidence.decision,
  "NO_GO_NOG_08_ACCEPTED_RISK_REGISTER_CURRENT_SCOPE_ONLY",
);
requireEqual("evidence.selectedSha", evidence.selectedSha, candidate.currentCandidate?.sha);
requireEqual("evidence.sourcePullRequest", evidence.sourcePullRequest, 388);
requireEqual("evidence.observedVia.provider", evidence.observedVia?.provider, "repository-local-authority");
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
requireEqual("evidence guard disposition", guard?.disposition, "pass");

requireArrayIncludes("evidence.acceptedForBlockers", evidence.acceptedForBlockers, "NOG-08");
const nog08 = register.blockers?.find((entry) => entry.id === "NOG-08");
requireEqual("NOG-08.status", nog08?.status, "accepted");
requireEqual("NOG-08.executionState", nog08?.executionState, "accepted_controlled_launch_risk_register_current");
requireEqual("NOG-08.evidence", nog08?.evidence, EVIDENCE_PATH);
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

for (const blocker of REMAINING_BLOCKERS) {
  const registerBlocker = register.blockers?.find((entry) => entry.id === blocker);
  requireEqual(`${blocker}.status`, registerBlocker?.status, "open");
  requireArrayIncludes("evidence.notAcceptedForBlockers", evidence.notAcceptedForBlockers, blocker);
}

for (const risk of REQUIRED_RISKS) {
  requireArrayIncludes("evidence.riskRegisterCoverage", evidence.riskRegisterCoverage, risk);
}

for (const invariant of [
  "NOG-08 is accepted only as current controlled-launch accepted-risk register evidence",
  "This evidence does not approve a Go decision",
  "Real-money Exchange, custody, deposits, withdrawals, public rewards, enterprise and white-label activation remain NO-GO",
]) {
  requireArrayIncludesText("evidence.acceptanceBoundary", evidence.acceptanceBoundary, invariant);
}

for (const invariant of [
  "protected staging evidence",
  "recovery reconciliation evidence",
  "incident readiness evidence",
  "Go approval matrix",
  "real-money Exchange activation",
]) {
  requireArrayIncludes("evidence.notAcceptedAs", evidence.notAcceptedAs, invariant);
}

failures.push(...evaluateAcceptedRiskRegisterAuthority(source.acceptedRisks));

for (const invariant of [
  EVIDENCE_PATH,
  "Accepted-risk sign-off evidence",
  "Accepted-risk register evidence for NOG-08",
  "Go remains blocked by protected staging, recovery reconciliation, incident readiness and approval evidence.",
]) {
  requireText("packet", source.packet, invariant);
}

for (const invariant of [
  "Accepted-risk sign-off evidence",
  "accepted-risk register evidence for NOG-08",
]) {
  requireText("candidate ledger", source.candidateHuman, invariant);
}

for (const invariant of [
  "Accepted-risk register evidence is accepted for NOG-08",
  "Go remains blocked by protected staging, recovery reconciliation, incident readiness and approvals.",
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
  "Accepted-risk signoff evidence authority passed: NOG-08 is accepted only as current controlled-launch risk-register evidence, while Go remains blocked by staging, recovery, incident and approval evidence.",
);
