import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const deletedPaths = [
  "src/lib/security/withdrawal-service.ts",
  "src/lib/security/api-key-auth.ts",
  "src/lib/security/audit-log.ts",
];

const files = {
  classification: "docs/security/LEGACY_AUDIT_CALLER_CLASSIFICATION.md",
  signedPolicy: "docs/security/SIGNED_API_AUTH_LAUNCH_POLICY.md",
  featureRegistry: "docs/FEATURE_REGISTRY.md",
  implementationGate: "docs/FINAL_IMPLEMENTATION_GATE.md",
  securityBlockers: "docs/SECURITY_BLOCKERS.md",
  hardeningPlan: "docs/PRODUCTION_HARDENING_MASTER_PLAN.md",
  apiKeysAuthority: "src/lib/security/api-keys.ts",
  apiKeysRoute: "src/app/api/api-keys/route.ts",
  apiKeyByIdRoute: "src/app/api/api-keys/[id]/route.ts",
  apiKeyPostgresTests:
    "src/tests/security/api-key-transactional-audit-postgres.test.ts",
  historicalMigration: "src/lib/db-migrate.ts",
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

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
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

function normalized(path) {
  return relative(".", path).split(sep).join("/");
}

for (const deletedPath of deletedPaths) {
  if (await pathExists(deletedPath)) {
    failures.push(`${deletedPath}: deleted legacy source must remain absent`);
  }
}

const productionRoots = ["src/app", "src/lib", "src/components", "src/workers"];
const productionPaths = [];
for (const root of productionRoots) {
  if (await pathExists(root)) productionPaths.push(...(await listSourceFiles(root)));
}

for (const path of productionPaths) {
  const source = await readFile(path, "utf8");
  const sourcePath = normalized(path);

  if (/\bwriteAudit\s*\(/.test(source)) {
    failures.push(`${sourcePath}: production writeAudit caller is forbidden`);
  }

  for (const deletedModule of [
    "withdrawal-service",
    "api-key-auth",
    "audit-log",
  ]) {
    if (
      new RegExp(`from\\s+["'][^"']*${deletedModule}["']`).test(source) ||
      new RegExp(`import\\s*\\([^)]*${deletedModule}`).test(source) ||
      new RegExp(`require\\s*\\([^)]*${deletedModule}`).test(source) ||
      new RegExp(
        `export\\s+[\\s\\S]*?from\\s+["'][^"']*${deletedModule}["']`,
      ).test(source)
    ) {
      failures.push(
        `${sourcePath}: deleted legacy module ${deletedModule} must not be referenced`,
      );
    }
  }

  for (const deletedSymbol of [
    "validateSignedApiKeyRequest",
    "hasApiKeyHeaders",
    "getAuditLog",
  ]) {
    if (new RegExp(`\\b${deletedSymbol}\\b`).test(source)) {
      failures.push(
        `${sourcePath}: deleted legacy symbol ${deletedSymbol} must not be referenced`,
      );
    }
  }

  if (
    sourcePath.startsWith("src/app/") &&
    /x-tecpey-(?:apikey|timestamp|signature)/i.test(source)
  ) {
    failures.push(
      `${sourcePath}: signed API authentication headers are launch-disabled`,
    );
  }

  if (/\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\s+(?:IF\s+EXISTS\s+)?audit_events\b/i.test(source)) {
    failures.push(
      `${sourcePath}: historical audit_events data cannot be removed by source cleanup`,
    );
  }
}

for (const invariant of [
  "Source-level legacy audit channel removed",
  "No production-source `writeAudit()` implementation, import or caller remains",
  "Historical `audit_events` preservation",
  "Signed HMAC API-key request authentication is launch-disabled",
  "Production source legacy audit callers:",
  "audit_events retained; non-authoritative for sensitive mutation proof",
  "#161 remains open",
]) {
  requireText(
    "classification",
    invariant,
    `final legacy classification is missing: ${invariant}`,
  );
}

for (const invariant of [
  "Launch-disabled / not implemented",
  "API-key credential lifecycle — active",
  "Signed API request authentication — disabled",
  "Mandatory sensitive audit — active",
  "Historical `audit_events` — retained data",
  "SB-003 is closed for soft launch by **surface elimination**",
  "Future activation requirements",
  "No existing credential automatically becomes valid",
]) {
  requireText(
    "signedPolicy",
    invariant,
    `signed API launch policy is missing: ${invariant}`,
  );
}

for (const invariant of [
  "API Key Credential Lifecycle",
  "Signed API Request Authentication",
  "Launch Disabled",
  "withdrawal-read-authority.ts",
  "sensitive-mutation-audit.ts",
  "Historical audit_events retained",
]) {
  requireText(
    "featureRegistry",
    invariant,
    `feature registry current state is missing: ${invariant}`,
  );
}
rejectText(
  "featureRegistry",
  "src/lib/security/api-key-auth.ts",
  "feature registry must not point to deleted signed-auth adapter",
);
rejectText(
  "featureRegistry",
  "src/lib/security/withdrawal-service.ts",
  "feature registry must not point to deleted Withdrawal service",
);

for (const invariant of [
  "Signed API authentication surface disabled",
  "Dormant signed-auth adapter absent",
  "Future activation requires a new P0 security review",
  "API-key credential lifecycle remains transactionally evidenced",
]) {
  requireText(
    "implementationGate",
    invariant,
    `final implementation gate is missing: ${invariant}`,
  );
}
rejectText(
  "implementationGate",
  "api-key-auth.ts",
  "final implementation gate must not cite deleted adapter as active evidence",
);

for (const invariant of [
  "SB-003 — Signed API Authentication Surface Eliminated",
  "Status: Closure candidate — pending merge and security review",
  "No signed API authentication route is exposed",
  "Dormant adapter removed",
  "Future activation is blocked by governance",
]) {
  requireText(
    "securityBlockers",
    invariant,
    `SB-003 closure record is missing: ${invariant}`,
  );
}
rejectText(
  "securityBlockers",
  "src/lib/security/api-key-auth.ts",
  "current blocker record must not point to deleted adapter",
);

for (const invariant of [
  "Signed API authentication — launch-disabled",
  "No signed API endpoint is exposed",
  "Credential lifecycle remains active",
  "Surface elimination closes SB-003 for soft launch",
]) {
  requireText(
    "hardeningPlan",
    invariant,
    `hardening plan correction is missing: ${invariant}`,
  );
}
rejectText(
  "hardeningPlan",
  "src/lib/security/api-key-auth.ts",
  "current hardening plan must not point to deleted adapter",
);

for (const invariant of [
  "writeSensitiveMutationAuditTx(client",
  'action: "api_key.create"',
  'action: "api_key.enable"',
  'action: "api_key.disable"',
  'action: "api_key.rotate"',
  'action: "api_key.delete"',
  "assertAuditActor",
  "credentialFingerprint",
]) {
  requireText(
    "apiKeysAuthority",
    invariant,
    `active API-key credential authority is missing: ${invariant}`,
  );
}
rejectText(
  "apiKeysAuthority",
  "writeAudit(",
  "active API-key lifecycle cannot use deleted best-effort audit",
);

for (const target of ["apiKeysRoute", "apiKeyByIdRoute"]) {
  requireText(
    target,
    "getCanonicalSession(req, { strictRevocation: true })",
    "API-key lifecycle route must use strict canonical identity",
  );
  requireText(
    target,
    "resolveSensitiveAuditCorrelation",
    "API-key lifecycle route must bind mandatory evidence correlation",
  );
  rejectText(
    target,
    "x-tecpey-apikey",
    "credential-management route must not become signed request authentication",
  );
}

for (const evidence of [
  "commits credential creation and mandatory evidence atomically",
  "rolls back API key creation when mandatory audit admission is invalid",
  "prevents replayed rotation from committing a second credential version",
  "transactionally records disable, enable and delete lifecycle evidence",
]) {
  requireText(
    "apiKeyPostgresTests",
    evidence,
    `API-key transactional evidence test is missing: ${evidence}`,
  );
}

requireText(
  "historicalMigration",
  "audit_events",
  "historical audit_events schema must remain in canonical migration history",
);
if (/\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\s+(?:IF\s+EXISTS\s+)?audit_events\b/i.test(content.historicalMigration)) {
  failures.push(
    `${files.historicalMigration}: canonical migration history must preserve audit_events`,
  );
}

if (failures.length > 0) {
  console.error("Legacy audit and signed API launch guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Legacy audit and signed API launch guard passed: dormant source adapters remain deleted, production writeAudit callers are zero, signed API authentication is launch-disabled, API-key credential lifecycle remains transactionally evidenced, and historical audit_events data remains preserved.",
);
