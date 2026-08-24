import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { validateControlledLaunchEvidenceManifest } from "./controlled-launch-evidence-manifest.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const deploymentDigest = `sha256:${"b".repeat(64)}`;
const externalDigest = `sha256:${"c".repeat(64)}`;
const runUrls = Object.freeze({
  ciRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456789",
  fullSuiteRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456790",
  apiSecurityRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456791",
  sensitiveMutationRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456792",
  repositoryAuditRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456793",
  publicGoldenPathRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456794",
  operationalRecoveryRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456795",
  containerSupplyChainRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456796",
  secretScanningRunUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/123456797",
});

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function completeManifest(overrides = {}) {
  return {
    schemaVersion: 2,
    evidenceClass: "controlled-soft-launch-final-evidence-manifest",
    generatedAt: "2026-08-24T09:02:22.198Z",
    authorityVerification: {
      authority: "tecpey-controlled-soft-launch-final-authority-v1",
      status: "verified",
      generator: {
        path: "scripts/generate-controlled-launch-release-packet.mjs",
        sourceDigest: digest,
      },
      verifier: {
        path: "scripts/controlled-launch-final-authority.mjs",
        sourceDigest: digest,
      },
    },
    releaseCandidate: {
      sha: currentHead(),
      sourceBranch: "main",
    },
    artifactIdentity: {
      imageDigest: digest,
      deploymentArtifactDigest: deploymentDigest,
    },
    workflowEvidence: { ...runUrls },
    requiredExternalEvidence: {
      protectedStaging: {
        evidenceUrl: `https://github.com/tecpey/Tecpey-Os/blob/${"1".repeat(40)}/protected.json`,
        artifactDigest: externalDigest,
      },
      recoveryReconciliation: {
        evidenceUrl: `https://github.com/tecpey/Tecpey-Os/blob/${"2".repeat(40)}/recovery.json`,
        artifactDigest: externalDigest,
      },
      rollbackOrForwardFix: {
        evidenceUrl: `https://github.com/tecpey/Tecpey-Os/blob/${"3".repeat(40)}/rollback.json`,
        artifactDigest: externalDigest,
      },
      incidentReadiness: {
        evidenceUrl: `https://github.com/tecpey/Tecpey-Os/blob/${"4".repeat(40)}/incident.json`,
        artifactDigest: externalDigest,
      },
      acceptedRisks: {
        evidenceUrl: `https://github.com/tecpey/Tecpey-Os/blob/${"5".repeat(40)}/risks.json`,
        artifactDigest: externalDigest,
      },
      approvals: {
        evidenceUrl: `https://github.com/tecpey/Tecpey-Os/blob/${"6".repeat(40)}/approvals.json`,
        artifactDigest: externalDigest,
      },
      disabledCapabilities: {
        evidenceUrl: `https://github.com/tecpey/Tecpey-Os/blob/${"7".repeat(40)}/disabled.json`,
        artifactDigest: externalDigest,
      },
    },
    ...overrides,
  };
}

test("controlled launch evidence manifest validates the complete final packet input set", () => {
  const manifest = validateControlledLaunchEvidenceManifest(completeManifest(), {
    expectedHeadSha: currentHead(),
  });

  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.artifactIdentity.imageDigest, digest);
  assert.equal(manifest.requiredExternalEvidence.acceptedRisks.artifactDigest, externalDigest);
  assert.equal(manifest.requiredExternalEvidence.disabledCapabilities.artifactDigest, externalDigest);
});

test("controlled launch evidence manifest rejects unknown fields", () => {
  assert.throws(
    () => validateControlledLaunchEvidenceManifest(completeManifest({ rawLogs: "not governed" })),
    /rawLogs is not a governed evidence manifest field/,
  );
});

test("controlled launch evidence manifest rejects non-https evidence URLs", () => {
  const base = completeManifest();
  const manifest = completeManifest({
    requiredExternalEvidence: {
      ...base.requiredExternalEvidence,
      protectedStaging: {
        ...base.requiredExternalEvidence.protectedStaging,
        evidenceUrl: "http://example.invalid/actions/runs/1",
      },
    },
  });

  assert.throws(
    () => validateControlledLaunchEvidenceManifest(manifest),
    /manifest.requiredExternalEvidence.protectedStaging.evidenceUrl must be an absolute https URL/,
  );
});

test("controlled launch evidence manifest rejects workflow URLs outside governed GitHub Actions", () => {
  const manifest = completeManifest({
    workflowEvidence: {
      ...runUrls,
      ciRunUrl: "https://example.invalid/tecpey/Tecpey-Os/actions/runs/123456789",
    },
  });

  assert.throws(
    () => validateControlledLaunchEvidenceManifest(manifest),
    /manifest.workflowEvidence.ciRunUrl must be an absolute https GitHub Actions run URL for tecpey\/Tecpey-Os/,
  );
});

test("controlled launch evidence manifest rejects duplicated workflow run URLs", () => {
  const manifest = completeManifest({
    workflowEvidence: {
      ...runUrls,
      fullSuiteRunUrl: runUrls.ciRunUrl,
    },
  });

  assert.throws(
    () => validateControlledLaunchEvidenceManifest(manifest),
    /manifest.workflowEvidence.fullSuiteRunUrl must not reuse the same GitHub Actions run URL/,
  );
});

test("controlled launch evidence manifest rejects raw secrets and connection strings", () => {
  const base = completeManifest();
  const manifest = completeManifest({
    requiredExternalEvidence: {
      ...base.requiredExternalEvidence,
      approvals: {
        ...base.requiredExternalEvidence.approvals,
        evidenceUrl: "https://github.com/tecpey/Tecpey-Os/actions/runs/1?DATABASE_URL=postgres://ci:ci@localhost/db",
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
    () => validateControlledLaunchEvidenceManifest(completeManifest(), { expectedHeadSha: "d".repeat(40) }),
    /must match the checked-out release candidate HEAD/,
  );
});

test("controlled launch evidence manifest rejects missing authority verification", () => {
  const manifest = completeManifest();
  delete manifest.authorityVerification;

  assert.throws(
    () => validateControlledLaunchEvidenceManifest(manifest),
    /manifest.authorityVerification must be an object/,
  );
});

test("controlled launch evidence manifest rejects missing accepted-risk artifact digest", () => {
  const manifest = completeManifest();
  delete manifest.requiredExternalEvidence.acceptedRisks.artifactDigest;

  assert.throws(
    () => validateControlledLaunchEvidenceManifest(manifest),
    /manifest.requiredExternalEvidence.acceptedRisks.artifactDigest is required/,
  );
});

test("controlled launch evidence manifest rejects non-canonical timestamps", () => {
  assert.throws(
    () => validateControlledLaunchEvidenceManifest(completeManifest({ generatedAt: "August 24, 2026" })),
    /manifest.generatedAt must be an ISO-8601 timestamp/,
  );
});
