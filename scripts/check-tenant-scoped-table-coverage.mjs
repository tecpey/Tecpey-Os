// Tenant-scoped table coverage authority — issue #109.
//
// Every table that carries tenant_id must be enrolled in one of the fixed,
// reviewable registry fragments below. The gate merges those fragments into one
// authority set, rejects duplicates across files, verifies proven claims point at
// real tests that mention the table, and checks two-way drift against live
// migration sources. The registry list is an explicit allowlist — adding an
// arbitrary JSON file does not enroll tables unless this gate is reviewed too.

import { readFile, readdir } from "node:fs/promises";

const REGISTRY_PATHS = Object.freeze([
  "docs/security/tenant-scoped-table-registry.json",
  "docs/security/tenant-scoped-table-registry.identity.json",
]);
const MIGRATIONS_DIR = "src/lib";
const VALID_PROOF_STATES = new Set(["pending", "proven"]);

const failures = [];

function tenantScopedTablesIn(source) {
  const tables = new Set();

  const createPattern = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/g;
  let match;
  while ((match = createPattern.exec(source)) !== null) {
    const [, name, body] = match;
    if (/\btenant_id\b/.test(body)) tables.add(name);
  }

  const alterPattern = /ALTER TABLE (\w+)([\s\S]*?);/g;
  while ((match = alterPattern.exec(source)) !== null) {
    const [, name, body] = match;
    if (/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?tenant_id\b/.test(body)) tables.add(name);
  }

  return tables;
}

const migrationFiles = (await readdir(MIGRATIONS_DIR)).filter(
  (file) => file.startsWith("db-migrate") && file.endsWith(".ts"),
);

const liveTables = new Set();
for (const file of migrationFiles) {
  const source = await readFile(`${MIGRATIONS_DIR}/${file}`, "utf8");
  for (const table of tenantScopedTablesIn(source)) liveTables.add(table);
}

const registryDocuments = [];
for (const registryPath of REGISTRY_PATHS) {
  try {
    const parsed = JSON.parse(await readFile(registryPath, "utf8"));
    registryDocuments.push({ registryPath, parsed });
  } catch (error) {
    failures.push(`cannot read ${registryPath}: ${error.message}`);
  }
}

const registered = new Map();
for (const { registryPath, parsed } of registryDocuments) {
  for (const entry of parsed.tables ?? []) {
    if (typeof entry.table !== "string" || !entry.table) {
      failures.push(`${registryPath}: a registry entry is missing its table name`);
      continue;
    }

    const previous = registered.get(entry.table);
    if (previous) {
      failures.push(
        `${entry.table}: registered more than once across ${previous.registryPath} and ${registryPath}`,
      );
      continue;
    }

    registered.set(entry.table, { ...entry, registryPath });

    if (!entry.isolationModel) {
      failures.push(`${entry.table}: missing isolationModel`);
    }
    if (!VALID_PROOF_STATES.has(entry.adversarialProof)) {
      failures.push(
        `${entry.table}: adversarialProof must be one of ${[...VALID_PROOF_STATES].join(", ")}`,
      );
    }

    if (entry.adversarialProof === "proven") {
      if (!entry.testReference) {
        failures.push(`${entry.table}: adversarialProof "proven" requires a testReference`);
      } else if (!/^src\/tests\/.*\.(test|integration)\.[jt]s$/.test(entry.testReference)) {
        failures.push(
          `${entry.table}: testReference ${entry.testReference} must be a test file under src/tests/ (…​.test.ts or …​.integration.ts)`,
        );
      } else {
        const contents = await readFile(entry.testReference, "utf8").catch(() => null);
        if (contents === null) {
          failures.push(`${entry.table}: testReference ${entry.testReference} does not exist`);
        } else if (!contents.includes(entry.table)) {
          failures.push(
            `${entry.table}: testReference ${entry.testReference} does not mention ${entry.table} — the proof must be tied to the registered table`,
          );
        }
      }
    }
  }
}

const registryAuthorityLabel = REGISTRY_PATHS.join(", ");
for (const table of [...liveTables].sort()) {
  if (!registered.has(table)) {
    failures.push(
      `${table}: has a tenant_id column but is not in the tenant-scoped registry authority (${registryAuthorityLabel}) — register it with its isolation model and proof status`,
    );
  }
}
for (const table of registered.keys()) {
  if (!liveTables.has(table)) {
    failures.push(
      `${table}: registered as tenant-scoped but no migration defines it with a tenant_id column`,
    );
  }
}

if (failures.length) {
  console.error("Tenant-scoped table coverage check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const proven = [...registered.values()].filter(
  (entry) => entry.adversarialProof === "proven",
).length;
console.log(
  `Tenant-scoped table coverage check passed: ${liveTables.size} tenant-scoped tables all registered ` +
    `across ${REGISTRY_PATHS.length} fixed registry fragments ` +
    `(${proven} with proven cross-tenant negative tests, ${liveTables.size - proven} pending under #109).`,
);
