import { readFile } from "node:fs/promises";

const files = {
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  digest: "docs/launch/CONTROLLED_LAUNCH_EVIDENCE_DIGEST_20260808.md",
  baseline: "docs/launch/TECPEY_COMPLETION_BASELINE_20260719.md",
  productionPlan: "docs/PRODUCTION_HARDENING_MASTER_PLAN.md",
  finalGate: "docs/FINAL_IMPLEMENTATION_GATE.md",
  acceptedRisks: "docs/LAUNCH_ACCEPTED_RISKS.md",
  readme: "README.md",
  readmeFa: "README.fa.md",
  packageJson: "package.json",
  releasePacket: "scripts/generate-controlled-launch-release-packet.mjs",
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
  "Required decision record",
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
  "Controlled Launch Reconciliation Addendum — 2026-08-08",
  "Required accepted-risk closure before a Go decision",
  "Current unresolved placeholders",
  "replace every placeholder with exact signed values",
  "keep the related capability explicitly NO-GO and product-disabled",
]) {
  requireText("acceptedRisks", invariant, `accepted-risk registry is missing controlled launch reconciliation: ${invariant}`);
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
  '"launch:decision:check"',
  "scripts/generate-controlled-launch-release-packet.mjs",
  "scripts/check-controlled-launch-decision-authority.mjs",
  "npm run launch:decision:check",
]) {
  requireText("packageJson", invariant, `package.json is missing launch decision guard wiring: ${invariant}`);
}

for (const invariant of [
  "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE",
  "imageDigest",
  "deploymentArtifactDigest",
  "migrationPlanSha256",
  "protectedStaging",
  "recoveryReconciliation",
  "rollbackOrForwardFix",
  "acceptedRisks",
  "real-money Exchange remains NO-GO",
  "packet must not contain raw secrets",
]) {
  requireText("releasePacket", invariant, `release packet generator is missing invariant: ${invariant}`);
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
