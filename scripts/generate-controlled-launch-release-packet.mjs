import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const flagArgs = new Set(["--allow-dirty", "--draft"]);
const valueArgs = new Set([
  "--ci-run-url",
  "--deployment-artifact-digest",
  "--accepted-risk-signoff-url",
  "--go-approvals-url",
  "--image-digest",
  "--incident-readiness-artifact-digest",
  "--incident-readiness-evidence-url",
  "--out",
  "--protected-staging-artifact-digest",
  "--protected-staging-evidence-url",
  "--public-golden-path-run-url",
  "--recovery-reconciliation-artifact-digest",
  "--recovery-reconciliation-evidence-url",
  "--repository-audit-run-url",
  "--rollback-artifact-digest",
  "--rollback-evidence-url",
  "--secret-scanning-run-url",
]);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (flagArgs.has(arg)) {
    args.set(arg.slice(2), true);
    continue;
  }
  if (arg.startsWith("--")) {
    if (!valueArgs.has(arg)) {
      throw new Error(`unknown launch packet option: ${arg}`);
    }
    const next = process.argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    args.set(arg.slice(2), next);
    index += 1;
  }
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    const error = result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`;
    throw new Error(error);
  }
  return result.stdout.trim();
}

function optionalGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function sha256GitFiles(files) {
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function validateSha(value, label) {
  if (!/^[a-f0-9]{40}$/i.test(value)) {
    throw new Error(`${label} must be a 40-character git SHA`);
  }
  return value;
}

function optionalDigest(value, label) {
  if (!value) return null;
  if (!/^(sha256:)?[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${label} must be a sha256 digest`);
  }
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function optionalUrl(value, label) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute https URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must be an absolute https URL`);
  }
  return parsed.toString();
}

function requireFinalEvidence(value, label, { draftMode }) {
  if (value) return value;
  if (draftMode) return null;
  throw new Error(
    `${label} is required for a final release packet. Re-run with --draft only for local incomplete packet scaffolding.`,
  );
}

const status = git(["status", "--porcelain"]);
const allowDirty = Boolean(args.get("allow-dirty"));
const draftMode = Boolean(args.get("draft")) || process.env.TECPEY_LAUNCH_PACKET_DRAFT === "1";
if (status && !allowDirty) {
  throw new Error(
    "release packet generation requires a clean worktree. Re-run with --allow-dirty only for local draft evidence.",
  );
}

const headSha = validateSha(git(["rev-parse", "HEAD"]), "HEAD");
const branch = optionalGit(["branch", "--show-current"]) || "detached";
const originMain = optionalGit(["rev-parse", "origin/main"]);
const isOriginMainAncestor = originMain
  ? spawnSync("git", ["merge-base", "--is-ancestor", headSha, "origin/main"]).status === 0
  : false;
const trackedFiles = git(["ls-files"]).split("\n").filter(Boolean);
const migrationFiles = trackedFiles.filter((file) =>
  /^(migrations\/|src\/lib\/db-migration|src\/lib\/db-migrate|scripts\/run-database-migrations\.ts)/.test(file),
);
const imageDigest = optionalDigest(args.get("image-digest") || process.env.TECPEY_RELEASE_IMAGE_DIGEST, "image digest");
const deploymentArtifactDigest = optionalDigest(
  args.get("deployment-artifact-digest") || process.env.TECPEY_DEPLOYMENT_ARTIFACT_DIGEST,
  "deployment artifact digest",
);
const ciRunUrl = optionalUrl(args.get("ci-run-url") || process.env.TECPEY_CI_RUN_URL, "CI run URL");
const repositoryAuditRunUrl = optionalUrl(
  args.get("repository-audit-run-url") || process.env.TECPEY_REPOSITORY_AUDIT_RUN_URL,
  "repository audit run URL",
);
const publicGoldenPathRunUrl = optionalUrl(
  args.get("public-golden-path-run-url") || process.env.TECPEY_PUBLIC_GOLDEN_PATH_RUN_URL,
  "public Golden Path run URL",
);
const secretScanningRunUrl = optionalUrl(
  args.get("secret-scanning-run-url") || process.env.TECPEY_SECRET_SCANNING_RUN_URL,
  "secret scanning run URL",
);
const protectedStagingEvidenceUrl = optionalUrl(
  args.get("protected-staging-evidence-url") || process.env.TECPEY_PROTECTED_STAGING_EVIDENCE_URL,
  "protected staging evidence URL",
);
const protectedStagingArtifactDigest = optionalDigest(
  args.get("protected-staging-artifact-digest") || process.env.TECPEY_PROTECTED_STAGING_ARTIFACT_DIGEST,
  "protected staging artifact digest",
);
const recoveryReconciliationEvidenceUrl = optionalUrl(
  args.get("recovery-reconciliation-evidence-url") || process.env.TECPEY_RECOVERY_RECONCILIATION_EVIDENCE_URL,
  "recovery reconciliation evidence URL",
);
const recoveryReconciliationArtifactDigest = optionalDigest(
  args.get("recovery-reconciliation-artifact-digest") || process.env.TECPEY_RECOVERY_RECONCILIATION_ARTIFACT_DIGEST,
  "recovery reconciliation artifact digest",
);
const rollbackEvidenceUrl = optionalUrl(
  args.get("rollback-evidence-url") || process.env.TECPEY_ROLLBACK_EVIDENCE_URL,
  "rollback evidence URL",
);
const rollbackArtifactDigest = optionalDigest(
  args.get("rollback-artifact-digest") || process.env.TECPEY_ROLLBACK_ARTIFACT_DIGEST,
  "rollback artifact digest",
);
const incidentReadinessEvidenceUrl = optionalUrl(
  args.get("incident-readiness-evidence-url") || process.env.TECPEY_INCIDENT_READINESS_EVIDENCE_URL,
  "incident readiness evidence URL",
);
const incidentReadinessArtifactDigest = optionalDigest(
  args.get("incident-readiness-artifact-digest") || process.env.TECPEY_INCIDENT_READINESS_ARTIFACT_DIGEST,
  "incident readiness artifact digest",
);
const acceptedRiskSignoffUrl = optionalUrl(
  args.get("accepted-risk-signoff-url") || process.env.TECPEY_ACCEPTED_RISK_SIGNOFF_URL,
  "accepted risk signoff URL",
);
const goApprovalsUrl = optionalUrl(
  args.get("go-approvals-url") || process.env.TECPEY_GO_APPROVALS_URL,
  "Go approvals URL",
);

function externalEvidence({ url, digest, urlLabel, digestLabel, contract, registry, draftMode }) {
  return {
    status: draftMode ? "missing_until_verified_artifact_attached" : "attached_for_release_owner_acceptance",
    ...(contract ? { contract } : {}),
    ...(registry ? { registry } : {}),
    evidenceUrl: requireFinalEvidence(url, urlLabel, { draftMode }),
    ...(digestLabel ? { artifactDigest: requireFinalEvidence(digest, digestLabel, { draftMode }) } : {}),
  };
}

const packet = {
  schemaVersion: 1,
  packetMode: draftMode ? "draft_incomplete_evidence_allowed" : "final_evidence_required",
  generatedAt: new Date().toISOString(),
  decision: "NO_GO_UNTIL_ACCEPTED_OPERATIONAL_EVIDENCE",
  releaseCandidate: {
    sha: headSha,
    branch,
    cleanWorktree: status.length === 0,
    originMainContainsSha: isOriginMainAncestor,
    localDirtyFiles: status ? status.split("\n") : [],
  },
  artifactIdentity: {
    packageLockSha256: await sha256File("package-lock.json"),
    migrationPlanSha256: await sha256GitFiles(migrationFiles),
    imageDigest: requireFinalEvidence(imageDigest, "image digest", { draftMode }),
    deploymentArtifactDigest: requireFinalEvidence(deploymentArtifactDigest, "deployment artifact digest", { draftMode }),
  },
  workflowEvidence: {
    ciRunUrl: requireFinalEvidence(ciRunUrl, "CI run URL", { draftMode }),
    repositoryAuditRunUrl: requireFinalEvidence(repositoryAuditRunUrl, "repository audit run URL", { draftMode }),
    publicGoldenPathRunUrl: requireFinalEvidence(publicGoldenPathRunUrl, "public Golden Path run URL", { draftMode }),
    secretScanningRunUrl: requireFinalEvidence(secretScanningRunUrl, "secret scanning run URL", { draftMode }),
  },
  requiredExternalEvidence: {
    protectedStaging: externalEvidence({
      url: protectedStagingEvidenceUrl,
      digest: protectedStagingArtifactDigest,
      urlLabel: "protected staging evidence URL",
      digestLabel: "protected staging artifact digest",
      contract: "docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md",
      draftMode,
    }),
    recoveryReconciliation: externalEvidence({
      url: recoveryReconciliationEvidenceUrl,
      digest: recoveryReconciliationArtifactDigest,
      urlLabel: "recovery reconciliation evidence URL",
      digestLabel: "recovery reconciliation artifact digest",
      contract: "docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md",
      draftMode,
    }),
    rollbackOrForwardFix: externalEvidence({
      url: rollbackEvidenceUrl,
      digest: rollbackArtifactDigest,
      urlLabel: "rollback evidence URL",
      digestLabel: "rollback artifact digest",
      contract: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
      draftMode,
    }),
    incidentReadiness: externalEvidence({
      url: incidentReadinessEvidenceUrl,
      digest: incidentReadinessArtifactDigest,
      urlLabel: "incident readiness evidence URL",
      digestLabel: "incident readiness artifact digest",
      contract: "docs/operations/INCIDENT_READINESS_CONTRACT.md",
      draftMode,
    }),
    acceptedRisks: externalEvidence({
      url: acceptedRiskSignoffUrl,
      urlLabel: "accepted risk signoff URL",
      registry: "docs/LAUNCH_ACCEPTED_RISKS.md",
      draftMode,
    }),
    approvals: externalEvidence({
      url: goApprovalsUrl,
      urlLabel: "Go approvals URL",
      contract: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
      draftMode,
    }),
  },
  disabledCapabilityAttestation: [
    "real-money Exchange remains NO-GO unless separately certified",
    "custody, deposits and withdrawals remain NO-GO unless separately certified",
    "public financial rewards remain NO-GO unless separately certified",
    "enterprise and white-label activation remain NO-GO unless separately certified",
  ],
  privacyBoundary: [
    "packet contains hashes, URLs and release identifiers only",
    "packet must not contain raw secrets, database URLs, host IPs, customer data or logs",
  ],
};

const output = `${JSON.stringify(packet, null, 2)}\n`;
const outputFile = args.get("out");
if (outputFile) {
  await writeFile(outputFile, output, { mode: 0o600 });
} else {
  process.stdout.write(output);
}
