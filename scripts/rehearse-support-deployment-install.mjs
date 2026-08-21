#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const zipPath = process.argv[2] || process.env.TECPEY_SUPPORT_BUNDLE_ZIP;
const shaPath =
  process.argv[3] ||
  process.env.TECPEY_SUPPORT_BUNDLE_SHA256 ||
  (zipPath ? `${zipPath}.sha256` : undefined);

if (!zipPath) {
  console.error(
    "Usage: node scripts/rehearse-support-deployment-install.mjs <bundle.zip> [bundle.zip.sha256]",
  );
  process.exit(1);
}

function unzip(args, options = {}) {
  return execFileSync("unzip", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

function fail(message) {
  throw new Error(message);
}

function requireText(source, expected, message) {
  if (!source.includes(expected)) fail(message);
}

function requireOrdered(source, tokens, message) {
  let cursor = -1;
  for (const token of tokens) {
    const index = source.indexOf(token, cursor + 1);
    if (index < 0) fail(`${message}: missing ${token}`);
    if (index <= cursor) fail(message);
    cursor = index;
  }
}

function assertPortableEntries(entries) {
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/");
    const parts = normalized.split("/");
    if (
      entry !== normalized ||
      path.isAbsolute(normalized) ||
      parts.includes("..") ||
      normalized.startsWith("../")
    ) {
      fail(`Unsafe bundle entry path: ${entry}`);
    }
  }
}

execFileSync(
  process.execPath,
  [path.join(root, "scripts", "verify-support-deployment-bundle.mjs"), zipPath, shaPath],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const entries = unzip(["-Z1", zipPath])
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);
assertPortableEntries(entries);

const roots = new Set(entries.map((entry) => entry.split("/")[0]).filter(Boolean));
if (roots.size !== 1) fail(`Expected exactly one top-level bundle root, found ${roots.size}`);
const [bundleRoot] = [...roots];
const releaseShaMatch = /^tecpey-deployment-([0-9a-f]{40})$/.exec(bundleRoot ?? "");
if (!releaseShaMatch) fail(`Unexpected bundle root: ${bundleRoot}`);
const releaseSha = releaseShaMatch[1];

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tecpey-support-install-rehearsal-"));
try {
  unzip(["-q", zipPath, "-d", tempRoot]);
  const candidateRoot = path.join(tempRoot, bundleRoot);

  const readCandidateFile = async (relativePath) => {
    const absolutePath = path.join(candidateRoot, relativePath);
    if (!absolutePath.startsWith(`${candidateRoot}${path.sep}`)) {
      fail(`Refusing to read outside candidate root: ${relativePath}`);
    }
    if (!fs.existsSync(absolutePath)) fail(`Missing rehearsed candidate file: ${relativePath}`);
    return readFile(absolutePath, "utf8");
  };

  if (fs.existsSync(path.join(candidateRoot, ".env.production"))) {
    fail("Rehearsal candidate must not contain .env.production");
  }
  if (!fs.existsSync(path.join(candidateRoot, ".env.production.example"))) {
    fail("Rehearsal candidate must include .env.production.example");
  }

  const packageJson = JSON.parse(await readCandidateFile("package.json"));
  for (const [scriptName, command] of Object.entries({
    "support:bundle": "bash scripts/create-support-deployment-bundle.sh",
    "support:bundle:verify": "node scripts/verify-support-deployment-bundle.mjs",
    "support:install:rehearse": "node scripts/rehearse-support-deployment-install.mjs",
    "support:install:check": "node scripts/check-support-install-readiness-authority.mjs",
    "env:check":
      "node scripts/validate-env.mjs && node --import tsx scripts/validate-csp-connection-env.ts && node --import tsx scripts/validate-alert-webhook-env.ts",
    build:
      "next build && npm run build:server",
    health: "node scripts/check-health.mjs",
  })) {
    if (packageJson.scripts?.[scriptName] !== command) {
      fail(`package.json script ${scriptName} must be exactly: ${command}`);
    }
  }

  const manifest = await readCandidateFile("SUPPORT_BUNDLE_MANIFEST.txt");
  requireText(manifest, `Release SHA: ${releaseSha}`, "Manifest release SHA mismatch");
  requireText(
    manifest,
    "docs/operations/SUPPORT_INSTALL_READINESS_CONTRACT.md",
    "Manifest must point to the support install readiness contract",
  );
  requireText(
    manifest,
    "scripts/rehearse-support-deployment-install.mjs",
    "Manifest must point to the clean-room rehearsal script",
  );

  const handoff = await readCandidateFile("docs/operations/SUPPORT_TEAM_DEPLOYMENT_HANDOFF.md");
  requireText(
    handoff,
    "Clean-Room Install Rehearsal",
    "Handoff must define the release-owner clean-room rehearsal",
  );
  requireText(
    handoff,
    "npm run support:install:rehearse -- tecpey-deployment-RELEASE_SHA.zip tecpey-deployment-RELEASE_SHA.zip.sha256",
    "Handoff must require the support install rehearsal command",
  );
  requireOrdered(
    handoff,
    [
      "sha256sum -c tecpey-deployment-RELEASE_SHA.zip.sha256",
      "sudo -u tecpey unzip tecpey-deployment-RELEASE_SHA.zip -d /var/www/tecpey-candidates",
      "bash scripts/ubuntu24-preflight.sh candidate",
      "bash scripts/ubuntu24-preflight.sh migrate",
      "bash scripts/ubuntu24-preflight.sh runtime",
    ],
    "Handoff must keep checksum, unpack, candidate, migration and runtime checks in order",
  );

  const preflight = await readCandidateFile("scripts/ubuntu24-preflight.sh");
  for (const token of [
    'readonly VERIFICATION_PHASE="${1:-}"',
    "candidate|migrate|runtime) ;;",
    "readonly SYSTEMD_LIVE_WORKTREE=/var/www/tecpey",
    "git status --short --untracked-files=all",
    "read_bundle_release_sha",
    "SUPPORT_BUNDLE_MANIFEST.txt",
    'PATH="$SYSTEMD_COMMAND_PATH" "$SYSTEMD_NPM_BIN" ci --no-audit --no-fund',
    'NODE_ENV=production "$SYSTEMD_NODE_BIN" --env-file=.env.production',
    "dist/run-production-bootstrap.cjs migrate",
    "http://127.0.0.1:3000/api/health",
  ]) {
    requireText(preflight, token, `Preflight is missing required install contract: ${token}`);
  }

  const verifier = await readCandidateFile("scripts/verify-support-deployment-bundle.mjs");
  for (const token of [
    "SUPPORT_BUNDLE_MANIFEST.txt",
    "docs/operations/SUPPORT_INSTALL_READINESS_CONTRACT.md",
    "scripts/rehearse-support-deployment-install.mjs",
    "zip sha256 does not match the detached sha256 file",
    "forbidden bundle entry detected",
  ]) {
    requireText(verifier, token, `Bundle verifier is missing required contract: ${token}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        releaseSha,
        rehearsedRoot: `${bundleRoot}/`,
        checks: [
          "detached checksum verified",
          "candidate unpacked into isolated temp directory",
          "secret-bearing production env excluded",
          "support runbook command order verified",
          "preflight phase boundary verified",
          "bundle verifier contract verified",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
