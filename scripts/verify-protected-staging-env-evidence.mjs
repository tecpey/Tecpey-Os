import { createHash, timingSafeEqual } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

const MAX_EVIDENCE_BYTES = 64 * 1024;
const SOURCES = new Set([
  "protected_host_env_file",
  "service_manager_preloaded_environment",
]);
const FORBIDDEN_PATTERNS = [
  /postgres(?:ql)?:\/\//i,
  /mysql:\/\//i,
  /redis:\/\//i,
  /bearer\s+[a-z0-9._~+/-]+=*/i,
  /private[-_ ]?key/i,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
];

function required(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function absolutePath(name) {
  const value = required(name);
  const normalized = path.normalize(value);
  if (
    !path.isAbsolute(normalized) ||
    normalized === path.parse(normalized).root ||
    normalized.length > 500 ||
    normalized.includes("\0")
  ) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return normalized;
}

async function safeRead(filePath, maximumBytes) {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 2 || stat.size > maximumBytes) {
    throw new Error("protected_staging_env_evidence_file_unsafe");
  }
  return readFile(filePath, "utf8");
}

function verifyDigest(evidencePath, content, digestContent) {
  const match = /^([0-9a-f]{64})  ([A-Za-z0-9._-]{1,200})\n?$/.exec(digestContent);
  if (!match || match[2] !== path.basename(evidencePath)) {
    throw new Error("protected_staging_env_evidence_digest_invalid");
  }
  const expected = Buffer.from(match[1], "hex");
  const actual = Buffer.from(createHash("sha256").update(content).digest("hex"), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("protected_staging_env_evidence_digest_mismatch");
  }
}

function assertExactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}_invalid`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label}_schema_drift`);
  }
}

function assertNoSensitiveMaterial(content) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error("protected_staging_env_evidence_sensitive_material");
    }
  }
}

async function main() {
  const evidencePath = absolutePath("TECPEY_STAGING_ENV_EVIDENCE_FILE");
  const [content, digestContent] = await Promise.all([
    safeRead(evidencePath, MAX_EVIDENCE_BYTES),
    safeRead(`${evidencePath}.sha256`, 512),
  ]);
  verifyDigest(evidencePath, content, digestContent);
  assertNoSensitiveMaterial(content);

  let evidence;
  try {
    evidence = JSON.parse(content);
  } catch {
    throw new Error("protected_staging_env_evidence_json_invalid");
  }

  assertExactObject(evidence, [
    "collectedAt",
    "contentDigest",
    "cspConnectionDisposition",
    "envCheckDisposition",
    "environment",
    "environmentSource",
    "environmentSourceProofDisposition",
    "evidenceClass",
    "failingKeyNamesOnly",
    "privacyBoundary",
    "rawOutputCaptured",
    "schemaVersion",
    "selectedSha",
    "sourceProof",
  ], "protected_staging_env_evidence");
  assertExactObject(evidence.privacyBoundary, [
    "credentialBearingUrlsUploaded",
    "hostIdentifiersUploaded",
    "rawLogsUploaded",
    "rawValuesUploaded",
  ], "protected_staging_env_evidence_privacy_boundary");

  if (evidence.schemaVersion !== 1) throw new Error("protected_staging_env_evidence_version_invalid");
  if (evidence.evidenceClass !== "protected-staging-env-evidence-v1") {
    throw new Error("protected_staging_env_evidence_class_invalid");
  }
  if (evidence.environment !== "staging") throw new Error("protected_staging_env_evidence_environment_invalid");
  if (evidence.selectedSha !== required("TECPEY_STAGING_ENV_EVIDENCE_EXPECTED_SHA")) {
    throw new Error("protected_staging_env_evidence_sha_mismatch");
  }
  if (!SOURCES.has(evidence.environmentSource)) {
    throw new Error("protected_staging_env_evidence_source_invalid");
  }
  if (
    evidence.environmentSourceProofDisposition !== "passed" ||
    evidence.envCheckDisposition !== "passed" ||
    evidence.cspConnectionDisposition !== "passed"
  ) {
    throw new Error("protected_staging_env_evidence_not_accepted");
  }
  if (!Array.isArray(evidence.failingKeyNamesOnly) || evidence.failingKeyNamesOnly.length !== 0) {
    throw new Error("protected_staging_env_evidence_failures_present");
  }
  if (
    evidence.rawOutputCaptured !== false ||
    evidence.privacyBoundary.rawValuesUploaded !== false ||
    evidence.privacyBoundary.rawLogsUploaded !== false ||
    evidence.privacyBoundary.credentialBearingUrlsUploaded !== false ||
    evidence.privacyBoundary.hostIdentifiersUploaded !== false
  ) {
    throw new Error("protected_staging_env_evidence_privacy_boundary_invalid");
  }

  console.log(JSON.stringify({
    ok: true,
    environment: evidence.environment,
    selectedSha: evidence.selectedSha,
    environmentSource: evidence.environmentSource,
    envCheckDisposition: evidence.envCheckDisposition,
    evidenceFile: path.basename(evidencePath),
  }));
}

void main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9._:-]{3,180}$/.test(error.message)
    ? error.message
    : "protected_staging_env_evidence_verification_failed";
  console.error(JSON.stringify({ ok: false, error: code }));
  process.exitCode = 1;
});
