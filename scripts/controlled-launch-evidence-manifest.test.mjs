import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateControlledLaunchEvidenceManifest } from "./controlled-launch-evidence-manifest.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const deploymentDigest = `sha256:${"b".repeat(64)}`;
const externalDigest = `sha256:${"c".repeat(64)}`;
const runUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/123456789";
const recoveryUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/223456789";
const rollbackUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/323456789";
const incidentUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/423456789";
const acceptedRiskUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/523456789";
const approvalsUrl = "https://github.com/tecpey/Tecpey-Os/actions/runs/623456789";

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function gitIn(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function completeManifest(overrides = {}, releaseCandidateSha = currentHead()) {
  return {
    schemaVersion: 1,
    evidenceClass: "controlled-soft-launch-final-evidence-manifest",
    releaseCandidate: {
      sha: releaseCandidateSha,
    },
    artifactIdentity: {
      imageDigest: digest,
      deploymentArtifactDigest: deploymentDigest,
    },
    workflowEvidence: {
      ciRunUrl: runUrl,
      repositoryAuditRunUrl: runUrl,
      publicGoldenPathRunUrl: runUrl,
      secretScanningRunUrl: runUrl,
    },
    requiredExternalEvidence: {
      protectedStaging: {
        evidenceUrl: runUrl,
        artifactDigest: externalDigest,
      },
      recoveryReconciliation: {
        evidenceUrl: recoveryUrl,
        artifactDigest: externalDigest,
      },
      rollbackOrForwardFix: {
        evidenceUrl: rollbackUrl,
        artifactDigest: externalDigest,
      },
      incidentReadiness: {
        evidenceUrl: incidentUrl,
        artifactDigest: externalDigest,
      },
      acceptedRisks: {
        evidenceUrl: acceptedRiskUrl,
      },
      approvals: {
        evidenceUrl: approvalsUrl,
      },
    },
    ...overrides,
  };
}

function writeManifest(manifest) {
  const root = mkdtempSync(path.join(os.tmpdir(), "tecpey-launch-evidence-manifest-"));
  const file = path.join(root, "manifest.json");
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, file };
}

function createPacketFixtureRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), "tecpey-launch-manifest-packet-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  cpSync(
    "scripts/generate-controlled-launch-release-packet.mjs",
    path.join(root, "scripts/generate-controlled-launch-release-packet.mjs"),
  );
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
  const headSha = gitIn(root, ["rev-parse", "HEAD"]);
  gitIn(root, ["update-ref", "refs/remotes/origin/main", headSha]);

  return { root, headSha };
}

test("controlled launch evidence manifest validates the complete final packet input set", () => {
  const manifest = validateControlledLaunchEvidenceManifest(completeManifest(), {
    expectedHeadSha: currentHead(),
  });

  assert.equal(manifest.artifactIdentity.imageDigest, digest);
  assert.equal(manifest.requiredExternalEvidence.rollbackOrForwardFix.evidenceUrl, rollbackUrl);
});

test("controlled launch evidence manifest rejects unknown fields", () => {
  assert.throws(
    () => validateControlledLaunchEvidenceManifest(completeManifest({ rawLogs: "not governed" })),
    /rawLogs is not a governed evidence manifest field/,
  );
});

test("controlled launch evidence manifest rejects non-https evidence URLs", () => {
  const manifest = completeManifest({
    workflowEvidence: {
      ...completeManifest().workflowEvidence,
      ciRunUrl: "http://example.invalid/actions/runs/1",
    },
  });

  assert.throws(
    () => validateControlledLaunchEvidenceManifest(manifest),
    /manifest.workflowEvidence.ciRunUrl must be an absolute https URL/,
  );
});

test("controlled launch evidence manifest rejects raw secrets and connection strings", () => {
  const manifest = completeManifest({
    requiredExternalEvidence: {
      ...completeManifest().requiredExternalEvidence,
      approvals: {
        evidenceUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/623456789?DATABASE_URL=postgres://ci:ci@localhost/db",
      },
    },
  });

  assert.throws(
    () => validateControlledLaunchEvidenceManifest(manifest),
    /must contain only URLs, digests and release identifiers/,
  );
});

test("controlled launch evidence manifest rejects a release candidate SHA mismatch", () => {
  assert.throws(
    () =>
      validateControlledLaunchEvidenceManifest(completeManifest(), {
        expectedHeadSha: "d".repeat(40),
      }),
    /must match the checked-out release candidate HEAD/,
  );
});

test("release packet generator accepts a complete governed manifest", () => {
  const fixture = createPacketFixtureRepo();
  const manifest = writeManifest(completeManifest({}, fixture.headSha));
  try {
    const result = spawnSync(process.execPath, [
      "scripts/generate-controlled-launch-release-packet.mjs",
      "--manifest",
      manifest.file,
    ], {
      cwd: fixture.root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });

    assert.equal(result.status, 0, result.stderr);
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.packetMode, "final_evidence_required");
    assert.equal(packet.artifactIdentity.imageDigest, digest);
    assert.equal(packet.workflowEvidence.ciRunUrl, runUrl);
    assert.equal(packet.requiredExternalEvidence.approvals.evidenceUrl, approvalsUrl);
  } finally {
    rmSync(manifest.root, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
