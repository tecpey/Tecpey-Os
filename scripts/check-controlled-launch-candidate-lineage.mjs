import { readFile } from "node:fs/promises";

const paths = {
  humanLedger: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  jsonLedger: "docs/launch/generated/current-controlled-launch-candidate.json",
  protectedStagingRequest:
    "docs/launch/generated/protected-staging-env-evidence-request-20260810.json",
  protectedStagingRegister:
    "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  protectedStagingRunbook:
    "docs/operations/PROTECTED_STAGING_ACTIVATION_ENV_EVIDENCE_RUNBOOK_20260810.md",
};

const shaPattern = /^[0-9a-f]{40}$/;
const failures = [];

async function text(path) {
  return readFile(path, "utf8");
}

async function json(path) {
  try {
    return JSON.parse(await text(path));
  } catch (error) {
    failures.push(`${path}: JSON parse failed`);
    return {};
  }
}

function requireSha(label, value) {
  if (typeof value !== "string" || !shaPattern.test(value)) {
    failures.push(`${label}: expected exact 40-character lowercase commit SHA`);
    return null;
  }
  return value;
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, received ${actual ?? "<missing>"}`);
  }
}

function requireContains(path, source, token, reason) {
  if (!source.includes(token)) {
    failures.push(`${path}: ${reason}`);
  }
}

function requireArrayIncludes(label, values, expected) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    failures.push(`${label}: missing ${expected}`);
  }
}

const [
  humanLedger,
  protectedStagingRunbook,
  jsonLedger,
  protectedStagingRequest,
  protectedStagingRegister,
] = await Promise.all([
  text(paths.humanLedger),
  text(paths.protectedStagingRunbook),
  json(paths.jsonLedger),
  json(paths.protectedStagingRequest),
  json(paths.protectedStagingRegister),
]);

const currentSha = requireSha(
  `${paths.jsonLedger}: currentCandidate.sha`,
  jsonLedger.currentCandidate?.sha,
);

if (currentSha) {
  requireContains(
    paths.humanLedger,
    humanLedger,
    `**Current candidate SHA:** \`${currentSha}\``,
    "human ledger must expose the current candidate SHA from generated JSON",
  );
  requireContains(
    paths.humanLedger,
    humanLedger,
    `\n${currentSha}\n`,
    "human ledger rationale must include the selected candidate SHA",
  );
  requireContains(
    paths.protectedStagingRunbook,
    protectedStagingRunbook,
    `**Protected staging evidence target SHA:** \`${currentSha}\``,
    "runbook must target the same protected staging SHA as the candidate ledger",
  );
  requireContains(
    paths.protectedStagingRunbook,
    protectedStagingRunbook,
    `**Runtime candidate baseline SHA:** \`${currentSha}\``,
    "runbook must keep the runtime baseline aligned with the candidate ledger",
  );
  requireContains(
    paths.protectedStagingRunbook,
    protectedStagingRunbook,
    `release_sha: ${currentSha}`,
    "runbook workflow dispatch example must use the candidate SHA",
  );
  requireContains(
    paths.protectedStagingRunbook,
    protectedStagingRunbook,
    "Do not silently move the staging target because documentation-only or\nlaunch-control PRs were merged",
    "runbook must preserve the documentation-only merge lineage rule",
  );

  requireEqual(
    `${paths.protectedStagingRequest}: releaseLineage.protectedStagingEvidenceTargetSha`,
    protectedStagingRequest.releaseLineage?.protectedStagingEvidenceTargetSha,
    currentSha,
  );
  requireEqual(
    `${paths.protectedStagingRequest}: releaseLineage.runtimeCandidateBaselineSha`,
    protectedStagingRequest.releaseLineage?.runtimeCandidateBaselineSha,
    currentSha,
  );
  requireEqual(
    `${paths.protectedStagingRequest}: requiredContext.workflowInputs.release_sha`,
    protectedStagingRequest.requiredContext?.workflowInputs?.release_sha,
    currentSha,
  );
  requireEqual(
    `${paths.protectedStagingRegister}: stagingEvidenceTargetSha`,
    protectedStagingRegister.stagingEvidenceTargetSha,
    currentSha,
  );
  requireEqual(
    `${paths.protectedStagingRegister}: runtimeCandidateBaselineSha`,
    protectedStagingRegister.runtimeCandidateBaselineSha,
    currentSha,
  );
  requireEqual(
    `${paths.protectedStagingRegister}: executionRequests[0].selectedSha`,
    protectedStagingRegister.executionRequests?.[0]?.selectedSha,
    currentSha,
  );
}

requireEqual(`${paths.jsonLedger}: schemaVersion`, jsonLedger.schemaVersion, 1);
requireEqual(
  `${paths.jsonLedger}: evidenceClass`,
  jsonLedger.evidenceClass,
  "current-controlled-launch-candidate",
);
requireEqual(`${paths.jsonLedger}: currentCandidate.sourceBranch`, jsonLedger.currentCandidate?.sourceBranch, "main");
requireEqual(
  `${paths.jsonLedger}: decision`,
  jsonLedger.decision,
  "NO_GO_UNTIL_ACCEPTED_EXACT_CANDIDATE_EVIDENCE",
);
requireEqual(
  `${paths.protectedStagingRequest}: decision`,
  protectedStagingRequest.decision,
  "NO_GO_UNTIL_PROTECTED_STAGING_AND_ENV_EVIDENCE_IS_EXECUTED_AND_ACCEPTED",
);
requireEqual(
  `${paths.protectedStagingRegister}: decision`,
  protectedStagingRegister.decision,
  "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE",
);

for (const blocker of ["NOG-01", "NOG-02"]) {
  requireArrayIncludes(`${paths.protectedStagingRequest}: relatedBlockers`, protectedStagingRequest.relatedBlockers, blocker);
  requireArrayIncludes(
    `${paths.protectedStagingRegister}: executionRequests[0].ids`,
    protectedStagingRegister.executionRequests?.[0]?.ids,
    blocker,
  );
}

for (const label of ["self-hosted", "linux", "x64", "tecpey-staging"]) {
  requireArrayIncludes(
    `${paths.protectedStagingRequest}: requiredContext.runnerLabels`,
    protectedStagingRequest.requiredContext?.runnerLabels,
    label,
  );
}

requireEqual(
  `${paths.protectedStagingRequest}: requiredContext.githubEnvironment`,
  protectedStagingRequest.requiredContext?.githubEnvironment,
  "staging",
);
requireEqual(
  `${paths.protectedStagingRequest}: requiredContext.workflowInputs.run_alert_probe`,
  protectedStagingRequest.requiredContext?.workflowInputs?.run_alert_probe,
  true,
);

const acceptedModes =
  protectedStagingRequest.nog02?.environmentSourcePolicy?.acceptedModes ?? [];
requireArrayIncludes(
  `${paths.protectedStagingRequest}: nog02.environmentSourcePolicy.acceptedModes`,
  acceptedModes,
  "protected_host_env_file",
);
requireArrayIncludes(
  `${paths.protectedStagingRequest}: nog02.environmentSourcePolicy.acceptedModes`,
  acceptedModes,
  "service_manager_preloaded_environment",
);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Controlled launch candidate lineage passed for ${jsonLedger.currentCandidate.sha}.`,
  );
}
