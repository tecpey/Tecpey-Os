import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";

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
const acceptedRiskRegister = "docs/LAUNCH_ACCEPTED_RISKS.md";

function runPacket(args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024,
  });
}

function runPacketIn(cwd, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

function completeFinalPacketArgs() {
  return [
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
  ];
}

function gitIn(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function createPacketFixtureRepo({ unmerged = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "tecpey-launch-packet-fixture-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  cpSync(script, path.join(root, script));
  cpSync(
    "scripts/controlled-launch-evidence-manifest.mjs",
    path.join(root, "scripts/controlled-launch-evidence-manifest.mjs"),
  );
  writeFileSync(path.join(root, "package-lock.json"), "{}\n");

  gitIn(root, ["init", "-b", "main"]);
  gitIn(root, ["add", "."]);
  gitIn(root, [
    "-c",
    "user.name=TecPey Test",
    "-c",
    "user.email=tecpey-test@example.invalid",
    "commit",
    "-m",
    "base release candidate",
  ]);
  const originMainSha = gitIn(root, ["rev-parse", "HEAD"]);
  gitIn(root, ["update-ref", "refs/remotes/origin/main", originMainSha]);

  if (unmerged) {
    writeFileSync(path.join(root, "unmerged-release-candidate.txt"), "local-only candidate\n");
    gitIn(root, ["add", "."]);
    gitIn(root, [
      "-c",
      "user.name=TecPey Test",
      "-c",
      "user.email=tecpey-test@example.invalid",
      "commit",
      "-m",
      "local-only release candidate",
    ]);
  }

  return root;
}

test("final launch packet fails closed without required release evidence", () => {
  const root = createPacketFixtureRepo();
  try {
    const result = runPacketIn(root, ["--allow-dirty"]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /image digest is required for a final release packet/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    const result = runPacket(completeFinalPacketArgs());

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires a clean worktree for final packets/);
  } finally {
    rmSync(dirtyFile, { force: true });
  }
});

test("final launch packet fails closed without external operational evidence", () => {
  const root = createPacketFixtureRepo();
  try {
    const result = runPacketIn(root, [
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("final launch packet rejects unmerged release candidates", () => {
  const root = createPacketFixtureRepo({ unmerged: true });
  try {
    const result = runPacketIn(root, completeFinalPacketArgs());

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires the release candidate SHA to be contained in origin\/main/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("final launch packet emits only after all release evidence is complete", () => {
  const root = createPacketFixtureRepo();
  try {
    const result = runPacketIn(root, completeFinalPacketArgs());

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
    assert.deepEqual(packet.disabledCapabilityAttestation, [
      "real-money Exchange remains NO-GO unless separately certified",
      "custody, deposits and withdrawals remain NO-GO unless separately certified",
      "public financial rewards remain NO-GO unless separately certified",
      "enterprise and white-label activation remain NO-GO unless separately certified",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepted-risk register authority accepts the controlled-launch closure matrix", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8");

  assert.deepEqual(evaluateAcceptedRiskRegisterAuthority(markdown), []);
});

test("accepted-risk register authority rejects a missing controlled-launch risk row", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(/\n\| R-06 \|[^\n]+/, "");

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /controlled-launch closure matrix is missing R-06/,
  );
});

test("accepted-risk register authority rejects placeholder thresholds in closure rows", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    /One suspected signing-secret compromise[^|]+/,
    "If N certificates fail or X users complain",
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /R-06 closure row contains placeholder text/,
  );
});

test("accepted-risk register authority rejects phase-only review dates", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    "2026-08-16, then weekly | Disable certificate issuance",
    "Phase 43 | Disable certificate issuance",
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /R-06 review date must be exact/,
  );
});

test("accepted-risk register authority rejects event-only review dates", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    "2026-08-16 before any Exchange re-scope | Disable the activating flag",
    "Before any Exchange re-scope | Disable the activating flag",
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /R-07 review date must be exact/,
  );
});

test("accepted-risk register authority rejects impossible calendar review dates", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    "2026-08-16, then weekly | Disable certificate issuance",
    "2026-02-30, then weekly | Disable certificate issuance",
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /R-06 review date must be exact/,
  );
});

test("accepted-risk register authority rejects duplicate controlled-launch risk rows", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    /\n\| R-06 \|[^\n]+/,
    (row) => `${row}${row}`,
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /duplicate R-06 rows/,
  );
});

test("accepted-risk register authority accepts escaped and inline-code pipes in closure rows", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    "controlled education certificates",
    "`controlled|education` certificates with operator \\| security wording",
  );

  assert.deepEqual(evaluateAcceptedRiskRegisterAuthority(markdown), []);
});

test("accepted-risk register authority accepts multi-backtick code spans with pipes in closure rows", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    "controlled education certificates",
    "``controlled `education|certificate` drill`` certificates",
  );

  assert.deepEqual(evaluateAcceptedRiskRegisterAuthority(markdown), []);
});
