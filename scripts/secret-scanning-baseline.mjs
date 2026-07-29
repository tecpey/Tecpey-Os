import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RULE_ID = /^[a-z0-9][a-z0-9-]*$/;

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function canonicalPath(value, label) {
  const candidate = requireString(value, label);
  if (
    candidate.startsWith("/") ||
    candidate.includes("\\") ||
    candidate.includes("\0") ||
    candidate.split("/").includes("..")
  ) {
    throw new Error(`${label} must be a canonical repository-relative path`);
  }
  return candidate;
}

export function validateSecretScanningBaseline(baseline) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    throw new Error("secret-scanning baseline must be an object");
  }
  if (baseline.schemaVersion !== 1) {
    throw new Error("secret-scanning baseline schemaVersion must equal 1");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requireString(baseline.reviewedAt, "reviewedAt"))) {
    throw new Error("reviewedAt must be an ISO calendar date");
  }

  const scanner = baseline.scanner;
  if (!scanner || typeof scanner !== "object" || Array.isArray(scanner)) {
    throw new Error("scanner authority must be an object");
  }
  if (scanner.name !== "gitleaks") {
    throw new Error("scanner.name must equal gitleaks");
  }
  if (!/^\d+\.\d+\.\d+$/.test(requireString(scanner.version, "scanner.version"))) {
    throw new Error("scanner.version must be an exact semantic version");
  }
  if (!COMMIT_SHA.test(requireString(scanner.releaseCommit, "scanner.releaseCommit"))) {
    throw new Error("scanner.releaseCommit must be a lowercase full commit SHA");
  }
  for (const field of ["linuxX64ArchiveSha256", "defaultConfigSha256"]) {
    if (!SHA256.test(requireString(scanner[field], `scanner.${field}`))) {
      throw new Error(`scanner.${field} must be a lowercase SHA-256 digest`);
    }
  }

  if (!Array.isArray(baseline.findings)) {
    throw new Error("findings must be an array");
  }
  const identities = new Set();
  const normalized = baseline.findings.map((finding, index) => {
    const label = `findings[${index}]`;
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      throw new Error(`${label} must be an object`);
    }
    const commit = requireString(finding.commit, `${label}.commit`);
    if (!COMMIT_SHA.test(commit)) {
      throw new Error(`${label}.commit must be a lowercase full commit SHA`);
    }
    const repositoryPath = canonicalPath(finding.path, `${label}.path`);
    const ruleId = requireString(finding.ruleId, `${label}.ruleId`);
    if (!RULE_ID.test(ruleId)) {
      throw new Error(`${label}.ruleId is not canonical`);
    }
    if (!Number.isSafeInteger(finding.line) || finding.line < 1) {
      throw new Error(`${label}.line must be a positive safe integer`);
    }
    if (finding.classification !== "known-non-secret") {
      throw new Error(`${label}.classification must equal known-non-secret`);
    }
    if (requireString(finding.reason, `${label}.reason`).length < 40) {
      throw new Error(`${label}.reason must contain an auditable justification`);
    }
    const expectedIdentity = `${commit}:${repositoryPath}:${ruleId}:${finding.line}`;
    if (finding.findingIdentity !== expectedIdentity) {
      throw new Error(`${label}.findingIdentity does not match its exact finding coordinates`);
    }
    if (identities.has(expectedIdentity)) {
      throw new Error(`duplicate secret-scanning finding identity: ${expectedIdentity}`);
    }
    identities.add(expectedIdentity);
    return finding;
  });

  const sorted = normalized.map((finding) => finding.findingIdentity).sort();
  if (
    JSON.stringify(normalized.map((finding) => finding.findingIdentity)) !==
    JSON.stringify(sorted)
  ) {
    throw new Error("secret-scanning findings must be sorted by findingIdentity");
  }

  return baseline;
}

export function readSecretScanningBaseline(
  baselinePath = path.resolve("config/secret-scanning-baseline.json"),
) {
  const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  return validateSecretScanningBaseline(parsed);
}

export function writeGitleaksIgnoreFile(baseline, outputPath) {
  const validated = validateSecretScanningBaseline(baseline);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${validated.findings.map((finding) => finding.findingIdentity).join("\n")}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

function parseOutputPath(argv) {
  const outputArgument = argv.find((argument) => argument.startsWith("--output="));
  if (!outputArgument) throw new Error("--output=<path> is required");
  const outputPath = outputArgument.slice("--output=".length);
  if (!path.isAbsolute(outputPath)) throw new Error("--output must be an absolute path");
  return outputPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseline = readSecretScanningBaseline();
  const outputPath = parseOutputPath(process.argv.slice(2));
  writeGitleaksIgnoreFile(baseline, outputPath);
  console.log(`Prepared ${baseline.findings.length} exact secret-scanning baseline identities`);
}
