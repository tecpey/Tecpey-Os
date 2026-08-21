import { readFile } from "node:fs/promises";

const paths = {
  humanLedger: "docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md",
  jsonLedger: "docs/launch/generated/current-controlled-launch-candidate.json",
  promotionState: "docs/launch/generated/candidate-promotion-state-20260821.json",
  protectedStagingRequest:
    "docs/launch/generated/protected-staging-env-evidence-request-20260810.json",
  protectedStagingRegister:
    "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  protectedStagingRunbook:
    "docs/operations/PROTECTED_STAGING_ACTIVATION_ENV_EVIDENCE_RUNBOOK_20260810.md",
};

const shaPattern = /^[0-9a-f]{40}$/;
const failures = [];
const RECOLLECTED_BLOCKERS = ["NOG-03", "NOG-04", "NOG-06"];
const OPEN_BLOCKERS = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08", "NOG-09"];
const DISABLED_BOUNDARIES = [
  "real-money Exchange",
  "custody/deposits/withdrawals",
  "enterprise",
  "white-label",
  "public rewards",
];

async function text(path) {
  return readFile(path, "utf8");
}

async function json(path) {
  try {
    return JSON.parse(await text(path));
  } catch {
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

function requireNotEqual(label, actual, unexpected) {
  if (actual === unexpected) {
    failures.push(`${label}: must differ from ${unexpected}`);
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

function requireArrayExact(label, values, expected) {
  if (!Array.isArray(values)) {
    failures.push(`${label}: expected array`);
    return;
  }
  if (new Set(values).size !== values.length) {
    failures.push(`${label}: duplicate entries are forbidden`);
  }
  const valueSet = new Set(values);
  if (values.length !== expected.length || expected.some((value) => !valueSet.has(value))) {
    failures.push(`${label}: expected exactly ${expected.join(", ")}`);
  }
}

const [
  humanLedger,
  protectedStagingRunbook,
  jsonLedger,
  promotionState,
  protectedStagingRequest,
  protectedStagingRegister,
] = await Promise.all([
  text(paths.humanLedger),
  text(paths.protectedStagingRunbook),
  json(paths.jsonLedger),
  json(paths.promotionState),
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

requireEqual(`${paths.promotionState}: schemaVersion`, promotionState.schemaVersion, 1);
requireEqual(
  `${paths.promotionState}: evidenceClass`,
  promotionState.evidenceClass,
  "controlled-launch-candidate-promotion-state",
);
requireEqual(
  `${paths.promotionState}: requiredAcceptanceSchemaVersion`,
  promotionState.requiredAcceptanceSchemaVersion,
  2,
);

const acceptedCandidateSha = requireSha(
  `${paths.promotionState}: currentAcceptedCandidateSha`,
  promotionState.currentAcceptedCandidateSha,
);
const proposedCandidateSha = requireSha(
  `${paths.promotionState}: proposedCandidate.sha`,
  promotionState.proposedCandidate?.sha,
);
requireEqual(
  `${paths.promotionState}: proposedCandidate.sourceBranch`,
  promotionState.proposedCandidate?.sourceBranch,
  "main",
);

for (const blocker of OPEN_BLOCKERS) {
  requireArrayIncludes(
    `${paths.promotionState}: stillOpenBlockers`,
    promotionState.stillOpenBlockers,
    blocker,
  );
}
for (const boundary of DISABLED_BOUNDARIES) {
  requireArrayIncludes(
    `${paths.promotionState}: launchDisabledBoundaries`,
    promotionState.launchDisabledBoundaries,
    boundary,
  );
}

if (promotionState.status === "promoted_exact_candidate_evidence") {
  requireEqual(
    `${paths.promotionState}: protectedExecutionAllowed`,
    promotionState.protectedExecutionAllowed,
    true,
  );
  if (currentSha && acceptedCandidateSha) {
    requireEqual(
      `${paths.promotionState}: currentAcceptedCandidateSha`,
      acceptedCandidateSha,
      currentSha,
    );
  }
  if (currentSha && proposedCandidateSha) {
    requireEqual(
      `${paths.promotionState}: proposedCandidate.sha`,
      proposedCandidateSha,
      currentSha,
    );
  }
  requireArrayExact(
    `${paths.promotionState}: staleAcceptedEvidence`,
    promotionState.staleAcceptedEvidence ?? [],
    [],
  );
  requireArrayExact(
    `${paths.promotionState}: acceptedRecollectedEvidence`,
    Array.isArray(promotionState.acceptedRecollectedEvidence)
      ? promotionState.acceptedRecollectedEvidence.map((entry) => entry?.id)
      : promotionState.acceptedRecollectedEvidence,
    RECOLLECTED_BLOCKERS,
  );
  requireArrayExact(
    `${paths.jsonLedger}: acceptedEvidence recollected blockers`,
    RECOLLECTED_BLOCKERS.filter((blocker) =>
      jsonLedger.acceptedEvidence?.some((entry) => entry?.id === blocker && entry?.status === "accepted"),
    ),
    RECOLLECTED_BLOCKERS,
  );
  requireArrayExact(
    `${paths.protectedStagingRegister}: acceptedEvidence recollected blockers`,
    RECOLLECTED_BLOCKERS.filter((blocker) =>
      protectedStagingRegister.acceptedEvidence?.some((entry) => entry?.id === blocker),
    ),
    RECOLLECTED_BLOCKERS,
  );
  for (const blocker of RECOLLECTED_BLOCKERS) {
    requireEqual(
      `${paths.protectedStagingRegister}: ${blocker}.status`,
      protectedStagingRegister.blockers?.find((entry) => entry.id === blocker)?.status,
      "accepted",
    );
  }
} else {
  requireEqual(
    `${paths.promotionState}: status`,
    promotionState.status,
    "pending_evidence_recollection",
  );
  requireEqual(
    `${paths.promotionState}: protectedExecutionAllowed`,
    promotionState.protectedExecutionAllowed,
    false,
  );
  if (currentSha && acceptedCandidateSha) {
    requireEqual(
      `${paths.promotionState}: currentAcceptedCandidateSha`,
      acceptedCandidateSha,
      currentSha,
    );
  }
  if (currentSha && proposedCandidateSha) {
    requireNotEqual(
      `${paths.promotionState}: proposedCandidate.sha`,
      proposedCandidateSha,
      currentSha,
    );
  }
  const staleEvidenceIds = Array.isArray(promotionState.staleAcceptedEvidence)
    ? promotionState.staleAcceptedEvidence.map((entry) => entry?.id)
    : [];
  requireArrayExact(
    `${paths.promotionState}: staleAcceptedEvidence`,
    staleEvidenceIds,
    RECOLLECTED_BLOCKERS,
  );
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else if (promotionState.status === "promoted_exact_candidate_evidence") {
  console.log(
    `Controlled launch candidate lineage passed for promoted candidate ${jsonLedger.currentCandidate.sha}; protected evidence collection may proceed while remaining launch blockers stay NO-GO.`,
  );
} else {
  console.log(
    `Controlled launch candidate lineage passed for ${jsonLedger.currentCandidate.sha}; proposed promotion ${promotionState.proposedCandidate.sha} remains fail-closed pending evidence recollection.`,
  );
}
