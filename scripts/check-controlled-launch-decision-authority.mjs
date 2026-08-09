import { readFile } from "node:fs/promises";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";

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
  acceptedRiskAuthority: "scripts/accepted-risk-register-authority-policy.mjs",
  workflow: ".github/workflows/ci.yml",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
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

for (const invariant of [
  "Incident Readiness Contract",
  "09:00-23:00 Asia/Tehran",
  "15 minutes during support hours",
  "60 minutes outside support hours",
  "4 hours",
  "protected staging synthetic critical alert delivery succeeds twice",
  "pending alert count is zero",
  "quarantine count is zero",
  "launch decision remains NO-GO",
  "No README, landing page, in-app copy, investor update or release note may imply 24/7 production support",
]) {
  requireText("incidentReadiness", invariant, `incident readiness contract is missing invariant: ${invariant}`);
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
  '"test:launch-packet"',
  '"launch:decision:check"',
  "scripts/generate-controlled-launch-release-packet.mjs",
  "scripts/controlled-launch-release-packet.test.mjs",
  "scripts/controlled-launch-evidence-manifest.mjs",
  "scripts/controlled-launch-evidence-manifest.test.mjs",
  "scripts/check-controlled-launch-decision-authority.mjs",
  "npm run launch:decision:check",
  '"test:launch-evidence-manifest"',
]) {
  requireText("packageJson", invariant, `package.json is missing launch decision guard wiring: ${invariant}`);
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
  "is required for a final release packet",
  "requires a clean worktree for final packets",
  "Re-run with --draft --allow-dirty only for local incomplete packet scaffolding",
  "imageDigest",
  "deploymentArtifactDigest",
  "migrationPlanSha256",
  "ciRunUrl",
  "repositoryAuditRunUrl",
  "publicGoldenPathRunUrl",
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
  "attached_for_release_owner_acceptance",
  "protectedStaging",
  "recoveryReconciliation",
  "rollbackOrForwardFix",
  "incidentReadiness",
  "acceptedRisks",
  "approvals",
  "real-money Exchange remains NO-GO",
  "packet must not contain raw secrets",
]) {
  requireText("releasePacket", invariant, `release packet generator is missing invariant: ${invariant}`);
}

for (const invariant of [
  "REQUIRED_CONTROLLED_LAUNCH_RISKS",
  "R-06",
  "evaluateAcceptedRiskRegisterAuthority",
  "hasValidIsoReviewDate",
  "splitMarkdownTableRow",
  "duplicate",
  "controlled-launch closure matrix is missing",
  "threshold must be measurable",
  "review date must be exact",
]) {
  requireText("acceptedRiskAuthority", invariant, `accepted-risk authority policy is missing invariant: ${invariant}`);
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
  "must be a sha256 digest",
]) {
  requireText("evidenceManifest", invariant, `controlled launch evidence manifest validator is missing invariant: ${invariant}`);
}

for (const invariant of [
  "controlled launch evidence manifest validates the complete final packet input set",
  "controlled launch evidence manifest rejects unknown fields",
  "controlled launch evidence manifest rejects non-https evidence URLs",
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
  "launch packet rejects unknown options",
  "draft launch packet can scaffold incomplete evidence explicitly",
  "final launch packet emits only after all release evidence is complete",
  "rollbackOrForwardFix.evidenceUrl",
  "incidentReadiness.artifactDigest",
  "acceptedRisks.evidenceUrl",
  "accepted-risk register authority accepts the controlled-launch closure matrix",
  "accepted-risk register authority rejects a missing controlled-launch risk row",
  "accepted-risk register authority rejects placeholder thresholds in closure rows",
  "accepted-risk register authority rejects phase-only review dates",
  "accepted-risk register authority rejects event-only review dates",
  "accepted-risk register authority rejects impossible calendar review dates",
  "accepted-risk register authority rejects duplicate controlled-launch risk rows",
  "accepted-risk register authority accepts escaped and inline-code pipes in closure rows",
  "accepted-risk register authority accepts multi-backtick code spans with pipes in closure rows",
]) {
  requireText("releasePacketTest", invariant, `release packet tests are missing invariant: ${invariant}`);
}

for (const invariant of [
  "Controlled launch decision authority guard",
  "npm run launch:decision:check",
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
