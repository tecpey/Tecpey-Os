import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { test } from "node:test";

const script = "scripts/generate-controlled-launch-release-packet.mjs";
const digest = `sha256:${"a".repeat(64)}`;
const deploymentDigest = `sha256:${"b".repeat(64)}`;
const externalDigest = `sha256:${"c".repeat(64)}`;
const runUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/123456789";
const recoveryUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/223456789";
const rollbackUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/323456789";
const incidentUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/423456789";
const acceptedRiskUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/523456789";
const approvalsUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/623456789";

function runPacket(args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024,
  });
}

function isWorktreeClean() {
  const result = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim().length === 0;
}

test("final launch packet fails closed without required release evidence", (t) => {
  if (!isWorktreeClean()) {
    t.skip("final packet evidence validation requires a clean release-candidate worktree");
    return;
  }

  const result = runPacket(["--allow-dirty"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /image digest is required for a final release packet/);
});

test("launch packet rejects unknown options instead of silently omitting evidence", () => {
  const result = runPacket(["--image-digset", digest]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown launch packet option: --image-digset/);
});

test("draft launch packet can scaffold incomplete evidence explicitly", () => {
  const result = runPacket(["--draft", "--allow-dirty"]);

  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.packetMode, "draft_incomplete_evidence_allowed");
  assert.equal(packet.artifactIdentity.imageDigest, null);
  assert.equal(packet.workflowEvidence.ciRunUrl, null);
  assert.equal(packet.requiredExternalEvidence.protectedStaging.evidenceUrl, null);
});

test("final launch packet rejects dirty worktrees even when allow-dirty is supplied", () => {
  const dirtyFile = ".launch-packet-dirty-test";
  writeFileSync(dirtyFile, "dirty final packet guard\n");

  try {
    const result = runPacket([
      "--allow-dirty",
      "--image-digest",
      digest,
      "--deployment-artifact-digest",
      deploymentDigest,
      "--ci-run-url",
      runUrl,
      "--repository-audit-run-url",
      runUrl,
      "--public-golden-path-run-url",
      runUrl,
      "--secret-scanning-run-url",
      runUrl,
      "--protected-staging-evidence-url",
      runUrl,
      "--protected-staging-artifact-digest",
      externalDigest,
      "--recovery-reconciliation-evidence-url",
      recoveryUrl,
      "--recovery-reconciliation-artifact-digest",
      externalDigest,
      "--rollback-evidence-url",
      rollbackUrl,
      "--rollback-artifact-digest",
      externalDigest,
      "--incident-readiness-evidence-url",
      incidentUrl,
      "--incident-readiness-artifact-digest",
      externalDigest,
      "--accepted-risk-signoff-url",
      acceptedRiskUrl,
      "--go-approvals-url",
      approvalsUrl,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires a clean worktree for final packets/);
  } finally {
    rmSync(dirtyFile, { force: true });
  }
});

test("final launch packet fails closed without external operational evidence", (t) => {
  if (!isWorktreeClean()) {
    t.skip("final packet evidence validation requires a clean release-candidate worktree");
    return;
  }

  const result = runPacket([
    "--allow-dirty",
    "--image-digest",
    digest,
    "--deployment-artifact-digest",
    deploymentDigest,
    "--ci-run-url",
    runUrl,
    "--repository-audit-run-url",
    runUrl,
    "--public-golden-path-run-url",
    runUrl,
    "--secret-scanning-run-url",
    runUrl,
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /protected staging evidence URL is required for a final release packet/);
});

test("final launch packet emits only after all release evidence is complete", (t) => {
  if (!isWorktreeClean()) {
    t.skip("final packet success requires a clean release-candidate worktree");
    return;
  }

  const result = runPacket([
    "--allow-dirty",
    "--image-digest",
    digest,
    "--deployment-artifact-digest",
    deploymentDigest,
    "--ci-run-url",
    runUrl,
    "--repository-audit-run-url",
    runUrl,
    "--public-golden-path-run-url",
    runUrl,
    "--secret-scanning-run-url",
    runUrl,
    "--protected-staging-evidence-url",
    runUrl,
    "--protected-staging-artifact-digest",
    externalDigest,
    "--recovery-reconciliation-evidence-url",
    recoveryUrl,
    "--recovery-reconciliation-artifact-digest",
    externalDigest,
    "--rollback-evidence-url",
    rollbackUrl,
    "--rollback-artifact-digest",
    externalDigest,
    "--incident-readiness-evidence-url",
    incidentUrl,
    "--incident-readiness-artifact-digest",
    externalDigest,
    "--accepted-risk-signoff-url",
    acceptedRiskUrl,
    "--go-approvals-url",
    approvalsUrl,
  ]);

  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.packetMode, "final_evidence_required");
  assert.equal(packet.artifactIdentity.imageDigest, digest);
  assert.equal(packet.artifactIdentity.deploymentArtifactDigest, deploymentDigest);
  assert.equal(packet.workflowEvidence.ciRunUrl, runUrl);
  assert.equal(packet.workflowEvidence.publicGoldenPathRunUrl, runUrl);
  assert.equal(packet.requiredExternalEvidence.protectedStaging.evidenceUrl, runUrl);
  assert.equal(packet.requiredExternalEvidence.protectedStaging.artifactDigest, externalDigest);
  assert.equal(packet.requiredExternalEvidence.recoveryReconciliation.status, "attached_for_release_owner_acceptance");
  assert.equal(packet.requiredExternalEvidence.recoveryReconciliation.evidenceUrl, recoveryUrl);
  assert.equal(packet.requiredExternalEvidence.recoveryReconciliation.artifactDigest, externalDigest);
  assert.equal(packet.requiredExternalEvidence.rollbackOrForwardFix.evidenceUrl, rollbackUrl);
  assert.equal(packet.requiredExternalEvidence.rollbackOrForwardFix.artifactDigest, externalDigest);
  assert.equal(packet.requiredExternalEvidence.incidentReadiness.evidenceUrl, incidentUrl);
  assert.equal(packet.requiredExternalEvidence.incidentReadiness.artifactDigest, externalDigest);
  assert.equal(packet.requiredExternalEvidence.acceptedRisks.evidenceUrl, acceptedRiskUrl);
  assert.equal(packet.requiredExternalEvidence.approvals.evidenceUrl, approvalsUrl);
});
