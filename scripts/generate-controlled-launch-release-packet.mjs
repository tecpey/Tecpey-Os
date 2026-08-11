import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  manifestValue,
  readControlledLaunchEvidenceManifest,
} from "./controlled-launch-evidence-manifest.mjs";

const flagArgs = new Set(["--allow-dirty", "--draft"]);
const valueArgs = new Set([
  "--ci-run-url",
  "--deployment-artifact-digest",
  "--accepted-risk-signoff-url",
  "--api-security-run-url",
  "--container-supply-chain-run-url",
  "--full-suite-run-url",
  "--go-approvals-url",
  "--image-digest",
  "--incident-readiness-artifact-digest",
  "--incident-readiness-evidence-url",
  "--manifest",
  "--operational-recovery-run-url",
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
  "--sensitive-mutation-run-url",
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

const manifest = args.get("manifest")
  ? await readControlledLaunchEvidenceManifest(args.get("manifest"))
  : null;

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

function optionalGithubActionsRunUrl(value, label) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute https GitHub Actions run URL for tecpey/Tecpey-Os`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.search ||
    parsed.hash ||
    !/^\/tecpey\/Tecpey-Os\/actions\/runs\/[1-9][0-9]*\/?$/.test(parsed.pathname)
  ) {
    throw new Error(`${label} must be an absolute https GitHub Actions run URL for tecpey/Tecpey-Os`);
  }
  return `https://github.com${parsed.pathname.replace(/\/$/, "")}`;
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
if (status && (!allowDirty || !draftMode)) {
  throw new Error(
    "release packet generation requires a clean worktree for final packets. Re-run with --draft --allow-dirty only for local incomplete packet scaffolding.",
  );
}

const headSha = validateSha(git(["rev-parse", "HEAD"]), "HEAD");
if (manifest?.releaseCandidate?.sha && manifest.releaseCandidate.sha !== headSha) {
  throw new Error("manifest release candidate SHA must match the checked-out release candidate HEAD");
}
const branch = optionalGit(["branch", "--show-current"]) || "detached";
const originMain = optionalGit(["rev-parse", "origin/main"]);
const isOriginMainAncestor = originMain
  ? spawnSync("git", ["merge-base", "--is-ancestor", headSha, "origin/main"]).status === 0
  : false;
if (!draftMode && !isOriginMainAncestor) {
  throw new Error(
    "final release packet requires the release candidate SHA to be contained in origin/main. Re-run with --draft only for local or unmerged release-candidate scaffolding.",
  );
}
const trackedFiles = git(["ls-files"]).split("\n").filter(Boolean);
const migrationFiles = trackedFiles.filter((file) =>
  /^(migrations\/|src\/lib\/db-migration|src\/lib\/db-migrate|scripts\/run-database-migrations\.ts)/.test(file),
);
function evidenceArg(name, envName) {
  return args.get(name) || (manifest ? manifestValue(manifest, name) : undefined) || process.env[envName];
}

const imageDigest = optionalDigest(evidenceArg("image-digest", "TECPEY_RELEASE_IMAGE_DIGEST"), "image digest");
const deploymentArtifactDigest = optionalDigest(
  evidenceArg("deployment-artifact-digest", "TECPEY_DEPLOYMENT_ARTIFACT_DIGEST"),
  "deployment artifact digest",
);
const ciRunUrl = optionalGithubActionsRunUrl(evidenceArg("ci-run-url", "TECPEY_CI_RUN_URL"), "CI run URL");
const fullSuiteRunUrl = optionalGithubActionsRunUrl(
  evidenceArg("full-suite-run-url", "TECPEY_FULL_SUITE_RUN_URL"),
  "Full Suite run URL",
);
const apiSecurityRunUrl = optionalGithubActionsRunUrl(
  evidenceArg("api-security-run-url", "TECPEY_API_SECURITY_RUN_URL"),
  "API Security run URL",
);
const sensitiveMutationRunUrl = optionalGithubActionsRunUrl(
  evidenceArg("sensitive-mutation-run-url", "TECPEY_SENSITIVE_MUTATION_RUN_URL"),
  "Sensitive Mutation run URL",
);
const repositoryAuditRunUrl = optionalGithubActionsRunUrl(
  evidenceArg("repository-audit-run-url", "TECPEY_REPOSITORY_AUDIT_RUN_URL"),
  "repository audit run URL",
);
const publicGoldenPathRunUrl = optionalGithubActionsRunUrl(
  evidenceArg("public-golden-path-run-url", "TECPEY_PUBLIC_GOLDEN_PATH_RUN_URL"),
  "public Golden Path run URL",
);
const operationalRecoveryRunUrl = optionalGithubActionsRunUrl(
  evidenceArg("operational-recovery-run-url", "TECPEY_OPERATIONAL_RECOVERY_RUN_URL"),
  "Operational Recovery run URL",
);
const containerSupplyChainRunUrl = optionalGithubActionsRunUrl(
  evidenceArg("container-supply-chain-run-url", "TECPEY_CONTAINER_SUPPLY_CHAIN_RUN_URL"),
  "Container Supply Chain run URL",
);
const secretScanningRunUrl = optionalGithubActionsRunUrl(
  evidenceArg("secret-scanning-run-url", "TECPEY_SECRET_SCANNING_RUN_URL"),
  "secret scanning run URL",
);
const protectedStagingEvidenceUrl = optionalUrl(
  evidenceArg("protected-staging-evidence-url", "TECPEY_PROTECTED_STAGING_EVIDENCE_URL"),
  "protected staging evidence URL",
);
const protectedStagingArtifactDigest = optionalDigest(
  evidenceArg("protected-staging-artifact-digest", "TECPEY_PROTECTED_STAGING_ARTIFACT_DIGEST"),
  "protected staging artifact digest",
);
const recoveryReconciliationEvidenceUrl = optionalUrl(
  evidenceArg("recovery-reconciliation-evidence-url", "TECPEY_RECOVERY_RECONCILIATION_EVIDENCE_URL"),
  "recovery reconciliation evidence URL",
);
const recoveryReconciliationArtifactDigest = optionalDigest(
  evidenceArg("recovery-reconciliation-artifact-digest", "TECPEY_RECOVERY_RECONCILIATION_ARTIFACT_DIGEST"),
  "recovery reconciliation artifact digest",
);
const rollbackEvidenceUrl = optionalUrl(
  evidenceArg("rollback-evidence-url", "TECPEY_ROLLBACK_EVIDENCE_URL"),
  "rollback evidence URL",
);
const rollbackArtifactDigest = optionalDigest(
  evidenceArg("rollback-artifact-digest", "TECPEY_ROLLBACK_ARTIFACT_DIGEST"),
  "rollback artifact digest",
);
const incidentReadinessEvidenceUrl = optionalUrl(
  evidenceArg("incident-readiness-evidence-url", "TECPEY_INCIDENT_READINESS_EVIDENCE_URL"),
  "incident readiness evidence URL",
);
const incidentReadinessArtifactDigest = optionalDigest(
  evidenceArg("incident-readiness-artifact-digest", "TECPEY_INCIDENT_READINESS_ARTIFACT_DIGEST"),
  "incident readiness artifact digest",
);
const acceptedRiskSignoffUrl = optionalUrl(
  evidenceArg("accepted-risk-signoff-url", "TECPEY_ACCEPTED_RISK_SIGNOFF_URL"),
  "accepted risk signoff URL",
);
const goApprovalsUrl = optionalUrl(
  evidenceArg("go-approvals-url", "TECPEY_GO_APPROVALS_URL"),
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
    fullSuiteRunUrl: requireFinalEvidence(fullSuiteRunUrl, "Full Suite run URL", { draftMode }),
    apiSecurityRunUrl: requireFinalEvidence(apiSecurityRunUrl, "API Security run URL", { draftMode }),
    sensitiveMutationRunUrl: requireFinalEvidence(sensitiveMutationRunUrl, "Sensitive Mutation run URL", { draftMode }),
    repositoryAuditRunUrl: requireFinalEvidence(repositoryAuditRunUrl, "repository audit run URL", { draftMode }),
    publicGoldenPathRunUrl: requireFinalEvidence(publicGoldenPathRunUrl, "public Golden Path run URL", { draftMode }),
    operationalRecoveryRunUrl: requireFinalEvidence(operationalRecoveryRunUrl, "Operational Recovery run URL", {
      draftMode,
    }),
    containerSupplyChainRunUrl: requireFinalEvidence(containerSupplyChainRunUrl, "Container Supply Chain run URL", {
      draftMode,
    }),
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
