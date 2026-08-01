import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const GATE = "scripts/check-tenant-scoped-table-coverage.mjs";
const REGISTRY = "docs/security/tenant-scoped-table-registry.json";

function runGate() {
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, out: "" };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

test("passes on the committed registry", () => {
  const { code } = runGate();
  assert.equal(code, 0);
});

test("fails when a CREATE-declared tenant-scoped table is not registered", () => {
  const probe = "src/lib/db-migrate-zzz-coverage-probe.ts";
  writeFileSync(
    probe,
    "export const x = `CREATE TABLE IF NOT EXISTS coverage_probe_table (\n" +
      "  id UUID PRIMARY KEY, tenant_id TEXT NOT NULL, payload TEXT\n);`;\n",
  );
  try {
    const { code, out } = runGate();
    assert.equal(code, 1);
    assert.match(out, /coverage_probe_table: has a tenant_id column but is not in/);
  } finally {
    rmSync(probe, { force: true });
  }
});

test("fails when a table is tenant-scoped by ALTER TABLE and not registered", () => {
  const probe = "src/lib/db-migrate-zzz-alter-probe.ts";
  writeFileSync(
    probe,
    "export const x = `CREATE TABLE IF NOT EXISTS alter_probe_table (id UUID PRIMARY KEY);\n" +
      "ALTER TABLE alter_probe_table ADD COLUMN IF NOT EXISTS tenant_id TEXT;`;\n",
  );
  try {
    const { code, out } = runGate();
    assert.equal(code, 1);
    assert.match(out, /alter_probe_table: has a tenant_id column but is not in/);
  } finally {
    rmSync(probe, { force: true });
  }
});

test("fails when a registered table no longer exists", () => {
  const original = readFileSync(REGISTRY, "utf8");
  const registry = JSON.parse(original);
  registry.tables.push({
    table: "ghost_registered_table",
    domain: "x",
    sourceFile: "x",
    isolationModel: "tenant_id column",
    adversarialProof: "pending",
    issue: "#109",
  });
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
  try {
    const { code, out } = runGate();
    assert.equal(code, 1);
    assert.match(out, /ghost_registered_table: registered as tenant-scoped but no migration/);
  } finally {
    writeFileSync(REGISTRY, original);
  }
});

test('rejects a "proven" claim whose testReference is not a test file', () => {
  const original = readFileSync(REGISTRY, "utf8");
  const registry = JSON.parse(original);
  registry.tables[0].adversarialProof = "proven";
  registry.tables[0].testReference = "package.json";
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
  try {
    const { code, out } = runGate();
    assert.equal(code, 1);
    assert.match(out, /must be a test file under src\/tests\//);
  } finally {
    writeFileSync(REGISTRY, original);
  }
});

test('rejects a "proven" claim whose testReference does not mention the table', () => {
  const original = readFileSync(REGISTRY, "utf8");
  const registry = JSON.parse(original);
  registry.tables[0].adversarialProof = "proven";
  registry.tables[0].testReference =
    "src/tests/trading/exchange-reconciliation-postgres.test.ts";
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
  try {
    const { code, out } = runGate();
    assert.equal(code, 1);
    assert.match(out, /does not mention .* the proof must be tied to the registered table/);
  } finally {
    writeFileSync(REGISTRY, original);
  }
});
