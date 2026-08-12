import { readFile } from "node:fs/promises";

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^(sha256:)?[a-f0-9]{64}$/;
const REVIEW_DATE = /^20\d{2}-\d{2}-\d{2}$/;
const RELEASE_SCOPE_ID = "controlled-public-fa-en-academy-mentor-arena";
const MINIMUM_REVIEW_DATE = "2026-08-16";

const REQUIRED_CONTROLLED_LAUNCH_RISKS = [
  "R-01",
  "R-02",
  "R-04",
  "R-05",
  "R-06",
  "R-07",
  "R-08",
  "R-09",
  "R-10",
];

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

const REQUIRED_RISK_CONDITIONS = [
  "exact candidate SHA accepted",
  "controlled public FA/EN, Academy, Mentor and virtual Arena only",
  "risk thresholds and rollback triggers from docs/LAUNCH_ACCEPTED_RISKS.md accepted",
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
  "webhookurl",
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

function parseUtcDay(value, path) {
  if (typeof value !== "string" || !REVIEW_DATE.test(value)) throw new Error(`${path}_review_date_invalid`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${path}_review_date_invalid`);
  }
  return date;
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

function verifyRiskRegister(value, expectedSha) {
  exactKeys(
    value,
    [
      "path",
      "digest",
      "candidateSha",
      "referenceDate",
      "minimumReviewDate",
      "coveredRisks",
      "supersededRisks",
      "freshnessPolicy",
    ],
    "riskRegister",
  );
  if (value.path !== "docs/LAUNCH_ACCEPTED_RISKS.md" || value.candidateSha !== expectedSha) {
    throw new Error("risk_register_identity_invalid");
  }
  assertDigest(value.digest, "riskRegister_digest");
  parseUtcDay(value.referenceDate, "riskRegister_referenceDate");
  if (value.minimumReviewDate !== MINIMUM_REVIEW_DATE) throw new Error("risk_register_minimum_review_date_invalid");
  assertArrayExactly(value.coveredRisks, REQUIRED_CONTROLLED_LAUNCH_RISKS, "riskRegister_coveredRisks");
  assertArrayExactly(value.supersededRisks, ["R-03"], "riskRegister_supersededRisks");
  if (value.freshnessPolicy !== "fail-closed-if-any-review-date-is-stale-before-go") {
    throw new Error("risk_register_freshness_policy_invalid");
  }
}

function verifyRiskOwnerSignoff(value, risk, expectedSha) {
  exactKeys(
    value,
    [
      "risk",
      "accountableOwners",
      "approvalOwnerExternalIdentity",
      "approvedAt",
      "candidateSha",
      "launchScopeId",
      "decision",
      "reviewDate",
      "acceptanceEvidenceUrl",
      "evidenceDigest",
      "attestation",
      "conditions",
    ],
    `riskOwnerSignoffs_${risk}`,
  );

  if (value.risk !== risk) throw new Error(`riskOwnerSignoffs_${risk}_risk_invalid`);
  if (!Array.isArray(value.accountableOwners) || value.accountableOwners.length < 2) {
    throw new Error(`riskOwnerSignoffs_${risk}_accountable_owners_invalid`);
  }
  for (const owner of value.accountableOwners) {
    assertNonEmptyString(owner, `riskOwnerSignoffs_${risk}_accountable_owner`);
  }
  assertNonEmptyString(value.approvalOwnerExternalIdentity, `riskOwnerSignoffs_${risk}_approval_owner`, 8);
  assertIso(value.approvedAt, `riskOwnerSignoffs_${risk}_approved_at`);
  if (value.candidateSha !== expectedSha || value.launchScopeId !== RELEASE_SCOPE_ID) {
    throw new Error(`riskOwnerSignoffs_${risk}_scope_invalid`);
  }
  if (value.decision !== "accepted") throw new Error(`riskOwnerSignoffs_${risk}_decision_invalid`);
  const reviewDay = parseUtcDay(value.reviewDate, `riskOwnerSignoffs_${risk}`);
  if (reviewDay < parseUtcDay(MINIMUM_REVIEW_DATE, "minimumReviewDate")) {
    throw new Error(`riskOwnerSignoffs_${risk}_review_date_stale`);
  }
  assertGithubRepoUrl(value.acceptanceEvidenceUrl, `riskOwnerSignoffs_${risk}_acceptanceEvidenceUrl`);
  assertDigest(value.evidenceDigest, `riskOwnerSignoffs_${risk}_evidence`);
  if (value.attestation !== "accepted-risk-register-approved-for-controlled-soft-launch-only") {
    throw new Error(`riskOwnerSignoffs_${risk}_attestation_invalid`);
  }
  assertArrayIncludesAll(value.conditions, REQUIRED_RISK_CONDITIONS, `riskOwnerSignoffs_${risk}_conditions`);
}

function verifyRiskOwnerSignoffs(value, expectedSha) {
  exactKeys(value, REQUIRED_CONTROLLED_LAUNCH_RISKS, "riskOwnerSignoffs");
  const distinctApprovalOwners = new Set();
  for (const risk of REQUIRED_CONTROLLED_LAUNCH_RISKS) {
    verifyRiskOwnerSignoff(value[risk], risk, expectedSha);
    distinctApprovalOwners.add(value[risk].approvalOwnerExternalIdentity);
  }
  if (distinctApprovalOwners.size < 3) throw new Error("risk_owner_signoff_coverage_insufficient");
}

export function verifyAcceptedRiskSignoffEvidence(value, expectedSha) {
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
      "riskRegister",
      "riskOwnerSignoffs",
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
    || value.authority !== "tecpey-accepted-risk-owner-signoff-v1"
    || value.evidenceClass !== "controlled-soft-launch-accepted-risk-owner-signoff"
    || value.decision !== "ACCEPTED_RISKS_SIGNED_OFF_FOR_CONTROLLED_SCOPE"
    || value.environment !== "release-control"
  ) {
    throw new Error("evidence_identity_invalid");
  }
  if (!COMMIT_SHA.test(value.sourceSha) || value.sourceSha !== expectedSha) {
    throw new Error("evidence_source_sha_invalid");
  }

  verifyReleaseScope(value.releaseScope, expectedSha);
  verifyRiskRegister(value.riskRegister, expectedSha);
  verifyRiskOwnerSignoffs(value.riskOwnerSignoffs, expectedSha);
  assertParticipant(value.releaseOwner, "releaseOwner");
  assertParticipant(value.operator, "operator");
  assertParticipant(value.reviewer, "reviewer");

  const approverIdentities = Object.values(value.riskOwnerSignoffs).map((entry) => entry.approvalOwnerExternalIdentity);
  if (
    value.reviewer.externalIdentity === value.operator.externalIdentity
    || value.reviewer.externalIdentity === value.releaseOwner.externalIdentity
    || approverIdentities.includes(value.operator.externalIdentity)
  ) {
    throw new Error("accepted_risk_signoff_independence_invalid");
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

  if (value.finalDisposition !== "accepted") throw new Error("final_disposition_invalid");

  return value;
}

async function main() {
  const [file, flag, expectedSha] = process.argv.slice(2);
  if (!file || flag !== "--expected-sha" || !COMMIT_SHA.test(expectedSha ?? "")) {
    throw new Error("usage: verify-accepted-risk-signoff-evidence.mjs <file> --expected-sha <sha>");
  }
  const value = JSON.parse(await readFile(file, "utf8"));
  verifyAcceptedRiskSignoffEvidence(value, expectedSha);
  process.stdout.write(`Accepted-risk owner signoff evidence verified for ${expectedSha}.\n`);
}

if (process.argv[1]?.endsWith("verify-accepted-risk-signoff-evidence.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
