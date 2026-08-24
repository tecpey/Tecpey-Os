import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";
import { validateControlledLaunchEvidenceManifest } from "./controlled-launch-evidence-manifest.mjs";
import {
  DISABLED_CAPABILITY_ATTESTATION,
  FINAL_AUTHORITY,
  FINAL_AUTHORITY_PATHS,
  FINAL_DECISION,
  FINAL_MANIFEST_PATH,
  PRIVACY_BOUNDARY,
  verifyControlledLaunchFinalAuthority,
} from "./controlled-launch-final-authority.mjs";
import { evaluateDisabledCapabilityAttestation } from "./disabled-capability-attestation-policy.mjs";

const files = {
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  digest: "docs/launch/CONTROLLED_LAUNCH_EVIDENCE_DIGEST_20260808.md",
  baseline: "docs/launch/TECPEY_COMPLETION_BASELINE_20260719.md",
  productionPlan: "docs/PRODUCTION_HARDENING_MASTER_PLAN.md",
  finalGate: "docs/FINAL_IMPLEMENTATION_GATE.md",
  acceptedRisks: "docs/LAUNCH_ACCEPTED_RISKS.md",
  incidentReadiness: "docs/operations/INCIDENT_READINESS_CONTRACT.md",
  readme: "README.md",
  readmeFa: "README.fa.md",
  packageJson: "package.json",
  releasePacket: "scripts/generate-controlled-launch-release-packet.mjs",
  releasePacketTest: "scripts/controlled-launch-release-packet.test.mjs",
  evidenceManifest: "scripts/controlled-launch-evidence-manifest.mjs",
  evidenceManifestTest: "scripts/controlled-launch-evidence-manifest.test.mjs",
  finalAuthority: "scripts/controlled-launch-final-authority.mjs",
  finalEvidenceManifest:
    "docs/launch/generated/controlled-soft-launch-final-evidence-manifest-20260824.json",
  finalReleasePacket:
    "docs/launch/generated/controlled-soft-launch-final-release-packet-20260824.json",
  packageLock: "package-lock.json",
  runtimeImageEvidence: "docs/launch/generated/runtime-image-digest-evidence-20260812.json",
  exactHeadWorkflowEvidence: "docs/launch/generated/exact-head-workflow-evidence-20260812.json",
  protectedStagingExecutionStatus:
    "docs/launch/generated/protected-staging-execution-status-20260812.json",
  rollbackExecutionStatus: "docs/launch/generated/rollback-volume-restore-evidence-20260812.json",
  workflowEvidenceAuthority: "scripts/check-exact-head-workflow-evidence-authority.mjs",
  rollbackEvidenceAuthority: "scripts/check-rollback-volume-restore-evidence-authority.mjs",
  recoveryReconciliationEvidenceAuthority:
    "scripts/check-protected-recovery-reconciliation-execution-status.mjs",
  recoveryReconciliationExecutionStatus:
    "docs/launch/generated/protected-recovery-reconciliation-execution-status-20260823.json",
  acceptedRiskAuthority: "scripts/accepted-risk-register-authority-policy.mjs",
  acceptedRiskEvidenceAuthority: "scripts/check-accepted-risk-signoff-evidence-authority.mjs",
  acceptedRiskRequest: "docs/launch/generated/accepted-risk-signoff-evidence-20260812.json",
  acceptedRiskEvidence: "docs/launch/generated/accepted-risk-signoff-execution-status-20260823.json",
  acceptedRiskOrigin: "scripts/accepted-risk-signoff-evidence-origin.mjs",
  acceptedRiskVerifier: "scripts/verify-accepted-risk-signoff-evidence.mjs",
  acceptedRiskVerifierTest: "scripts/accepted-risk-signoff-evidence.test.mjs",
  incidentReadinessEvidenceAuthority:
    "scripts/check-protected-incident-readiness-execution-status.mjs",
  incidentReadinessExecutionStatus:
    "docs/launch/generated/protected-incident-readiness-execution-status-20260823.json",
  incidentReadinessVerifier: "scripts/verify-incident-readiness-evidence.mjs",
  incidentReadinessVerifierTest: "scripts/incident-readiness-evidence.test.mjs",
  incidentReadinessRequest: "docs/launch/generated/incident-readiness-evidence-request-20260812.json",
  goApprovalMatrixEvidenceAuthority: "scripts/check-go-approval-matrix-evidence-authority.mjs",
  goApprovalMatrixVerifier: "scripts/verify-go-approval-matrix-evidence.mjs",
  goApprovalMatrixVerifierTest: "scripts/go-approval-matrix-evidence.test.mjs",
  goApprovalMatrixRequest: "docs/launch/generated/go-approval-matrix-evidence-request-20260812.json",
  goApprovalMatrixEvidence: "docs/launch/generated/go-approval-matrix-execution-status-20260824.json",
  goApprovalMatrixOrigin: "scripts/go-approval-matrix-evidence-origin.mjs",
  disabledCapabilityPolicy: "scripts/disabled-capability-attestation-policy.mjs",
  disabledCapabilityCheck: "scripts/check-disabled-capability-attestation.mjs",
  disabledCapabilityTest: "scripts/disabled-capability-attestation-policy.test.mjs",
  gatedCapabilityEvidenceAuthority: "scripts/check-gated-capability-evidence-authority.mjs",
  gatedCapabilityEvidence: "docs/launch/generated/disabled-capability-attestation-evidence-20260812.json",
  workflow: ".github/workflows/ci.yml",
  server: "server.ts",
  layout: "src/app/layout.tsx",
  englishLandingPage: "src/app/en/page.tsx",
  englishLanding: "src/app/en/EnglishLandingClient.tsx",
  arenaSimulation: "src/components/academy/AcademySimulationWorld.tsx",
  structuredData: "src/components/seo/StructuredData.tsx",
  custodyPolicy: "src/lib/wallet/custody-launch-policy.ts",
  custodyStatusRoute: "src/app/api/wallet/custody-status/route.ts",
  envValidator: "scripts/validate-env.mjs",
  exchangeCompareData: "src/data/exchangeCompare.json",
  featureFlags: "src/lib/feature-flags.ts",
  i18nMessagesEn: "src/i18n/messages/en.json",
  i18nMessagesFa: "src/i18n/messages/fa.json",
};

async function collectPublicSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const file = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      if (file === "src/app/api") continue;
      files.push(...(await collectPublicSourceFiles(file)));
    } else if (/\.(?:ts|tsx|mdx)$/.test(file)) {
      files.push(file);
    }
  }

  return files;
}

async function collectI18nMessageFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.json$/.test(entry.name))
    .map((entry) => `${root}/${entry.name}`);
}

const fileEntries = [
  ...Object.entries(files),
  ...[
    ...(await collectPublicSourceFiles("src/app")),
    ...(await collectPublicSourceFiles("src/components")),
    ...(await collectI18nMessageFiles("src/i18n/messages")),
  ]
    .filter((file) => !Object.values(files).includes(file))
    .map((file) => [`public:${file}`, file]),
];

const source = Object.fromEntries(
  await Promise.all(
    fileEntries.map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const sourceByPath = Object.fromEntries(fileEntries.map(([key, file]) => [file, source[key]]));
const normalized = Object.fromEntries(
  Object.entries(source).map(([key, value]) => [key, value.replace(/\s+/g, " ")]),
);
const failures = [];

function parseJson(target) {
  try {
    return JSON.parse(source[target]);
  } catch (error) {
    failures.push(`${files[target]}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function requireEqualValue(label, actual, expected) {
  if (JSON.stringify(canonicalValue(actual)) !== JSON.stringify(canonicalValue(expected))) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function sourceDigest(target) {
  return `sha256:${createHash("sha256").update(source[target], "utf8").digest("hex")}`;
}

function gitSourceDigest(revision, file) {
  const result = spawnSync("git", ["show", `${revision}:${file}`]);
  if (result.status !== 0) return null;
  return `sha256:${createHash("sha256").update(result.stdout).digest("hex")}`;
}

const selectedSha = "79c48a16cb685a88315a44e103b3758cf7845d65";
const finalManifest = parseJson("finalEvidenceManifest");
const finalPacket = parseJson("finalReleasePacket");
const runtimeImageEvidence = parseJson("runtimeImageEvidence");
const exactHeadWorkflowEvidence = parseJson("exactHeadWorkflowEvidence");

if (finalManifest) {
  try {
    validateControlledLaunchEvidenceManifest(finalManifest, { expectedHeadSha: selectedSha });
  } catch (error) {
    failures.push(`${files.finalEvidenceManifest}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await verifyControlledLaunchFinalAuthority(finalManifest);
  } catch (error) {
    failures.push(`${files.finalEvidenceManifest}: ${error instanceof Error ? error.message : String(error)}`);
  }
  requireEqualValue(
    "final manifest image digest",
    finalManifest.artifactIdentity?.imageDigest,
    runtimeImageEvidence?.containerImage?.imageDigest,
  );
  requireEqualValue(
    "final manifest deployment artifact digest",
    finalManifest.artifactIdentity?.deploymentArtifactDigest,
    runtimeImageEvidence?.artifactEvidence?.containerRelease?.artifactDigest,
  );
  requireEqualValue(
    "final manifest workflow evidence",
    finalManifest.workflowEvidence,
    exactHeadWorkflowEvidence?.workflowEvidence,
  );
  requireEqualValue(
    "final manifest protected staging digest",
    finalManifest.requiredExternalEvidence?.protectedStaging?.artifactDigest,
    sourceDigest("protectedStagingExecutionStatus"),
  );
  requireEqualValue(
    "final manifest recovery digest",
    finalManifest.requiredExternalEvidence?.recoveryReconciliation?.artifactDigest,
    sourceDigest("recoveryReconciliationExecutionStatus"),
  );
  requireEqualValue(
    "final manifest rollback digest",
    finalManifest.requiredExternalEvidence?.rollbackOrForwardFix?.artifactDigest,
    sourceDigest("rollbackExecutionStatus"),
  );
  requireEqualValue(
    "final manifest incident digest",
    finalManifest.requiredExternalEvidence?.incidentReadiness?.artifactDigest,
    sourceDigest("incidentReadinessExecutionStatus"),
  );
  requireEqualValue(
    "final manifest accepted-risk digest",
    finalManifest.requiredExternalEvidence?.acceptedRisks?.artifactDigest,
    sourceDigest("acceptedRiskEvidence"),
  );
  requireEqualValue(
    "final manifest Go approval digest",
    finalManifest.requiredExternalEvidence?.approvals?.artifactDigest,
    sourceDigest("goApprovalMatrixEvidence"),
  );
  requireEqualValue(
    "final manifest disabled-capability digest",
    finalManifest.requiredExternalEvidence?.disabledCapabilities?.artifactDigest,
    sourceDigest("gatedCapabilityEvidence"),
  );
}

if (finalPacket && finalManifest) {
  requireEqualValue("final packet schemaVersion", finalPacket.schemaVersion, 1);
  requireEqualValue("final packet mode", finalPacket.packetMode, "final_evidence_required");
  requireEqualValue("final packet generatedAt", finalPacket.generatedAt, finalManifest.generatedAt);
  requireEqualValue("final packet decision", finalPacket.decision, FINAL_DECISION);
  requireEqualValue("final packet release authority", finalPacket.releaseControl?.authority, FINAL_AUTHORITY);
  requireEqualValue("final packet authority status", finalPacket.releaseControl?.authorityStatus, "verified");
  requireEqualValue(
    "final packet generator identity",
    finalPacket.releaseControl?.generator,
    finalManifest.authorityVerification?.generator,
  );
  requireEqualValue(
    "final packet verifier identity",
    finalPacket.releaseControl?.verifier,
    finalManifest.authorityVerification?.verifier,
  );
  requireEqualValue("final packet manifest path", finalPacket.releaseControl?.manifest?.path, FINAL_MANIFEST_PATH);
  requireEqualValue(
    "final packet manifest digest",
    finalPacket.releaseControl?.manifest?.sourceDigest,
    sourceDigest("finalEvidenceManifest"),
  );
  if (!/^[a-f0-9]{40}$/.test(finalPacket.releaseControl?.sourceRevision ?? "")) {
    failures.push("final packet release-control source revision must be a 40-character git SHA");
  } else if (
    spawnSync("git", ["merge-base", "--is-ancestor", finalPacket.releaseControl.sourceRevision, "HEAD"]).status !== 0
  ) {
    failures.push("final packet release-control source revision must be an ancestor of the packet commit");
  } else {
    for (const [label, identity] of [
      ["generator", finalPacket.releaseControl?.generator],
      ["verifier", finalPacket.releaseControl?.verifier],
      ["manifest", finalPacket.releaseControl?.manifest],
    ]) {
      requireEqualValue(
        `final packet ${label} digest at release-control source revision`,
        gitSourceDigest(finalPacket.releaseControl.sourceRevision, identity?.path),
        identity?.sourceDigest,
      );
    }
  }
  requireEqualValue("final packet candidate", finalPacket.releaseCandidate?.sha, selectedSha);
  requireEqualValue("final packet clean candidate", finalPacket.releaseCandidate?.cleanWorktree, true);
  requireEqualValue("final packet main containment", finalPacket.releaseCandidate?.originMainContainsSha, true);
  requireEqualValue("final packet local dirty files", finalPacket.releaseCandidate?.localDirtyFiles, []);
  requireEqualValue(
    "final packet image digest",
    finalPacket.artifactIdentity?.imageDigest,
    finalManifest.artifactIdentity?.imageDigest,
  );
  requireEqualValue(
    "final packet deployment artifact digest",
    finalPacket.artifactIdentity?.deploymentArtifactDigest,
    finalManifest.artifactIdentity?.deploymentArtifactDigest,
  );
  requireEqualValue(
    "final packet package-lock digest",
    finalPacket.artifactIdentity?.packageLockSha256,
    gitSourceDigest(selectedSha, files.packageLock)?.slice("sha256:".length),
  );
  requireEqualValue(
    "final packet migration plan digest",
    finalPacket.artifactIdentity?.migrationPlanSha256,
    "69f784cef674c98a2df4548d335480877db80995c567ec9a9ec69ead2b46f727",
  );
  requireEqualValue("final packet workflow evidence", finalPacket.workflowEvidence, finalManifest.workflowEvidence);
  for (const key of [
    "protectedStaging",
    "recoveryReconciliation",
    "rollbackOrForwardFix",
    "incidentReadiness",
    "acceptedRisks",
    "approvals",
    "disabledCapabilities",
  ]) {
    requireEqualValue(
      `final packet ${key} authority status`,
      finalPacket.requiredExternalEvidence?.[key]?.status,
      "authority_verified",
    );
    requireEqualValue(
      `final packet ${key} evidence URL`,
      finalPacket.requiredExternalEvidence?.[key]?.evidenceUrl,
      finalManifest.requiredExternalEvidence?.[key]?.evidenceUrl,
    );
    if (finalManifest.requiredExternalEvidence?.[key]?.artifactDigest) {
      requireEqualValue(
        `final packet ${key} artifact digest`,
        finalPacket.requiredExternalEvidence?.[key]?.artifactDigest,
        finalManifest.requiredExternalEvidence?.[key]?.artifactDigest,
      );
    }
  }
  requireEqualValue(
    "final packet disabled capability attestations",
    finalPacket.disabledCapabilityAttestation,
    DISABLED_CAPABILITY_ATTESTATION,
  );
  requireEqualValue("final packet privacy boundary", finalPacket.privacyBoundary, PRIVACY_BOUNDARY);
  if (!Number.isFinite(Date.parse(finalPacket.generatedAt))) {
    failures.push(`${files.finalReleasePacket}: generatedAt must be an ISO-8601 timestamp`);
  }
}

function requireText(target, token, reason) {
  if (!normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function rejectText(target, token, reason) {
  if (normalized[target].includes(token.replace(/\s+/g, " "))) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

for (const invariant of [
  "Status:** GO — controlled soft launch only",
  "This checklist is the release-decision surface",
  "does not authorize real-money Exchange, custody, deposits, withdrawals",
  "public Persian and English experience",
  "controlled Academy journeys",
  "governed educational Mentor assistance",
  "official virtual Trading Arena",
  "Protected staging activation",
  "STAGING_READINESS_EVIDENCE_CONTRACT.md",
  "Backup, restore and recovery",
  "RECOVERY_RECONCILIATION_CONTRACT.md",
  "Disabled financial surfaces",
  "Exchange safety boundary",
  "Custody and withdrawal boundary",
  "Compliance activation",
  "Product truth and UX",
  "Accepted risks",
  "Incident readiness",
  "INCIDENT_READINESS_CONTRACT.md",
  "Required decision record",
  "controlled-soft-launch-final-evidence-manifest",
  "controlled-soft-launch-final-evidence-manifest-20260824.json",
  "controlled-soft-launch-final-release-packet-20260824.json",
  "GO_APPROVED_FOR_CONTROLLED_SOFT_LAUNCH_ONLY",
  "must contain only HTTPS URLs",
  "npm run launch:packet -- --manifest",
  "releaseControl.sourceRevision",
  "direct evidence flags are draft-only",
  "Non-negotiable No-Go rules",
  "Completion percentage rule",
  "This checklist does not increase the completion percentage by itself",
]) {
  requireText("checklist", invariant, `launch decision checklist is missing invariant: ${invariant}`);
}

for (const forbidden of [
  "Status:** NO-GO until every blocking row",
  "authorizes production deployment",
  "authorizes real-money",
  "ready for real-money",
  "white-label activation is approved",
]) {
  rejectText("checklist", forbidden, `launch decision checklist contains forbidden claim: ${forbidden}`);
}

for (const invariant of [
  "Go/No-Go decision and not a marketing readiness claim",
  "Real-money Exchange activation",
  "Production custody and withdrawals",
  "Protected staging acceptance",
  "Final release reconciliation",
]) {
  requireText("digest", invariant, `controlled launch digest is missing boundary: ${invariant}`);
}

for (const invariant of [
  "This is not a Go decision",
  "Strict QA and operational proof (#50)",
  "staging Golden Path and recovery drills are recorded",
]) {
  requireText("baseline", invariant, `completion baseline is missing launch-boundary text: ${invariant}`);
}

for (const invariant of [
  "Stage E — soft-launch decision",
  "Go / No-Go Rules",
  "Soft launch is blocked when any of the following is true",
  "real-money Wallet/Withdrawal execution lacks custody and reconciliation evidence",
  "backup/restore or rollback is untested",
  "critical alerts are not delivered",
]) {
  requireText("productionPlan", invariant, `production hardening plan is missing decision authority: ${invariant}`);
}

for (const invariant of [
  "Gate 6 — Soft Launch Go / No-Go",
  "Final decision before real users and real money enter the platform",
]) {
  requireText("finalGate", invariant, `final implementation gate is missing Gate 6 authority: ${invariant}`);
}

for (const invariant of [
  "Controlled-launch decision update (2026-08-08)",
  "not yet accepted as final Go evidence",
  "Placeholder thresholds such as `N`, `X`, `defined hours`",
  "Controlled-launch closure update (2026-08-09)",
  "Controlled Launch Reconciliation Addendum — 2026-08-08",
  "Required accepted-risk closure before a Go decision",
  "Controlled-launch closure matrix — 2026-08-09",
  "09:00-23:00 Asia/Tehran",
  "Three or more support complaints about lost engagement state in seven days",
  "Three distinct stale-price reports in 24 hours",
  "delivery latency must be under five minutes",
  "Zero real-money orders, deposits, withdrawals",
  "non-Persian traffic exceeds ten percent of weekly active users",
  "P0 acknowledgement target is fifteen minutes",
  "keep the related capability explicitly NO-GO and product-disabled",
]) {
  requireText("acceptedRisks", invariant, `accepted-risk registry is missing controlled launch reconciliation: ${invariant}`);
}

failures.push(...evaluateAcceptedRiskRegisterAuthority(source.acceptedRisks));
failures.push(...evaluateDisabledCapabilityAttestation(sourceByPath));

for (const invariant of [
  "Incident Readiness Contract",
  "09:00-23:00 Asia/Tehran",
  "15 minutes during support hours",
  "60 minutes outside support hours",
  "4 hours",
  "protected staging synthetic critical alert delivery succeeds twice",
  "pending alert count is zero",
  "quarantine count is zero",
  "Machine-readable evidence artifact",
  "tecpey-incident-readiness-v1",
  "protected-staging-incident-readiness",
  "docs/launch/generated/incident-readiness-evidence-request-20260812.json",
  "npm run ops:incident-readiness:evidence:verify",
  "DB, Redis, migration, alert-delivery, provider, worker and reconciliation",
  "launch decision remains NO-GO",
  "No README, landing page, in-app copy, investor update or release note may imply 24/7 production support",
]) {
  requireText("incidentReadiness", invariant, `incident readiness contract is missing invariant: ${invariant}`);
}

for (const invariant of [
  "incident-readiness-evidence-request",
  "NO_GO_NOG_07_INCIDENT_READINESS_EVIDENCE_REQUIRED",
  "blocked_pending_protected_staging_incident_drill",
  "tecpey-incident-readiness-v1",
  "protected-staging-incident-readiness",
  "maximumLatencySeconds",
  "insideSupportWindowTargetSeconds",
  "outsideSupportWindowTargetSeconds",
  "reviewer must differ from operator, incidentCommander and sreOwner",
  "NOG-07 is not accepted by this request",
]) {
  requireText("incidentReadinessRequest", invariant, `incident readiness request is missing invariant: ${invariant}`);
}

for (const invariant of [
  "verifyIncidentReadinessEvidence",
  "RUNBOOK_FAILURE_MODES",
  "synthetic-critical-alert",
  "pendingAlertCountAfterProbe",
  "quarantineCountAfterProbe",
  "reviewer_must_be_independent",
  "no-host-ips",
]) {
  requireText("incidentReadinessVerifier", invariant, `incident readiness verifier is missing invariant: ${invariant}`);
}

for (const invariant of [
  "accepts protected staging incident readiness evidence",
  "rejects slow alert delivery",
  "rejects P0 acknowledgement misses",
  "rejects missing runbook coverage",
]) {
  requireText("incidentReadinessVerifierTest", invariant, `incident readiness verifier tests are missing invariant: ${invariant}`);
}

for (const invariant of [
  "Protected incident readiness execution status",
  "NO_GO_NOG_07_ACCEPTED_REMAINING_BLOCKERS_OPEN",
  "accepted_exact_candidate_protected_incident_readiness",
  "NOG-07 is accepted",
  "launch:incident-readiness-evidence:check",
]) {
  requireText(
    "incidentReadinessEvidenceAuthority",
    invariant,
    `incident readiness evidence authority is missing invariant: ${invariant}`,
  );
}

for (const [target, label] of [
  ["readme", "README.md"],
  ["readmeFa", "README.fa.md"],
]) {
  requireText(
    target,
    "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
    `${label} must expose the controlled launch Go/No-Go checklist`,
  );
  requireText(
    target,
    "docs/launch/CONTROLLED_LAUNCH_EVIDENCE_DIGEST_20260808.md",
    `${label} must expose the controlled launch evidence digest`,
  );
}

for (const invariant of [
  '"launch:packet"',
  '"launch:disabled-capabilities:check"',
  '"launch:gated-capability-evidence:check"',
  '"launch:accepted-risk-evidence:check"',
  '"launch:incident-readiness-evidence:check"',
  '"ops:incident-readiness:evidence:collect"',
  '"ops:incident-readiness:evidence:verify"',
  '"test:incident-readiness-evidence"',
  '"launch:go-approval-matrix-evidence:check"',
  '"ops:go-approval-matrix:evidence:verify"',
  '"test:go-approval-matrix-evidence"',
  '"launch:rollback-evidence:check"',
  '"launch:workflow-evidence:check"',
  '"launch:recovery-reconciliation-evidence:check"',
  '"test:launch-packet"',
  '"test:disabled-capability-attestation"',
  '"launch:decision:check"',
  "scripts/generate-controlled-launch-release-packet.mjs",
  "scripts/check-disabled-capability-attestation.mjs",
  "scripts/check-gated-capability-evidence-authority.mjs",
  "scripts/check-accepted-risk-signoff-evidence-authority.mjs",
  "scripts/check-protected-incident-readiness-execution-status.mjs",
  "scripts/collect-protected-incident-readiness-evidence.ts",
  "scripts/protected-incident-readiness-collector-policy.test.mjs",
  "scripts/verify-incident-readiness-evidence.mjs",
  "scripts/incident-readiness-evidence.test.mjs",
  "scripts/check-go-approval-matrix-evidence-authority.mjs",
  "scripts/verify-go-approval-matrix-evidence.mjs",
  "scripts/go-approval-matrix-evidence.test.mjs",
  "scripts/check-exact-head-workflow-evidence-authority.mjs",
  "scripts/check-rollback-volume-restore-evidence-authority.mjs",
  "scripts/check-protected-recovery-reconciliation-execution-status.mjs",
  "scripts/disabled-capability-attestation-policy.test.mjs",
  "scripts/controlled-launch-release-packet.test.mjs",
  "scripts/controlled-launch-evidence-manifest.mjs",
  "scripts/controlled-launch-evidence-manifest.test.mjs",
  "scripts/check-controlled-launch-decision-authority.mjs",
  "npm run launch:decision:check",
  "npm run launch:rollback-evidence:check",
  "npm run launch:workflow-evidence:check",
  "npm run launch:recovery-reconciliation-evidence:check",
  "npm run launch:disabled-capabilities:check",
  "npm run launch:gated-capability-evidence:check",
  "npm run launch:accepted-risk-evidence:check",
  "npm run test:accepted-risk-signoff-evidence",
  "npm run launch:incident-readiness-evidence:check",
  "npm run test:incident-readiness-evidence",
  "npm run launch:go-approval-matrix-evidence:check",
  "npm run test:go-approval-matrix-evidence",
  "npm run test:disabled-capability-attestation",
  '"test:launch-evidence-manifest"',
]) {
  requireText("packageJson", invariant, `package.json is missing launch decision guard wiring: ${invariant}`);
}

for (const invariant of [
  '"schemaVersion": 2',
  '"decision": "ACCEPTED_RISKS_SIGNED_OFF_FOR_CONTROLLED_SCOPE"',
  '"releaseScope"',
  '"riskRegister"',
  '"riskOwnerSignoffs"',
  '"releaseOwner"',
  '"operator"',
  '"reviewer"',
  '"privacyBoundary"',
  '"acceptanceEvidenceType": "github-issue-comment"',
  '"acceptanceEvidenceCommentId"',
  "issuecomment-5388723104",
  "issuecomment-5388727231",
  "issuecomment-5388733838",
  '"requiredArtifactOriginVerification"',
  "issues/comments/{acceptanceEvidenceCommentId}",
  '"failureMode": "fail-closed"',
]) {
  requireText("acceptedRiskRequest", invariant, `accepted-risk request is missing schema-v2 invariant: ${invariant}`);
}

for (const invariant of [
  "tecpey-accepted-risk-owner-signoff-v1",
  "controlled-soft-launch-accepted-risk-owner-signoff",
  '"schemaVersion": 2',
  "ACCEPTED_RISKS_SIGNED_OFF_FOR_CONTROLLED_SCOPE",
  "79c48a16cb685a88315a44e103b3758cf7845d65",
  "sha256:d5ef423425b50d8c241b9bb83182c2938ffc4cc5f0e15a0b07b2118cbf977c97",
  "riskOwnerSignoffs",
  "github:tecpey",
  "github:mvexhiiii",
  "github:xrayman6zfm-ux",
  "issuecomment-5388723104",
  "issuecomment-5388727231",
  "issuecomment-5388733838",
  '"finalDisposition": "accepted"',
  "accepted-risk-register-approved-for-controlled-soft-launch-only",
  "no-secrets-or-connection-urls",
  "no-host-ips",
]) {
  requireText("acceptedRiskEvidence", invariant, `accepted-risk evidence is missing invariant: ${invariant}`);
}

for (const invariant of [
  "Accepted-risk signoff evidence authority",
  "acceptedRiskSignoffEvidenceOriginFindings",
  "REQUIRED_APPROVAL_COMMENTS",
  "GITHUB_TOKEN",
  "verifyAcceptedRiskSignoffEvidence",
  "accepted_exact_candidate_accepted_risk_owner_signoff",
  "scripts/verify-accepted-risk-signoff-evidence.mjs",
  "scripts/accepted-risk-signoff-evidence.test.mjs",
  "evidence must not contain secrets, connection strings or host identifiers",
  "evaluateAcceptedRiskRegisterAuthority",
  "NOG-08 is accepted",
  "NOG-09",
  "launch:accepted-risk-evidence:check",
  "test:accepted-risk-signoff-evidence",
]) {
  requireText(
    "acceptedRiskEvidenceAuthority",
    invariant,
    `accepted-risk evidence authority is missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  "acceptedRiskSignoffEvidenceOriginFindings",
  "issues/comments",
  "origin.bodyDigest",
  "origin.author",
  "approval body is missing",
  "accepted-risk approval origin verification requires GITHUB_TOKEN",
]) {
  requireText("acceptedRiskOrigin", invariant, `accepted-risk origin verifier is missing invariant: ${invariant}`);
}

for (const invariant of [
  "verifyAcceptedRiskSignoffEvidence",
  "tecpey-accepted-risk-owner-signoff-v1",
  "controlled-soft-launch-accepted-risk-owner-signoff",
  "REQUIRED_CONTROLLED_LAUNCH_RISKS",
  "accepted-risk-register-approved-for-controlled-soft-launch-only",
  "accepted_risk_signoff_independence_invalid",
  "no-secrets-or-connection-urls",
  "no-host-ips",
]) {
  requireText("acceptedRiskVerifier", invariant, `accepted-risk verifier is missing invariant: ${invariant}`);
}

for (const invariant of [
  "accepts complete accepted-risk owner signoff evidence",
  "attests immutable accepted-risk issue comments by author and body digest",
  "rejects accepted-risk origin verification without GitHub token",
  "rejects edited or wrongly attributed accepted-risk approval comments",
  "rejects stale candidate SHA",
  "rejects stale review date",
  "rejects rejected owner signoff",
  "rejects operator self-approval",
]) {
  requireText("acceptedRiskVerifierTest", invariant, `accepted-risk verifier tests are missing invariant: ${invariant}`);
}

for (const invariant of [
  "go-approval-matrix-evidence-request",
  "GO_NOG_09_EXACT_CANDIDATE_MATRIX_ACCEPTED",
  "accepted_exact_candidate_go_approval_matrix",
  "NOG-09",
  "tecpey-go-approval-matrix-v1",
  "controlled-soft-launch-go-approval-matrix",
  "controlled-public-fa-en-academy-mentor-arena",
  "CEO",
  "CTO or Chief Architect",
  "Security",
  "Product",
  "Compliance",
  "SRE",
  "QA",
  "NOG-09 is accepted only for the exact selected SHA",
  "requiredArtifactOriginVerification",
  "issues/comments/{approvalEvidenceCommentId}",
  "failureMode\": \"fail-closed",
]) {
  requireText("goApprovalMatrixRequest", invariant, `Go approval matrix request is missing invariant: ${invariant}`);
}

for (const invariant of [
  "verifyGoApprovalMatrixEvidence",
  "REQUIRED_APPROVAL_ROLES",
  "REQUIRED_PREREQUISITE_BLOCKERS",
  "approved-for-controlled-soft-launch-only",
  "approval_matrix_independence_invalid",
  "no-secrets-or-connection-urls",
  "no-host-ips",
]) {
  requireText("goApprovalMatrixVerifier", invariant, `Go approval matrix verifier is missing invariant: ${invariant}`);
}

for (const invariant of [
  "accepts complete Go approval matrix evidence",
  "rejects stale candidate SHA",
  "rejects pending prerequisites",
  "rejects rejected approvals",
  "rejects operator self-review",
]) {
  requireText("goApprovalMatrixVerifierTest", invariant, `Go approval matrix verifier tests are missing invariant: ${invariant}`);
}

for (const invariant of [
  "Go approval matrix evidence authority",
  "accepted_exact_candidate_go_approval_matrix",
  "goApprovalMatrixEvidenceOriginFindings",
  "GITHUB_TOKEN",
  "NOG-09",
  "launch:go-approval-matrix-evidence:check",
  "ops:go-approval-matrix:evidence:verify",
  "test:go-approval-matrix-evidence",
]) {
  requireText(
    "goApprovalMatrixEvidenceAuthority",
    invariant,
    `Go approval matrix evidence authority is missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  '"schemaVersion": 2',
  "APPROVED_FOR_CONTROLLED_SOFT_LAUNCH",
  "79c48a16cb685a88315a44e103b3758cf7845d65",
  "github:tecpey",
  "github:mvexhiiii",
  "github:tecpeysup",
  "issuecomment-5391626720",
  "issuecomment-5391640345",
  "issuecomment-5391646913",
  "approved_for_controlled_soft_launch",
]) {
  requireText("goApprovalMatrixEvidence", invariant, `Go approval matrix evidence is missing invariant: ${invariant}`);
}

for (const invariant of [
  "goApprovalMatrixEvidenceOriginFindings",
  "issues/comments",
  "origin.bodyDigest",
  "origin.author",
  "origin.updated_at",
  "Go approval matrix origin verification requires GITHUB_TOKEN",
]) {
  requireText("goApprovalMatrixOrigin", invariant, `Go approval matrix origin verifier is missing invariant: ${invariant}`);
}

for (const invariant of [
  "disabled-capability-attestation-evidence",
  "NO_GO_NOG_10_11_12_ACCEPTED_LAUNCH_DISABLED_SCOPE_ONLY",
  "accepted_launch_disabled_attestation",
  "NOG-10",
  "NOG-11",
  "NOG-12",
  "This evidence does not authorize real-money Exchange, custody, deposits, withdrawals, enterprise, white-label or public reward activation.",
]) {
  requireText("gatedCapabilityEvidence", invariant, `gated capability evidence is missing invariant: ${invariant}`);
}

for (const invariant of [
  "Gated capability evidence authority",
  "accepted_launch_disabled_attestation",
  "evaluateDisabledCapabilityAttestation",
  "NOG-10",
  "NOG-11",
  "NOG-12",
  "launch:gated-capability-evidence:check",
]) {
  requireText(
    "gatedCapabilityEvidenceAuthority",
    invariant,
    `gated capability evidence authority is missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE",
  "packetMode",
  "final_evidence_required",
  "draft_incomplete_evidence_allowed",
  "unknown launch packet option",
  "--manifest",
  "controlled-launch-evidence-manifest.mjs",
  "final GO packet generation requires --manifest with governed authority verification",
  "final release packet requires the release candidate SHA to be contained in origin/main",
  "is required for a final release packet",
  "requires a clean worktree for final packets",
  "Re-run with --draft --allow-dirty only for local incomplete packet scaffolding",
  "imageDigest",
  "deploymentArtifactDigest",
  "migrationPlanSha256",
  "ciRunUrl",
  "fullSuiteRunUrl",
  "apiSecurityRunUrl",
  "sensitiveMutationRunUrl",
  "repositoryAuditRunUrl",
  "publicGoldenPathRunUrl",
  "operationalRecoveryRunUrl",
  "containerSupplyChainRunUrl",
  "secretScanningRunUrl",
  "protected-staging-evidence-url",
  "protected-staging-artifact-digest",
  "recovery-reconciliation-evidence-url",
  "recovery-reconciliation-artifact-digest",
  "rollback-evidence-url",
  "rollback-artifact-digest",
  "incident-readiness-evidence-url",
  "incident-readiness-artifact-digest",
  "accepted-risk-signoff-url",
  "go-approvals-url",
  "go-approvals-artifact-digest",
  "authority_verified",
  "final GO packet accepts only --manifest and optional --out; evidence overrides are draft-only",
  "releaseControl",
  "sourceRevision",
  "sha256GitFileAtCommit",
  "verifyControlledLaunchFinalAuthority",
  "protectedStaging",
  "recoveryReconciliation",
  "rollbackOrForwardFix",
  "incidentReadiness",
  "acceptedRisks",
  "approvals",
  "disabledCapabilities",
  "goApprovalsArtifactDigest",
]) {
  requireText("releasePacket", invariant, `release packet generator is missing invariant: ${invariant}`);
}

for (const invariant of [
  "tecpey-controlled-soft-launch-final-authority-v1",
  "GO_APPROVED_FOR_CONTROLLED_SOFT_LAUNCH_ONLY",
  "NO_GO_PENDING_GOVERNED_AUTHORITY_VERIFICATION",
  "verifyControlledLaunchFinalAuthority",
  "manifest generator source digest",
  "manifest verifier source digest",
  "workflow evidence decision",
  "workflow evidence ${key} conclusion",
  "accepted-risk final disposition",
  "Go approval final disposition",
  "disabled-capability accepted blockers",
  "must be an immutable tecpey/Tecpey-Os blob URL",
]) {
  requireText("finalAuthority", invariant, `controlled launch final authority is missing invariant: ${invariant}`);
}

for (const invariant of [
  "REQUIRED_CONTROLLED_LAUNCH_RISKS",
  "R-06",
  "evaluateAcceptedRiskRegisterAuthority",
  "parseIsoReviewDate",
  "referenceDate",
  "splitMarkdownTableRow",
  "duplicate",
  "controlled-launch closure matrix is missing",
  "threshold must be measurable",
  "review date must be exact",
  "review date ${parsedReviewDate.token} is stale",
]) {
  requireText("acceptedRiskAuthority", invariant, `accepted-risk authority policy is missing invariant: ${invariant}`);
}

for (const invariant of [
  "REQUIRED_PUBLIC_BOUNDARIES",
  "REQUIRED_ACTIVATION_BOUNDARIES",
  "FORBIDDEN_PUBLIC_CLAIMS",
  "FORBIDDEN_BOUNDARY_CLAIMS",
  "evaluateDisabledCapabilityAttestation",
  "extractBalancedBlock",
  "requireRuntimeGuard",
  "validateExchangeCompareData",
  "src/i18n/messages/en.json",
  "src/i18n/messages/fa.json",
  "WITHDRAWAL_WORKER_STARTUP_RE",
  "real-money Exchange, custody, deposits, or withdrawals are active",
  "Real-money Exchange, custody, deposits, withdrawals, public financial rewards, enterprise and white-label activation remain outside the current launch scope",
  "TecPey Exchange Core — launch gated",
  "Crypto Education and Launch-Gated Market Practice",
  "custodyStatus.workerEnabled",
  "REQUIRED_RUNTIME_PATTERNS",
  "withdrawal workers must start only inside the redisUrl plus custodyStatus.workerEnabled guard",
  "disabledCapabilityAttestation",
]) {
  requireText(
    "disabledCapabilityPolicy",
    invariant,
    `disabled-capability attestation policy is missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  "Disabled capability attestation passed",
  "collectPublicSourceFiles",
  "collectI18nMessageFiles",
  "evaluateDisabledCapabilityAttestation",
]) {
  requireText(
    "disabledCapabilityCheck",
    invariant,
    `disabled-capability attestation check is missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  "disabled capability attestation accepts current controlled-launch boundary",
  "disabled capability attestation rejects public real-money overclaims",
  "disabled capability attestation rejects public SEO exchange overclaims",
  "disabled capability attestation scans discovered public copy surfaces",
  "disabled capability attestation scans i18n message product-truth surfaces",
  "disabled capability attestation rejects rendered exchange comparison capability drift",
  "disabled capability attestation rejects missing custody runtime gate",
  "disabled capability attestation rejects token-preserving custody runtime bypasses",
  "disabled capability attestation rejects worker startup moved outside the custody guard",
  "disabled capability attestation rejects dead worker tokens inside the custody guard",
  "disabled capability attestation rejects duplicate worker startup outside the custody guard",
  "disabled capability attestation rejects incomplete release-packet boundary",
]) {
  requireText(
    "disabledCapabilityTest",
    invariant,
    `disabled-capability attestation tests are missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  "controlled-soft-launch-final-evidence-manifest",
  "validateControlledLaunchEvidenceManifest",
  "readControlledLaunchEvidenceManifest",
  "manifestValue",
  "manifest.releaseCandidate.sha must be a 40-character git SHA",
  "must contain only URLs, digests and release identifiers",
  "must match the checked-out release candidate HEAD",
  "manifest.schemaVersion must be 2",
  "manifest.generatedAt must be an ISO-8601 timestamp",
  "authorityVerification",
  "disabledCapabilities",
  "must be an absolute https URL",
  "must be an absolute https GitHub Actions run URL for tecpey/Tecpey-Os",
  "must be a sha256 digest",
  "go-approvals-artifact-digest",
]) {
  requireText("evidenceManifest", invariant, `controlled launch evidence manifest validator is missing invariant: ${invariant}`);
}

for (const invariant of [
  "exact-head-workflow-evidence",
  "NO_GO_NOG_04_ACCEPTED_EXACT_HEAD_WORKFLOW_URLS_ONLY",
  "accepted_exact_head_workflow_urls",
  "operationalRecoveryRunUrl",
  "NOG-01",
  "NOG-02",
]) {
  requireText("workflowEvidenceAuthority", invariant, `exact-head workflow evidence authority is missing invariant: ${invariant}`);
}

for (const invariant of [
  "rollback-volume-restore-evidence",
  "NO_GO_NOG_06_ACCEPTED_EPHEMERAL_ROLLBACK_VOLUME_RESTORE_ONLY",
  "accepted_ephemeral_rollback_volume_restore",
  "container-recovery-",
  "previous-release-served",
  "NOG-05",
]) {
  requireText("rollbackEvidenceAuthority", invariant, `rollback evidence authority is missing invariant: ${invariant}`);
}

for (const invariant of [
  "Protected recovery reconciliation execution status",
  "NO_GO_NOG_05_ACCEPTED_REMAINING_BLOCKERS_OPEN",
  "accepted_exact_candidate_protected_recovery_reconciliation",
  "NOG-05 is accepted",
  "launch:recovery-reconciliation-evidence:check",
]) {
  requireText(
    "recoveryReconciliationEvidenceAuthority",
    invariant,
    `protected recovery reconciliation evidence authority is missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  "protected-recovery-reconciliation-execution-status-observation",
  "32659459702",
  "sha256:e55f5eb887bde6d15d41f955d7a39345fa5f0472c4ef688c3d54b98203fd1e69",
  "github:xrayman6zfm-ux",
  "NOG-07, NOG-08 and NOG-09 are accepted",
]) {
  requireText(
    "recoveryReconciliationExecutionStatus",
    invariant,
    `protected recovery reconciliation execution status is missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  "protected-incident-readiness-execution-status-observation",
  "32663989309",
  "sha256:e9bf68a588571fcf8cf91b22ff8fbf1fe92734cced0321e286ad27921591a8a5",
  "github:xrayman6zfm-ux",
  "NOG-08 and NOG-09 are accepted",
]) {
  requireText(
    "incidentReadinessExecutionStatus",
    invariant,
    `protected incident readiness execution status is missing invariant: ${invariant}`,
  );
}

for (const invariant of [
  "controlled launch evidence manifest validates the complete final packet input set",
  "controlled launch evidence manifest rejects unknown fields",
  "controlled launch evidence manifest rejects non-https evidence URLs",
  "controlled launch evidence manifest rejects workflow URLs outside governed GitHub Actions",
  "controlled launch evidence manifest rejects raw secrets and connection strings",
  "controlled launch evidence manifest rejects a release candidate SHA mismatch",
  "controlled launch evidence manifest rejects missing authority verification",
  "controlled launch evidence manifest rejects missing accepted-risk artifact digest",
  "controlled launch evidence manifest rejects non-canonical timestamps",
]) {
  requireText("evidenceManifestTest", invariant, `controlled launch evidence manifest tests are missing invariant: ${invariant}`);
}

for (const invariant of [
  "final launch packet fails closed without required release evidence",
  "final launch packet rejects dirty worktrees in governed final mode",
  "final launch packet fails closed without external operational evidence",
  "final launch packet rejects unmerged release candidates",
  "launch packet rejects unknown options",
  "launch packet rejects workflow URLs outside governed GitHub Actions",
  "draft launch packet can scaffold incomplete evidence explicitly",
  "final launch packet emits only after all release evidence is complete",
  "direct evidence flags cannot emit a final GO packet",
  "final launch packet rejects evidence overrides even with the governed manifest",
  "final packet records the independent release-control revision",
  "final packet reproduces byte-for-byte from its recorded source revision",
  "final packet authority rejects invented workflow conclusions",
  "decision authority rejects same-length disabled capability substitutions",
  "rollbackOrForwardFix.evidenceUrl",
  "incidentReadiness.artifactDigest",
  "acceptedRisks.evidenceUrl",
  "approvals.artifactDigest",
  "accepted-risk register authority accepts the controlled-launch closure matrix",
  "accepted-risk register authority rejects a missing controlled-launch risk row",
  "accepted-risk register authority rejects placeholder thresholds in closure rows",
  "accepted-risk register authority rejects phase-only review dates",
  "accepted-risk register authority rejects event-only review dates",
  "accepted-risk register authority rejects impossible calendar review dates",
  "accepted-risk register authority rejects stale review dates",
  "accepted-risk register authority rejects duplicate controlled-launch risk rows",
  "accepted-risk register authority accepts escaped and inline-code pipes in closure rows",
  "accepted-risk register authority accepts multi-backtick code spans with pipes in closure rows",
  "Full Suite Diagnostics workflow produces exact-head main evidence for NOG-04",
]) {
  requireText("releasePacketTest", invariant, `release packet tests are missing invariant: ${invariant}`);
}

for (const invariant of [
  "Protected recovery reconciliation evidence authority guard",
  "npm run launch:recovery-reconciliation-evidence:check",
  "Protected incident readiness evidence authority guard",
  "npm run launch:incident-readiness-evidence:check",
  "Accepted-risk signoff evidence authority guard",
  "npm run launch:accepted-risk-evidence:check",
  "Controlled launch decision authority guard",
  "npm run launch:decision:check",
  "Go approval matrix evidence authority guard",
  "npm run launch:go-approval-matrix-evidence:check",
]) {
  requireText("workflow", invariant, `CI workflow is missing launch decision guard wiring: ${invariant}`);
}

if (failures.length > 0) {
  console.error("Controlled launch decision authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Controlled launch decision authority passed: the controlled soft launch is Go for the exact candidate and narrow scope; financial and enterprise activation remains disabled and separately NO-GO.",
);
