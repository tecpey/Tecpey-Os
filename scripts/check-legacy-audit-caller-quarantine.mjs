import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const deletedWithdrawalService = "src/lib/security/withdrawal-service.ts";
const files = {
  audit: "src/lib/security/audit-log.ts",
  apiKeyAuth: "src/lib/security/api-key-auth.ts",
  classification: "docs/security/LEGACY_AUDIT_CALLER_CLASSIFICATION.md",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(path, "utf8"),
    ]),
  ),
);

const failures = [];

function requireText(target, text, reason) {
  if (!content[target].includes(text)) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function rejectText(target, text, reason) {
  if (content[target].includes(text)) {
    failures.push(`${files[target]}: ${reason}`);
  }
}

function balancedObject(source, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function callObjectBlock(source, marker) {
  const callStart = source.indexOf(marker);
  if (callStart < 0) return "";
  const objectStart = source.indexOf("{", callStart);
  return objectStart >= 0 ? balancedObject(source, objectStart) : "";
}

function containsStoredKey(block, names) {
  return new RegExp(`\\b(?:${names.join("|")})\\s*(?=:|[,}])`).test(block);
}

async function listSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listSourceFiles(path);
      return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

function normalizePath(path) {
  return relative(".", path).split(sep).join("/");
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

if (await pathExists(deletedWithdrawalService)) {
  failures.push(
    `${deletedWithdrawalService}: deleted dormant Withdrawal service must remain absent`,
  );
}

const sourcePaths = await listSourceFiles("src");
const sourceEntries = await Promise.all(
  sourcePaths.map(async (path) => [normalizePath(path), await readFile(path, "utf8")]),
);
const sourceByPath = new Map(sourceEntries);

requireText(
  "audit",
  'LEGACY_AUDIT_TELEMETRY_AUTHORITY = "non-authoritative"',
  "legacy writer must be explicitly non-authoritative",
);
requireText(
  "audit",
  "@deprecated Non-authoritative, best-effort telemetry only.",
  "legacy writer must carry a deprecation contract",
);
requireText(
  "audit",
  "cannot satisfy security,",
  "legacy writer must state that it cannot prove mandatory evidence",
);
requireText(
  "audit",
  "Storage failure is swallowed here by design",
  "best-effort failure semantics must remain explicit",
);

requireText(
  "apiKeyAuth",
  'LEGACY_SIGNED_API_KEY_AUTHORITY =\n  "inactive-non-authoritative"',
  "signed API-key adapter must remain explicitly inactive",
);
requireText(
  "apiKeyAuth",
  'action: "api_key_auth_rejected"',
  "rejected authentication telemetry needs truthful semantics",
);
requireText(
  "apiKeyAuth",
  'update("tecpey-legacy-signed-api-key-telemetry-v1\\0")',
  "telemetry identity must be a domain-separated fingerprint",
);
requireText(
  "apiKeyAuth",
  'telemetryVersion: "legacy-signed-api-key-rejection-v1"',
  "legacy telemetry must be versioned",
);
rejectText(
  "apiKeyAuth",
  'action: "api_key_created"',
  "authentication rejection must not impersonate a credential mutation",
);
rejectText(
  "apiKeyAuth",
  "rawKey.slice(",
  "raw API-key prefixes are forbidden in telemetry identity",
);
rejectText(
  "apiKeyAuth",
  "submittedTs",
  "exact submitted timestamps are forbidden in rejection telemetry",
);

const telemetryObject = callObjectBlock(content.apiKeyAuth, "writeAudit(");
if (!telemetryObject) {
  failures.push(
    `${files.apiKeyAuth}: classified rejection telemetry object is missing`,
  );
}
if (
  containsStoredKey(telemetryObject, [
    "rawApiKey",
    "rawKey",
    "signature",
    "submittedSignature",
    "rawBody",
    "timestampMs",
    "authorization",
    "cookie",
    "secret",
  ])
) {
  failures.push(
    `${files.apiKeyAuth}: rejection telemetry stores raw credential or request material`,
  );
}

const classifiedWriteAuditPaths = new Set([
  "src/lib/security/audit-log.ts",
  "src/lib/security/api-key-auth.ts",
]);
for (const [path, source] of sourceByPath.entries()) {
  const hasLegacyCall = /\bwriteAudit\s*\(/.test(source);
  const importsLegacyAudit = /["'][^"']*audit-log["']/.test(source);
  if (
    (hasLegacyCall || importsLegacyAudit) &&
    !classifiedWriteAuditPaths.has(path)
  ) {
    failures.push(
      `${path}: new legacy audit import/call is forbidden outside the classified compatibility set`,
    );
  }

  if (
    path !== "src/lib/security/api-key-auth.ts" &&
    /(?:import|export)[\s\S]*?["'][^"']*api-key-auth["']/.test(source)
  ) {
    failures.push(`${path}: dormant signed API-key adapter must not be imported`);
  }

  if (
    /from\s+["'][^"']*withdrawal-service["']/.test(source) ||
    /import\s*\([^)]*withdrawal-service/.test(source) ||
    /require\s*\([^)]*withdrawal-service/.test(source) ||
    /export\s+[\s\S]*?from\s+["'][^"']*withdrawal-service["']/.test(source)
  ) {
    failures.push(`${path}: deleted Withdrawal legacy service must not be referenced`);
  }
}

for (const [symbol, owner] of [
  ["validateSignedApiKeyRequest", "src/lib/security/api-key-auth.ts"],
  ["hasApiKeyHeaders", "src/lib/security/api-key-auth.ts"],
  ["getAuditLog", "src/lib/security/audit-log.ts"],
]) {
  const symbolPattern = new RegExp(`\\b${symbol}\\b`);
  const externalReferences = [...sourceByPath.entries()]
    .filter(([path]) => path !== owner)
    .filter(([, source]) => symbolPattern.test(source))
    .map(([path]) => path);
  if (externalReferences.length > 0) {
    failures.push(
      `${owner}: dormant export ${symbol} is referenced by ${externalReferences.join(
        ", ",
      )}`,
    );
  }
}

const apiKeyLegacyCalls =
  content.apiKeyAuth.match(/\bwriteAudit\s*\(/g)?.length ?? 0;
if (apiKeyLegacyCalls !== 1) {
  failures.push(
    `${files.apiKeyAuth}: expected one centralized classified writeAudit call, found ${apiKeyLegacyCalls}`,
  );
}

for (const invariant of [
  "Every remaining production-source `writeAudit()` site",
  "Signed API-key rejection telemetry is the only production caller",
  "Withdrawal legacy service removed",
  "No production-source `writeAudit()` site remains in Withdrawal",
  "Deprecated best-effort writer",
  "api_key_auth_rejected",
  "Historical read-only compatibility helper",
  "#161 remains open",
]) {
  requireText(
    "classification",
    invariant,
    `legacy caller inventory is missing: ${invariant}`,
  );
}

if (failures.length > 0) {
  console.error("Legacy audit caller quarantine failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Legacy audit caller quarantine passed: the dormant Withdrawal legacy service and its audit calls remain deleted, signed API-key rejection telemetry is the only production caller, and historical reads remain non-authoritative.",
);
