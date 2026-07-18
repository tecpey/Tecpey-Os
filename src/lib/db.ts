import { Pool, type PoolClient } from "pg";
import { runMigrations } from "./db-migrate";
import { runCompatibilityMigrations } from "./db-migrate-compat";
import { runUserStateMigrations } from "./db-migrate-user-state";
import { runAdminControlPlaneMigrations } from "./db-migrate-admin-control-plane";
import { runAdminControlPlaneHardeningMigrations } from "./db-migrate-admin-control-plane-hardening";
import { logger } from "./logger";

let pool: Pool | null = null;
let schemaInit: Promise<void> | null = null;

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("CHANGE_ME")) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[db] DATABASE_URL is not set or is a placeholder. All DB operations will fail.");
    }
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("error", (err) => {
      logger.error("[db] pool error", { message: err.message });
    });
  }
  return pool;
}

export type DbHealthResult = {
  status: "ok" | "unavailable" | "unconfigured";
  latencyMs: number;
  migrations?: number;
};

/**
 * Lightweight DB health probe — bypasses the migration runner so the health
 * endpoint remains fast and side-effect-free. Runs SELECT 1 plus an optional
 * migration count query.
 */
export async function checkDbHealth(): Promise<DbHealthResult> {
  const start = Date.now();
  const p = getPool();
  if (!p) return { status: "unconfigured", latencyMs: 0 };
  let client;
  try {
    client = await p.connect();
    await client.query("SELECT 1");
    let migrations: number | undefined;
    try {
      const r = await client.query("SELECT COUNT(*)::int AS count FROM _migrations");
      migrations = r.rows[0]?.count ?? 0;
    } catch {
      // _migrations may not exist on a fresh DB before first migration run.
    }
    return { status: "ok", latencyMs: Date.now() - start, migrations };
  } catch {
    return { status: "unavailable", latencyMs: Date.now() - start };
  } finally {
    client?.release();
  }
}

async function ensureSchema(p: Pool): Promise<void> {
  if (!schemaInit) {
    schemaInit = (async () => {
      let client: PoolClient | undefined;
      try {
        client = await p.connect();
        await runMigrations(client);
        await runCompatibilityMigrations(client);
        await runUserStateMigrations(client);
        await runAdminControlPlaneMigrations(client);
        await runAdminControlPlaneHardeningMigrations(client);
      } catch (err) {
        schemaInit = null;
        throw err;
      } finally {
        client?.release();
      }
    })();
  }

  await schemaInit;
}

export async function withDb<T>(
  handler: (client: PoolClient) => Promise<T>,
): Promise<{ enabled: true; value: T } | { enabled: false; value: null }> {
  const p = getPool();
  if (!p) return { enabled: false, value: null };

  try {
    await ensureSchema(p);
  } catch {
    return { enabled: false, value: null };
  }

  const client = await p.connect();
  try {
    return { enabled: true, value: await handler(client) };
  } finally {
    client.release();
  }
}

// Wraps a handler in a single Postgres transaction (BEGIN / COMMIT / ROLLBACK).
// On handler success: commits and returns { enabled: true, value }.
// On pool unavailable: returns { enabled: false, value: null } without connecting.
// On handler throw: rolls back then re-throws — callers must catch specific errors.
export async function withTx<T>(
  handler: (client: PoolClient) => Promise<T>,
): Promise<{ enabled: true; value: T } | { enabled: false; value: null }> {
  const p = getPool();
  if (!p) return { enabled: false, value: null };

  try {
    await ensureSchema(p);
  } catch {
    return { enabled: false, value: null };
  }

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const value = await handler(client);
    await client.query("COMMIT");
    return { enabled: true, value };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Best-effort rollback; preserve the original failure.
    }
    throw err;
  } finally {
    client.release();
  }
}
