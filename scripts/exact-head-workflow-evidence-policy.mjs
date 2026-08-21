const RUN_URL = /^https:\/\/github\.com\/tecpey\/Tecpey-Os\/actions\/runs\/[1-9][0-9]*\/?$/;

export const WORKFLOW_CONTRACT = Object.freeze({
  ciRunUrl: { name: "CI", path: ".github/workflows/ci.yml", event: "push" },
  fullSuiteRunUrl: { name: "Full Suite Diagnostics", path: ".github/workflows/full-suite-diagnostics.yml", event: "push" },
  apiSecurityRunUrl: { name: "API Security Manifest", path: ".github/workflows/api-security-manifest.yml", event: "push" },
  sensitiveMutationRunUrl: { name: "Sensitive Mutation Audit", path: ".github/workflows/sensitive-mutation-audit.yml", event: "push" },
  repositoryAuditRunUrl: { name: "Repository Audit Manifest", path: ".github/workflows/repository-audit-manifest.yml", event: "push" },
  publicGoldenPathRunUrl: { name: "Public Browser Golden Path", path: ".github/workflows/public-browser-golden-path.yml", event: "push" },
  containerSupplyChainRunUrl: { name: "Container Supply Chain", path: ".github/workflows/container-supply-chain.yml", event: "push" },
  secretScanningRunUrl: { name: "Full History Secret Scanning", path: ".github/workflows/secret-scanning.yml", event: "push" },
  operationalRecoveryRunUrl: {
    name: "Scheduled Operational Recovery",
    path: ".github/workflows/operational-recovery.yml",
    event: "workflow_dispatch",
    v2Only: true,
  },
});

function requireEqual(findings, label, actual, expected) {
  if (actual !== expected) {
    findings.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

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

function requireRunUrl(findings, label, value) {
  if (typeof value !== "string" || !RUN_URL.test(value)) {
    findings.push(`${label}: expected governed tecpey/Tecpey-Os GitHub Actions run URL`);
  }
}

export function exactHeadWorkflowEvidenceFindings({ evidence, selectedSha }) {
  const findings = [];

  if (![1, 2].includes(evidence?.schemaVersion)) {
    findings.push("evidence.schemaVersion: expected 1 or 2");
  }
  const v2 = evidence?.schemaVersion === 2;
  requireEqual(findings, "evidence.evidenceClass", evidence?.evidenceClass, "exact-head-workflow-evidence");
  requireEqual(
    findings,
    "evidence.decision",
    evidence?.decision,
    "NO_GO_NOG_04_ACCEPTED_EXACT_HEAD_WORKFLOW_URLS_ONLY",
  );
  requireEqual(findings, "evidence.selectedSha", evidence?.selectedSha, selectedSha);

  const allFields = Object.keys(WORKFLOW_CONTRACT);
  exactSet(
    findings,
    "evidence.workflowEvidence fields",
    evidence?.workflowEvidence && typeof evidence.workflowEvidence === "object"
      ? Object.keys(evidence.workflowEvidence)
      : null,
    allFields,
  );

  const activeContracts = Object.entries(WORKFLOW_CONTRACT).filter(([, contract]) => v2 || !contract.v2Only);
  const expectedNames = activeContracts.map(([, contract]) => contract.name);
  const runs = evidence?.workflowRuns;
  exactSet(
    findings,
    "evidence.workflowRuns names",
    Array.isArray(runs) ? runs.map((run) => run?.name) : null,
    expectedNames,
  );

  const seenUrls = new Set();
  for (const [field, contract] of Object.entries(WORKFLOW_CONTRACT)) {
    const value = evidence?.workflowEvidence?.[field];
    if (contract.v2Only && !v2) {
      requireEqual(findings, `evidence.workflowEvidence.${field}`, value, null);
      continue;
    }

    requireRunUrl(findings, `evidence.workflowEvidence.${field}`, value);
    if (typeof value === "string") {
      if (seenUrls.has(value)) {
        findings.push(`evidence.workflowEvidence.${field}: duplicate GitHub Actions run URL`);
      }
      seenUrls.add(value);
    }

    const matchingRuns = Array.isArray(runs)
      ? runs.filter((candidateRun) => candidateRun?.name === contract.name)
      : [];
    if (matchingRuns.length !== 1) {
      findings.push(`${contract.name}: expected exactly one workflow run record`);
      continue;
    }
    const run = matchingRuns[0];
    requireEqual(findings, `${contract.name}.runUrl`, run?.runUrl, value);
    requireEqual(findings, `${contract.name}.status`, run?.status, "completed");
    requireEqual(findings, `${contract.name}.conclusion`, run?.conclusion, "success");
    requireEqual(findings, `${contract.name}.event`, run?.event, contract.event);
    if (v2) {
      requireEqual(findings, `${contract.name}.workflowPath`, run?.workflowPath, contract.path);
      requireEqual(findings, `${contract.name}.headSha`, run?.headSha, selectedSha);
      requireEqual(findings, `${contract.name}.headBranch`, run?.headBranch, "main");
    }
  }

  if (!Array.isArray(evidence?.remainingFinalManifestGaps)) {
    findings.push("evidence.remainingFinalManifestGaps: expected array");
  } else if (v2) {
    if (evidence.remainingFinalManifestGaps.includes("operational recovery/reconciliation evidence and digest")) {
      findings.push(
        "evidence.remainingFinalManifestGaps: must not retain operational recovery/reconciliation after governed v2 dispatch evidence",
      );
    }
  } else if (!evidence.remainingFinalManifestGaps.includes("operational recovery/reconciliation evidence and digest")) {
    findings.push(
      "evidence.remainingFinalManifestGaps: historical schema v1 must retain operational recovery/reconciliation evidence and digest",
    );
  }

  return findings;
}
