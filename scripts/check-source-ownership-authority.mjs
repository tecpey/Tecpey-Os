import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const files = {
  policy: "docs/security/SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
  license: "LICENSE",
  supportHandoff: "docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md",
  productionContract: "docs/operations/PRODUCTION_DEPLOYMENT_CONTRACT.md",
  ipRegistry: "docs/IP_REGISTRY.md",
  whiteLabel: "docs/WHITE_LABEL_PLATFORM.md",
  bundleScript: "scripts/create-support-deployment-bundle.sh",
  bundleVerifier: "scripts/verify-support-deployment-bundle.mjs",
  packageJson: "package.json",
  prTemplate: ".github/PULL_REQUEST_TEMPLATE.md",
  ci: ".github/workflows/ci.yml",
};

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required ownership authority file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

const sources = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

function requireText(fileKey, token, reason) {
  const source = sources[fileKey];
  const normalizedSource = source.replace(/^>\s?/gm, "").replace(/\s+/g, " ");
  const normalizedToken = token.replace(/\s+/g, " ");
  if (!source.includes(token) && !normalizedSource.includes(normalizedToken)) {
    failures.push(`${files[fileKey]}: ${reason}`);
  }
}

function requireRegex(fileKey, regex, reason) {
  if (!regex.test(sources[fileKey])) {
    failures.push(`${files[fileKey]}: ${reason}`);
  }
}

for (const token of [
  "TecPey Source Code Ownership and Controlled Delivery Policy",
  "TecPey is proprietary software",
  "controlled artifact delivery",
  "full source bundles are emergency or staging exceptions only",
  "TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED=1",
  "White-label means a licensed tenant experience under a customer brand",
  "no real secrets, tokens, private keys, wallet keys, database dumps, PII",
  "Every support handoff must include this notice",
  "No ownership, resale, sublicensing, redistribution, reverse-engineering, or competing use is granted.",
]) {
  requireText("policy", token, `missing ownership policy invariant: ${token}`);
}

for (const token of [
  "PROPRIETARY LICENSE",
  "Copyright (c) 2024-2026 TechnoPardakht. All rights reserved.",
  "You may NOT copy, modify, merge, publish, distribute, sublicense, or sell",
  "You may NOT reverse-engineer, decompile, disassemble",
]) {
  requireText("license", token, `missing proprietary license invariant: ${token}`);
}

for (const token of [
  "docs/security/SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
  "Source bundles are not the default delivery model",
  "No ownership, resale, sublicensing, redistribution, reverse-engineering, or competing use is granted.",
  "TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED=1",
  "immutable production supply-chain evidence or as a white-label resale package",
]) {
  requireText("supportHandoff", token, `missing support handoff ownership boundary: ${token}`);
}

for (const token of [
  "artifact-first",
  "Full source archives are not production supply-chain artifacts",
  "SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
]) {
  requireText("productionContract", token, `missing production delivery boundary: ${token}`);
}

for (const token of [
  "Controlled Source Delivery",
  "SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
  "not full source transfer",
  "recipient accountability",
]) {
  requireText("ipRegistry", token, `missing IP registry ownership invariant: ${token}`);
}

for (const token of [
  "licensed platform use right, not a source-code or IP transfer",
  "SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
  "do not receive permission to resell, sublicense, redistribute, reverse-engineer",
]) {
  requireText("whiteLabel", token, `missing white-label commercial boundary: ${token}`);
}

for (const token of [
  "TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED",
  "Refusing to create a source deployment bundle without explicit exception approval",
  "Proprietary source bundle exception",
  "SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
  "No ownership, resale, sublicensing, redistribution, reverse-engineering, or competing use is granted.",
]) {
  requireText("bundleScript", token, `missing source bundle guard: ${token}`);
}

for (const token of [
  "docs/security/SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
  "TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED=1",
  "Proprietary source bundle exception",
  "No ownership, resale, sublicensing, redistribution, reverse-engineering, or competing use is granted.",
]) {
  requireText("bundleVerifier", token, `missing source bundle verifier guard: ${token}`);
}

requireText("packageJson", "\"ip:ownership:check\"", "package.json must expose ip:ownership:check");
requireText("prTemplate", "Source/IP ownership", "PR template must ask reviewers about source/IP ownership");
requireText("ci", "Source ownership authority guard", "CI must run the source ownership authority guard");
requireRegex("ci", /npm run ip:ownership:check/, "CI must execute npm run ip:ownership:check");

if (failures.length > 0) {
  console.error("TecPey source ownership authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "TecPey source ownership authority check passed: proprietary license, controlled delivery policy, support handoff, production contract, IP registry, white-label boundary, source bundle exception guard, verifier, PR template and CI are synchronized.",
);
