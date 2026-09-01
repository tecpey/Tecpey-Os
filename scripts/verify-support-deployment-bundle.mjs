#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const zipPath = process.argv[2] || process.env.TECPEY_SUPPORT_BUNDLE_ZIP;
const shaPath =
  process.argv[3] ||
  process.env.TECPEY_SUPPORT_BUNDLE_SHA256 ||
  (zipPath ? `${zipPath}.sha256` : undefined);

if (!zipPath) {
  console.error(
    "Usage: node scripts/verify-support-deployment-bundle.mjs <bundle.zip> [bundle.zip.sha256]",
  );
  process.exit(1);
}
if (!existsSync(zipPath)) {
  console.error(`Support deployment bundle zip not found: ${zipPath}`);
  process.exit(1);
}

function unzip(args, options = {}) {
  return execFileSync("unzip", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

const entries = unzip(["-Z1", zipPath])
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);

const failures = [];

function fail(message) {
  failures.push(message);
}

function hasEntry(suffix) {
  return entries.some((entry) => entry.endsWith(suffix));
}

const roots = new Set(entries.map((entry) => entry.split("/")[0]).filter(Boolean));
if (roots.size !== 1) {
  fail(`bundle must contain exactly one top-level directory, found ${roots.size}`);
}

const [bundleRoot] = [...roots];
const expectedRootMatch = /^tecpey-deployment-([0-9a-f]{40})$/.exec(bundleRoot ?? "");
if (!expectedRootMatch) {
  fail(`top-level directory must be tecpey-deployment-<40-char-sha>, found ${bundleRoot}`);
}
const expectedReleaseSha = expectedRootMatch?.[1];

for (const required of [
  "SUPPORT_BUNDLE_MANIFEST.txt",
  "package.json",
  ".env.production.example",
  "DEPLOY_UBUNTU_24_PRODUCTION.md",
  "docs/security/SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
  "docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md",
  "docs/operations/SUPPORT_INSTALL_READINESS_CONTRACT.md",
  "docs/operations/STAGING_READINESS_EVIDENCE_CONTRACT.md",
  "docs/architecture/TECPEY_CONTENT_GROWTH_AUTOMATION_CONTRACT.md",
  "scripts/create-support-deployment-bundle.sh",
  "scripts/rehearse-support-deployment-install.mjs",
  "scripts/check-support-install-readiness-authority.mjs",
  "scripts/support-install-readiness-policy.mjs",
  "scripts/install-news-materialization-scheduler.sh",
  "scripts/check-news-materialization-env.ts",
  "scripts/run-news-materialization-worker.ts",
  "scripts/verify-news-materialization-last-run.ts",
  "deploy/systemd/tecpey-news-materialization.service.in",
  "deploy/systemd/tecpey-news-materialization.timer",
  "deploy/systemd/tecpey-organic-growth-trend.service.in",
  "deploy/systemd/tecpey-organic-growth-trend.timer",
  "scripts/install-organic-growth-trend-scheduler.sh",
  "scripts/check-organic-growth-trend-env.ts",
  "scripts/run-organic-growth-trend-worker.ts",
  "docs/assets/brand/brand-assets.json",
  "docs/assets/brand/source/tecpey-tp-icon-uploaded.png",
  "docs/assets/brand/source/tecpey-tp-icon-compact-uploaded.png",
  "docs/assets/brand/tecpey-logo-official.png",
  "public/images/tecpey-logo.png",
  "public/logo.png",
]) {
  if (!hasEntry(`/${required}`)) fail(`required bundle entry is missing: ${required}`);
}

for (const entry of entries) {
  const relative = entry.startsWith(`${bundleRoot}/`) ? entry.slice(bundleRoot.length + 1) : entry;
  if (
    relative === ".git" ||
    relative.startsWith(".git/") ||
    relative === "node_modules" ||
    relative.includes("/node_modules/") ||
    relative === ".next" ||
    relative.startsWith(".next/") ||
    relative === "dist" ||
    relative.startsWith("dist/") ||
    relative === ".env" ||
    relative === ".env.local" ||
    relative === ".env.production" ||
    relative.endsWith(".env.production") ||
    relative.endsWith(".pem") ||
    relative.endsWith(".key") ||
    relative.endsWith(".dump") ||
    /(?:^|\/)(?:dump|backup|database-dump|db-dump)[\w.-]*\.sql$/i.test(relative)
  ) {
    fail(`forbidden bundle entry detected: ${relative}`);
  }
}

let manifest = "";
try {
  manifest = unzip(["-p", zipPath, `${bundleRoot}/SUPPORT_BUNDLE_MANIFEST.txt`]);
} catch (error) {
  fail(`unable to read SUPPORT_BUNDLE_MANIFEST.txt: ${error.message}`);
}

if (manifest) {
  const normalizedManifest = manifest.replace(/\s+/g, " ");
  const hasManifestToken = (token) =>
    manifest.includes(token) || normalizedManifest.includes(token.replace(/\s+/g, " "));

  if (!hasManifestToken("TecPey support deployment bundle")) {
    fail("manifest is missing the TecPey support deployment bundle title");
  }
  if (expectedReleaseSha && !hasManifestToken(`Release SHA: ${expectedReleaseSha}`)) {
    fail("manifest release SHA does not match the bundle top-level directory");
  }
  for (const token of [
    "Proprietary source bundle exception",
    "Source bundle exception approved: 1",
    "No ownership, resale, sublicensing, redistribution, reverse-engineering, or competing use is granted.",
    "docs/security/SOURCE_CODE_OWNERSHIP_AND_DELIVERY_POLICY.md",
    "docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md",
    "docs/operations/SUPPORT_INSTALL_READINESS_CONTRACT.md",
    "scripts/rehearse-support-deployment-install.mjs",
    "support:install:rehearse",
    "deploy/systemd/tecpey-news-materialization.service.in",
    "deploy/systemd/tecpey-news-materialization.timer",
    "scripts/install-news-materialization-scheduler.sh",
    "deploy/systemd/tecpey-organic-growth-trend.service.in",
    "deploy/systemd/tecpey-organic-growth-trend.timer",
    "scripts/install-organic-growth-trend-scheduler.sh",
    "scripts/check-organic-growth-trend-env.ts",
    "scripts/run-organic-growth-trend-worker.ts",
    "docs/assets/brand/brand-assets.json",
    "TECPEY_SOURCE_BUNDLE_EXCEPTION_APPROVED=1",
    "Never add .env.production",
  ]) {
    if (!hasManifestToken(token)) fail(`manifest is missing required token: ${token}`);
  }
}

if (shaPath && existsSync(shaPath)) {
  const shaText = await readFile(shaPath, "utf8");
  const shaLines = shaText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (shaLines.length !== 1) {
    fail(`sha256 file must contain exactly one checksum line: ${shaPath}`);
  }

  const checksumMatch = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(shaLines[0] ?? "");
  const expectedSha256 = checksumMatch?.[1];
  const checksumFilename = checksumMatch?.[2];
  const expectedFilename = path.basename(zipPath);

  if (!checksumMatch || !expectedSha256) {
    fail(`sha256 file does not contain a valid '<digest> <filename>' line: ${shaPath}`);
  } else if (checksumFilename !== expectedFilename) {
    fail(
      `sha256 file must reference the portable zip basename '${expectedFilename}', found '${checksumFilename}'`,
    );
  } else {
    const actualSha256 = createHash("sha256")
      .update(await readFile(zipPath))
      .digest("hex");
    if (expectedSha256 !== actualSha256) {
      fail("zip sha256 does not match the detached sha256 file");
    }
  }
} else {
  fail(`detached sha256 file is missing: ${shaPath ?? "<not provided>"}`);
}

if (failures.length) {
  console.error("Support deployment bundle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      bundle: path.resolve(zipPath),
      releaseSha: expectedReleaseSha,
      entries: entries.length,
      manifest: `${bundleRoot}/SUPPORT_BUNDLE_MANIFEST.txt`,
      sha256File: path.resolve(shaPath),
    },
    null,
    2,
  ),
);
