import { readFile } from "node:fs/promises";

const files = {
  evidence: "docs/launch/generated/rollback-volume-restore-evidence-20260812.json",
  register: "docs/launch/generated/protected-staging-no-go-register-20260810.json",
  candidate: "docs/launch/generated/current-controlled-launch-candidate.json",
  packet: "docs/launch/PROTECTED_STAGING_EVIDENCE_PACKET_20260810.md",
  checklist: "docs/launch/CONTROLLED_SOFT_LAUNCH_GO_NO_GO_CHECKLIST.md",
  packageJson: "package.json",
};

const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;

const failures = [];

async function read(path) {
  return readFile(path, "utf8");
}

async function json(path) {
  try {
    return JSON.parse(await read(path));
  } catch {
    failures.push(`${path}: JSON parse failed`);
    return {};
  }
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireArrayIncludes(label, value, expected) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    failures.push(`${label}: missing ${expected}`);
  }
}

function requireText(path, source, token, reason) {
  if (!source.replace(/\s+/g, " ").includes(token.replace(/\s+/g, " "))) {
    failures.push(`${path}: ${reason}`);
  }
}

function requireAnyText(path, source, tokens, reason) {
  const normalizedSource = source.replace(/\s+/g, " ");
  if (!tokens.some((token) => normalizedSource.includes(token.replace(/\s+/g, " ")))) {
    failures.push(`${path}: ${reason}`);
  }
}

function requireSha(label, value) {
  if (typeof value !== "string" || !SHA.test(value)) {
    failures.push(`${label}: expected 40-character git SHA`);
  }
}

function requireDigest(label, value) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    failures.push(`${label}: expected sha256 digest`);
  }
}

function requireImageId(label, value) {
  if (typeof value !== "string" || !IMAGE_ID.test(value)) {
    failures.push(`${label}: expected sha256 image id`);
  }
}

function requireGitHubRunUrl(label, value) {
  if (typeof value !== "string") {
    failures.push(`${label}: expected GitHub Actions run URL`);
    return;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    failures.push(`${label}: expected absolute URL`);
    return;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.search ||
    parsed.hash ||
    !/^\/tecpey\/Tecpey-Os\/actions\/runs\/[1-9][0-9]*\/?$/.test(parsed.pathname)
  ) {
    failures.push(`${label}: expected governed tecpey/Tecpey-Os GitHub Actions run URL`);
  }
}

function requireGitHubArtifactApiUrl(label, value) {
  if (typeof value !== "string") {
    failures.push(`${label}: expected GitHub artifact API URL`);
    return;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    failures.push(`${label}: expected absolute URL`);
    return;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "api.github.com" ||
    parsed.search ||
    parsed.hash ||
    !/^\/repos\/tecpey\/Tecpey-Os\/actions\/artifacts\/[1-9][0-9]*\/?$/.test(parsed.pathname)
  ) {
    failures.push(`${label}: expected governed tecpey/Tecpey-Os GitHub artifact API URL`);
  }
}

const [evidence, register, candidate, packet, checklist, packageJson] = await Promise.all([
  json(files.evidence),
  json(files.register),
  json(files.candidate),
  read(files.packet),
  read(files.checklist),
  json(files.packageJson),
]);

const selectedSha = candidate.currentCandidate?.sha;
requireEqual("evidence.schemaVersion", evidence.schemaVersion, 1);
requireEqual("evidence.evidenceClass", evidence.evidenceClass, "rollback-volume-restore-evidence");
requireEqual(
  "evidence.decision",
  evidence.decision,
  "NO_GO_NOG_06_ACCEPTED_EPHEMERAL_ROLLBACK_VOLUME_RESTORE_ONLY",
);
requireEqual("evidence.selectedSha", evidence.selectedSha, selectedSha);
requireSha("evidence.previousReleaseSha", evidence.previousReleaseSha);
requireEqual("register.rollbackVolumeRestoreEvidence", register.rollbackVolumeRestoreEvidence, files.evidence);
requireEqual("candidate.activeInputs.rollbackVolumeRestoreEvidence", candidate.activeInputs?.rollbackVolumeRestoreEvidence, files.evidence);

const blocker = register.blockers?.find((entry) => entry.id === "NOG-06");
requireEqual("NOG-06.status", blocker?.status, "accepted");
requireEqual("NOG-06.executionState", blocker?.executionState, "accepted_ephemeral_rollback_volume_restore");
requireEqual("NOG-06.evidence", blocker?.evidence, files.evidence);
requireArrayIncludes("register.acceptedEvidence", register.acceptedEvidence?.map((entry) => entry.id), "NOG-06");
requireArrayIncludes("candidate.acceptedEvidence", candidate.acceptedEvidence?.map((entry) => entry.id), "NOG-06");
requireArrayIncludes("evidence.acceptedForBlockers", evidence.acceptedForBlockers, "NOG-06");

for (const blockerId of ["NOG-01", "NOG-02", "NOG-05"]) {
  requireArrayIncludes("evidence.notAcceptedForBlockers", evidence.notAcceptedForBlockers, blockerId);
}
const protectedStagingStatuses = ["NOG-01", "NOG-02"].map(
  (blockerId) => register.blockers?.find((entry) => entry.id === blockerId)?.status,
);
const protectedStagingOpen = protectedStagingStatuses.every((status) => status === "open");
const protectedStagingAccepted = protectedStagingStatuses.every((status) => status === "accepted");
if (!protectedStagingOpen && !protectedStagingAccepted) {
  failures.push(
    `NOG-01/NOG-02 statuses must transition atomically as both open or both accepted, got ${JSON.stringify(
      protectedStagingStatuses,
    )}`,
  );
}
const nog05 = register.blockers?.find((entry) => entry.id === "NOG-05");
requireEqual("NOG-05.status", nog05?.status, "accepted");

requireEqual("evidence.observedVia.workflow", evidence.observedVia?.workflow, "Container Supply Chain");
requireEqual("evidence.observedVia.workflowPath", evidence.observedVia?.workflowPath, ".github/workflows/container-supply-chain.yml");
requireEqual("evidence.observedVia.event", evidence.observedVia?.event, "push");
requireEqual("evidence.observedVia.status", evidence.observedVia?.status, "completed");
requireEqual("evidence.observedVia.conclusion", evidence.observedVia?.conclusion, "success");
requireGitHubRunUrl("evidence.observedVia.runUrl", evidence.observedVia?.runUrl);

requireEqual("evidence.rollbackJob.name", evidence.rollbackJob?.name, "Ephemeral staging rollback and volume restore");
requireEqual("evidence.rollbackJob.status", evidence.rollbackJob?.status, "completed");
requireEqual("evidence.rollbackJob.conclusion", evidence.rollbackJob?.conclusion, "success");
for (const step of [
  "Checkout exact source",
  "Verify exact checkout",
  "Build exact candidate image",
  "Checkout exact previous release",
  "Build and deploy exact previous release image",
  "Restore PostgreSQL and Redis persistent volumes",
  "Upload recovery evidence",
]) {
  requireArrayIncludes("evidence.rollbackJob.requiredSteps", evidence.rollbackJob?.requiredSteps, step);
}

requireEqual("evidence.artifact.name", evidence.artifact?.name, `container-recovery-${selectedSha}`);
requireGitHubArtifactApiUrl("evidence.artifact.apiUrl", evidence.artifact?.apiUrl);
requireDigest("evidence.artifact.digest", evidence.artifact?.digest);
requireEqual("downloadVerification.resultVerifierDisposition", evidence.downloadVerification?.resultVerifierDisposition, "success");
requireEqual("downloadVerification.zipSha256", `sha256:${evidence.downloadVerification?.zipSha256}`, evidence.artifact?.digest);
requireText(
  files.evidence,
  evidence.downloadVerification?.resultVerifier ?? "",
  `--expected-sha ${selectedSha}`,
  "download verifier must be bound to the selected SHA",
);

requireEqual("rollbackResult.environment", evidence.rollbackResult?.environment, "ephemeral-staging");
requireEqual("rollbackResult.candidate", evidence.rollbackResult?.candidate, "served");
requireEqual("rollbackResult.rollback", evidence.rollbackResult?.rollback, "previous-release-served");
requireImageId("rollbackResult.candidateImageId", evidence.rollbackResult?.candidateImageId);
requireImageId("rollbackResult.previousImageId", evidence.rollbackResult?.previousImageId);

requireEqual("volumeRestoreResult.authority", evidence.volumeRestoreResult?.authority, "tecpey-operational-recovery-drill-v1");
requireEqual("volumeRestoreResult.environment", evidence.volumeRestoreResult?.environment, "ephemeral-ci");
requireEqual("volumeRestoreResult.sourceSha", evidence.volumeRestoreResult?.sourceSha, selectedSha);
requireImageId("volumeRestoreResult.imageId", evidence.volumeRestoreResult?.imageId);
requireEqual(
  "volumeRestoreResult.rpoBoundary",
  evidence.volumeRestoreResult?.rpoBoundary,
  "all-probe-writes-committed-before-backup-are-present-and-later-writes-are-absent",
);
requireEqual(
  "volumeRestoreResult.migrationPlanHash",
  evidence.volumeRestoreResult?.migrationPlanHash,
  evidence.volumeRestoreResult?.restoredMigrationPlanHash,
);
for (const field of ["postgresBackupSha256", "redisBackupSha256"]) {
  if (typeof evidence.volumeRestoreResult?.[field] !== "string" || !/^[a-f0-9]{64}$/.test(evidence.volumeRestoreResult[field])) {
    failures.push(`volumeRestoreResult.${field}: expected sha256 hex`);
  }
}
if (
  !Number.isInteger(evidence.volumeRestoreResult?.maximumRecoverySeconds) ||
  evidence.volumeRestoreResult.maximumRecoverySeconds > 900 ||
  !Number.isInteger(evidence.volumeRestoreResult?.recoveryDurationMs) ||
  evidence.volumeRestoreResult.recoveryDurationMs > evidence.volumeRestoreResult.maximumRecoverySeconds * 1000
) {
  failures.push("volumeRestoreResult: invalid recovery timing");
}

for (const invariant of [
  files.evidence,
  "NOG-06 is accepted for exact-candidate ephemeral rollback and synthetic PostgreSQL/Redis volume-restore mechanics only",
  "protected staging domain recovery reconciliation is accepted separately under NOG-05",
]) {
  requireText(files.packet, packet, invariant, `packet is missing NOG-06 invariant: ${invariant}`);
}
requireText(
  files.checklist,
  checklist,
  "Exact-candidate rollback and synthetic PostgreSQL/Redis volume-restore evidence is accepted for NOG-06",
  "checklist is missing the accepted NOG-06 evidence boundary",
);
requireAnyText(
  files.checklist,
  checklist,
  [
    "NO-GO remains until protected staging, recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence is accepted",
    "NO-GO remains until recovery reconciliation, incident, accepted-risk owner sign-off and approval evidence is accepted",
    "NO-GO remains until incident, accepted-risk owner sign-off and approval evidence is accepted",
    "NO-GO remains until accepted-risk owner sign-off and approval evidence is accepted",
  ],
  "checklist is missing a coherent pre/post protected-staging NOG-06 boundary",
);
requireText(
  files.packageJson,
  JSON.stringify(packageJson),
  "launch:rollback-evidence:check",
  "package.json must expose the rollback evidence guard",
);
requireText(
  files.packageJson,
  packageJson.scripts?.["launch:decision:check"] ?? "",
  "npm run launch:rollback-evidence:check",
  "launch:decision:check must enforce the rollback evidence guard",
);

const serializedEvidence = JSON.stringify(evidence);
for (const forbidden of [
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
]) {
  if (forbidden.test(serializedEvidence)) {
    failures.push(`${files.evidence}: evidence must not contain secrets, connection strings or host identifiers`);
  }
}

if (failures.length > 0) {
  console.error("Rollback/volume-restore evidence authority failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Rollback/volume-restore evidence authority passed for ${selectedSha}.`);
