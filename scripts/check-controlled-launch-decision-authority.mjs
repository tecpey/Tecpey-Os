import { readFile, readdir } from "node:fs/promises";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";
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
  workflowEvidenceAuthority: "scripts/check-exact-head-workflow-evidence-authority.mjs",
  rollbackEvidenceAuthority: "scripts/check-rollback-volume-restore-evidence-authority.mjs",
  recoveryReconciliationEvidenceAuthority:
    "scripts/check-protected-recovery-reconciliation-execution-status.mjs",
  recoveryReconciliationExecutionStatus:
    "docs/launch/generated/protected-recovery-reconciliation-execution-status-20260823.json",
  acceptedRiskAuthority: "scripts/accepted-risk-register-authority-policy.mjs",
  acceptedRiskEvidenceAuthority: "scripts/check-accepted-risk-signoff-evidence-authority.mjs",
  acceptedRiskEvidence: "docs/launch/generated/accepted-risk-signoff-evidence-20260812.json",
  acceptedRiskVerifier: "scripts/verify-accepted-risk-signoff-evidence.mjs",
  acceptedRiskVerifierTest: "scripts/accepted-risk-signoff-evidence.test.mjs",
  incidentReadinessEvidenceAuthority: "scripts/check-incident-readiness-evidence-authority.mjs",
  incidentReadinessVerifier: "scripts/verify-incident-readiness-evidence.mjs",
  incidentReadinessVerifierTest: "scripts/incident-readiness-evidence.test.mjs",
  incidentReadinessRequest: "docs/launch/generated/incident-readiness-evidence-request-20260812.json",
  goApprovalMatrixEvidenceAuthority: "scripts/check-go-approval-matrix-evidence-authority.mjs",
  goApprovalMatrixVerifier: "scripts/verify-go-approval-matrix-evidence.mjs",
  goApprovalMatrixVerifierTest: "scripts/go-approval-matrix-evidence.test.mjs",
  goApprovalMatrixRequest: "docs/launch/generated/go-approval-matrix-evidence-request-20260812.json",
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
  "Status:** NO-GO",
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
  "must contain only HTTPS URLs",
  "npm run launch:packet -- --manifest",
  "--full-suite-run-url",
  "--api-security-run-url",
  "--sensitive-mutation-run-url",
  "--operational-recovery-run-url",
  "--container-supply-chain-run-url",
  "Non-negotiable No-Go rules",
  "Completion percentage rule",
  "This checklist does not increase the completion percentage by itself",
]) {
  requireText("checklist", invariant, `launch decision checklist is missing invariant: ${invariant}`);
}

for (const forbidden of [
  "Status:** GO",
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
  "Incident readiness evidence authority",
  "launch:incident-readiness-evidence:check",
  "ops:incident-readiness:evidence:verify",
  "test:incident-readiness-evidence",
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
  "scripts/check-incident-readiness-evidence-authority.mjs",
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
  "accepted-risk-signoff-evidence",
  "tecpey-accepted-risk-owner-signoff-v1",
  "controlled-soft-launch-accepted-risk-owner-signoff",
  "NO_GO_NOG_08_OWNER_APPROVAL_REQUIRED",
  "prepared_owner_approval_required",
  "NOG-08",
  "NOG-08 is not accepted by this artifact because externally attributable owner sign-off evidence is still missing",
  "scripts/verify-accepted-risk-signoff-evidence.mjs",
  "riskOwnerSignoffs",
  "accepted-risk owner sign-off",
  "Real-money Exchange, custody, deposits, withdrawals, public rewards, enterprise and white-label activation remain NO-GO",
]) {
  requireText("acceptedRiskEvidence", invariant, `accepted-risk evidence is missing invariant: ${invariant}`);
}

for (const invariant of [
  "Accepted-risk signoff evidence authority",
  "prepared_owner_approval_required",
  "requiredOwnerApprovalEvidence",
  "requiredArtifact",
  "scripts/verify-accepted-risk-signoff-evidence.mjs",
  "scripts/accepted-risk-signoff-evidence.test.mjs",
  "currentEvidenceUrl",
  "evidence must not contain secrets, connection strings or host identifiers",
  "evaluateAcceptedRiskRegisterAuthority",
  "NOG-08",
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
  "rejects stale candidate SHA",
  "rejects stale review date",
  "rejects rejected owner signoff",
  "rejects operator self-approval",
]) {
  requireText("acceptedRiskVerifierTest", invariant, `accepted-risk verifier tests are missing invariant: ${invariant}`);
}

for (const invariant of [
  "go-approval-matrix-evidence-request",
  "NO_GO_NOG_09_GO_APPROVAL_MATRIX_REQUIRED",
  "blocked_pending_final_go_approval_matrix",
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
  "NOG-09 is not accepted by this request",
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
  "blocked_pending_final_go_approval_matrix",
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
  "manifest release candidate SHA must match the checked-out release candidate HEAD",
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
  "attached_for_release_owner_acceptance",
  "protectedStaging",
  "recoveryReconciliation",
  "rollbackOrForwardFix",
  "incidentReadiness",
  "acceptedRisks",
  "approvals",
  "goApprovalsArtifactDigest",
  "real-money Exchange remains NO-GO",
  "packet must not contain raw secrets",
]) {
  requireText("releasePacket", invariant, `release packet generator is missing invariant: ${invariant}`);
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
  "controlled launch evidence manifest validates the complete final packet input set",
  "controlled launch evidence manifest rejects unknown fields",
  "controlled launch evidence manifest rejects non-https evidence URLs",
  "controlled launch evidence manifest rejects workflow URLs outside governed GitHub Actions",
  "controlled launch evidence manifest rejects raw secrets and connection strings",
  "controlled launch evidence manifest rejects a release candidate SHA mismatch",
  "release packet generator accepts a complete governed manifest",
]) {
  requireText("evidenceManifestTest", invariant, `controlled launch evidence manifest tests are missing invariant: ${invariant}`);
}

for (const invariant of [
  "final launch packet fails closed without required release evidence",
  "final launch packet rejects dirty worktrees even when allow-dirty is supplied",
  "final launch packet fails closed without external operational evidence",
  "final launch packet rejects unmerged release candidates",
  "launch packet rejects unknown options",
  "launch packet rejects workflow URLs outside governed GitHub Actions",
  "draft launch packet can scaffold incomplete evidence explicitly",
  "final launch packet emits only after all release evidence is complete",
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
  "Controlled launch decision authority passed: the Go/No-Go checklist remains NO-GO by default, linked from public docs, wired into release gates and aligned with staging, recovery, custody, exchange and compliance boundaries.",
);
