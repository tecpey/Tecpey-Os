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
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    expected.every((key, index) => key === keys[index])
  );
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function compareSets(label, authorityValues, inventoryValues) {
  const authoritySet = new Set(authorityValues);
  const inventorySet = new Set(inventoryValues);
  const missing = [...authoritySet].filter((value) => !inventorySet.has(value));
  const extra = [...inventorySet].filter((value) => !authoritySet.has(value));
  if (missing.length > 0) {
    failures.push(
      `${files.inventory}: missing ${label} values: ${missing.sort().join(", ")}`,
    );
  }
  if (extra.length > 0) {
    failures.push(
      `${files.inventory}: unknown ${label} values: ${extra.sort().join(", ")}`,
    );
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
const resourceUnion = parseStringUnion("SensitiveMutationResource");
const actionEntries = Array.isArray(inventory.actions) ? inventory.actions : [];
const resourceEntries = Array.isArray(inventory.resources)
  ? inventory.resources
  : [];

const sensitivities = new Set(["internal", "confidential", "restricted"]);
for (const entry of actionEntries) {
  if (
    !exactKeys(entry, ["action", "domainOwner", "evidenceClass", "sensitivity"])
  ) {
    failures.push(`${files.inventory}: malformed action inventory entry`);
    continue;
  }
  if (
    typeof entry.action !== "string" ||
    typeof entry.domainOwner !== "string" ||
    entry.domainOwner.length < 3 ||
    typeof entry.evidenceClass !== "string" ||
    entry.evidenceClass.length < 3 ||
    !sensitivities.has(entry.sensitivity)
  ) {
    failures.push(
      `${files.inventory}: incomplete action classification ${String(entry.action)}`,
    );
  }
}

for (const entry of resourceEntries) {
  if (
    !exactKeys(entry, ["dataCategory", "domainOwner", "resource", "sensitivity"])
  ) {
    failures.push(`${files.inventory}: malformed resource inventory entry`);
    continue;
  }
  if (
    typeof entry.resource !== "string" ||
    typeof entry.domainOwner !== "string" ||
    entry.domainOwner.length < 3 ||
    typeof entry.dataCategory !== "string" ||
    entry.dataCategory.length < 3 ||
    !sensitivities.has(entry.sensitivity)
  ) {
    failures.push(
      `${files.inventory}: incomplete resource classification ${String(entry.resource)}`,
    );
  }
}

const inventoryActions = actionEntries.map((entry) => entry.action);
const inventoryResources = resourceEntries.map((entry) => entry.resource);
for (const duplicate of duplicateValues(inventoryActions)) {
  failures.push(`${files.inventory}: duplicate action ${duplicate}`);
}
for (const duplicate of duplicateValues(inventoryResources)) {
  failures.push(`${files.inventory}: duplicate resource ${duplicate}`);
}
compareSets("action", actionUnion, inventoryActions);
compareSets("resource", resourceUnion, inventoryResources);

const productionRoots = [
  "src/app",
  "src/lib",
  "src/components",
  "src/workers",
  "scripts",
];
const sourcePaths = [];
for (const root of productionRoots) {
  if (await pathExists(root)) sourcePaths.push(...(await listSourceFiles(root)));
}

const activeActions = new Set();
const activeResources = new Set();
const governedPrefixes = new Set(
  inventoryActions.map((action) => action.split(".")[0]),
);

for (const path of sourcePaths) {
  const sourcePath = normalized(path);
  if (
    sourcePath === files.authority ||
    sourcePath === "scripts/check-sensitive-audit-domain-inventory.mjs" ||
    sourcePath.includes("/tests/") ||
    sourcePath.includes("/stubs/")
  ) {
    continue;
  }

  const source = await readFile(path, "utf8");
  for (const action of inventoryActions) {
    if (source.includes(`"${action}"`) || source.includes(`'${action}'`)) {
      activeActions.add(action);
    }
  }
  for (const resource of inventoryResources) {
    if (source.includes(`"${resource}"`) || source.includes(`'${resource}'`)) {
      activeResources.add(resource);
    }
  }

  for (const match of source.matchAll(/\baction\s*:\s*["']([a-z0-9_.]+)["']/gi)) {
    const action = match[1];
    if (
      action.includes(".") &&
      governedPrefixes.has(action.split(".")[0]) &&
      !inventoryActions.includes(action)
    ) {
      failures.push(`${sourcePath}: unknown governed audit action ${action}`);
    }
  }

  if (
    sourcePath.startsWith("src/app/") &&
    /\b(?:sensitive_mutation_audit_events|audit_events)\b/.test(source)
  ) {
    failures.push(
      `${sourcePath}: public/application route must not expose raw audit tables`,
    );
  }

  if (
    /\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\s+(?:IF\s+EXISTS\s+)?(?:sensitive_mutation_audit_events|audit_events)\b/i.test(
      source,
    )
  ) {
    failures.push(
      `${sourcePath}: governed audit tables cannot be removed by ordinary source`,
    );
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
    `${files.policy}: jurisdictional retention duration requires an explicit guard/policy-version migration`,
  );
}

for (const invariant of [
  "Source-level legacy audit channel removed",
  "Historical `audit_events` preservation",
  "audit_events retained; non-authoritative for sensitive mutation proof",
]) {
  if (!classificationSource.includes(invariant)) {
    failures.push(`${files.classification}: missing historical boundary ${invariant}`);
  }
}

if (failures.length > 0) {
  console.error("Sensitive mutation audit domain inventory failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const reservedActions = inventoryActions.filter(
  (action) => !activeActions.has(action),
);
const reservedResources = inventoryResources.filter(
  (resource) => !activeResources.has(resource),
);

console.log(
  `Sensitive mutation audit inventory passed: ${inventoryActions.length} actions (${activeActions.size} active, ${reservedActions.length} reserved) and ${inventoryResources.length} resources (${activeResources.size} active, ${reservedResources.length} reserved) are exactly classified; retention/access authority remains conservative and governed.`,
);
if (reservedActions.length > 0) {
  console.log(`Reserved actions: ${reservedActions.sort().join(", ")}`);
}
if (reservedResources.length > 0) {
  console.log(`Reserved resources: ${reservedResources.sort().join(", ")}`);
}
