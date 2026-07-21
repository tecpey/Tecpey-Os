import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const files = {
  authority: "src/lib/security/sensitive-mutation-audit.ts",
  inventory:
    "docs/security/generated/sensitive-mutation-audit-domain-inventory.json",
  policy: "docs/security/AUDIT_DATA_RETENTION_AND_ACCESS_POLICY.md",
  classification: "docs/security/LEGACY_AUDIT_CALLER_CLASSIFICATION.md",
};

const [authoritySource, inventorySource, policySource, classificationSource] =
  await Promise.all([
    readFile(files.authority, "utf8"),
    readFile(files.inventory, "utf8"),
    readFile(files.policy, "utf8"),
    readFile(files.classification, "utf8"),
  ]);

const failures = [];
const inventory = JSON.parse(inventorySource);

function parseStringUnion(typeName) {
  const marker = `export type ${typeName} =`;
  const start = authoritySource.indexOf(marker);
  if (start < 0) {
    failures.push(`${files.authority}: missing ${typeName}`);
    return [];
  }
  const end = authoritySource.indexOf(";", start);
  if (end < 0) {
    failures.push(`${files.authority}: unterminated ${typeName}`);
    return [];
  }
  return [...authoritySource.slice(start, end).matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    actual.length === required.length &&
    required.every((key, index) => key === actual[index])
  );
}

function duplicates(values) {
  const seen = new Set();
  const duplicateSet = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicateSet.add(value);
    seen.add(value);
  }
  return [...duplicateSet].sort();
}

function compareExactSets(label, authorityValues, inventoryValues) {
  const authoritySet = new Set(authorityValues);
  const inventorySet = new Set(inventoryValues);
  const missing = authorityValues.filter((value) => !inventorySet.has(value));
  const unknown = inventoryValues.filter((value) => !authoritySet.has(value));
  if (missing.length > 0) {
    failures.push(
      `${files.inventory}: missing ${label} values: ${missing.sort().join(", ")}`,
    );
  }
  if (unknown.length > 0) {
    failures.push(
      `${files.inventory}: unknown ${label} values: ${unknown.sort().join(", ")}`,
    );
  }
  if (authoritySet.size !== inventorySet.size) {
    failures.push(`${files.inventory}: ${label} union/registry cardinality differs`);
  }
}

async function exists(path) {
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

function literalActionsPassedToSensitiveWriters(source) {
  const actions = [];
  const writerCall =
    /\b(?:writeSensitiveMutationAuditTx|writeWithdrawalExternalEffectEvidenceTx)\s*\([\s\S]{0,1200}?\baction\s*:\s*["']([a-z0-9_.]+)["']/gi;
  for (const match of source.matchAll(writerCall)) actions.push(match[1]);
  return actions;
}

if (
  inventory.schemaVersion !== 1 ||
  inventory.policyVersion !== "sensitive-mutation-audit-domain-inventory-v1" ||
  typeof inventory.usagePolicy !== "string" ||
  !Array.isArray(inventory.actions) ||
  !Array.isArray(inventory.resources)
) {
  failures.push(`${files.inventory}: invalid registry envelope`);
}

const actionUnion = parseStringUnion("SensitiveMutationAuditAction");
const resourceUnion = parseStringUnion("SensitiveMutationAuditResource");
const actionEntries = Array.isArray(inventory.actions) ? inventory.actions : [];
const resourceEntries = Array.isArray(inventory.resources)
  ? inventory.resources
  : [];
const sensitivities = new Set(["internal", "confidential", "restricted"]);

for (const entry of actionEntries) {
  if (
    !exactKeys(entry, ["action", "domainOwner", "evidenceClass", "sensitivity"]) ||
    typeof entry.action !== "string" ||
    typeof entry.domainOwner !== "string" ||
    entry.domainOwner.length < 3 ||
    typeof entry.evidenceClass !== "string" ||
    entry.evidenceClass.length < 3 ||
    !sensitivities.has(entry.sensitivity)
  ) {
    failures.push(
      `${files.inventory}: malformed action classification ${String(entry?.action)}`,
    );
  }
}

for (const entry of resourceEntries) {
  if (
    !exactKeys(entry, ["resource", "domainOwner", "dataCategory", "sensitivity"]) ||
    typeof entry.resource !== "string" ||
    typeof entry.domainOwner !== "string" ||
    entry.domainOwner.length < 3 ||
    typeof entry.dataCategory !== "string" ||
    entry.dataCategory.length < 3 ||
    !sensitivities.has(entry.sensitivity)
  ) {
    failures.push(
      `${files.inventory}: malformed resource classification ${String(entry?.resource)}`,
    );
  }
}

const inventoryActions = actionEntries.map((entry) => entry.action);
const inventoryResources = resourceEntries.map((entry) => entry.resource);
for (const value of duplicates(inventoryActions)) {
  failures.push(`${files.inventory}: duplicate action ${value}`);
}
for (const value of duplicates(inventoryResources)) {
  failures.push(`${files.inventory}: duplicate resource ${value}`);
}
compareExactSets("action", actionUnion, inventoryActions);
compareExactSets("resource", resourceUnion, inventoryResources);

const roots = ["src", "scripts"];
const sourcePaths = [];
for (const root of roots) {
  if (await exists(root)) sourcePaths.push(...(await listSourceFiles(root)));
}

for (const path of sourcePaths) {
  const sourcePath = normalized(path);
  if (
    sourcePath === files.authority ||
    sourcePath === "scripts/check-sensitive-audit-domain-inventory.mjs" ||
    sourcePath.includes("/tests/") ||
    sourcePath.includes("/stubs/") ||
    sourcePath.includes("/fixtures/")
  ) {
    continue;
  }
  const source = await readFile(path, "utf8");

  for (const action of literalActionsPassedToSensitiveWriters(source)) {
    if (!inventoryActions.includes(action)) {
      failures.push(`${sourcePath}: unknown sensitive audit writer action ${action}`);
    }
  }

  if (
    sourcePath.startsWith("src/app/") &&
    /\b(?:sensitive_mutation_audit_events|audit_events)\b/.test(source)
  ) {
    failures.push(`${sourcePath}: application route cannot access raw audit tables`);
  }

  if (
    /\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\s+(?:IF\s+EXISTS\s+)?(?:sensitive_mutation_audit_events|audit_events)\b/i.test(
      source,
    )
  ) {
    failures.push(`${sourcePath}: governed audit tables cannot be removed`);
  }
}

for (const invariant of [
  "audit-data-retention-access-v1",
  "final duration pending Legal/Compliance approval",
  "no automatic deletion",
  "no public or end-user audit API",
  "ticketed purpose",
  "encrypted transport and encrypted storage",
  "legal-hold override",
  "No archival or deletion implementation is authorized",
  "Legal owner",
  "Compliance/Privacy owner",
  "Historical `audit_events`",
  "not mandatory mutation evidence",
]) {
  if (!policySource.includes(invariant)) {
    failures.push(`${files.policy}: missing policy invariant ${invariant}`);
  }
}

if (/\b\d+\s*(?:day|days|month|months|year|years)\b/i.test(policySource)) {
  failures.push(
    `${files.policy}: retention duration requires explicit legal approval and policy migration`,
  );
}

for (const invariant of [
  "Source-level legacy audit channel removed",
  "Historical `audit_events` preservation",
  "audit_events retained; non-authoritative for sensitive mutation proof",
]) {
  if (!classificationSource.includes(invariant)) {
    failures.push(`${files.classification}: missing classification invariant ${invariant}`);
  }
}

if (failures.length > 0) {
  console.error("Sensitive audit domain inventory failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Sensitive audit domain inventory passed: exact typed coverage for ${actionUnion.length} actions and ${resourceUnion.length} resources, with governed writer/table/retention boundaries.`,
);
