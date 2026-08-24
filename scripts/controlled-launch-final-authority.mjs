import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";
import { acceptedRiskSignoffEvidenceOriginFindings } from "./accepted-risk-signoff-evidence-origin.mjs";
import { validateControlledLaunchEvidenceManifest } from "./controlled-launch-evidence-manifest.mjs";
import { goApprovalMatrixEvidenceOriginFindings } from "./go-approval-matrix-evidence-origin.mjs";
import { verifyAcceptedRiskSignoffEvidence } from "./verify-accepted-risk-signoff-evidence.mjs";
import { verifyGoApprovalMatrixEvidence } from "./verify-go-approval-matrix-evidence.mjs";

export const FINAL_AUTHORITY = "tecpey-controlled-soft-launch-final-authority-v1";
export const FINAL_DECISION = "GO_APPROVED_FOR_CONTROLLED_SOFT_LAUNCH_ONLY";
export const UNVERIFIED_DECISION = "NO_GO_PENDING_GOVERNED_AUTHORITY_VERIFICATION";
export const FINAL_MANIFEST_PATH =
  "docs/launch/generated/controlled-soft-launch-final-evidence-manifest-20260824.json";
const ACCEPTED_RISK_REGISTER_PATH = "docs/LAUNCH_ACCEPTED_RISKS.md";

export const DISABLED_CAPABILITY_ATTESTATION = Object.freeze([
  "real-money Exchange remains NO-GO unless separately certified",
  "custody, deposits and withdrawals remain NO-GO unless separately certified",
  "public financial rewards remain NO-GO unless separately certified",
  "enterprise and white-label activation remain NO-GO unless separately certified",
]);

export const PRIVACY_BOUNDARY = Object.freeze([
  "packet contains hashes, URLs and release identifiers only",
  "packet must not contain raw secrets, database URLs, host IPs, customer data or logs",
]);

export const FINAL_AUTHORITY_PATHS = Object.freeze({
  generator: "scripts/generate-controlled-launch-release-packet.mjs",
  verifier: "scripts/controlled-launch-final-authority.mjs",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  runtimeImage: "docs/launch/generated/runtime-image-digest-evidence-20260812.json",
  workflowEvidence: "docs/launch/generated/exact-head-workflow-evidence-20260812.json",
  protectedStaging: "docs/launch/generated/protected-staging-execution-status-20260812.json",
  recoveryReconciliation:
    "docs/launch/generated/protected-recovery-reconciliation-execution-status-20260823.json",
  rollbackOrForwardFix: "docs/launch/generated/rollback-volume-restore-evidence-20260812.json",
  incidentReadiness:
    "docs/launch/generated/protected-incident-readiness-execution-status-20260823.json",
  acceptedRisks:
    "docs/launch/generated/accepted-risk-signoff-execution-status-20260823.json",
  approvals: "docs/launch/generated/go-approval-matrix-execution-status-20260824.json",
  disabledCapabilities:
    "docs/launch/generated/disabled-capability-attestation-evidence-20260812.json",
});

const EXPECTED_DECISIONS = Object.freeze({
  runtimeImage: "NOG_03_ACCEPTED_FOR_EXACT_CANDIDATE_RUNTIME_IMAGE_IDENTITY",
  workflowEvidence: "NO_GO_NOG_04_ACCEPTED_EXACT_HEAD_WORKFLOW_URLS_ONLY",
  protectedStaging: "NO_GO_NOG_01_NOG_02_ACCEPTED_REMAINING_BLOCKERS_OPEN",
  recoveryReconciliation: "NO_GO_NOG_05_ACCEPTED_REMAINING_BLOCKERS_OPEN",
  rollbackOrForwardFix: "NO_GO_NOG_06_ACCEPTED_EPHEMERAL_ROLLBACK_VOLUME_RESTORE_ONLY",
  incidentReadiness: "NO_GO_NOG_07_ACCEPTED_REMAINING_BLOCKERS_OPEN",
  acceptedRisks: "ACCEPTED_RISKS_SIGNED_OFF_FOR_CONTROLLED_SCOPE",
  approvals: "APPROVED_FOR_CONTROLLED_SOFT_LAUNCH",
  disabledCapabilities: "NO_GO_NOG_10_11_12_ACCEPTED_LAUNCH_DISABLED_SCOPE_ONLY",
});

const WORKFLOW_KEYS = Object.freeze([
  "ciRunUrl",
  "fullSuiteRunUrl",
  "apiSecurityRunUrl",
  "sensitiveMutationRunUrl",
  "repositoryAuditRunUrl",
  "publicGoldenPathRunUrl",
  "operationalRecoveryRunUrl",
  "containerSupplyChainRunUrl",
  "secretScanningRunUrl",
]);

function fail(message) {
  throw new Error(`controlled launch final authority invalid: ${message}`);
}

function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function sha256(source) {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

async function readSource(root, file) {
  return readFile(path.resolve(root, file));
}

async function readJson(root, file) {
  try {
    return JSON.parse((await readSource(root, file)).toString("utf8"));
  } catch (error) {
    fail(`${file} could not be read as canonical JSON: ${error.message}`);
  }
}

function requireCandidate(value, candidateSha, label) {
  if (value !== candidateSha) fail(`${label} must bind exact candidate ${candidateSha}`);
}

function requireImmutableBlobUrl(value, expectedPath, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an immutable tecpey/Tecpey-Os blob URL`);
  }
  const escapedPath = expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^/tecpey/Tecpey-Os/blob/([a-f0-9]{40})/${escapedPath}$`).exec(parsed.pathname);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parsed.search || parsed.hash || !match) {
    fail(`${label} must be an immutable tecpey/Tecpey-Os blob URL for ${expectedPath}`);
  }
  return match[1];
}

function gitSourceAtRevision(root, revision, file) {
  const result = spawnSync("git", ["show", `${revision}:${file}`], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`immutable evidence ${revision}:${file} is not available in repository history`);
  }
  return result.stdout;
}

function requireWorkflowAuthority(workflowEvidence, manifest, candidateSha) {
  equal(workflowEvidence.decision, EXPECTED_DECISIONS.workflowEvidence, "workflow evidence decision");
  requireCandidate(workflowEvidence.selectedSha, candidateSha, "workflow evidence selectedSha");
  const runs = Array.isArray(workflowEvidence.workflowRuns) ? workflowEvidence.workflowRuns : [];
  for (const key of WORKFLOW_KEYS) {
    const expectedUrl = manifest.workflowEvidence[key];
    equal(workflowEvidence.workflowEvidence?.[key], expectedUrl, `workflow evidence ${key}`);
    const run = runs.find((entry) => entry.runUrl === expectedUrl);
    if (!run) fail(`workflow evidence ${key} has no authoritative run record`);
    equal(run.status, "completed", `workflow evidence ${key} status`);
    equal(run.conclusion, "success", `workflow evidence ${key} conclusion`);
    requireCandidate(run.headSha, candidateSha, `workflow evidence ${key} headSha`);
  }
}

function requireCanonicalEvidence({
  value,
  decision,
  candidateSha,
  candidateValues,
  label,
}) {
  equal(value.decision, decision, `${label} decision`);
  if (candidateValues.length === 0 || candidateValues.some((candidate) => candidate !== candidateSha)) {
    fail(`${label} must bind exact candidate ${candidateSha}`);
  }
}

export async function verifyControlledLaunchFinalAuthority(
  manifestInput,
  {
    root = ".",
    githubToken = process.env.GITHUB_TOKEN,
    fetchImpl = globalThis.fetch,
    referenceDate = new Date(),
  } = {},
) {
  const manifest = validateControlledLaunchEvidenceManifest(manifestInput);
  const candidateSha = manifest.releaseCandidate.sha;
  const authority = manifest.authorityVerification;

  equal(authority.authority, FINAL_AUTHORITY, "manifest authority");
  equal(authority.status, "verified", "manifest authority status");
  equal(authority.generator.path, FINAL_AUTHORITY_PATHS.generator, "manifest generator path");
  equal(authority.verifier.path, FINAL_AUTHORITY_PATHS.verifier, "manifest verifier path");

  const [generatorSource, verifierSource] = await Promise.all([
    readSource(root, FINAL_AUTHORITY_PATHS.generator),
    readSource(root, FINAL_AUTHORITY_PATHS.verifier),
  ]);
  equal(authority.generator.sourceDigest, sha256(generatorSource), "manifest generator source digest");
  equal(authority.verifier.sourceDigest, sha256(verifierSource), "manifest verifier source digest");

  const entries = await Promise.all(
    Object.entries(FINAL_AUTHORITY_PATHS)
      .filter(([key]) => !["generator", "verifier"].includes(key))
      .map(async ([key, file]) => [key, await readJson(root, file), await readSource(root, file)]),
  );
  const canonical = Object.fromEntries(entries.map(([key, value]) => [key, value]));
  const sourceDigests = Object.fromEntries(entries.map(([key, , source]) => [key, sha256(source)]));

  equal(canonical.candidate.decision, FINAL_DECISION, "current candidate decision");
  requireCandidate(canonical.candidate.currentCandidate?.sha, candidateSha, "current candidate ledger");
  equal(
    manifest.releaseCandidate.sourceBranch,
    canonical.candidate.currentCandidate?.sourceBranch,
    "manifest candidate source branch",
  );

  equal(canonical.runtimeImage.decision, EXPECTED_DECISIONS.runtimeImage, "runtime image decision");
  requireCandidate(canonical.runtimeImage.releaseCandidate?.sha, candidateSha, "runtime image candidate");
  equal(
    canonical.runtimeImage.containerImage?.imageDigest,
    manifest.artifactIdentity.imageDigest,
    "runtime image digest",
  );
  equal(
    canonical.runtimeImage.artifactEvidence?.containerRelease?.artifactDigest,
    manifest.artifactIdentity.deploymentArtifactDigest,
    "deployment artifact digest",
  );

  requireWorkflowAuthority(canonical.workflowEvidence, manifest, candidateSha);

  requireCanonicalEvidence({
    value: canonical.protectedStaging,
    decision: EXPECTED_DECISIONS.protectedStaging,
    candidateSha,
    candidateValues: [
      canonical.protectedStaging.releaseLineage?.protectedStagingEvidenceTargetSha,
      canonical.protectedStaging.runtimeDeployment?.releaseSha,
      canonical.protectedStaging.runtimeDeployment?.healthCommitSha,
    ],
    label: "protected staging evidence",
  });
  requireCanonicalEvidence({
    value: canonical.recoveryReconciliation,
    decision: EXPECTED_DECISIONS.recoveryReconciliation,
    candidateSha,
    candidateValues: [
      canonical.recoveryReconciliation.releaseLineage?.protectedStagingEvidenceTargetSha,
      canonical.recoveryReconciliation.workflow?.selectedReleaseSha,
      canonical.recoveryReconciliation.recovery?.sourceSha,
    ],
    label: "recovery reconciliation evidence",
  });
  requireCanonicalEvidence({
    value: canonical.rollbackOrForwardFix,
    decision: EXPECTED_DECISIONS.rollbackOrForwardFix,
    candidateSha,
    candidateValues: [canonical.rollbackOrForwardFix.selectedSha],
    label: "rollback evidence",
  });
  requireCanonicalEvidence({
    value: canonical.incidentReadiness,
    decision: EXPECTED_DECISIONS.incidentReadiness,
    candidateSha,
    candidateValues: [
      canonical.incidentReadiness.releaseLineage?.protectedStagingEvidenceTargetSha,
      canonical.incidentReadiness.workflow?.selectedReleaseSha,
      canonical.incidentReadiness.incidentReadiness?.sourceSha,
    ],
    label: "incident readiness evidence",
  });
  requireCanonicalEvidence({
    value: canonical.acceptedRisks,
    decision: EXPECTED_DECISIONS.acceptedRisks,
    candidateSha,
    candidateValues: [canonical.acceptedRisks.sourceSha, canonical.acceptedRisks.releaseScope?.candidateSha],
    label: "accepted-risk evidence",
  });
  try {
    verifyAcceptedRiskSignoffEvidence(canonical.acceptedRisks, candidateSha);
  } catch (error) {
    fail(`accepted-risk artifact verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const acceptedRiskRegisterSource = await readSource(root, ACCEPTED_RISK_REGISTER_PATH);
  equal(
    canonical.acceptedRisks.riskRegister?.digest,
    sha256(acceptedRiskRegisterSource),
    "accepted-risk register source digest",
  );
  const acceptedRiskRegisterFindings = evaluateAcceptedRiskRegisterAuthority(
    acceptedRiskRegisterSource.toString("utf8"),
    { referenceDate },
  );
  if (acceptedRiskRegisterFindings.length > 0) {
    fail(`accepted-risk register authority failed: ${acceptedRiskRegisterFindings.join("; ")}`);
  }
  const acceptedRiskOriginFindings = await acceptedRiskSignoffEvidenceOriginFindings({
    evidence: canonical.acceptedRisks,
    selectedSha: candidateSha,
    token: githubToken,
    fetchImpl,
  });
  if (acceptedRiskOriginFindings.length > 0) {
    fail(`accepted-risk origin verification failed: ${acceptedRiskOriginFindings.join("; ")}`);
  }
  equal(canonical.acceptedRisks.finalDisposition, "accepted", "accepted-risk final disposition");
  requireCanonicalEvidence({
    value: canonical.approvals,
    decision: EXPECTED_DECISIONS.approvals,
    candidateSha,
    candidateValues: [canonical.approvals.sourceSha, canonical.approvals.releaseScope?.candidateSha],
    label: "Go approval evidence",
  });
  try {
    verifyGoApprovalMatrixEvidence(canonical.approvals, candidateSha);
  } catch (error) {
    fail(`Go approval artifact verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const approvalOriginFindings = await goApprovalMatrixEvidenceOriginFindings({
    evidence: canonical.approvals,
    selectedSha: candidateSha,
    token: githubToken,
    fetchImpl,
  });
  if (approvalOriginFindings.length > 0) {
    fail(`Go approval origin verification failed: ${approvalOriginFindings.join("; ")}`);
  }
  equal(
    canonical.approvals.finalDisposition,
    "approved_for_controlled_soft_launch",
    "Go approval final disposition",
  );
  requireCanonicalEvidence({
    value: canonical.disabledCapabilities,
    decision: EXPECTED_DECISIONS.disabledCapabilities,
    candidateSha,
    candidateValues: [canonical.disabledCapabilities.selectedSha],
    label: "disabled-capability evidence",
  });
  equal(
    canonical.disabledCapabilities.acceptedForBlockers,
    ["NOG-10", "NOG-11", "NOG-12"],
    "disabled-capability accepted blockers",
  );

  for (const key of [
    "protectedStaging",
    "recoveryReconciliation",
    "rollbackOrForwardFix",
    "incidentReadiness",
    "acceptedRisks",
    "approvals",
    "disabledCapabilities",
  ]) {
    const expectedPath = FINAL_AUTHORITY_PATHS[key];
    const evidence = manifest.requiredExternalEvidence[key];
    const evidenceRevision = requireImmutableBlobUrl(
      evidence.evidenceUrl,
      expectedPath,
      `manifest ${key} evidence URL`,
    );
    equal(evidence.artifactDigest, sourceDigests[key], `manifest ${key} source digest`);
    equal(
      evidence.artifactDigest,
      sha256(gitSourceAtRevision(root, evidenceRevision, expectedPath)),
      `manifest ${key} immutable URL source digest`,
    );
  }

  return {
    manifest,
    authority: {
      authority: FINAL_AUTHORITY,
      status: "verified",
      candidateSha,
      generatorSourceDigest: sha256(generatorSource),
      verifierSourceDigest: sha256(verifierSource),
      canonicalSourceDigests: sourceDigests,
    },
  };
}
