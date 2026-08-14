import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";

import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

// Governance for the tenant-less children of academy_students (#20).
//
// docs/security/student-derived-table-classification.json records the
// multi-tenant model each of these tables should follow. This test keeps the
// registry honest against the live schema on both sides: a tenant-less FK child
// of academy_students that is missing from the registry fails here, so a new
// such table cannot ship unclassified; and a registered table that no longer
// exists, or has since gained a tenant_id column, fails too — because a table
// that graduates to a real tenant column belongs in tenant-scoped-table-
// registry.json, not described here as if it still had none.
//
// The one exception is the row deliberately marked tenant_partitioned + pending:
// it is a tenant-less table today (so it still belongs to this registry) that is
// scheduled to gain a boundary. It must stay tenant-less until that slice lands.

const databaseUrl = process.env.DATABASE_URL?.trim();
const configured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
let pool: Pool | null = null;

const ROOT = path.resolve(import.meta.dirname, "../../..");

type Verdict = "student_global" | "tenant_partitioned";
type ClassifiedTable = {
  table: string;
  domain: string;
  verdict: Verdict;
  status?: string;
  reason: string;
};

async function registry(): Promise<{ tables: ClassifiedTable[] }> {
  const raw = await readFile(
    path.join(ROOT, "docs/security/student-derived-table-classification.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

/** Every FK child of academy_students that carries no tenant_id column. */
async function tenantlessStudentChildren(): Promise<string[]> {
  const client = await pool!.connect();
  try {
    const { rows } = await client.query<{ tbl: string }>(
      `SELECT DISTINCT con.conrelid::regclass::text AS tbl
         FROM pg_constraint con
        WHERE con.contype = 'f'
          AND con.confrelid = 'academy_students'::regclass
          AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns c
             WHERE c.table_name = con.conrelid::regclass::text
               AND c.column_name = 'tenant_id')`,
    );
    // conrelid::regclass can schema-qualify; the registry uses bare names.
    return rows.map((r) => r.tbl.replace(/^public\./, "")).sort();
  } finally {
    client.release();
  }
}

async function hasTenantColumn(table: string): Promise<boolean> {
  const client = await pool!.connect();
  try {
    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = $1 AND column_name = 'tenant_id'
       ) AS exists`,
      [table],
    );
    return rows[0]?.exists ?? false;
  } finally {
    client.release();
  }
}

before(async () => {
  if (!configured || !databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    await applyDatabaseMigrationsWithLock(client);
  } finally {
    client.release();
  }
});

after(async () => {
  const closing = pool;
  pool = null;
  if (!closing) return;
  await Promise.race([
    closing.end(),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
});

describe("Student-derived table classification", () => {
  it("classifies every field with a known verdict and a reason", async () => {
    const { tables } = await registry();
    assert.ok(tables.length > 0);
    for (const entry of tables) {
      assert.ok(entry.table, "each entry names a table");
      assert.ok(
        entry.verdict === "student_global" || entry.verdict === "tenant_partitioned",
        `${entry.table} has an unknown verdict: ${entry.verdict}`,
      );
      assert.ok(entry.reason && entry.reason.length > 20, `${entry.table} needs a reason`);
      // Only a tenant_partitioned row may carry a status, and only "pending":
      // a student_global table has nothing to schedule.
      if (entry.status !== undefined) {
        assert.equal(entry.verdict, "tenant_partitioned", `${entry.table} status on a global table`);
        assert.equal(entry.status, "pending", `${entry.table} has an unexpected status`);
      }
    }
    // No table is classified twice.
    const names = tables.map((t) => t.table);
    assert.deepEqual(names, [...new Set(names)], "a table is classified more than once");
  });

  it(
    "matches the tenant-less FK children of academy_students exactly",
    { skip: !configured, timeout: 45_000 },
    async () => {
      const { tables } = await registry();
      const classified = tables.map((t) => t.table).sort();
      const onDisk = await tenantlessStudentChildren();

      const missing = onDisk.filter((t) => !classified.includes(t));
      const stale = classified.filter((t) => !onDisk.includes(t));
      assert.deepEqual(
        missing,
        [],
        "a tenant-less child of academy_students is not classified — add it to the registry",
      );
      assert.deepEqual(
        stale,
        [],
        "a classified table no longer exists or has gained a tenant_id — reclassify or move it",
      );
    },
  );

  it(
    "keeps every student_global table genuinely tenant-less",
    { skip: !configured, timeout: 45_000 },
    async () => {
      // A student_global classification is a claim that the table has no
      // per-row tenant. If one quietly gained a tenant_id, the claim is false
      // and the row belongs in tenant-scoped-table-registry.json instead.
      const { tables } = await registry();
      for (const entry of tables.filter((t) => t.verdict === "student_global")) {
        assert.equal(
          await hasTenantColumn(entry.table),
          false,
          `${entry.table} is classified student_global but now has a tenant_id column`,
        );
      }
    },
  );
});
