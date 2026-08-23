import { readFile } from "node:fs/promises";
import { exactHeadWorkflowEvidenceFindings } from "./exact-head-workflow-evidence-policy.mjs";
import { exactHeadWorkflowEvidenceOriginFindings } from "./exact-head-workflow-evidence-origin.mjs";

const files = {
  evidence: "docs/launch/generated/exact-head-workflow-evidence-20260812.json",
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  packageJson: "package.json",
};

const failures = [];
const originVerificationMode =
  process.argv.includes("--static-only") ||
  process.env.TECPEY_EXACT_HEAD_ORIGIN_VERIFICATION === "static-only"
    ? "static-only"
    : "required";

async function read(path) {
  return readFile(path, "utf8");
}

async function json(path) {
  try {
    return JSON.parse(await read(path));
  } catch {
    failures.push(`${path}: JSON parse failed`);
    return {};
  }
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireArrayIncludes(label, value, expected) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    failures.push(`${label}: missing ${expected}`);
  }
}

function requireText(path, source, token, reason) {
  if (!source.replace(/\s+/g, " ").includes(token.replace(/\s+/g, " "))) {
    failures.push(`${path}: ${reason}`);
  }
}

function requireAnyText(path, source, tokens, reason) {
  const normalized = source.replace(/\s+/g, " ");
  if (!tokens.some((token) => normalized.includes(token.replace(/\s+/g, " ")))) {
    failures.push(`${path}: ${reason}`);
  }
}

const [evidence, register, candidate, packet, checklist, packageJson] = await Promise.all([
  json(files.evidence),
  json(files.register),
  json(files.candidate),
  read(files.packet),
  read(files.checklist),
  json(files.packageJson),
]);

const selectedSha = candidate.currentCandidate?.sha;

// Preserve critical launch-decision sentinels directly in this authority surface.
// Detailed schema validation is delegated to the policy module below, while these
// checks keep the parent controlled-launch decision guard fail-closed across refactors.
requireEqual("evidence.evidenceClass", evidence.evidenceClass, "exact-head-workflow-evidence");
requireEqual(
  "evidence.decision",
  evidence.decision,
  "NO_GO_NOG_04_ACCEPTED_EXACT_HEAD_WORKFLOW_URLS_ONLY",
);
if (evidence.schemaVersion === 1) {
  requireEqual(
    "evidence.workflowEvidence.operationalRecoveryRunUrl",
    evidence.workflowEvidence?.operationalRecoveryRunUrl,
    null,
  );
} else if (evidence.schemaVersion === 2) {
  const operationalRecoveryRun = evidence.workflowRuns?.find(
    (run) => run?.name === "Scheduled Operational Recovery",
  );
  requireEqual(
    "Scheduled Operational Recovery.runUrl",
    operationalRecoveryRun?.runUrl,
    evidence.workflowEvidence?.operationalRecoveryRunUrl,
  );
}

failures.push(...exactHeadWorkflowEvidenceFindings({ evidence, selectedSha }));
if (originVerificationMode === "required") {
  failures.push(
    ...(await exactHeadWorkflowEvidenceOriginFindings({
      evidence,
      selectedSha,
      token: process.env.GITHUB_TOKEN,
    })),
  );
}

requireEqual("register.stagingEvidenceTargetSha", register.stagingEvidenceTargetSha, selectedSha);
requireEqual("register.exactHeadWorkflowEvidence", register.exactHeadWorkflowEvidence, files.evidence);
requireEqual(
  "candidate.activeInputs.exactHeadWorkflowEvidence",
  candidate.activeInputs?.exactHeadWorkflowEvidence,
  files.evidence,
);

const blocker = register.blockers?.find((entry) => entry.id === "NOG-04");
requireEqual("NOG-04.status", blocker?.status, "accepted");
requireEqual("NOG-04.executionState", blocker?.executionState, "accepted_exact_head_workflow_urls");
requireEqual("NOG-04.evidence", blocker?.evidence, files.evidence);
requireArrayIncludes(
  "register.acceptedEvidence",
  register.acceptedEvidence?.map((entry) => entry.id),
  "NOG-04",
);
requireArrayIncludes(
  "candidate.acceptedEvidence",
  candidate.acceptedEvidence?.map((entry) => entry.id),
  "NOG-04",
);
requireArrayIncludes("evidence.acceptedForBlockers", evidence.acceptedForBlockers, "NOG-04");

const acceptedProtectedStagingExecutionStates = {
  "NOG-01": "accepted_exact_candidate_protected_staging_activation",
  "NOG-02": "accepted_exact_candidate_redacted_environment_evidence",
};
const protectedStagingEntries = ["NOG-01", "NOG-02"].map((blockerId) =>
  register.blockers?.find((candidateBlocker) => candidateBlocker.id === blockerId),
);
const protectedStagingState =
  protectedStagingEntries.every((entry) => entry?.status === "open")
    ? "open"
    : protectedStagingEntries.every((entry) => entry?.status === "accepted")
      ? "accepted"
      : "incoherent";
if (protectedStagingState === "incoherent") {
  failures.push("NOG-01/NOG-02: statuses must transition atomically from open to accepted");
}
for (const blockerId of ["NOG-01", "NOG-02"]) {
  const entry = register.blockers?.find((candidateBlocker) => candidateBlocker.id === blockerId);
  if (protectedStagingState === "open") {
    requireEqual(`${blockerId}.executionState`, entry?.executionState, "blocked_pending_protected_environment_rules_and_workflow_dispatch");
    requireEqual(
      `${blockerId}.currentObservationState`,
      entry?.currentObservationState,
      "blocked_pending_exact_candidate_deployment_and_successful_workflow_dispatch",
    );
  } else if (protectedStagingState === "accepted") {
    requireEqual(
      `${blockerId}.executionState`,
      entry?.executionState,
      acceptedProtectedStagingExecutionStates[blockerId],
    );
    requireEqual(
      `${blockerId}.currentObservationState`,
      entry?.currentObservationState,
      "accepted_exact_candidate_evidence_verified",
    );
    requireEqual(`${blockerId}.selectedSha`, entry?.selectedSha, selectedSha);
  }
  // NOG-04 evidence does not itself close NOG-01/NOG-02; their separate
  // protected-staging evidence is recorded by the execution-status authority.
  requireArrayIncludes("evidence.notAcceptedForBlockers", evidence.notAcceptedForBlockers, blockerId);
}

for (const invariant of [
  files.evidence,
  "NOG-04 is accepted for exact-head workflow URL attachment only",
  "NOG-01 and NOG-02",
]) {
  requireText(files.packet, packet, invariant, `packet is missing NOG-04 invariant: ${invariant}`);
}
requireText(
  files.checklist,
  checklist,
  "Exact-head CI, Full Suite, API Security, Sensitive Mutation, Repository Audit, Public Golden Path, Container Supply Chain and Secret Scanning URLs are accepted for NOG-04",
  "checklist is missing the NOG-04 accepted-workflow boundary",
);
requireAnyText(
  files.checklist,
  checklist,
  [
    "NO-GO remains until protected staging, recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence is accepted",
    "NO-GO remains until recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence is accepted",
    "NO-GO remains until incident, accepted-risk owner sign-off and approval evidence is accepted",
  ],
  "checklist is missing a coherent pre- or post-protected-staging NOG-04 boundary",
);
requireText(
  files.packageJson,
  JSON.stringify(packageJson),
  "launch:workflow-evidence:check",
  "package.json must expose the exact-head workflow evidence guard",
);
requireText(
  files.packageJson,
  packageJson.scripts?.["launch:decision:check"] ?? "",
  "npm run launch:workflow-evidence:check",
  "launch:decision:check must enforce the exact-head workflow evidence guard",
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
    failures.push(`${files.evidence}: evidence must not contain secrets, connection strings or host identifiers`);
  }
}

if (failures.length > 0) {
  console.error("Exact-head workflow evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Exact-head workflow evidence authority passed for ${selectedSha} using schema v${evidence.schemaVersion}.`,
);
