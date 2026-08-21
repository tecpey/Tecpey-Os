import { readFile } from "node:fs/promises";

const files = {
  evidence: "docs/launch/generated/exact-head-workflow-evidence-20260812.json",
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  packageJson: "package.json",
};

const workflowContract = {
  ciRunUrl: { name: "CI", path: ".github/workflows/ci.yml", event: "push" },
  fullSuiteRunUrl: { name: "Full Suite Diagnostics", path: ".github/workflows/full-suite-diagnostics.yml", event: "push" },
  apiSecurityRunUrl: { name: "API Security Manifest", path: ".github/workflows/api-security-manifest.yml", event: "push" },
  sensitiveMutationRunUrl: { name: "Sensitive Mutation Audit", path: ".github/workflows/sensitive-mutation-audit.yml", event: "push" },
  repositoryAuditRunUrl: { name: "Repository Audit Manifest", path: ".github/workflows/repository-audit-manifest.yml", event: "push" },
  publicGoldenPathRunUrl: { name: "Public Browser Golden Path", path: ".github/workflows/public-browser-golden-path.yml", event: "push" },
  containerSupplyChainRunUrl: { name: "Container Supply Chain", path: ".github/workflows/container-supply-chain.yml", event: "push" },
  secretScanningRunUrl: { name: "Full History Secret Scanning", path: ".github/workflows/secret-scanning.yml", event: "push" },
  operationalRecoveryRunUrl: { name: "Scheduled Operational Recovery", path: ".github/workflows/operational-recovery.yml", event: "workflow_dispatch", v2Only: true },
};

const failures = [];

async function read(path) { return readFile(path, "utf8"); }
async function json(path) {
  try { return JSON.parse(await read(path)); }
  catch { failures.push(`${path}: JSON parse failed`); return {}; }
}
function requireEqual(label, actual, expected) {
  if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function requireArrayIncludes(label, value, expected) {
  if (!Array.isArray(value) || !value.includes(expected)) failures.push(`${label}: missing ${expected}`);
}
function requireArrayExcludes(label, value, unexpected) {
  if (Array.isArray(value) && value.includes(unexpected)) failures.push(`${label}: must not include ${unexpected}`);
}
function requireText(path, source, token, reason) {
  if (!source.replace(/\s+/g, " ").includes(token.replace(/\s+/g, " "))) failures.push(`${path}: ${reason}`);
}
function requireGitHubRunUrl(label, value) {
  if (typeof value !== "string") { failures.push(`${label}: expected GitHub Actions run URL`); return; }
  let parsed;
  try { parsed = new URL(value); } catch { failures.push(`${label}: expected absolute URL`); return; }
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parsed.search || parsed.hash || !/^\/tecpey\/Tecpey-Os\/actions\/runs\/[1-9][0-9]*\/?$/.test(parsed.pathname)) {
    failures.push(`${label}: expected governed tecpey/Tecpey-Os GitHub Actions run URL`);
  }
}

const [evidence, register, candidate, packet, checklist, packageJson] = await Promise.all([
  json(files.evidence), json(files.register), json(files.candidate), read(files.packet), read(files.checklist), json(files.packageJson),
]);

const selectedSha = candidate.currentCandidate?.sha;
if (![1, 2].includes(evidence.schemaVersion)) failures.push("evidence.schemaVersion: expected 1 or 2");
const v2 = evidence.schemaVersion === 2;
requireEqual("evidence.evidenceClass", evidence.evidenceClass, "exact-head-workflow-evidence");
requireEqual("evidence.decision", evidence.decision, "NO_GO_NOG_04_ACCEPTED_EXACT_HEAD_WORKFLOW_URLS_ONLY");
requireEqual("evidence.selectedSha", evidence.selectedSha, selectedSha);
requireEqual("register.stagingEvidenceTargetSha", register.stagingEvidenceTargetSha, selectedSha);
requireEqual("register.exactHeadWorkflowEvidence", register.exactHeadWorkflowEvidence, files.evidence);
requireEqual("candidate.activeInputs.exactHeadWorkflowEvidence", candidate.activeInputs?.exactHeadWorkflowEvidence, files.evidence);

const blocker = register.blockers?.find((entry) => entry.id === "NOG-04");
requireEqual("NOG-04.status", blocker?.status, "accepted");
requireEqual("NOG-04.executionState", blocker?.executionState, "accepted_exact_head_workflow_urls");
requireEqual("NOG-04.evidence", blocker?.evidence, files.evidence);
requireArrayIncludes("register.acceptedEvidence", register.acceptedEvidence?.map((entry) => entry.id), "NOG-04");
requireArrayIncludes("candidate.acceptedEvidence", candidate.acceptedEvidence?.map((entry) => entry.id), "NOG-04");
requireArrayIncludes("evidence.acceptedForBlockers", evidence.acceptedForBlockers, "NOG-04");

for (const blockerId of ["NOG-01", "NOG-02"]) {
  const entry = register.blockers?.find((candidateBlocker) => candidateBlocker.id === blockerId);
  requireEqual(`${blockerId}.status`, entry?.status, "open");
  requireEqual(`${blockerId}.executionState`, entry?.executionState, "blocked_pending_protected_environment_rules_and_workflow_dispatch");
  requireArrayIncludes("evidence.notAcceptedForBlockers", evidence.notAcceptedForBlockers, blockerId);
}

const seenUrls = new Set();
for (const [field, contract] of Object.entries(workflowContract)) {
  if (contract.v2Only && !v2) continue;
  const value = evidence.workflowEvidence?.[field];
  requireGitHubRunUrl(`evidence.workflowEvidence.${field}`, value);
  if (seenUrls.has(value)) failures.push(`evidence.workflowEvidence.${field}: duplicate GitHub Actions run URL`);
  seenUrls.add(value);

  const run = evidence.workflowRuns?.find((candidateRun) => candidateRun.name === contract.name);
  requireEqual(`${contract.name}.runUrl`, run?.runUrl, value);
  requireEqual(`${contract.name}.status`, run?.status, "completed");
  requireEqual(`${contract.name}.conclusion`, run?.conclusion, "success");
  requireEqual(`${contract.name}.event`, run?.event, contract.event);
  if (v2) {
    requireEqual(`${contract.name}.workflowPath`, run?.workflowPath, contract.path);
    requireEqual(`${contract.name}.headSha`, run?.headSha, selectedSha);
    requireEqual(`${contract.name}.headBranch`, run?.headBranch, "main");
  }
}

if (v2) {
  requireArrayExcludes("evidence.remainingFinalManifestGaps", evidence.remainingFinalManifestGaps, "operational recovery/reconciliation evidence and digest");
} else {
  requireEqual("evidence.workflowEvidence.operationalRecoveryRunUrl", evidence.workflowEvidence?.operationalRecoveryRunUrl, null);
  requireArrayIncludes("evidence.remainingFinalManifestGaps", evidence.remainingFinalManifestGaps, "operational recovery/reconciliation evidence and digest");
}

for (const invariant of [files.evidence, "NOG-04 is accepted for exact-head workflow URL attachment only", "NOG-01 and NOG-02"]) {
  requireText(files.packet, packet, invariant, `packet is missing NOG-04 invariant: ${invariant}`);
}
for (const invariant of [
  "Exact-head CI, Full Suite, API Security, Sensitive Mutation, Repository Audit, Public Golden Path, Container Supply Chain and Secret Scanning URLs are accepted for NOG-04",
  "NO-GO remains until protected staging, recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence is accepted",
]) {
  requireText(files.checklist, checklist, invariant, `checklist is missing NOG-04 boundary: ${invariant}`);
}
requireText(files.packageJson, JSON.stringify(packageJson), "launch:workflow-evidence:check", "package.json must expose the exact-head workflow evidence guard");
requireText(files.packageJson, packageJson.scripts?.["launch:decision:check"] ?? "", "npm run launch:workflow-evidence:check", "launch:decision:check must enforce the exact-head workflow evidence guard");

const serializedEvidence = JSON.stringify(evidence);
for (const forbidden of [/postgres(?:ql)?:\/\//i, /DATABASE_URL/i, /BEGIN [A-Z ]*PRIVATE KEY/i, /\bsk-[A-Za-z0-9_-]{20,}\b/, /\b(?:\d{1,3}\.){3}\d{1,3}\b/]) {
  if (forbidden.test(serializedEvidence)) failures.push(`${files.evidence}: evidence must not contain secrets, connection strings or host identifiers`);
}

if (failures.length > 0) {
  console.error("Exact-head workflow evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Exact-head workflow evidence authority passed for ${selectedSha} using schema v${evidence.schemaVersion}.`);
