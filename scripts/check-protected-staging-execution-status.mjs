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
const sha256Pattern = /^sha256:[0-9a-f]{64}$/;
const exactShaPattern = /^[0-9a-f]{40}$/;
const remainingBlockers = ["NOG-08", "NOG-09"];

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

function requireArrayExact(label, value, expected) {
  if (!Array.isArray(value)) {
    failures.push(`${label}: expected array`);
    return;
  }
  if (value.length !== expected.length || expected.some((item) => !value.includes(item))) {
    failures.push(`${label}: expected exactly ${expected.join(", ")}`);
  }
}

function requirePattern(label, value, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    failures.push(`${label}: invalid value ${JSON.stringify(value)}`);
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
  "NO_GO_NOG_01_NOG_02_ACCEPTED_REMAINING_BLOCKERS_OPEN",
);
for (const blocker of ["NOG-01", "NOG-02"]) {
  requireArrayIncludes("status.relatedBlockers", status.relatedBlockers, blocker);
}

const currentSha = request.releaseLineage?.protectedStagingEvidenceTargetSha;
requirePattern("request.releaseLineage.protectedStagingEvidenceTargetSha", currentSha, exactShaPattern);
requireEqual(
  "status.releaseLineage.protectedStagingEvidenceTargetSha",
  status.releaseLineage?.protectedStagingEvidenceTargetSha,
  currentSha,
);
requireEqual("status.runtimeDeployment.releaseSha", status.runtimeDeployment?.releaseSha, currentSha);
requireEqual("status.runtimeDeployment.healthCommitSha", status.runtimeDeployment?.healthCommitSha, currentSha);
requireEqual(
  "status.runtimeDeployment.deploymentDisposition",
  status.runtimeDeployment?.deploymentDisposition,
  "accepted_exact_candidate_immutable_release",
);
requireEqual("status.runtimeDeployment.serviceActiveState", status.runtimeDeployment?.serviceActiveState, "active");
requireEqual("status.runtimeDeployment.serviceSubState", status.runtimeDeployment?.serviceSubState, "running");
requireEqual("register.stagingEvidenceTargetSha", register.stagingEvidenceTargetSha, currentSha);
requireEqual("request.executionStatusObservation", request.executionStatusObservation, files.status);
requireEqual("register.executionStatusObservation", register.executionStatusObservation, files.status);
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
  "passed_required_reviewer_and_branch_policy_no_admin_bypass",
);
requireEqual("status.githubEnvironment.protectionRulesCount", status.githubEnvironment?.protectionRulesCount, 2);
requireEqual("status.githubEnvironment.canAdminsBypass", status.githubEnvironment?.canAdminsBypass, false);
for (const ruleType of ["required_reviewers", "branch_policy"]) {
  requireArrayIncludes("status.githubEnvironment.observedRuleTypes", status.githubEnvironment?.observedRuleTypes, ruleType);
}

const workflowExpectations = [
  {
    key: "protectedStagingEnvEvidence",
    blocker: "NOG-02",
    runUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/32644937055",
    artifactName: `tecpey-staging-env-evidence-${currentSha}`,
    artifactDigest: "sha256:bd8cd520526d7520883218697dad9af9eec1dcbe8eca7db163493d5dd254f5d5",
  },
  {
    key: "stagingCommunityChallengeSchedulerEvidence",
    blocker: "NOG-01",
    runUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/32648754664",
    artifactName: `tecpey-staging-scheduler-evidence-${currentSha}`,
    artifactDigest: "sha256:ea3cfb4bbd188988063d31e393556aebb4ea9359e9c96d2b9a68de44b14dde4d",
  },
];

for (const expected of workflowExpectations) {
  const workflow = status.workflows?.[expected.key];
  requireEqual(`${expected.key}.acceptedForBlocker`, workflow?.acceptedForBlocker, expected.blocker);
  requireEqual(`${expected.key}.selectedReleaseSha`, workflow?.selectedReleaseSha, currentSha);
  requireEqual(`${expected.key}.runConclusion`, workflow?.runConclusion, "success");
  requireEqual(`${expected.key}.acceptedRunUrl`, workflow?.acceptedRunUrl, expected.runUrl);
  requireEqual(`${expected.key}.acceptedArtifactName`, workflow?.acceptedArtifactName, expected.artifactName);
  requireEqual(`${expected.key}.artifactDigest`, workflow?.artifactDigest, expected.artifactDigest);
  requirePattern(`${expected.key}.artifactDigest format`, workflow?.artifactDigest, sha256Pattern);
  requireEqual(`${expected.key}.detachedDigestDisposition`, workflow?.detachedDigestDisposition, "verified");
  requireEqual(`${expected.key}.offlineVerifierDisposition`, workflow?.offlineVerifierDisposition, "passed");
  requireEqual(
    `${expected.key}.disposition`,
    workflow?.disposition,
    "accepted_exact_candidate_artifact_and_detached_digest",
  );
}

requireEqual(
  "protectedStagingEnvEvidence.environmentSource",
  status.workflows?.protectedStagingEnvEvidence?.environmentSource,
  "protected_host_env_file",
);
requireEqual(
  "stagingCommunityChallengeSchedulerEvidence.alertProbeDelivered",
  status.workflows?.stagingCommunityChallengeSchedulerEvidence?.alertProbeDelivered,
  true,
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

requireEqual(
  "request.decision",
  request.decision,
  "NO_GO_NOG_01_NOG_02_ACCEPTED_EXACT_CANDIDATE_ONLY",
);
requireEqual("request.nog01.status", request.nog01?.status, "accepted_exact_candidate_evidence");
requireEqual("request.nog02.status", request.nog02?.status, "accepted_exact_candidate_evidence");
requireEqual("request.nog01.acceptedEvidence.selectedReleaseSha", request.nog01?.acceptedEvidence?.selectedReleaseSha, currentSha);
requireEqual("request.nog02.acceptedEvidence.selectedReleaseSha", request.nog02?.acceptedEvidence?.selectedReleaseSha, currentSha);

for (const blockerId of ["NOG-01", "NOG-02"]) {
  const blocker = register.blockers.find((entry) => entry.id === blockerId);
  const accepted = register.acceptedEvidence.find((entry) => entry.id === blockerId);
  requireEqual(`${blockerId}.status`, blocker?.status, "accepted");
  requireEqual(`${blockerId}.currentObservationState`, blocker?.currentObservationState, "accepted_exact_candidate_evidence_verified");
  requireEqual(`${blockerId}.selectedSha`, blocker?.selectedSha, currentSha);
  requireEqual(`${blockerId}.acceptedEvidence.status`, accepted?.status, "accepted");
  requireEqual(`${blockerId}.acceptedEvidence.selectedSha`, accepted?.selectedSha, currentSha);
  requirePattern(`${blockerId}.acceptedEvidence.artifactDigest`, accepted?.artifactDigest, sha256Pattern);
}
requireEqual(
  "register.executionRequests[0].status",
  register.executionRequests?.[0]?.status,
  "accepted_exact_candidate_protected_staging_and_env_evidence",
);
requireEqual(
  "register.executionRequests[0].currentObservationState",
  register.executionRequests?.[0]?.currentObservationState,
  "accepted_exact_candidate_evidence_verified",
);
requireArrayExact("register.remainingOpenBlockers", register.remainingOpenBlockers, remainingBlockers);

for (const invariant of [
  "protected-staging-execution-status-20260812.json",
  "NO_GO_NOG_01_NOG_02_ACCEPTED_REMAINING_BLOCKERS_OPEN",
  "required_reviewers",
  "branch_policy",
  "NOG-01 and NOG-02 are accepted",
  "32644937055",
  "32648754664",
]) {
  requireText("packet", invariant, `packet is missing execution-status invariant: ${invariant}`);
  requireText("runbook", invariant, `runbook is missing execution-status invariant: ${invariant}`);
}
for (const invariant of [
  "GITHUB_STAGING_ENVIRONMENT_PROTECTION_RUNBOOK_20260812.md",
  "administrator bypass disabled",
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
