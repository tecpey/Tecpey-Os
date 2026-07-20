import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";

const ROOT = realpathSync(process.cwd());
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.split("=");
    return [key, value.join("=") || true];
  }),
);

function git(...gitArgs) {
  return execFileSync("git", gitArgs, {
    cwd: ROOT,
    encoding: gitArgs.includes("-z") ? "buffer" : "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}

function trackedPaths() {
  const output = git("ls-files", "-z");
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function lineCount(buffer) {
  if (buffer.length === 0) return 0;
  let lines = 0;
  for (const byte of buffer) {
    if (byte === 10) lines += 1;
  }
  return lines + (buffer.at(-1) === 10 ? 0 : 1);
}

const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".eot",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".tar",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

const FORCE_TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".env",
  ".graphql",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

function isText(path, buffer) {
  const extension = extname(path).toLowerCase();
  if (FORCE_TEXT_EXTENSIONS.has(extension)) return true;
  if (BINARY_EXTENSIONS.has(extension)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192));
  return !sample.includes(0);
}

function isGenerated(path) {
  const name = basename(path);
  return (
    name === "package-lock.json" ||
    name === "pnpm-lock.yaml" ||
    name === "yarn.lock" ||
    path.endsWith(".min.js") ||
    path.endsWith(".min.css") ||
    path.includes("/__generated__/") ||
    path.startsWith("generated/")
  );
}

function domainFor(path) {
  if (path.startsWith(".github/")) return "governance-ci";
  if (path.startsWith("docs/")) return "documentation";
  if (path.startsWith("scripts/")) return "engineering-operations";
  if (path.startsWith("public/") || path.startsWith("src/assets/")) return "static-assets";
  if (/academy/i.test(path)) return "academy";
  if (/arena|trading-arena|journal/i.test(path)) return "trading-arena";
  if (/mentor|\bai[-_/]/i.test(path)) return "mentor-ai";
  if (/wallet|withdraw|deposit|custody|keystore|chain/i.test(path)) return "wallet-custody";
  if (/exchange|order|matching|ledger|balance|market-data|trade/i.test(path)) return "exchange-financial";
  if (/auth|session|csrf|passkey|webauthn|permission|admin|security/i.test(path)) return "identity-security";
  if (/tenant|workspace|membership/i.test(path)) return "multi-tenant";
  if (/notification|push|inbox/i.test(path)) return "notifications";
  if (/crm|lead|campaign/i.test(path)) return "crm";
  if (/social|community|reputation/i.test(path)) return "social-reputation";
  if (/db|migration|postgres|redis|queue|bullmq/i.test(path)) return "data-infrastructure";
  if (path.startsWith("src/app/api/")) return "api-platform";
  if (path.startsWith("src/app/") || path.startsWith("src/components/")) return "product-ui";
  if (path.startsWith("src/tests/") || /\.test\.[cm]?[jt]sx?$/.test(path)) return "testing";
  if (path.startsWith("src/lib/")) return "platform-core";
  if (/docker|nginx|systemd|deploy|server\.ts|instrumentation/i.test(path)) return "runtime-deployment";
  if (/package|tsconfig|eslint|next\.config|postcss|tailwind|\.env/i.test(path)) return "supply-chain-config";
  return "repository-root";
}

function reviewBatchFor(domain) {
  const batches = {
    "governance-ci": 1,
    "repository-root": 1,
    "supply-chain-config": 1,
    "runtime-deployment": 1,
    "engineering-operations": 1,
    "data-infrastructure": 2,
    "identity-security": 3,
    "multi-tenant": 3,
    academy: 4,
    "trading-arena": 5,
    "exchange-financial": 6,
    "wallet-custody": 7,
    "mentor-ai": 8,
    crm: 9,
    notifications: 9,
    "social-reputation": 9,
    "product-ui": 10,
    "static-assets": 10,
    "api-platform": 3,
    "platform-core": 3,
    testing: 12,
    documentation: 12,
  };
  return batches[domain] ?? 12;
}

function riskFor(path, domain, text) {
  if (!text && domain === "static-assets") return "low";
  if (
    path === "package.json" ||
    path === "package-lock.json" ||
    path === "server.ts" ||
    path.startsWith(".github/workflows/") ||
    path.startsWith("src/app/api/") ||
    /migration|db-migrate|auth|session|csrf|security|tenant|permission|admin|exchange|order|matching|ledger|balance|wallet|withdraw|custody|keystore/i.test(path)
  ) {
    return "critical";
  }
  if (
    [
      "mentor-ai",
      "crm",
      "notifications",
      "trading-arena",
      "academy",
      "data-infrastructure",
      "runtime-deployment",
    ].includes(domain)
  ) {
    return "high";
  }
  if (["product-ui", "platform-core", "api-platform", "testing"].includes(domain)) {
    return "medium";
  }
  return "low";
}

function fileType(path, text, generated, symbolicLink) {
  if (symbolicLink) return "symlink";
  if (generated) return text ? "generated-text" : "generated-binary";
  if (!text) return "binary";
  const extension = extname(path).toLowerCase();
  return extension ? `text:${extension.slice(1)}` : "text:no-extension";
}

function ensureInsideRoot(path) {
  const absolute = resolve(ROOT, path);
  const repositoryRelative = relative(ROOT, absolute);
  if (repositoryRelative.startsWith("..") || repositoryRelative === "") {
    throw new Error(`Unsafe repository path: ${path}`);
  }
  return absolute;
}

const commit = git("rev-parse", "HEAD").trim();
const paths = trackedPaths();
const seen = new Set();
const files = [];

for (const path of paths) {
  if (seen.has(path)) throw new Error(`Duplicate tracked path: ${path}`);
  seen.add(path);

  const absolute = ensureInsideRoot(path);
  const stats = lstatSync(absolute);
  const symbolicLink = stats.isSymbolicLink();
  const buffer = readFileSync(absolute);
  const text = symbolicLink || isText(path, buffer);
  const generated = isGenerated(path);
  const domain = domainFor(path);
  const lines = text ? lineCount(buffer) : null;

  files.push({
    path,
    bytes: buffer.length,
    lines,
    digestSha256: sha256(buffer),
    classification: fileType(path, text, generated, symbolicLink),
    text,
    binary: !text,
    generated,
    symbolicLink,
    domain,
    risk: riskFor(path, domain, text),
    reviewBatch: reviewBatchFor(domain),
    reviewStatus: "unreviewed",
    semanticEvidence: null,
    findings: { p0: 0, p1: 0, p2: 0, p3: 0 },
    remediation: [],
    reviewedCommit: null,
  });
}

if (files.length !== paths.length) {
  throw new Error(`Inventory mismatch: ${files.length} entries for ${paths.length} tracked paths`);
}

const aggregate = (key) =>
  Object.fromEntries(
    [...new Set(files.map((file) => String(file[key])))]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => [value, files.filter((file) => String(file[key]) === value).length]),
  );

const inventory = {
  schemaVersion: 1,
  repository: "tecpey/Tecpey-Os",
  commit,
  generatedAt: new Date().toISOString(),
  source: "git ls-files -z",
  totals: {
    trackedFiles: files.length,
    textualFiles: files.filter((file) => file.text).length,
    binaryFiles: files.filter((file) => file.binary).length,
    generatedFiles: files.filter((file) => file.generated).length,
    symbolicLinks: files.filter((file) => file.symbolicLink).length,
    textLines: files.reduce((total, file) => total + (file.lines ?? 0), 0),
    bytes: files.reduce((total, file) => total + file.bytes, 0),
  },
  counts: {
    domain: aggregate("domain"),
    risk: aggregate("risk"),
    reviewBatch: aggregate("reviewBatch"),
    classification: aggregate("classification"),
  },
  files,
};

function markdownReport() {
  const rows = Object.entries(inventory.counts.domain)
    .map(([domain, count]) => `| ${domain} | ${count} |`)
    .join("\n");

  return `# TecPey Repository Audit Inventory\n\n` +
    `- Repository: \`${inventory.repository}\`\n` +
    `- Exact commit: \`${inventory.commit}\`\n` +
    `- Tracked files: **${inventory.totals.trackedFiles}**\n` +
    `- Textual files: **${inventory.totals.textualFiles}**\n` +
    `- Binary files: **${inventory.totals.binaryFiles}**\n` +
    `- Generated files: **${inventory.totals.generatedFiles}**\n` +
    `- Text lines: **${inventory.totals.textLines}**\n` +
    `- Total bytes: **${inventory.totals.bytes}**\n\n` +
    `## Domain denominator\n\n| Domain | Files |\n|---|---:|\n${rows}\n\n` +
    `The JSON artifact is the authoritative per-path denominator. A generated inventory is not semantic review evidence.\n`;
}

function writeOutput(target, content) {
  const absolute = resolve(ROOT, String(target));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

const json = `${JSON.stringify(inventory, null, 2)}\n`;
const markdown = markdownReport();

if (args.has("--json")) writeOutput(args.get("--json"), json);
if (args.has("--markdown")) writeOutput(args.get("--markdown"), markdown);

if (!args.has("--json") && !args.has("--markdown")) {
  process.stdout.write(markdown);
}
