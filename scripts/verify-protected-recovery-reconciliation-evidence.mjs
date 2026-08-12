import { readFile } from "node:fs/promises";

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;

const DOMAIN_KEYS = {
  academy: "Academy",
  tradingArena: "Trading Arena",
  mentorAi: "Mentor AI",
  exchangeLedger: "Exchange Ledger",
  notificationsOperationalJobs: "Notifications and operational jobs",
  tenantPrincipalIsolation: "Tenant and principal isolation",
};

const FORBIDDEN_KEYS = new Set([
  "credentials",
  "customerData",
  "databaseUrl",
  "privateKey",
  "providerPayload",
  "promptTranscript",
  "rawCustomerData",
  "rawLogs",
  "rawRows",
  "rows",
  "secret",
  "token",
]);

const FORBIDDEN_STRING_PATTERNS = [
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL\s*=/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bsk-[A-Za-z0-9_-]{12,}/i,
];

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}_must_be_object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${path}_keys_invalid`);
  }
}

function assertIso(value, path) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${path}_timestamp_invalid`);
  }
}

function assertOrderedWindow(startedAt, completedAt, path) {
  assertIso(startedAt, `${path}_started_at`);
  assertIso(completedAt, `${path}_completed_at`);
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new Error(`${path}_timestamp_order_invalid`);
  }
}

function assertParticipant(value, path) {
  exactKeys(value, ["role", "externalIdentity"], path);
  for (const key of ["role", "externalIdentity"]) {
    if (typeof value[key] !== "string" || value[key].trim().length < 3) {
      throw new Error(`${path}_${key}_invalid`);
    }
  }
}

function assertRowCounts(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) {
    throw new Error(`${path}_row_counts_invalid`);
  }
  for (const [key, count] of Object.entries(value)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key) || !Number.isInteger(count) || count < 0) {
      throw new Error(`${path}_row_counts_invalid`);
    }
  }
}

function forbidRawMaterial(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => forbidRawMaterial(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error(`${path}_contains_forbidden_material`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`${path}_${key}_forbidden`);
    }
    forbidRawMaterial(entry, `${path}.${key}`);
  }
}

function verifyDomain(value, key, expected, topLevel) {
  exactKeys(value, [
    "domain",
    "sourceSha",
    "migrationPlanHash",
    "backupBoundary",
    "queryDigest",
    "rowCounts",
    "startedAt",
    "completedAt",
    "operator",
    "reviewer",
    "disposition",
  ], `domains_${key}`);

  if (value.domain !== expected) throw new Error(`domains_${key}_domain_invalid`);
  if (value.sourceSha !== topLevel.sourceSha) throw new Error(`domains_${key}_source_sha_invalid`);
  if (value.migrationPlanHash !== topLevel.migrationPlanHash) {
    throw new Error(`domains_${key}_migration_plan_hash_invalid`);
  }
  if (value.backupBoundary !== topLevel.backupBoundary.boundaryId) {
    throw new Error(`domains_${key}_backup_boundary_invalid`);
  }
  if (!SHA256.test(value.queryDigest)) throw new Error(`domains_${key}_query_digest_invalid`);
  assertRowCounts(value.rowCounts, `domains_${key}`);
  assertOrderedWindow(value.startedAt, value.completedAt, `domains_${key}`);
  if (typeof value.operator !== "string" || value.operator !== topLevel.operator.externalIdentity) {
    throw new Error(`domains_${key}_operator_invalid`);
  }
  if (typeof value.reviewer !== "string" || value.reviewer !== topLevel.reviewer.externalIdentity) {
    throw new Error(`domains_${key}_reviewer_invalid`);
  }
  if (value.disposition !== "accepted") throw new Error(`domains_${key}_disposition_invalid`);
}

export function verifyProtectedRecoveryReconciliationEvidence(value, expectedSha) {
  forbidRawMaterial(value);
  exactKeys(value, [
    "schemaVersion",
    "authority",
    "evidenceClass",
    "environment",
    "sourceSha",
    "imageDigest",
    "migrationPlanHash",
    "backupBoundary",
    "restoreWindow",
    "operator",
    "reviewer",
    "domains",
    "privacyBoundary",
    "finalDisposition",
  ], "evidence");

  if (
    value.schemaVersion !== 1
    || value.authority !== "tecpey-protected-recovery-reconciliation-v1"
    || value.evidenceClass !== "protected-staging-domain-recovery-reconciliation"
    || value.environment !== "protected-staging"
  ) {
    throw new Error("evidence_identity_invalid");
  }
  if (!COMMIT_SHA.test(value.sourceSha) || value.sourceSha !== expectedSha) {
    throw new Error("evidence_source_sha_invalid");
  }
  if (!IMAGE_DIGEST.test(value.imageDigest)) throw new Error("evidence_image_digest_invalid");
  if (!SHA256.test(value.migrationPlanHash)) throw new Error("evidence_migration_plan_hash_invalid");

  exactKeys(value.backupBoundary, ["boundaryId", "startedAt", "completedAt", "rpoBoundary", "backupDigest"], "backupBoundary");
  if (typeof value.backupBoundary.boundaryId !== "string" || value.backupBoundary.boundaryId.trim().length < 8) {
    throw new Error("backupBoundary_boundary_id_invalid");
  }
  assertOrderedWindow(value.backupBoundary.startedAt, value.backupBoundary.completedAt, "backupBoundary");
  if (
    value.backupBoundary.rpoBoundary
    !== "all-acknowledged-domain-state-before-backup-is-present-after-restore"
  ) {
    throw new Error("backupBoundary_rpo_boundary_invalid");
  }
  if (!SHA256.test(value.backupBoundary.backupDigest)) throw new Error("backupBoundary_backup_digest_invalid");

  exactKeys(value.restoreWindow, ["startedAt", "completedAt", "measuredRtoSeconds", "maximumRtoSeconds"], "restoreWindow");
  assertOrderedWindow(value.restoreWindow.startedAt, value.restoreWindow.completedAt, "restoreWindow");
  if (
    !Number.isInteger(value.restoreWindow.measuredRtoSeconds)
    || !Number.isInteger(value.restoreWindow.maximumRtoSeconds)
    || value.restoreWindow.maximumRtoSeconds <= 0
    || value.restoreWindow.maximumRtoSeconds > 900
    || value.restoreWindow.measuredRtoSeconds < 0
    || value.restoreWindow.measuredRtoSeconds > value.restoreWindow.maximumRtoSeconds
  ) {
    throw new Error("restoreWindow_rto_invalid");
  }

  assertParticipant(value.operator, "operator");
  assertParticipant(value.reviewer, "reviewer");
  if (value.operator.externalIdentity === value.reviewer.externalIdentity) {
    throw new Error("reviewer_must_be_independent");
  }

  exactKeys(value.domains, Object.keys(DOMAIN_KEYS), "domains");
  for (const [key, expected] of Object.entries(DOMAIN_KEYS)) {
    verifyDomain(value.domains[key], key, expected, value);
  }

  if (
    !Array.isArray(value.privacyBoundary)
    || !value.privacyBoundary.includes("counts-and-hashes-only")
    || !value.privacyBoundary.includes("no-raw-rows")
    || !value.privacyBoundary.includes("no-secrets-or-connection-urls")
  ) {
    throw new Error("privacy_boundary_invalid");
  }
  if (value.finalDisposition !== "accepted") throw new Error("final_disposition_invalid");
  return value;
}

async function main() {
  const [file, flag, expectedSha] = process.argv.slice(2);
  if (!file || flag !== "--expected-sha" || !COMMIT_SHA.test(expectedSha ?? "")) {
    throw new Error(
      "usage: verify-protected-recovery-reconciliation-evidence.mjs <file> --expected-sha <sha>",
    );
  }
  const value = JSON.parse(await readFile(file, "utf8"));
  verifyProtectedRecoveryReconciliationEvidence(value, expectedSha);
  process.stdout.write(`Protected recovery reconciliation evidence verified for ${expectedSha}.\n`);
}

if (process.argv[1]?.endsWith("verify-protected-recovery-reconciliation-evidence.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
