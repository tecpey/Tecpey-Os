import { readFile } from "node:fs/promises";

const files = {
  status: "docs/launch/generated/protected-staging-execution-status-20260812.json",
  request: "docs/launch/generated/protected-staging-env-evidence-request-20260810.json",
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  runbook: "docs/operations/PROTECTED_STAGING_ACTIVATION_ENV_EVIDENCE_RUNBOOK_20260810.md",
  environmentProtectionRunbook:
    "docs/operations/GITHUB_STAGING_ENVIRONMENT_PROTECTION_RUNBOOK_20260812.md",
  packageJson: "package.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const normalized = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, value.replace(/\s+/g, " ")]),
);
const status = JSON.parse(source.status);
const request = JSON.parse(source.request);
const register = JSON.parse(source.register);
const failures = [];

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

function requireText(target, token, reason) {
  if (!normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

requireEqual("status.schemaVersion", status.schemaVersion, 1);
requireEqual(
  "status.evidenceClass",
  status.evidenceClass,
  "protected-staging-execution-status-observation",
);
requireEqual(
  "status.decision",
  status.decision,
  "NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED",
);
for (const blocker of ["NOG-01", "NOG-02"]) {
  requireArrayIncludes("status.relatedBlockers", status.relatedBlockers, blocker);
}

const currentSha = request.releaseLineage?.protectedStagingEvidenceTargetSha;
requireEqual(
  "status.releaseLineage.protectedStagingEvidenceTargetSha",
  status.releaseLineage?.protectedStagingEvidenceTargetSha,
  currentSha,
);
requireEqual(
  "register.stagingEvidenceTargetSha",
  register.stagingEvidenceTargetSha,
  currentSha,
);
requireEqual(
  "request.executionStatusObservation",
  request.executionStatusObservation,
  files.status,
);
requireEqual(
  "register.executionStatusObservation",
  register.executionStatusObservation,
  files.status,
);
requireEqual(
  "request.environmentProtectionRunbook",
  request.environmentProtectionRunbook,
  files.environmentProtectionRunbook,
);
requireEqual(
  "register.executionRequests[0].environmentProtectionRunbook",
  register.executionRequests?.[0]?.environmentProtectionRunbook,
  files.environmentProtectionRunbook,
);

requireEqual("status.githubEnvironment.name", status.githubEnvironment?.name, "staging");
requireEqual("status.githubEnvironment.exists", status.githubEnvironment?.exists, true);
requireEqual(
  "status.githubEnvironment.protectionDisposition",
  status.githubEnvironment?.protectionDisposition,
  "failed_no_protection_rules_observed",
);
if ((status.githubEnvironment?.protectionRulesCount ?? 0) > 0) {
  failures.push("status.githubEnvironment.protectionRulesCount: update this observation before acceptance");
}

requireEqual(
  "status.workflows.protectedStagingEnvEvidence.disposition",
  status.workflows?.protectedStagingEnvEvidence?.disposition,
  "blocked_no_runs_observed",
);
requireEqual(
  "status.workflows.stagingCommunityChallengeSchedulerEvidence.disposition",
  status.workflows?.stagingCommunityChallengeSchedulerEvidence?.disposition,
  "blocked_no_accepted_current_candidate_run",
);
requireEqual(
  "status.workflows.protectedStagingEnvEvidence.acceptedRunUrl",
  status.workflows?.protectedStagingEnvEvidence?.acceptedRunUrl,
  null,
);
requireEqual(
  "status.workflows.stagingCommunityChallengeSchedulerEvidence.acceptedRunUrl",
  status.workflows?.stagingCommunityChallengeSchedulerEvidence?.acceptedRunUrl,
  null,
);

for (const field of [
  "rawSecretsObserved",
  "rawSecretsRecorded",
  "hostIdentifiersRecorded",
  "runnerNamesRecorded",
  "rawLogsRecorded",
]) {
  requireEqual(`status.privacyBoundary.${field}`, status.privacyBoundary?.[field], false);
}

for (const blocker of register.blockers.filter((entry) => ["NOG-01", "NOG-02"].includes(entry.id))) {
  requireEqual(`${blocker.id}.status`, blocker.status, "open");
  requireEqual(
    `${blocker.id}.executionState`,
    blocker.executionState,
    "blocked_pending_protected_environment_rules_and_workflow_dispatch",
  );
}
requireEqual(
  "register.executionRequests[0].status",
  register.executionRequests?.[0]?.status,
  "blocked_pending_protected_environment_rules_and_workflow_dispatch",
);

for (const invariant of [
  "protected-staging-execution-status-20260812.json",
  "NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED",
  "protection_rules: []",
  "NOG-01 and NOG-02 remain open",
]) {
  requireText("packet", invariant, `packet is missing execution-status invariant: ${invariant}`);
  requireText("runbook", invariant, `runbook is missing execution-status invariant: ${invariant}`);
}
for (const invariant of [
  "GITHUB_STAGING_ENVIRONMENT_PROTECTION_RUNBOOK_20260812.md",
  "protection_rules: []",
]) {
  requireText("packet", invariant, `packet is missing environment-protection invariant: ${invariant}`);
  requireText("runbook", invariant, `runbook is missing environment-protection invariant: ${invariant}`);
}
for (const invariant of [
  "Environment name",
  "Required reviewers",
  "self-hosted",
  "linux",
  "x64",
  "tecpey-staging",
  "TECPEY_STAGING_ENV_FILE",
  "NO_GO_PROTECTED_STAGING_EXECUTION_BLOCKED",
]) {
  requireText(
    "environmentProtectionRunbook",
    invariant,
    `environment protection runbook is missing invariant: ${invariant}`,
  );
}
for (const invariant of [
  "\"ops:staging:execution-status:check\"",
  "scripts/check-protected-staging-execution-status.mjs",
]) {
  requireText("packageJson", invariant, `package.json is missing execution-status guard: ${invariant}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Protected staging execution status guard passed.");
}
