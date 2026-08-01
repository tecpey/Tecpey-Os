// Tenant-scoped table coverage authority — issue #109.
//
// #109's core requirement is that every tenant-owned table has proven cross-tenant
// isolation. That is a large program. This gate closes the *first* hole in it: the
// silent one. Today a new table with a tenant_id column can ship, be mutated
// through a domain authority, and never appear in any isolation inventory — so
// nobody notices it lacks a negative test.
//
// The registry (`docs/security/tenant-scoped-table-registry.json`) names every
// tenant-scoped table, its database isolation model, and whether a cross-tenant
// negative test proves it. This gate enforces that the registry and the migrations
// never drift: a tenant_id table absent from the registry fails, and a registered
// table that no longer exists fails. It does not itself prove isolation — it makes
// the work queue impossible to lose.

import { readFile, readdir } from "node:fs/promises";

const REGISTRY_PATH = "docs/security/tenant-scoped-table-registry.json";
const MIGRATIONS_DIR = "src/lib";
const VALID_PROOF_STATES = new Set(["pending", "proven"]);

const failures = [];

// Extract every table whose CREATE TABLE body declares a tenant_id column, exactly
// as the registry generator does — this is the ground truth the registry tracks.
function tenantScopedTablesIn(source) {
  const tables = new Set();
  const pattern = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const [, name, body] = match;
    if (/\btenant_id\b/.test(body)) tables.add(name);
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

let registry;
try {
  registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
} catch (error) {
  console.error("Tenant-scoped table coverage check failed:");
  console.error(`- cannot read ${REGISTRY_PATH}: ${error.message}`);
  process.exit(1);
}

const registered = new Map();
for (const entry of registry.tables ?? []) {
  if (typeof entry.table !== "string" || !entry.table) {
    failures.push("a registry entry is missing its table name");
    continue;
  }
  if (registered.has(entry.table)) {
    failures.push(`${entry.table}: registered more than once`);
  }
  registered.set(entry.table, entry);

  if (!entry.isolationModel) {
    failures.push(`${entry.table}: missing isolationModel`);
  }
  if (!VALID_PROOF_STATES.has(entry.adversarialProof)) {
    failures.push(
      `${entry.table}: adversarialProof must be one of ${[...VALID_PROOF_STATES].join(", ")}`,
    );
  }
  // A "proven" claim must point at a test file that actually exists — the same
  // ratchet the other authority guards use, so proof cannot be asserted on paper.
  if (entry.adversarialProof === "proven") {
    if (!entry.testReference) {
      failures.push(`${entry.table}: adversarialProof "proven" requires a testReference`);
    } else {
      const exists = await readFile(entry.testReference, "utf8").then(
        () => true,
        () => false,
      );
      if (!exists) {
        failures.push(
          `${entry.table}: testReference ${entry.testReference} does not exist`,
        );
      }
    }
  }
}

// Two-way drift: every live tenant-scoped table must be registered, and every
// registered table must still exist.
for (const table of [...liveTables].sort()) {
  if (!registered.has(table)) {
    failures.push(
      `${table}: has a tenant_id column but is not in ${REGISTRY_PATH} — register it with its isolation model and proof status`,
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
    `(${proven} with proven cross-tenant negative tests, ${liveTables.size - proven} pending under #109).`,
);
