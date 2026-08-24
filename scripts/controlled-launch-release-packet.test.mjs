import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { evaluateAcceptedRiskRegisterAuthority } from "./accepted-risk-register-authority-policy.mjs";
import {
  DISABLED_CAPABILITY_ATTESTATION,
  FINAL_MANIFEST_PATH,
  PRIVACY_BOUNDARY,
} from "./controlled-launch-final-authority.mjs";

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
const fullSuiteDiagnosticsWorkflow = ".github/workflows/full-suite-diagnostics.yml";

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
    "--full-suite-run-url",
    runUrl,
    "--api-security-run-url",
    runUrl,
    "--sensitive-mutation-run-url",
    runUrl,
    "--repository-audit-run-url",
    runUrl,
    "--public-golden-path-run-url",
    runUrl,
    "--operational-recovery-run-url",
    runUrl,
    "--container-supply-chain-run-url",
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
    "--go-approvals-artifact-digest",
    externalDigest,
  ];
}

function yamlBlock(source, indent, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linePrefix = " ".repeat(indent);
  const childPrefix = " ".repeat(indent + 2);
  const match = source.match(
    new RegExp(
      `(?:^|\\n)${linePrefix}${escapedKey}:[^\\S\\n]*(?:\\n(?<body>(?:${childPrefix}.*(?:\\n|$))*))?`,
    ),
  );

  return match?.groups?.body ?? "";
}

function yamlHasTrigger(workflow, trigger) {
  return new RegExp(`(?:^|\\n)  ${trigger}:`).test(yamlBlock(workflow, 0, "on"));
}

function yamlTriggerBlock(workflow, trigger) {
  return yamlBlock(yamlBlock(workflow, 0, "on"), 2, trigger);
}

function yamlTriggerTargetsMain(workflow, trigger) {
  const triggerBlock = yamlTriggerBlock(workflow, trigger);

  return (
    /branches:\s*\[[^\]]*\bmain\b[^\]]*\]/.test(triggerBlock) ||
    /branches:\s*\n(?: {6,}.*\n)* {6,}-\s*main\b/.test(triggerBlock)
  );
}

function gitIn(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function createCleanRepositoryClone() {
  const parent = mkdtempSync(path.join(os.tmpdir(), "tecpey-launch-packet-fixture-"));
  const root = path.join(parent, "repo");
  const clone = spawnSync("git", ["clone", "--quiet", "--no-hardlinks", process.cwd(), root], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(clone.status, 0, clone.stderr || clone.stdout);
  gitIn(root, ["update-ref", "refs/remotes/origin/main", gitIn(process.cwd(), ["rev-parse", "origin/main"])]);
  return { parent, root };
}

function commitAll(root, message) {
  gitIn(root, ["add", "."]);
  gitIn(root, [
    "-c",
    "user.name=TecPey Test",
    "-c",
    "user.email=tecpey-test@example.invalid",
    "commit",
    "-m",
    message,
  ]);
}

function readJson(root, file) {
  return JSON.parse(readFileSync(path.join(root, file), "utf8"));
}

function writeJson(root, file, value) {
  writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

test("final launch packet fails closed without required release evidence", () => {
  const result = runPacket([]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final GO packet generation requires --manifest with governed authority verification/);
});

test("launch packet rejects unknown options instead of silently omitting evidence", () => {
  const result = runPacket(["--image-digset", digest]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown launch packet option: --image-digset/);
});

test("launch packet rejects workflow URLs outside governed GitHub Actions", () => {
  const result = runPacket([
    "--draft",
    "--allow-dirty",
    "--ci-run-url",
    "https://example.invalid/tecpey/Tecpey-Os/actions/runs/123456789",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CI run URL must be an absolute https GitHub Actions run URL for tecpey\/Tecpey-Os/);
});

test("draft launch packet can scaffold incomplete evidence explicitly", () => {
  const result = runPacket(["--draft", "--allow-dirty"]);

  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.packetMode, "draft_incomplete_evidence_allowed");
  assert.equal(packet.decision, "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE");
  assert.equal(packet.artifactIdentity.imageDigest, null);
  assert.equal(packet.workflowEvidence.ciRunUrl, null);
  assert.equal(packet.workflowEvidence.fullSuiteRunUrl, null);
  assert.equal(packet.workflowEvidence.apiSecurityRunUrl, null);
  assert.equal(packet.workflowEvidence.sensitiveMutationRunUrl, null);
  assert.equal(packet.workflowEvidence.operationalRecoveryRunUrl, null);
  assert.equal(packet.workflowEvidence.containerSupplyChainRunUrl, null);
  assert.equal(packet.requiredExternalEvidence.protectedStaging.evidenceUrl, null);
});

test("direct evidence flags cannot emit a final GO packet", () => {
  const result = runPacket(completeFinalPacketArgs());

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final GO packet generation requires --manifest with governed authority verification/);
});

test("final launch packet rejects evidence overrides even with the governed manifest", () => {
  const fixture = createCleanRepositoryClone();
  try {
    const result = runPacketIn(fixture.root, [
      "--manifest",
      FINAL_MANIFEST_PATH,
      "--image-digest",
      digest,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /evidence overrides are draft-only: image-digest/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("final launch packet rejects dirty worktrees in governed final mode", () => {
  const fixture = createCleanRepositoryClone();
  try {
    writeFileSync(path.join(fixture.root, ".launch-packet-dirty-test"), "dirty final packet guard\n");
    const result = runPacketIn(fixture.root, ["--manifest", FINAL_MANIFEST_PATH]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires a clean worktree for final packets/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("final launch packet fails closed without external operational evidence", () => {
  const fixture = createCleanRepositoryClone();
  try {
    const manifest = readJson(fixture.root, FINAL_MANIFEST_PATH);
    delete manifest.requiredExternalEvidence.disabledCapabilities;
    writeJson(fixture.root, FINAL_MANIFEST_PATH, manifest);
    commitAll(fixture.root, "test missing external evidence");
    const result = runPacketIn(fixture.root, ["--manifest", FINAL_MANIFEST_PATH]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest.requiredExternalEvidence.disabledCapabilities must be an object/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("final launch packet rejects unmerged release candidates", () => {
  const fixture = createCleanRepositoryClone();
  try {
    writeFileSync(path.join(fixture.root, "unmerged-release-candidate.txt"), "local-only candidate\n");
    commitAll(fixture.root, "local-only release candidate");
    const unmergedCandidate = gitIn(fixture.root, ["rev-parse", "HEAD"]);
    const manifest = readJson(fixture.root, FINAL_MANIFEST_PATH);
    manifest.releaseCandidate.sha = unmergedCandidate;
    writeJson(fixture.root, FINAL_MANIFEST_PATH, manifest);
    commitAll(fixture.root, "select local-only candidate");
    const result = runPacketIn(fixture.root, ["--manifest", FINAL_MANIFEST_PATH]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires the release candidate SHA to be contained in origin\/main/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("final launch packet emits only after all release evidence is complete", () => {
  const fixture = createCleanRepositoryClone();
  try {
    const result = runPacketIn(fixture.root, ["--manifest", FINAL_MANIFEST_PATH]);

    assert.equal(result.status, 0, result.stderr);
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.packetMode, "final_evidence_required");
    assert.equal(packet.decision, "GO_APPROVED_FOR_CONTROLLED_SOFT_LAUNCH_ONLY");
    assert.equal(packet.releaseCandidate.sha, "79c48a16cb685a88315a44e103b3758cf7845d65");
    assert.equal(packet.releaseCandidate.branch, "main");
    assert.equal(packet.artifactIdentity.packageLockSha256, "c3fc6345c8916840a2b3dede5c3ca5b7c047e369b92ecf59b10f1b4dfb20fe0b");
    assert.equal(packet.artifactIdentity.migrationPlanSha256, "69f784cef674c98a2df4548d335480877db80995c567ec9a9ec69ead2b46f727");
    assert.match(packet.requiredExternalEvidence.rollbackOrForwardFix.evidenceUrl, /^https:\/\//);
    assert.match(packet.requiredExternalEvidence.incidentReadiness.artifactDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(packet.requiredExternalEvidence.acceptedRisks.evidenceUrl, /^https:\/\//);
    assert.match(packet.requiredExternalEvidence.approvals.artifactDigest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(packet.disabledCapabilityAttestation, DISABLED_CAPABILITY_ATTESTATION);
    assert.deepEqual(packet.privacyBoundary, PRIVACY_BOUNDARY);
    for (const evidence of Object.values(packet.requiredExternalEvidence)) {
      assert.equal(evidence.status, "authority_verified");
    }
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("final packet records the independent release-control revision", () => {
  const fixture = createCleanRepositoryClone();
  try {
    const result = runPacketIn(fixture.root, ["--manifest", FINAL_MANIFEST_PATH]);
    assert.equal(result.status, 0, result.stderr);
    const packet = JSON.parse(result.stdout);

    assert.equal(packet.releaseControl.sourceRevision, gitIn(fixture.root, ["rev-parse", "HEAD"]));
    assert.equal(packet.releaseControl.manifest.path, FINAL_MANIFEST_PATH);
    assert.match(packet.releaseControl.generator.sourceDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(packet.releaseControl.verifier.sourceDigest, /^sha256:[a-f0-9]{64}$/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("final packet reproduces byte-for-byte from its recorded source revision", () => {
  const fixture = createCleanRepositoryClone();
  try {
    const packetPath = "docs/launch/generated/controlled-soft-launch-final-release-packet-20260824.json";
    const expectedPacketSource = readFileSync(path.join(fixture.root, packetPath), "utf8");
    const sourceRevision = JSON.parse(expectedPacketSource).releaseControl.sourceRevision;
    gitIn(fixture.root, ["checkout", "--detach", sourceRevision]);
    const result = runPacketIn(fixture.root, ["--manifest", FINAL_MANIFEST_PATH]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expectedPacketSource);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("final packet authority rejects invented workflow conclusions", () => {
  const fixture = createCleanRepositoryClone();
  try {
    const evidencePath = "docs/launch/generated/exact-head-workflow-evidence-20260812.json";
    const evidence = readJson(fixture.root, evidencePath);
    evidence.workflowRuns[0].conclusion = "failure";
    writeJson(fixture.root, evidencePath, evidence);
    commitAll(fixture.root, "tamper workflow conclusion");
    const result = runPacketIn(fixture.root, ["--manifest", FINAL_MANIFEST_PATH]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /workflow evidence ciRunUrl conclusion expected "success", got "failure"/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("decision authority rejects same-length disabled capability substitutions", () => {
  const fixture = createCleanRepositoryClone();
  try {
    const packetPath = "docs/launch/generated/controlled-soft-launch-final-release-packet-20260824.json";
    const packet = readJson(fixture.root, packetPath);
    packet.disabledCapabilityAttestation[0] = "real-money Exchange is enabled for production";
    writeJson(fixture.root, packetPath, packet);
    const result = spawnSync(process.execPath, ["scripts/check-controlled-launch-decision-authority.mjs"], {
      cwd: fixture.root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /final packet disabled capability attestations/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
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

// These negative cases inject a malformed R-06/R-07 review date. They match the
// current review date by pattern rather than a literal, so they stay correct as
// the register's review dates are bumped for freshness.
test("accepted-risk register authority rejects phase-only review dates", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    /\d{4}-\d{2}-\d{2}, then weekly \| Disable certificate issuance/,
    "Phase 43 | Disable certificate issuance",
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /R-06 review date must be exact/,
  );
});

test("accepted-risk register authority rejects event-only review dates", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    /\d{4}-\d{2}-\d{2} before any Exchange re-scope \| Disable the activating flag/,
    "Before any Exchange re-scope | Disable the activating flag",
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /R-07 review date must be exact/,
  );
});

test("accepted-risk register authority rejects impossible calendar review dates", () => {
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    /\d{4}-\d{2}-\d{2}(, then weekly \| Disable certificate issuance)/,
    "2026-02-30$1",
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown).join("\n"),
    /R-06 review date must be exact/,
  );
});

test("accepted-risk register authority rejects stale review dates", () => {
  // Inject a definitely-stale review date so the case is independent of the
  // register's current (freshness-bumped) date.
  const markdown = readFileSync(acceptedRiskRegister, "utf8").replace(
    /\d{4}-\d{2}-\d{2}(, then weekly \| Disable certificate issuance)/,
    "2020-01-01$1",
  );

  assert.match(
    evaluateAcceptedRiskRegisterAuthority(markdown, { referenceDate: "2026-08-20T00:00:00.000Z" }).join("\n"),
    /R-06 review date 2020-01-01 is stale before 2026-08-20/,
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

test("Full Suite Diagnostics workflow produces exact-head main evidence for NOG-04", () => {
  const workflow = readFileSync(fullSuiteDiagnosticsWorkflow, "utf8");

  assert.match(workflow, /name: Full Suite Diagnostics/);
  assert.equal(yamlHasTrigger(workflow, "push"), true);
  assert.equal(yamlTriggerTargetsMain(workflow, "push"), true);
  assert.equal(yamlHasTrigger(workflow, "pull_request"), true);
  assert.equal(yamlTriggerTargetsMain(workflow, "pull_request"), true);
  assert.equal(yamlHasTrigger(workflow, "workflow_dispatch"), true);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /group: full-suite-diagnostics-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}/,
  );
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /run: test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40} # v4/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40} # v4/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40} # v4/);
});
