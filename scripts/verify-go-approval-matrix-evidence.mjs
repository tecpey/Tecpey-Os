import { readFile } from "node:fs/promises";

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^(sha256:)?[a-f0-9]{64}$/;
const RELEASE_SCOPE_ID = "controlled-public-fa-en-academy-mentor-arena";

const REQUIRED_ALLOWED_SURFACES = [
  "public-fa-en",
  "academy",
  "mentor",
  "virtual-trading-arena",
];

const REQUIRED_DISABLED_SURFACES = [
  "real-money-exchange",
  "custody-deposits-withdrawals",
  "public-financial-rewards",
  "enterprise-white-label",
];

const REQUIRED_PREREQUISITE_BLOCKERS = [
  "NOG-01",
  "NOG-02",
  "NOG-03",
  "NOG-04",
  "NOG-05",
  "NOG-06",
  "NOG-07",
  "NOG-08",
  "NOG-10",
  "NOG-11",
  "NOG-12",
];

const REQUIRED_APPROVAL_ROLES = {
  ceo: "CEO",
  ctoOrChiefArchitect: "CTO or Chief Architect",
  security: "Security",
  product: "Product",
  compliance: "Compliance",
  sre: "SRE",
  qa: "QA",
};

const REQUIRED_CONDITIONS = [
  "exact candidate SHA approved",
  "controlled public FA/EN, Academy, Mentor and virtual Arena only",
  "real-money Exchange remains disabled",
  "custody deposits withdrawals remain disabled",
  "enterprise white-label public rewards remain disabled",
];

const FORBIDDEN_KEYS = new Set([
  "credentials",
  "credential",
  "customerdatas",
  "customerdata",
  "databaseurl",
  "hostip",
  "ipaddress",
  "privatekey",
  "providerpayload",
  "prompttranscript",
  "rawlogs",
  "rawlog",
  "rawrows",
  "rawrow",
  "secret",
  "secrets",
  "token",
  "tokens",
]);

const FORBIDDEN_STRING_PATTERNS = [
  /postgres(?:ql)?:\/\//i,
  /redis:\/\//i,
  /DATABASE_URL\s*=/i,
  /BEGIN [A-Z ]*PRIVATE KEY/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bsk-[A-Za-z0-9_-]{12,}\b/i,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
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

function assertNonEmptyString(value, path, minimum = 3) {
  if (typeof value !== "string" || value.trim().length < minimum) {
    throw new Error(`${path}_invalid`);
  }
}

function assertDigest(value, path) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${path}_digest_invalid`);
  }
}

function assertHttpsUrl(value, path) {
  if (typeof value !== "string") throw new Error(`${path}_url_invalid`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${path}_url_invalid`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${path}_url_invalid`);
  }
  return parsed;
}

function assertGithubRepoUrl(value, path) {
  const parsed = assertHttpsUrl(value, path);
  if (
    parsed.hostname !== "github.com"
    || parsed.search
    || parsed.hash
    || !/^\/tecpey\/Tecpey-Os\/(?:pull|issues|actions\/runs|commit|blob)\/.+/.test(parsed.pathname)
  ) {
    throw new Error(`${path}_github_repo_url_invalid`);
  }
}

function assertParticipant(value, path) {
  exactKeys(value, ["role", "externalIdentity"], path);
  assertNonEmptyString(value.role, `${path}_role`);
  assertNonEmptyString(value.externalIdentity, `${path}_external_identity`, 8);
}

function assertArrayExactly(value, expected, path) {
  if (!Array.isArray(value)) throw new Error(`${path}_must_be_array`);
  const actual = [...value].sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${path}_invalid`);
  }
}

function assertArrayIncludesAll(value, expected, path) {
  if (!Array.isArray(value)) throw new Error(`${path}_must_be_array`);
  for (const item of expected) {
    if (!value.includes(item)) throw new Error(`${path}_missing_${item.replace(/[^A-Za-z0-9]/g, "_")}`);
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
    const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
    if (FORBIDDEN_KEYS.has(normalizedKey)) {
      throw new Error(`${path}_${key}_forbidden`);
    }
    forbidRawMaterial(entry, `${path}.${key}`);
  }
}

function verifyReleaseScope(value, expectedSha) {
  exactKeys(value, ["candidateSha", "launchScopeId", "allowedSurfaces", "disabledSurfaces", "status"], "releaseScope");
  if (value.candidateSha !== expectedSha || value.launchScopeId !== RELEASE_SCOPE_ID) {
    throw new Error("release_scope_identity_invalid");
  }
  assertArrayExactly(value.allowedSurfaces, REQUIRED_ALLOWED_SURFACES, "releaseScope_allowedSurfaces");
  assertArrayExactly(value.disabledSurfaces, REQUIRED_DISABLED_SURFACES, "releaseScope_disabledSurfaces");
  if (value.status !== "controlled-soft-launch-only") throw new Error("release_scope_status_invalid");
}

function verifyPrerequisiteEvidence(value) {
  exactKeys(value, REQUIRED_PREREQUISITE_BLOCKERS, "prerequisiteEvidence");
  for (const blocker of REQUIRED_PREREQUISITE_BLOCKERS) {
    const item = value[blocker];
    exactKeys(item, ["id", "status", "evidenceUrl", "evidenceDigest"], `prerequisiteEvidence_${blocker}`);
    if (item.id !== blocker || item.status !== "accepted") {
      throw new Error(`prerequisiteEvidence_${blocker}_status_invalid`);
    }
    assertHttpsUrl(item.evidenceUrl, `prerequisiteEvidence_${blocker}_evidence`);
    assertDigest(item.evidenceDigest, `prerequisiteEvidence_${blocker}_evidence`);
  }
}

function verifyApprovalEntry(value, key, expectedRole, expectedSha) {
  exactKeys(
    value,
    [
      "role",
      "approverExternalIdentity",
      "approvedAt",
      "candidateSha",
      "launchScopeId",
      "decision",
      "approvalEvidenceUrl",
      "evidenceDigest",
      "attestation",
      "conditions",
    ],
    `approvalMatrix_${key}`,
  );

  if (value.role !== expectedRole) throw new Error(`approvalMatrix_${key}_role_invalid`);
  assertNonEmptyString(value.approverExternalIdentity, `approvalMatrix_${key}_approver`, 8);
  assertIso(value.approvedAt, `approvalMatrix_${key}_approved_at`);
  if (value.candidateSha !== expectedSha || value.launchScopeId !== RELEASE_SCOPE_ID) {
    throw new Error(`approvalMatrix_${key}_scope_invalid`);
  }
  if (value.decision !== "approved") throw new Error(`approvalMatrix_${key}_decision_invalid`);
  assertGithubRepoUrl(value.approvalEvidenceUrl, `approvalMatrix_${key}_approvalEvidenceUrl`);
  assertDigest(value.evidenceDigest, `approvalMatrix_${key}_evidence`);
  if (value.attestation !== "approved-for-controlled-soft-launch-only") {
    throw new Error(`approvalMatrix_${key}_attestation_invalid`);
  }
  assertArrayIncludesAll(value.conditions, REQUIRED_CONDITIONS, `approvalMatrix_${key}_conditions`);
}

function verifyApprovalMatrix(value, expectedSha) {
  exactKeys(value, Object.keys(REQUIRED_APPROVAL_ROLES), "approvalMatrix");
  const seenRoles = new Set();
  for (const [key, expectedRole] of Object.entries(REQUIRED_APPROVAL_ROLES)) {
    verifyApprovalEntry(value[key], key, expectedRole, expectedSha);
    if (seenRoles.has(value[key].role)) throw new Error("approval_roles_must_be_unique");
    seenRoles.add(value[key].role);
  }
}

export function verifyGoApprovalMatrixEvidence(value, expectedSha) {
  forbidRawMaterial(value);
  exactKeys(
    value,
    [
      "schemaVersion",
      "authority",
      "evidenceClass",
      "decision",
      "environment",
      "sourceSha",
      "releaseScope",
      "prerequisiteEvidence",
      "approvalMatrix",
      "releaseOwner",
      "operator",
      "reviewer",
      "privacyBoundary",
      "finalDisposition",
    ],
    "evidence",
  );

  if (
    value.schemaVersion !== 1
    || value.authority !== "tecpey-go-approval-matrix-v1"
    || value.evidenceClass !== "controlled-soft-launch-go-approval-matrix"
    || value.decision !== "APPROVED_FOR_CONTROLLED_SOFT_LAUNCH"
    || value.environment !== "release-control"
  ) {
    throw new Error("evidence_identity_invalid");
  }
  if (!COMMIT_SHA.test(value.sourceSha) || value.sourceSha !== expectedSha) {
    throw new Error("evidence_source_sha_invalid");
  }

  verifyReleaseScope(value.releaseScope, expectedSha);
  verifyPrerequisiteEvidence(value.prerequisiteEvidence);
  verifyApprovalMatrix(value.approvalMatrix, expectedSha);
  assertParticipant(value.releaseOwner, "releaseOwner");
  assertParticipant(value.operator, "operator");
  assertParticipant(value.reviewer, "reviewer");

  const qaApprover = value.approvalMatrix.qa.approverExternalIdentity;
  if (
    value.reviewer.externalIdentity === value.operator.externalIdentity
    || value.reviewer.externalIdentity === value.releaseOwner.externalIdentity
    || qaApprover === value.operator.externalIdentity
  ) {
    throw new Error("approval_matrix_independence_invalid");
  }

  if (
    !Array.isArray(value.privacyBoundary)
    || !value.privacyBoundary.includes("redacted-evidence-only")
    || !value.privacyBoundary.includes("no-secrets-or-connection-urls")
    || !value.privacyBoundary.includes("no-host-ips")
    || !value.privacyBoundary.includes("no-raw-logs")
    || !value.privacyBoundary.includes("no-customer-data")
  ) {
    throw new Error("privacy_boundary_invalid");
  }

  if (value.finalDisposition !== "approved_for_controlled_soft_launch") {
    throw new Error("final_disposition_invalid");
  }

  return value;
}

async function main() {
  const [file, flag, expectedSha] = process.argv.slice(2);
  if (!file || flag !== "--expected-sha" || !COMMIT_SHA.test(expectedSha ?? "")) {
    throw new Error("usage: verify-go-approval-matrix-evidence.mjs <file> --expected-sha <sha>");
  }
  const value = JSON.parse(await readFile(file, "utf8"));
  verifyGoApprovalMatrixEvidence(value, expectedSha);
  process.stdout.write(`Go approval matrix evidence verified for ${expectedSha}.\n`);
}

if (process.argv[1]?.endsWith("verify-go-approval-matrix-evidence.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
