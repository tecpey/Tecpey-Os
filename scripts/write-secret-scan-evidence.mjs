import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readSecretScanningBaseline } from "./secret-scanning-baseline.mjs";

const COMMIT_SHA = /^[0-9a-f]{40}$/;

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((candidate) => candidate.startsWith(prefix));
  if (!argument) throw new Error(`${prefix}<value> is required`);
  return argument.slice(prefix.length);
}

function requireCommitSha(value, label) {
  if (!COMMIT_SHA.test(value)) throw new Error(`${label} must be a lowercase full commit SHA`);
  return value;
}

const reportPath = path.resolve(argumentValue("report"));
const outputPath = path.resolve(argumentValue("output"));
const sourceCommitSha = requireCommitSha(argumentValue("source-sha"), "source-sha");
const sourceTreeSha = requireCommitSha(argumentValue("source-tree"), "source-tree");
const scanExitCode = Number.parseInt(argumentValue("scan-exit-code"), 10);
const detectorRuleId = argumentValue("detector-rule");

if (!Number.isSafeInteger(scanExitCode) || scanExitCode < 0 || scanExitCode > 255) {
  throw new Error("scan-exit-code must be an integer between 0 and 255");
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(detectorRuleId)) {
  throw new Error("detector-rule is not canonical");
}

const reportBytes = fs.readFileSync(reportPath);
const findings = JSON.parse(reportBytes.toString("utf8"));
if (!Array.isArray(findings)) throw new Error("Gitleaks report must be a JSON array");
for (const [index, finding] of findings.entries()) {
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
    throw new Error(`Gitleaks report finding ${index} must be an object`);
  }
  if (finding.Secret !== "REDACTED") {
    throw new Error(`Gitleaks report finding ${index} is not fully redacted`);
  }
}

const baseline = readSecretScanningBaseline();
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceCommitSha,
  sourceTreeSha,
  scope: "all-reachable-git-history",
  scanner: {
    name: baseline.scanner.name,
    version: baseline.scanner.version,
    releaseCommit: baseline.scanner.releaseCommit,
    linuxX64ArchiveSha256: baseline.scanner.linuxX64ArchiveSha256,
    defaultConfigSha256: baseline.scanner.defaultConfigSha256,
  },
  baseline: {
    reviewedAt: baseline.reviewedAt,
    exactFindingIdentities: baseline.findings.length,
  },
  detectorSelfTest: {
    detected: true,
    ruleId: detectorRuleId,
  },
  scan: {
    exitCode: scanExitCode,
    conclusion:
      scanExitCode === 0 ? "no-unreviewed-findings" : scanExitCode === 1 ? "findings" : "tool-error",
    findingCount: findings.length,
    ruleIds: [...new Set(findings.map((finding) => finding.RuleID))].sort(),
    redactedReportSha256: crypto.createHash("sha256").update(reportBytes).digest("hex"),
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(
  `Secret scan evidence: ${result.scan.conclusion}, ${result.scan.findingCount} unreviewed findings`,
);
