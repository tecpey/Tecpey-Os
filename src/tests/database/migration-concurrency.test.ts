import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  applyDatabaseMigrationsWithLock,
  DATABASE_MIGRATION_LOCK_KEYS,
} from "../../lib/db-migration-plan";
import { checkMigrationReadiness } from "../../lib/db-migration-readiness";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

describe("PostgreSQL migration concurrency", { skip: !databaseConfigured }, () => {
  it("times out observably instead of waiting indefinitely for another runner", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const holder = await pool.connect();
    const contender = await pool.connect();
    try {
      await holder.query("SELECT pg_advisory_lock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
      await assert.rejects(
        applyDatabaseMigrationsWithLock(contender, { lockTimeoutMs: 150 }),
        /migration_lock_timeout:150/,
      );
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
      holder.release();
      contender.release();
      await pool.end();
    }
  });

  it("serializes concurrent runners and leaves one current schema state", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await Promise.all([
        applyDatabaseMigrationsWithLock(first, { lockTimeoutMs: 30_000 }),
        applyDatabaseMigrationsWithLock(second, { lockTimeoutMs: 30_000 }),
      ]);
      assert.equal((await checkMigrationReadiness(first)).status, "current");
    } finally {
      first.release();
      second.release();
      await pool.end();
    }
  });
});
