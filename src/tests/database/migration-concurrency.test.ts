import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  applyDatabaseMigrationsWithLock,
  DATABASE_MIGRATION_LOCK_KEYS,
} from "../../lib/db-migration-plan";
import { checkMigrationReadiness } from "../../lib/db-migration-readiness";
import {
  DATABASE_MIGRATION_EXPECTATIONS,
  DATABASE_MIGRATION_PLAN_HASH,
} from "../../lib/db-migration-registry";
import { runAiMentorTrustMigrations } from "../../lib/db-migrate-ai-mentor-trust";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

async function withIsolatedDatabase(
  purpose: string,
  run: (isolatedDatabaseUrl: string) => Promise<void>,
): Promise<void> {
  const name = `tecpey_166_${purpose}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const adminUrl = new URL(databaseUrl!);
  adminUrl.pathname = "/postgres";
  const isolatedUrl = new URL(databaseUrl!);
  isolatedUrl.pathname = `/${name}`;
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    await run(isolatedUrl.toString());
  } finally {
    const sessions = await admin.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = $1",
      [name],
    );
    assert.equal(sessions.rows[0]?.count, 0, "isolated migration database must release every session");
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
}

async function waitForMigrationOperator(pool: Pool): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ active: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
          WHERE application_name = 'tecpey-database-migration-operator'
            AND datname = current_database()
            AND pid <> pg_backend_pid()
       ) AS active`,
    );
    if (result.rows[0]?.active) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("migration_operator_connection_not_observed");
}

async function waitForBlockedMigrationQuery(pool: Pool): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
          WHERE application_name = 'tecpey-database-migration-operator'
            AND datname = current_database()
            AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock'
            AND query LIKE '%CREATE TABLE IF NOT EXISTS mentor_ai_preferences%'
       ) AS blocked`,
    );
    if (result.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("in_flight_migration_query_not_observed");
}

describe("PostgreSQL migration concurrency", { skip: !databaseConfigured }, () => {
  it("times out observably instead of waiting indefinitely for another runner", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const holder = await pool.connect();
    const contender = await pool.connect();
    try {
      await holder.query("SELECT pg_advisory_lock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
      await assert.rejects(
        applyDatabaseMigrationsWithLock(contender, { lockTimeoutMs: 150 }),
        /migration_lock_timeout:150:holder:[0-9a-f-]+:state:(?:current|running|failed)/,
      );
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
      holder.release();
      contender.release();
      await pool.end();
    }
  });

  it("reports the lock-owning runner as migration_running to a waiting process", async () => {
    await withIsolatedDatabase("running", async (isolatedDatabaseUrl) => {
      const pool = new Pool({ connectionString: isolatedDatabaseUrl, max: 2 });
      const holder = await pool.connect();
      const observer = await pool.connect();
      const runnerId = "00000000-0000-4000-8000-000000000166";
      try {
        await applyDatabaseMigrationsWithLock(holder);
        await holder.query("SELECT pg_advisory_lock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
        await holder.query(
          `UPDATE _migration_runtime_state SET
             status = 'running', runner_id = $1, plan_hash = $2,
             started_at = NOW(), updated_at = NOW(), finished_at = NULL,
             ledger_digest = NULL, error_code = NULL, error_detail = NULL
           WHERE singleton = TRUE`,
          [runnerId, DATABASE_MIGRATION_PLAN_HASH],
        );
        const readiness = await checkMigrationReadiness(observer);
        assert.equal(readiness.status, "migration_running");
        assert.equal(readiness.runnerId, runnerId);
      } finally {
        await holder.query("SELECT pg_advisory_unlock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
        await applyDatabaseMigrationsWithLock(holder);
        holder.release();
        observer.release();
        await pool.end();
      }
    });
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
      const state = await first.query<{ status: string }>(
        "SELECT status FROM _migration_runtime_state WHERE singleton = TRUE",
      );
      assert.equal(state.rows[0]?.status, "current");
    } finally {
      first.release();
      second.release();
      await pool.end();
    }
  });

  it("records durable failure evidence and recovers deterministically", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const target = DATABASE_MIGRATION_EXPECTATIONS[0];
    const original = await client.query<{ checksum: string }>(
      "SELECT checksum FROM _migrations WHERE filename = $1",
      [target.identity],
    );
    await client.query("SELECT pg_advisory_lock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
    try {
      await client.query("UPDATE _migrations SET checksum = $1 WHERE filename = $2", [
        "0".repeat(16),
        target.identity,
      ]);
      await assert.rejects(
        applyDatabaseMigrationsWithLock(client),
        /migration_ledger_expected_checksum_mismatch:/,
      );
      const failed = await checkMigrationReadiness(client);
      assert.equal(failed.status, "migration_failed");
      assert.match(failed.errorCode ?? "", /checksum/i);

      await client.query("UPDATE _migrations SET checksum = $1 WHERE filename = $2", [
        original.rows[0].checksum,
        target.identity,
      ]);
      await applyDatabaseMigrationsWithLock(client);
      assert.equal((await checkMigrationReadiness(client)).status, "current");
    } finally {
      try {
        await client.query("UPDATE _migrations SET checksum = $1 WHERE filename = $2", [
          original.rows[0].checksum,
          target.identity,
        ]);
        await applyDatabaseMigrationsWithLock(client);
      } finally {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [
          ...DATABASE_MIGRATION_LOCK_KEYS,
        ]);
        client.release();
        await pool.end();
      }
    }
  });

  it("rolls back an interrupted migration transaction and recovers on rerun", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const target = DATABASE_MIGRATION_EXPECTATIONS.at(-1)!;
    await client.query("DELETE FROM _migration_runtime_ledger WHERE identity = $1", [target.identity]);
    await client.query("DELETE FROM _migrations WHERE filename = $1", [target.identity]);
    let migrationSqlObserved = false;
    const interruptedClient = new Proxy(client, {
      get(current, property) {
        if (property !== "query") return Reflect.get(current, property, current);
        return async (sql: string, values?: unknown[]) => {
          if (sql.includes("CREATE TABLE IF NOT EXISTS mentor_ai_preferences")) {
            migrationSqlObserved = true;
            const result = await client.query(sql, values);
            await client.query("CREATE TABLE migration_interruption_probe (id INTEGER)");
            return result;
          }
          if (migrationSqlObserved && sql.includes("INSERT INTO _migrations")) {
            throw new Error("migration_test_interrupted");
          }
          return client.query(sql, values);
        };
      },
    });
    try {
      await assert.rejects(
        runAiMentorTrustMigrations(interruptedClient),
        /migration_test_interrupted/,
      );
      const probe = await client.query<{ identity: string | null }>(
        "SELECT to_regclass('public.migration_interruption_probe')::text AS identity",
      );
      assert.equal(probe.rows[0].identity, null, "interrupted transaction must roll back all effects");
      await applyDatabaseMigrationsWithLock(client);
      assert.equal((await checkMigrationReadiness(client)).status, "current");
    } finally {
      await applyDatabaseMigrationsWithLock(client);
      client.release();
      await pool.end();
    }
  });

  it("classifies stale running state and recovers it under the canonical lock", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE _migration_runtime_state SET status = 'running', updated_at = NOW() - INTERVAL '1 hour',
           started_at = NOW() - INTERVAL '1 hour', finished_at = NULL, ledger_digest = NULL
         WHERE singleton = TRUE`,
      );
      const stale = await checkMigrationReadiness(client, { runningStaleAfterMs: 1_000 });
      assert.equal(stale.status, "migration_failed");
      assert.equal(stale.errorCode, "migration_runner_stale");
      await applyDatabaseMigrationsWithLock(client);
      assert.equal((await checkMigrationReadiness(client)).status, "current");
    } finally {
      await applyDatabaseMigrationsWithLock(client);
      client.release();
      await pool.end();
    }
  });

  it("preserves migration and advisory unlock failures together", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const target = DATABASE_MIGRATION_EXPECTATIONS[0];
    const original = await client.query<{ checksum: string }>(
      "SELECT checksum FROM _migrations WHERE filename = $1",
      [target.identity],
    );
    await client.query("UPDATE _migrations SET checksum = $1 WHERE filename = $2", [
      "0".repeat(16),
      target.identity,
    ]);
    const unlockFailingClient = new Proxy(client, {
      get(current, property) {
        if (property !== "query") return Reflect.get(current, property, current);
        return async (sql: string, values?: unknown[]) => {
          if (sql.includes("pg_advisory_unlock")) return { rows: [{ released: false }] };
          return client.query(sql, values);
        };
      },
    });
    try {
      await assert.rejects(async () => {
        try {
          await applyDatabaseMigrationsWithLock(unlockFailingClient);
        } catch (error) {
          assert.ok(error instanceof AggregateError);
          const details = error.errors.map((entry) => String(entry)).join("\n");
          assert.match(details, /checksum mismatch/i);
          assert.match(details, /migration_lock_release_failed/);
          throw error;
        }
      });
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
      await client.query("UPDATE _migrations SET checksum = $1 WHERE filename = $2", [
        original.rows[0].checksum,
        target.identity,
      ]);
      await applyDatabaseMigrationsWithLock(client);
      client.release();
      await pool.end();
    }
  });

  it("releases the migration session cleanly after SIGINT and SIGTERM", async () => {
    for (const [signal, expectedCode] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
      const pool = new Pool({ connectionString: databaseUrl, max: 2 });
      const holder = await pool.connect();
      let child: ReturnType<typeof spawn> | undefined;
      try {
        await holder.query("SELECT pg_advisory_lock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
        const spawned = spawn(process.execPath, ["--import", "tsx", "scripts/run-database-migrations.ts"], {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: databaseUrl },
          stdio: ["ignore", "pipe", "pipe"],
        });
        child = spawned;
        let output = "";
        spawned.stdout?.on("data", (chunk) => { output += String(chunk); });
        spawned.stderr?.on("data", (chunk) => { output += String(chunk); });
        await waitForMigrationOperator(pool);
        const exit = new Promise<number | null>((resolve, reject) => {
          spawned.once("error", reject);
          spawned.once("exit", resolve);
        });
        assert.equal(spawned.kill(signal), true);
        const code = await exit;
        assert.equal(code, expectedCode, `${signal} must produce the governed exit code`);
        assert.match(output, /migration_interrupted/);
        const active = await pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM pg_stat_activity
            WHERE application_name = 'tecpey-database-migration-operator'
              AND datname = current_database()`,
        );
        assert.equal(active.rows[0]?.count, 0, `${signal} must close the migration session`);
      } finally {
        if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await holder.query("SELECT pg_advisory_unlock($1, $2)", [...DATABASE_MIGRATION_LOCK_KEYS]);
        holder.release();
        await pool.end();
      }
    }
  });

  it("cancels in-flight PostgreSQL migration queries on SIGINT and SIGTERM", {
    timeout: 30_000,
  }, async () => {
    await withIsolatedDatabase("interrupt", async (isolatedDatabaseUrl) => {
      const target = DATABASE_MIGRATION_EXPECTATIONS.at(-1)!;
      for (const [signal, expectedCode] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
        const pool = new Pool({ connectionString: isolatedDatabaseUrl, max: 3 });
        const holder = await pool.connect();
        let child: ReturnType<typeof spawn> | undefined;
        try {
          await applyDatabaseMigrationsWithLock(holder);
          await holder.query("DELETE FROM _migration_runtime_ledger WHERE identity = $1", [target.identity]);
          await holder.query("DELETE FROM _migrations WHERE filename = $1", [target.identity]);
          await holder.query("DROP TABLE mentor_ai_preferences");
          await holder.query("BEGIN");
          await holder.query("LOCK TABLE academy_students IN ACCESS EXCLUSIVE MODE");

          const spawned = spawn(process.execPath, ["--import", "tsx", "scripts/run-database-migrations.ts"], {
            cwd: process.cwd(),
            env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl },
            stdio: ["ignore", "pipe", "pipe"],
          });
          child = spawned;
          let output = "";
          spawned.stdout?.on("data", (chunk) => { output += String(chunk); });
          spawned.stderr?.on("data", (chunk) => { output += String(chunk); });
          await waitForBlockedMigrationQuery(pool);
          const exit = new Promise<number | null>((resolve, reject) => {
            spawned.once("error", reject);
            spawned.once("exit", resolve);
          });
          assert.equal(spawned.kill(signal), true);
          assert.equal(await exit, expectedCode, `${signal} must cancel the active migration query`);
          assert.match(output, /canceling statement due to user request|migration_interrupted/);
          const ledger = await holder.query<{ applied: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM _migrations WHERE filename = $1) AS applied",
            [target.identity],
          );
          assert.equal(ledger.rows[0]?.applied, false, `${signal} must roll back the interrupted step`);
          const active = await pool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count FROM pg_stat_activity
              WHERE application_name = 'tecpey-database-migration-operator'
                AND datname = current_database()`,
          );
          assert.equal(active.rows[0]?.count, 0, `${signal} must release the migration session`);
        } finally {
          if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
          await holder.query("ROLLBACK");
          await applyDatabaseMigrationsWithLock(holder);
          holder.release();
          await pool.end();
        }
      }
    });
  });

  it("fails a blocked runtime readiness query within its governed deadline", {
    timeout: 15_000,
  }, async () => {
    await withIsolatedDatabase("readiness", async (isolatedDatabaseUrl) => {
      const pool = new Pool({ connectionString: isolatedDatabaseUrl, max: 2 });
      const holder = await pool.connect();
      let child: ReturnType<typeof spawn> | undefined;
      try {
        await applyDatabaseMigrationsWithLock(holder);
        await holder.query("BEGIN");
        await holder.query("LOCK TABLE _migration_runtime_state IN ACCESS EXCLUSIVE MODE");
        const startedAt = Date.now();
        const spawned = spawn(process.execPath, [
          "--import", "tsx", "--input-type=module", "--eval",
          "const db = await import('./src/lib/db.ts'); const check = db.checkDbHealth ?? db.default?.checkDbHealth; console.log(JSON.stringify(await check()));",
        ], {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl, NODE_ENV: "test" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        child = spawned;
        let output = "";
        spawned.stdout?.on("data", (chunk) => { output += String(chunk); });
        spawned.stderr?.on("data", (chunk) => { output += String(chunk); });
        const code = await new Promise<number | null>((resolve, reject) => {
          spawned.once("error", reject);
          spawned.once("exit", resolve);
        });
        assert.equal(code, 0, output);
        assert.ok(Date.now() - startedAt < 8_000, "readiness must fail within the governed deadline");
        assert.match(output, /"status":"ok"/);
        assert.match(output, /"status":"migration_failed"/);
        assert.match(output, /canceling_statement_due_to_statement_timeout/);
      } finally {
        if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await holder.query("ROLLBACK");
        holder.release();
        await pool.end();
      }
    });
  });
});
