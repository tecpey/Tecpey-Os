import { Pool, type PoolClient } from "pg";
import {
  assertMigrationReady,
  checkMigrationReadiness,
  failedMigrationReadiness,
  type MigrationReadiness,
} from "./db-migration-readiness";
import { logger } from "./logger";

let pool: Pool | null = null;
let readinessPool: Pool | null = null;
let schemaVerification: Promise<void> | null = null;

export const DATABASE_READINESS_STATEMENT_TIMEOUT_MS = 5_000;
export const DATABASE_READINESS_QUERY_TIMEOUT_MS = 6_000;

// Runtime pool statement/query timeouts. The main pool previously had no
// server-side timeout at all: a hung or pathologically slow query could hold
// one of the 10 connections (and its transaction locks) indefinitely, slowly
// exhausting the pool under load. Defaults are deliberately generous so
// legitimate reporting queries are unaffected; tighten via env when needed.
function boundedTimeoutMs(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1_000) return fallback;
  return Math.floor(parsed);
}

export const DATABASE_STATEMENT_TIMEOUT_MS = boundedTimeoutMs(
  process.env.TECPEY_DB_STATEMENT_TIMEOUT_MS,
  15_000,
);
export const DATABASE_QUERY_TIMEOUT_MS = boundedTimeoutMs(
  process.env.TECPEY_DB_QUERY_TIMEOUT_MS,
  20_000,
);

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
      statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
      query_timeout: DATABASE_QUERY_TIMEOUT_MS,
      application_name: "tecpey-runtime",
      // Test workers import the shared DB authority directly. Once assertions
      // complete, idle sockets must not keep the Node test process alive.
      allowExitOnIdle: process.env.NODE_ENV === "test",
    });
    pool.on("error", (err) => {
      logger.error("[db] pool error", { message: err.message });
    });
  }
  return pool;
}

function getReadinessPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("CHANGE_ME")) return null;
  if (!readinessPool) {
    readinessPool = new Pool({
      connectionString: url,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: DATABASE_READINESS_STATEMENT_TIMEOUT_MS,
      query_timeout: DATABASE_READINESS_QUERY_TIMEOUT_MS,
      application_name: "tecpey-runtime-readiness",
      allowExitOnIdle: process.env.NODE_ENV === "test",
    });
    readinessPool.on("error", (err) => {
      logger.error("[db] readiness pool error", { message: err.message });
    });
  }
  return readinessPool;
}

export type DbHealthResult = {
  status: "ok" | "unavailable" | "unconfigured";
  latencyMs: number;
  schema?: MigrationReadiness;
};

/**
 * Lightweight DB health probe — bypasses the migration runner so the health
 * endpoint remains fast and side-effect-free. Runs SELECT 1 plus an optional
 * verify-only schema readiness query. It never executes DDL.
 */
export async function checkDbHealth(): Promise<DbHealthResult> {
  const start = Date.now();
  const p = getReadinessPool();
  if (!p) return { status: "unconfigured", latencyMs: 0 };
  let client;
  try {
    client = await p.connect();
    await client.query("SELECT 1");
    let schema: MigrationReadiness;
    try {
      schema = await checkMigrationReadiness(client);
    } catch (error) {
      const diagnostic = error instanceof Error
        ? error.message.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 240)
        : "schema_verification_failed";
      logger.error("[db] schema readiness query failed", {
        error: diagnostic,
      });
      schema = failedMigrationReadiness(diagnostic);
    }
    return { status: "ok", latencyMs: Date.now() - start, schema };
  } catch {
    return { status: "unavailable", latencyMs: Date.now() - start };
  } finally {
    client?.release();
  }
}

async function ensureSchemaCurrent(): Promise<void> {
  if (!schemaVerification) {
    const verification = (async () => {
      let client: PoolClient | undefined;
      try {
        const p = getReadinessPool();
        if (!p) throw new Error("database_not_configured");
        client = await p.connect();
        assertMigrationReady(await checkMigrationReadiness(client));
      } finally {
        client?.release();
      }
    })();
    schemaVerification = verification;
  }

  const verification = schemaVerification;
  try {
    await verification;
  } finally {
    if (schemaVerification === verification) schemaVerification = null;
  }
}

export async function assertDatabaseReadyForRuntime(): Promise<void> {
  await ensureSchemaCurrent();
}

export async function withDb<T>(
  handler: (client: PoolClient) => Promise<T>,
): Promise<{ enabled: true; value: T } | { enabled: false; value: null }> {
  const p = getPool();
  if (!p) return { enabled: false, value: null };

  try {
    await ensureSchemaCurrent();
  } catch (error) {
    logger.error("[db] schema verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
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
    await ensureSchemaCurrent();
  } catch (error) {
    logger.error("[db] schema verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
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
