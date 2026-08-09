import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--allow-dirty") {
    args.set("allowDirty", true);
    continue;
  }
  if (arg.startsWith("--")) {
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

const status = git(["status", "--porcelain"]);
const allowDirty = Boolean(args.get("allowDirty"));
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

const packet = {
  schemaVersion: 1,
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
    imageDigest: optionalDigest(args.get("image-digest") || process.env.TECPEY_RELEASE_IMAGE_DIGEST, "image digest"),
    deploymentArtifactDigest: optionalDigest(
      args.get("deployment-artifact-digest") || process.env.TECPEY_DEPLOYMENT_ARTIFACT_DIGEST,
      "deployment artifact digest",
    ),
  },
  workflowEvidence: {
    ciRunUrl: args.get("ci-run-url") || process.env.TECPEY_CI_RUN_URL || null,
    repositoryAuditRunUrl: args.get("repository-audit-run-url") || process.env.TECPEY_REPOSITORY_AUDIT_RUN_URL || null,
    publicGoldenPathRunUrl: args.get("public-golden-path-run-url") || process.env.TECPEY_PUBLIC_GOLDEN_PATH_RUN_URL || null,
    secretScanningRunUrl: args.get("secret-scanning-run-url") || process.env.TECPEY_SECRET_SCANNING_RUN_URL || null,
  },
  requiredExternalEvidence: {
    protectedStaging: {
      status: "missing_until_verified_artifact_attached",
      contract: "docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md",
    },
    recoveryReconciliation: {
      status: "missing_until_restore_drill_artifact_attached",
      contract: "docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md",
    },
    rollbackOrForwardFix: {
      status: "missing_until_candidate_rollback_or_signed_forward_fix_evidence_attached",
      contract: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
    },
    acceptedRisks: {
      status: "missing_until_named_owner_thresholds_dates_and_signoffs_are_recorded",
      registry: "docs/LAUNCH_ACCEPTED_RISKS.md",
    },
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
