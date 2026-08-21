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

const REQUIRED_STALE = ["NOG-03", "NOG-04", "NOG-06"];
const REQUIRED_OPEN = ["NOG-01", "NOG-02", "NOG-05", "NOG-07", "NOG-08", "NOG-09"];
const REQUIRED_BOUNDARIES = [
  "real-money Exchange",
  "custody/deposits/withdrawals",
  "enterprise",
  "white-label",
  "public rewards",
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

function requireText(findings, label, values, token) {
  if (!Array.isArray(values) || !values.some((value) => typeof value === "string" && value.includes(token))) {
    findings.push(`${label}: missing contract token ${JSON.stringify(token)}`);
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

  requireEqual(findings, "request.schemaVersion", request?.schemaVersion, 1);
  requireEqual(
    findings,
    "request.evidenceClass",
    request?.evidenceClass,
    "controlled-launch-candidate-evidence-recollection-request",
  );
  requireEqual(findings, "request.issue", request?.issue, 515);
  requireEqual(
    findings,
    "request.decision",
    request?.decision,
    "NO_GO_PENDING_NOG_03_04_06_RECOLLECTION",
  );
  requireEqual(findings, "request.sourceBranch", request?.sourceBranch, "main");
  requireEqual(findings, "request.protectedExecutionAllowed", request?.protectedExecutionAllowed, false);
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
  requireEqual(findings, "promotionState.status", promotionState?.status, "pending_evidence_recollection");
  requireEqual(
    findings,
    "promotionState.protectedExecutionAllowed",
    promotionState?.protectedExecutionAllowed,
    false,
  );
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

  if (promotionState?.currentAcceptedCandidateSha === promotionState?.proposedCandidate?.sha) {
    findings.push("promotionState.proposedCandidate.sha: must differ from historical accepted candidate");
  }
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
  exactSet(
    findings,
    "promotionState.staleAcceptedEvidence",
    promotionState?.staleAcceptedEvidence?.map((entry) => entry?.id),
    REQUIRED_STALE,
  );

  for (const blocker of ["NOG-03", "NOG-04", "NOG-06"]) {
    requireEqual(
      findings,
      `request.requiredEvidence.${blocker}.status`,
      request?.requiredEvidence?.[blocker]?.status,
      "pending_recollection",
    );
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

  const nog04 = request?.requiredEvidence?.["NOG-04"]?.acceptance;
  for (const token of [
    "bound to selectedSha",
    "push or an explicitly governed exact-SHA dispatch",
    "completed successfully",
    "distinct governed GitHub Actions run URL",
    "headSha equal to selectedSha",
    "Scheduled Operational Recovery",
  ]) {
    requireText(findings, "NOG-04.acceptance", nog04, token);
  }

  const nog03 = request?.requiredEvidence?.["NOG-03"]?.acceptance;
  for (const token of [
    "built from selectedSha",
    "immutable image digest",
    "container evidence artifact",
    "signature or governed verification disposition",
    "headSha equal to selectedSha",
    "not copied or relabelled",
  ]) {
    requireText(findings, "NOG-03.acceptance", nog03, token);
  }

  const nog06 = request?.requiredEvidence?.["NOG-06"]?.acceptance;
  for (const token of [
    "bound to selectedSha",
    "candidate image is served before rollback",
    "previous release is served after rollback",
    "PostgreSQL and Redis restore evidence",
    "artifact digest and verifier disposition",
    "headSha equal to selectedSha",
    "not copied or relabelled",
  ]) {
    requireText(findings, "NOG-06.acceptance", nog06, token);
  }

  exactSet(findings, "request.privacyBoundary", request?.privacyBoundary, REQUIRED_REQUEST_PRIVACY);
  exactSet(
    findings,
    "promotionState.privacyBoundary",
    promotionState?.privacyBoundary,
    REQUIRED_PROMOTION_PRIVACY,
  );

  return findings;
}
