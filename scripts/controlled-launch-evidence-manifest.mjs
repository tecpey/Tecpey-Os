import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REQUIRED_MANIFEST_CLASS = "controlled-soft-launch-final-evidence-manifest";

const manifestShape = Object.freeze({
  schemaVersion: "number",
  evidenceClass: "string",
  generatedAt: "string",
  authorityVerification: {
    authority: "string",
    status: "string",
    generator: {
      path: "string",
      sourceDigest: "digest",
    },
    verifier: {
      path: "string",
      sourceDigest: "digest",
    },
  },
  releaseCandidate: {
    sha: "string",
    sourceBranch: "string",
  },
  artifactIdentity: {
    imageDigest: "digest",
    deploymentArtifactDigest: "digest",
  },
  workflowEvidence: {
    ciRunUrl: "workflowRunUrl",
    fullSuiteRunUrl: "workflowRunUrl",
    apiSecurityRunUrl: "workflowRunUrl",
    sensitiveMutationRunUrl: "workflowRunUrl",
    repositoryAuditRunUrl: "workflowRunUrl",
    publicGoldenPathRunUrl: "workflowRunUrl",
    operationalRecoveryRunUrl: "workflowRunUrl",
    containerSupplyChainRunUrl: "workflowRunUrl",
    secretScanningRunUrl: "workflowRunUrl",
  },
  requiredExternalEvidence: {
    protectedStaging: {
      evidenceUrl: "url",
      artifactDigest: "digest",
    },
    recoveryReconciliation: {
      evidenceUrl: "url",
      artifactDigest: "digest",
    },
    rollbackOrForwardFix: {
      evidenceUrl: "url",
      artifactDigest: "digest",
    },
    incidentReadiness: {
      evidenceUrl: "url",
      artifactDigest: "digest",
    },
    acceptedRisks: {
      evidenceUrl: "url",
      artifactDigest: "digest",
    },
    approvals: {
      evidenceUrl: "url",
      artifactDigest: "digest",
    },
    disabledCapabilities: {
      evidenceUrl: "url",
      artifactDigest: "digest",
    },
  },
});

const manifestFlagPaths = Object.freeze({
  "image-digest": ["artifactIdentity", "imageDigest"],
  "deployment-artifact-digest": ["artifactIdentity", "deploymentArtifactDigest"],
  "ci-run-url": ["workflowEvidence", "ciRunUrl"],
  "full-suite-run-url": ["workflowEvidence", "fullSuiteRunUrl"],
  "api-security-run-url": ["workflowEvidence", "apiSecurityRunUrl"],
  "sensitive-mutation-run-url": ["workflowEvidence", "sensitiveMutationRunUrl"],
  "repository-audit-run-url": ["workflowEvidence", "repositoryAuditRunUrl"],
  "public-golden-path-run-url": ["workflowEvidence", "publicGoldenPathRunUrl"],
  "operational-recovery-run-url": ["workflowEvidence", "operationalRecoveryRunUrl"],
  "container-supply-chain-run-url": ["workflowEvidence", "containerSupplyChainRunUrl"],
  "secret-scanning-run-url": ["workflowEvidence", "secretScanningRunUrl"],
  "protected-staging-evidence-url": ["requiredExternalEvidence", "protectedStaging", "evidenceUrl"],
  "protected-staging-artifact-digest": ["requiredExternalEvidence", "protectedStaging", "artifactDigest"],
  "recovery-reconciliation-evidence-url": ["requiredExternalEvidence", "recoveryReconciliation", "evidenceUrl"],
  "recovery-reconciliation-artifact-digest": ["requiredExternalEvidence", "recoveryReconciliation", "artifactDigest"],
  "rollback-evidence-url": ["requiredExternalEvidence", "rollbackOrForwardFix", "evidenceUrl"],
  "rollback-artifact-digest": ["requiredExternalEvidence", "rollbackOrForwardFix", "artifactDigest"],
  "incident-readiness-evidence-url": ["requiredExternalEvidence", "incidentReadiness", "evidenceUrl"],
  "incident-readiness-artifact-digest": ["requiredExternalEvidence", "incidentReadiness", "artifactDigest"],
  "accepted-risk-signoff-url": ["requiredExternalEvidence", "acceptedRisks", "evidenceUrl"],
  "go-approvals-url": ["requiredExternalEvidence", "approvals", "evidenceUrl"],
  "go-approvals-artifact-digest": ["requiredExternalEvidence", "approvals", "artifactDigest"],
});

const forbiddenSensitiveEvidence = [
  /postgres(?:ql)?:\/\//i,
  /redis:\/\//i,
  /mongodb(?:\+srv)?:\/\//i,
  /mysql:\/\//i,
  /DATABASE_URL/i,
  /UPSTASH_REDIS_REST_TOKEN/i,
  /PRIVATE KEY/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
];

function fail(message) {
  throw new Error(`controlled launch evidence manifest invalid: ${message}`);
}

function normalizeDigest(value, label) {
  if (typeof value !== "string" || !/^(sha256:)?[a-f0-9]{64}$/i.test(value)) {
    fail(`${label} must be a sha256 digest`);
  }
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function validateUrl(value, label) {
  if (typeof value !== "string") fail(`${label} must be an absolute https URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an absolute https URL`);
  }
  if (parsed.protocol !== "https:") fail(`${label} must be an absolute https URL`);
  return parsed.toString();
}

function validateGithubActionsRunUrl(value, label) {
  if (typeof value !== "string") {
    fail(`${label} must be an absolute https GitHub Actions run URL for tecpey/Tecpey-Os`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an absolute https GitHub Actions run URL for tecpey/Tecpey-Os`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.search ||
    parsed.hash ||
    !/^\/tecpey\/Tecpey-Os\/actions\/runs\/[1-9][0-9]*\/?$/.test(parsed.pathname)
  ) {
    fail(`${label} must be an absolute https GitHub Actions run URL for tecpey/Tecpey-Os`);
  }
  return `https://github.com${parsed.pathname.replace(/\/$/, "")}`;
}

function valueAt(object, path) {
  return path.reduce((current, key) => current?.[key], object);
}

function findDuplicateWorkflowRunUrls(workflowEvidence) {
  if (!workflowEvidence || typeof workflowEvidence !== "object" || Array.isArray(workflowEvidence)) {
    return [];
  }

  const byUrl = new Map();
  for (const [key, value] of Object.entries(workflowEvidence)) {
    if (typeof value !== "string") continue;
    const normalized = value.replace(/\/$/, "");
    const existing = byUrl.get(normalized);
    if (existing) {
      return [existing, key, normalized];
    }
    byUrl.set(normalized, key);
  }

  return [];
}

function validateKnownShape(value, shape, label, failures) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${label} must be an object`);
    return;
  }

  for (const key of Object.keys(value)) {
    if (!(key in shape)) failures.push(`${label}.${key} is not a governed evidence manifest field`);
  }

  for (const [key, expected] of Object.entries(shape)) {
    const nextLabel = `${label}.${key}`;
    const nextValue = value[key];
    if (typeof expected === "string") {
      if (nextValue === undefined) {
        failures.push(`${nextLabel} is required`);
      } else if (expected === "number" && typeof nextValue !== "number") {
        failures.push(`${nextLabel} must be a number`);
      } else if (expected === "string" && typeof nextValue !== "string") {
        failures.push(`${nextLabel} must be a string`);
      } else if (expected === "digest") {
        try {
          normalizeDigest(nextValue, nextLabel);
        } catch (error) {
          failures.push(error.message);
        }
      } else if (expected === "workflowRunUrl") {
        try {
          validateGithubActionsRunUrl(nextValue, nextLabel);
        } catch (error) {
          failures.push(error.message);
        }
      } else if (expected === "url") {
        try {
          validateUrl(nextValue, nextLabel);
        } catch (error) {
          failures.push(error.message);
        }
      }
      continue;
    }
    validateKnownShape(nextValue, expected, nextLabel, failures);
  }
}

export function validateControlledLaunchEvidenceManifest(manifest, { expectedHeadSha } = {}) {
  const failures = [];
  validateKnownShape(manifest, manifestShape, "manifest", failures);

  if (manifest?.schemaVersion !== 2) failures.push("manifest.schemaVersion must be 2");
  if (manifest?.evidenceClass !== REQUIRED_MANIFEST_CLASS) {
    failures.push(`manifest.evidenceClass must be ${REQUIRED_MANIFEST_CLASS}`);
  }
  const generatedAt = manifest?.generatedAt;
  if (
    typeof generatedAt !== "string" ||
    !Number.isFinite(Date.parse(generatedAt)) ||
    new Date(generatedAt).toISOString() !== generatedAt
  ) {
    failures.push("manifest.generatedAt must be an ISO-8601 timestamp");
  }

  const duplicateWorkflowRun = findDuplicateWorkflowRunUrls(manifest?.workflowEvidence);
  if (duplicateWorkflowRun.length) {
    const [firstKey, duplicateKey] = duplicateWorkflowRun;
    failures.push(
      `manifest.workflowEvidence.${duplicateKey} must not reuse the same GitHub Actions run URL as manifest.workflowEvidence.${firstKey}`,
    );
  }

  const candidateSha = manifest?.releaseCandidate?.sha;
  if (typeof candidateSha !== "string" || !/^[a-f0-9]{40}$/i.test(candidateSha)) {
    failures.push("manifest.releaseCandidate.sha must be a 40-character git SHA");
  }
  if (expectedHeadSha && candidateSha !== expectedHeadSha) {
    failures.push("manifest.releaseCandidate.sha must match the checked-out release candidate HEAD");
  }
  if (typeof manifest?.releaseCandidate?.sourceBranch !== "string" || !manifest.releaseCandidate.sourceBranch) {
    failures.push("manifest.releaseCandidate.sourceBranch must be a non-empty branch name");
  }

  const serialized = JSON.stringify(manifest);
  if (forbiddenSensitiveEvidence.some((pattern) => pattern.test(serialized))) {
    failures.push("manifest must contain only URLs, digests and release identifiers, not secrets or raw connection strings");
  }

  if (failures.length > 0) fail(failures.join("; "));

  return {
    ...manifest,
    authorityVerification: {
      ...manifest.authorityVerification,
      generator: {
        ...manifest.authorityVerification.generator,
        sourceDigest: normalizeDigest(
          manifest.authorityVerification.generator.sourceDigest,
          "manifest.authorityVerification.generator.sourceDigest",
        ),
      },
      verifier: {
        ...manifest.authorityVerification.verifier,
        sourceDigest: normalizeDigest(
          manifest.authorityVerification.verifier.sourceDigest,
          "manifest.authorityVerification.verifier.sourceDigest",
        ),
      },
    },
    artifactIdentity: {
      imageDigest: normalizeDigest(manifest.artifactIdentity.imageDigest, "manifest.artifactIdentity.imageDigest"),
      deploymentArtifactDigest: normalizeDigest(
        manifest.artifactIdentity.deploymentArtifactDigest,
        "manifest.artifactIdentity.deploymentArtifactDigest",
      ),
    },
    workflowEvidence: Object.fromEntries(
      Object.entries(manifest.workflowEvidence).map(([key, value]) => [
        key,
        validateGithubActionsRunUrl(value, `manifest.workflowEvidence.${key}`),
      ]),
    ),
    requiredExternalEvidence: {
      protectedStaging: {
        evidenceUrl: validateUrl(
          manifest.requiredExternalEvidence.protectedStaging.evidenceUrl,
          "manifest.requiredExternalEvidence.protectedStaging.evidenceUrl",
        ),
        artifactDigest: normalizeDigest(
          manifest.requiredExternalEvidence.protectedStaging.artifactDigest,
          "manifest.requiredExternalEvidence.protectedStaging.artifactDigest",
        ),
      },
      recoveryReconciliation: {
        evidenceUrl: validateUrl(
          manifest.requiredExternalEvidence.recoveryReconciliation.evidenceUrl,
          "manifest.requiredExternalEvidence.recoveryReconciliation.evidenceUrl",
        ),
        artifactDigest: normalizeDigest(
          manifest.requiredExternalEvidence.recoveryReconciliation.artifactDigest,
          "manifest.requiredExternalEvidence.recoveryReconciliation.artifactDigest",
        ),
      },
      rollbackOrForwardFix: {
        evidenceUrl: validateUrl(
          manifest.requiredExternalEvidence.rollbackOrForwardFix.evidenceUrl,
          "manifest.requiredExternalEvidence.rollbackOrForwardFix.evidenceUrl",
        ),
        artifactDigest: normalizeDigest(
          manifest.requiredExternalEvidence.rollbackOrForwardFix.artifactDigest,
          "manifest.requiredExternalEvidence.rollbackOrForwardFix.artifactDigest",
        ),
      },
      incidentReadiness: {
        evidenceUrl: validateUrl(
          manifest.requiredExternalEvidence.incidentReadiness.evidenceUrl,
          "manifest.requiredExternalEvidence.incidentReadiness.evidenceUrl",
        ),
        artifactDigest: normalizeDigest(
          manifest.requiredExternalEvidence.incidentReadiness.artifactDigest,
          "manifest.requiredExternalEvidence.incidentReadiness.artifactDigest",
        ),
      },
      acceptedRisks: {
        evidenceUrl: validateUrl(
          manifest.requiredExternalEvidence.acceptedRisks.evidenceUrl,
          "manifest.requiredExternalEvidence.acceptedRisks.evidenceUrl",
        ),
        artifactDigest: normalizeDigest(
          manifest.requiredExternalEvidence.acceptedRisks.artifactDigest,
          "manifest.requiredExternalEvidence.acceptedRisks.artifactDigest",
        ),
      },
      approvals: {
        evidenceUrl: validateUrl(
          manifest.requiredExternalEvidence.approvals.evidenceUrl,
          "manifest.requiredExternalEvidence.approvals.evidenceUrl",
        ),
        artifactDigest: normalizeDigest(
          manifest.requiredExternalEvidence.approvals.artifactDigest,
          "manifest.requiredExternalEvidence.approvals.artifactDigest",
        ),
      },
      disabledCapabilities: {
        evidenceUrl: validateUrl(
          manifest.requiredExternalEvidence.disabledCapabilities.evidenceUrl,
          "manifest.requiredExternalEvidence.disabledCapabilities.evidenceUrl",
        ),
        artifactDigest: normalizeDigest(
          manifest.requiredExternalEvidence.disabledCapabilities.artifactDigest,
          "manifest.requiredExternalEvidence.disabledCapabilities.artifactDigest",
        ),
      },
    },
  };
}

export async function readControlledLaunchEvidenceManifest(file, options = {}) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`${file} could not be read as JSON: ${error.message}`);
  }
  return validateControlledLaunchEvidenceManifest(manifest, options);
}

export function manifestValue(manifest, flagName) {
  const path = manifestFlagPaths[flagName];
  return path ? valueAt(manifest, path) : undefined;
}

function parseCliArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--manifest" && arg !== "--expect-head") {
      fail(`unknown option: ${arg}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail(`${arg} requires a value`);
    args.set(arg.slice(2), next);
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseCliArgs(process.argv);
  const manifestFile = args.get("manifest");
  if (!manifestFile) fail("--manifest is required");
  const manifest = await readControlledLaunchEvidenceManifest(manifestFile, {
    expectedHeadSha: args.get("expect-head"),
  });
  process.stdout.write(
    `Controlled launch evidence manifest passed: ${manifest.releaseCandidate.sha} has complete governed URLs and digests for final packet input.\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
