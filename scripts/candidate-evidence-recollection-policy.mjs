const SHA = /^[0-9a-f]{40}$/;

export const ACTIVE_RECOLLECTION_FILES = Object.freeze({
  request: "candidate-evidence-recollection-request-20260821.json",
  promotionState: "candidate-promotion-state-20260821.json",
});

export const REQUIRED_WORKFLOWS = [
  "CI",
  "Full Suite Diagnostics",
  "API Security Manifest",
  "Sensitive Mutation Audit",
  "Repository Audit Manifest",
  "Public Browser Golden Path",
  "Container Supply Chain",
  "Full History Secret Scanning",
  "Scheduled Operational Recovery",
];

const REQUIRED_RECOLLECTED = ["NOG-03", "NOG-04", "NOG-06"];
const REQUIRED_OPEN = ["NOG-09"];
const REQUIRED_BOUNDARIES = [
  "real-money Exchange",
  "custody/deposits/withdrawals",
  "enterprise",
  "white-label",
  "public rewards",
];
const ACCEPTED_EVIDENCE_PATHS = Object.freeze({
  "NOG-03": "docs/launch/generated/runtime-image-digest-evidence-20260812.json",
  "NOG-04": "docs/launch/generated/exact-head-workflow-evidence-20260812.json",
  "NOG-06": "docs/launch/generated/rollback-volume-restore-evidence-20260812.json",
});
const REQUIRED_NOG04_ACCEPTANCE = [
  "each workflow run is bound to selectedSha",
  "each workflow run event is push or an explicitly governed exact-SHA dispatch",
  "each workflow completed successfully",
  "each workflow uses a distinct governed GitHub Actions run URL",
  "each workflow record includes headSha equal to selectedSha and its governed workflow path",
  "Scheduled Operational Recovery must use governed workflow_dispatch on main and resolve headSha equal to selectedSha",
  "PR-head run URLs from 6c2bcbbc7c7e32fa00cbff2c3583507f4eda5b5c, 6145c03bdee9da4d06b781175a60b63d38cba568, 60691da0e1c45d7e6c5ea9aed4558e391f38db71 or 32799a79ea9bdee4c7f99f1cba385149723f14d6 are not accepted as exact-candidate evidence for selectedSha",
];
const REQUIRED_NOG03_ACCEPTANCE = [
  "container runtime image is built from selectedSha",
  "immutable image digest is recorded",
  "container evidence artifact and detached digest are recorded",
  "signature or governed verification disposition is recorded",
  "workflow record includes headSha equal to selectedSha and refs/heads/main",
  "artifact metadata is not copied or relabelled from the historical 9bd4ca5 candidate",
];
const REQUIRED_NOG06_ACCEPTANCE = [
  "rollback job is bound to selectedSha",
  "candidate image is served before rollback",
  "previous release is served after rollback",
  "PostgreSQL and Redis restore evidence is attached",
  "artifact digest and verifier disposition are recorded",
  "workflow record includes headSha equal to selectedSha and refs/heads/main",
  "artifact metadata is not copied or relabelled from the historical 9bd4ca5 candidate",
];
const REQUIRED_PROMOTION_AFTER_ACCEPTANCE = [
  "re-read main and active PRs immediately before promotion",
  "verify selectedSha is still the newest stable runtime/security/bundle/launch-control target",
  "atomically align CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md and generated current candidate ledger",
  "atomically align protected-staging runbook, request and No-Go register",
  "replace pending NOG-03/NOG-04/NOG-06 state only with genuine exact-selectedSha evidence using acceptance schema v2",
  "run launch candidate, evidence authority, staging evidence, launch decision and full CI gates",
];
const REQUIRED_BEFORE_PROMOTION = [
  "re-read main immediately before final promotion commit",
  "recollect genuine exact-head workflow evidence for the proposed exact SHA",
  "recollect genuine runtime image digest evidence for the proposed exact SHA",
  "recollect genuine rollback/volume-restore evidence for the proposed exact SHA",
  "record all newly accepted evidence using acceptance schema v2 with explicit exact-SHA workflow binding",
  "atomically align human and JSON candidate ledgers, protected-staging request/runbook/register and evidence-authority checks",
  "keep protected execution blocked until the aligned promotion state is CI-valid",
];
const REQUIRED_COMPLETED_CHECKS = [
  "exact-head workflow evidence schema v2 accepted for the selected SHA",
  "runtime image digest evidence accepted for the selected SHA",
  "rollback and volume-restore evidence accepted for the selected SHA",
  "candidate and protected-staging lineage aligned to the selected SHA",
  "remaining operational blockers remain open",
  "real-money and expanded-scope launch boundaries remain disabled",
];
const REQUIRED_REQUEST_PRIVACY = [
  "record run URLs, artifact identifiers, digests, release identifiers and dispositions only",
  "do not record raw secrets, database URLs, host IPs, customer data, raw logs, private keys, provider payloads or prompt transcripts",
];
const REQUIRED_PROMOTION_PRIVACY = [
  "state contains release identifiers, blocker IDs, status and policy text only",
  "no secrets, database URLs, host IPs, customer data, raw logs, private keys, provider payloads or prompt transcripts",
];

function exactSet(findings, label, actual, expected) {
  if (!Array.isArray(actual)) {
    findings.push(`${label}: expected array`);
    return;
  }
  if (new Set(actual).size !== actual.length) {
    findings.push(`${label}: duplicate entries are forbidden`);
  }
  const actualSet = new Set(actual);
  if (actual.length !== expected.length || expected.some((value) => !actualSet.has(value))) {
    findings.push(`${label}: expected exactly ${expected.join(", ")}`);
  }
}

function requireEqual(findings, label, actual, expected) {
  if (actual !== expected) {
    findings.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireSha(findings, label, value) {
  if (typeof value !== "string" || !SHA.test(value)) {
    findings.push(`${label}: expected exact lowercase 40-character SHA`);
  }
}

function matchingGeneratedFiles(generatedFilenames, prefix) {
  if (!Array.isArray(generatedFilenames)) return null;
  return generatedFilenames.filter(
    (name) => typeof name === "string" && name.startsWith(prefix) && name.endsWith(".json"),
  );
}

function validateCommonRequest(findings, request, promotionState) {
  requireEqual(findings, "request.schemaVersion", request?.schemaVersion, 1);
  requireEqual(
    findings,
    "request.evidenceClass",
    request?.evidenceClass,
    "controlled-launch-candidate-evidence-recollection-request",
  );
  requireEqual(findings, "request.issue", request?.issue, 515);
  requireEqual(findings, "request.sourceBranch", request?.sourceBranch, "main");
  requireEqual(findings, "request.requiredAcceptanceSchemaVersion", request?.requiredAcceptanceSchemaVersion, 2);
  requireSha(findings, "request.selectedSha", request?.selectedSha);

  requireEqual(findings, "promotionState.schemaVersion", promotionState?.schemaVersion, 1);
  requireEqual(
    findings,
    "promotionState.evidenceClass",
    promotionState?.evidenceClass,
    "controlled-launch-candidate-promotion-state",
  );
  requireEqual(findings, "promotionState.issue", promotionState?.issue, 515);
  requireEqual(
    findings,
    "promotionState.requiredAcceptanceSchemaVersion",
    promotionState?.requiredAcceptanceSchemaVersion,
    2,
  );
  requireSha(
    findings,
    "promotionState.currentAcceptedCandidateSha",
    promotionState?.currentAcceptedCandidateSha,
  );
  requireSha(findings, "promotionState.proposedCandidate.sha", promotionState?.proposedCandidate?.sha);
  requireEqual(
    findings,
    "promotionState.proposedCandidate.sourceBranch",
    promotionState?.proposedCandidate?.sourceBranch,
    "main",
  );
  requireEqual(
    findings,
    "request.selectedSha",
    request?.selectedSha,
    promotionState?.proposedCandidate?.sha,
  );
  requireEqual(
    findings,
    "request.sourcePullRequest",
    request?.sourcePullRequest,
    promotionState?.proposedCandidate?.sourcePullRequest,
  );

  exactSet(
    findings,
    "request.requiredEvidence.NOG-04.requiredWorkflows",
    request?.requiredEvidence?.["NOG-04"]?.requiredWorkflows,
    REQUIRED_WORKFLOWS,
  );
  exactSet(findings, "request.stillOpenBlockers", request?.stillOpenBlockers, REQUIRED_OPEN);
  exactSet(
    findings,
    "promotionState.stillOpenBlockers",
    promotionState?.stillOpenBlockers,
    REQUIRED_OPEN,
  );
  exactSet(
    findings,
    "request.launchDisabledBoundaries",
    request?.launchDisabledBoundaries,
    REQUIRED_BOUNDARIES,
  );
  exactSet(
    findings,
    "promotionState.launchDisabledBoundaries",
    promotionState?.launchDisabledBoundaries,
    REQUIRED_BOUNDARIES,
  );

  for (const blocker of REQUIRED_RECOLLECTED) {
    requireEqual(
      findings,
      `request.requiredEvidence.${blocker}.requireExactSelectedSha`,
      request?.requiredEvidence?.[blocker]?.requireExactSelectedSha,
      true,
    );
  }

  requireEqual(
    findings,
    "NOG-03.workflow",
    request?.requiredEvidence?.["NOG-03"]?.workflow,
    "Container Supply Chain",
  );
  requireEqual(
    findings,
    "NOG-06.workflow",
    request?.requiredEvidence?.["NOG-06"]?.workflow,
    "Container Supply Chain",
  );
  requireEqual(
    findings,
    "NOG-06.job",
    request?.requiredEvidence?.["NOG-06"]?.job,
    "Ephemeral staging rollback and volume restore",
  );

  exactSet(
    findings,
    "NOG-04.acceptance",
    request?.requiredEvidence?.["NOG-04"]?.acceptance,
    REQUIRED_NOG04_ACCEPTANCE,
  );
  exactSet(
    findings,
    "NOG-03.acceptance",
    request?.requiredEvidence?.["NOG-03"]?.acceptance,
    REQUIRED_NOG03_ACCEPTANCE,
  );
  exactSet(
    findings,
    "NOG-06.acceptance",
    request?.requiredEvidence?.["NOG-06"]?.acceptance,
    REQUIRED_NOG06_ACCEPTANCE,
  );
  exactSet(
    findings,
    "request.promotionAfterAcceptance",
    request?.promotionAfterAcceptance,
    REQUIRED_PROMOTION_AFTER_ACCEPTANCE,
  );
  exactSet(
    findings,
    "promotionState.requiredBeforePromotion",
    promotionState?.requiredBeforePromotion,
    REQUIRED_BEFORE_PROMOTION,
  );
  exactSet(findings, "request.privacyBoundary", request?.privacyBoundary, REQUIRED_REQUEST_PRIVACY);
  exactSet(
    findings,
    "promotionState.privacyBoundary",
    promotionState?.privacyBoundary,
    REQUIRED_PROMOTION_PRIVACY,
  );
}

function validatePending(findings, request, promotionState) {
  requireEqual(
    findings,
    "request.decision",
    request?.decision,
    "NO_GO_PENDING_NOG_03_04_06_RECOLLECTION",
  );
  requireEqual(findings, "request.protectedExecutionAllowed", request?.protectedExecutionAllowed, false);
  requireEqual(findings, "promotionState.status", promotionState?.status, "pending_evidence_recollection");
  requireEqual(
    findings,
    "promotionState.protectedExecutionAllowed",
    promotionState?.protectedExecutionAllowed,
    false,
  );
  if (promotionState?.currentAcceptedCandidateSha === promotionState?.proposedCandidate?.sha) {
    findings.push("promotionState.proposedCandidate.sha: must differ from historical accepted candidate");
  }
  exactSet(
    findings,
    "promotionState.staleAcceptedEvidence",
    promotionState?.staleAcceptedEvidence?.map((entry) => entry?.id),
    REQUIRED_RECOLLECTED,
  );
  for (const blocker of REQUIRED_RECOLLECTED) {
    requireEqual(
      findings,
      `request.requiredEvidence.${blocker}.status`,
      request?.requiredEvidence?.[blocker]?.status,
      "pending_recollection",
    );
  }
}

function validatePromoted(findings, request, promotionState) {
  requireEqual(
    findings,
    "request.decision",
    request?.decision,
    "NO_GO_NOG_03_04_06_RECOLLECTED_AND_ACCEPTED",
  );
  requireEqual(findings, "request.protectedExecutionAllowed", request?.protectedExecutionAllowed, true);
  requireEqual(
    findings,
    "promotionState.status",
    promotionState?.status,
    "promoted_exact_candidate_evidence",
  );
  requireEqual(
    findings,
    "promotionState.protectedExecutionAllowed",
    promotionState?.protectedExecutionAllowed,
    true,
  );
  requireEqual(
    findings,
    "promotionState.currentAcceptedCandidateSha",
    promotionState?.currentAcceptedCandidateSha,
    promotionState?.proposedCandidate?.sha,
  );
  exactSet(findings, "promotionState.staleAcceptedEvidence", promotionState?.staleAcceptedEvidence ?? [], []);

  for (const blocker of REQUIRED_RECOLLECTED) {
    requireEqual(
      findings,
      `request.requiredEvidence.${blocker}.status`,
      request?.requiredEvidence?.[blocker]?.status,
      "accepted_exact_selected_sha_evidence",
    );
  }

  const requestAccepted = request?.acceptedEvidence;
  exactSet(
    findings,
    "request.acceptedEvidence",
    Array.isArray(requestAccepted) ? requestAccepted.map((entry) => entry?.id) : requestAccepted,
    REQUIRED_RECOLLECTED,
  );
  const promotionAccepted = promotionState?.acceptedRecollectedEvidence;
  exactSet(
    findings,
    "promotionState.acceptedRecollectedEvidence",
    Array.isArray(promotionAccepted) ? promotionAccepted.map((entry) => entry?.id) : promotionAccepted,
    REQUIRED_RECOLLECTED,
  );
  for (const blocker of REQUIRED_RECOLLECTED) {
    requireEqual(
      findings,
      `request.acceptedEvidence.${blocker}.evidence`,
      requestAccepted?.find((entry) => entry?.id === blocker)?.evidence,
      ACCEPTED_EVIDENCE_PATHS[blocker],
    );
    requireEqual(
      findings,
      `promotionState.acceptedRecollectedEvidence.${blocker}.evidence`,
      promotionAccepted?.find((entry) => entry?.id === blocker)?.evidence,
      ACCEPTED_EVIDENCE_PATHS[blocker],
    );
  }
  exactSet(
    findings,
    "promotionState.promotionCompletedChecks",
    promotionState?.promotionCompletedChecks,
    REQUIRED_COMPLETED_CHECKS,
  );
}

export function candidateEvidenceRecollectionFileSelectionFindings(generatedFilenames) {
  const findings = [];
  if (!Array.isArray(generatedFilenames)) {
    findings.push("generated evidence inventory: expected filename array");
    return findings;
  }

  exactSet(
    findings,
    "active recollection request files",
    matchingGeneratedFiles(generatedFilenames, "candidate-evidence-recollection-request-"),
    [ACTIVE_RECOLLECTION_FILES.request],
  );
  exactSet(
    findings,
    "active promotion state files",
    matchingGeneratedFiles(generatedFilenames, "candidate-promotion-state-"),
    [ACTIVE_RECOLLECTION_FILES.promotionState],
  );

  return findings;
}

export function candidateEvidenceRecollectionFindings({ request, promotionState }) {
  const findings = [];
  validateCommonRequest(findings, request, promotionState);

  if (promotionState?.status === "promoted_exact_candidate_evidence") {
    validatePromoted(findings, request, promotionState);
  } else {
    validatePending(findings, request, promotionState);
  }

  return findings;
}
