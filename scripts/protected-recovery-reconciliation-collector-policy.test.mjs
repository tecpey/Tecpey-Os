import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DOMAIN_TABLES,
  FINANCIAL_INVARIANT_QUERIES,
  RECOVERY_TENANT_REGISTRY_FRAGMENT_TABLES,
  assertFinancialInvariantCounts,
  assertSummariesMatch,
  assertTenantRegistryCoverage,
  combinedBackupDigest,
  summarizeDomain,
  tableFingerprintQuery,
} from "./protected-recovery-reconciliation-collector-policy.mjs";

test("covers every governed recovery domain with deterministic table membership", () => {
  assert.deepEqual(Object.keys(DOMAIN_TABLES), [
    "academy",
    "tradingArena",
    "mentorAi",
    "exchangeLedger",
    "notificationsOperationalJobs",
  ]);
  for (const tables of Object.values(DOMAIN_TABLES)) {
    assert.equal(tables.length > 0, true);
    assert.equal(new Set(tables).size, tables.length);
  }
});

test("binds protected recovery to the fixed identity tenant-registry fragment", async () => {
  const identityRegistry = JSON.parse(await readFile(
    new URL("../docs/security/tenant-scoped-table-registry.identity.json", import.meta.url),
    "utf8",
  ));
  const identityTables = identityRegistry.tables.map((entry) => entry.table).sort();
  assert.deepEqual(
    [...RECOVERY_TENANT_REGISTRY_FRAGMENT_TABLES].sort(),
    identityTables,
  );
  assert.equal(identityTables.length, 4);
});

test("builds a quoted aggregate fingerprint and rejects identifier injection", () => {
  const query = tableFingerprintQuery("academy_students");
  assert.match(query, /FROM "academy_students" AS candidate_row/);
  assert.match(query, /COUNT\(\*\)::text AS row_count/);
  assert.match(query, /md5\(to_jsonb\(candidate_row\)::text\)/);
  assert.throws(() => tableFingerprintQuery("academy_students; DROP TABLE orders"), /identifier_invalid/);
});

test("produces stable counts and digests independent of table input order", () => {
  const left = summarizeDomain([
    { table: "trades", rowCount: "3", rowDigest: "b".repeat(32) },
    { table: "orders", rowCount: "5", rowDigest: "a".repeat(32) },
  ], { financialDivergences: 0 });
  const right = summarizeDomain([
    { table: "orders", rowCount: 5, rowDigest: "a".repeat(32) },
    { table: "trades", rowCount: 3, rowDigest: "b".repeat(32) },
  ], { financialDivergences: 0 });
  assert.deepEqual(left, right);
  assert.deepEqual(left.rowCounts, {
    tablesCovered: 2,
    records: 8,
    nonEmptyTables: 2,
    financialDivergences: 0,
  });
  assertSummariesMatch(left, right, "exchangeLedger");
});

test("fails closed on source/restore drift and tenant registry drift", () => {
  const source = summarizeDomain([
    { table: "orders", rowCount: 1, rowDigest: "a".repeat(32) },
  ]);
  const restored = summarizeDomain([
    { table: "orders", rowCount: 2, rowDigest: "b".repeat(32) },
  ]);
  assert.throws(
    () => assertSummariesMatch(source, restored, "exchangeLedger"),
    /exchangeLedger_source_restore_mismatch/,
  );

  const primaryRegistry = ["academy_students", "mentor_profiles"];
  const expected = [
    ...primaryRegistry,
    ...RECOVERY_TENANT_REGISTRY_FRAGMENT_TABLES,
  ].sort();
  const runtime = [...expected].reverse();
  assert.deepEqual(
    assertTenantRegistryCoverage(primaryRegistry, runtime),
    expected,
  );
  assert.deepEqual(primaryRegistry, expected);

  assert.throws(
    () => assertTenantRegistryCoverage(
      ["academy_students"],
      ["academy_students", ...RECOVERY_TENANT_REGISTRY_FRAGMENT_TABLES, "unknown_scope"],
    ),
    /tenant_registry_runtime_drift/,
  );
});

test("requires every financial invariant to be present and zero", () => {
  const valid = Object.fromEntries(FINANCIAL_INVARIANT_QUERIES.map(({ name }) => [name, 0]));
  assert.deepEqual(assertFinancialInvariantCounts(valid), valid);
  assert.throws(
    () => assertFinancialInvariantCounts({ ...valid, orderQuantity: 1 }),
    /orderQuantity_financial_invariant_divergence/,
  );
  const missing = { ...valid };
  delete missing.tradeFeeLedger;
  assert.throws(() => assertFinancialInvariantCounts(missing), /financial_invariant_membership_invalid/);
});

test("binds both backup payloads into one deterministic digest", () => {
  const first = combinedBackupDigest("a".repeat(64), "b".repeat(64));
  const second = combinedBackupDigest("a".repeat(64), "b".repeat(64));
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.throws(() => combinedBackupDigest("short", "b".repeat(64)), /postgres_backup_digest_invalid/);
});