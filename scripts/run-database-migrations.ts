import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../src/lib/db-migration-plan";
import { checkMigrationReadiness } from "../src/lib/db-migration-readiness";

const interruption = new AbortController();
let terminationSignal: "SIGINT" | "SIGTERM" | null = null;

function requiredDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value || value.includes("CHANGE_ME")) {
    throw new Error("DATABASE_URL must be configured for database migrations");
  }
  return value;
}

async function migrationCount(client: PoolClient): Promise<number> {
  try {
    const result = await client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM _migrations",
    );
    return result.rows[0]?.count ?? 0;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01") return 0;
    throw error;
  }
}

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: requiredDatabaseUrl(),
    max: 2,
    application_name: "tecpey-database-migration-operator",
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });

  let client: PoolClient | undefined;
  let cancellation: Promise<void> | undefined;
  let operationError: unknown;
  const interrupt = (signal: "SIGINT" | "SIGTERM") => {
    terminationSignal = signal;
    interruption.abort();
    const processId = (client as (PoolClient & { processID?: number }) | undefined)?.processID;
    if (processId !== undefined) {
      cancellation = pool.query<{ cancelled: boolean }>(
        "SELECT pg_cancel_backend($1) AS cancelled",
        [processId],
      ).then((result) => {
        if (result.rows[0]?.cancelled !== true) throw new Error("migration_query_cancel_failed");
      });
    }
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => interrupt(signal));
  }
  try {
    client = await pool.connect();
    const before = await migrationCount(client);
    const configuredTimeout = process.env.TECPEY_MIGRATION_LOCK_TIMEOUT_MS?.trim();
    const lockTimeoutMs = configuredTimeout === undefined ? undefined : Number(configuredTimeout);
    await applyDatabaseMigrationsWithLock(client, {
      lockTimeoutMs,
      signal: interruption.signal,
    });
    const after = await migrationCount(client);
    const readiness = await checkMigrationReadiness(client);
    if (readiness.status !== "current") {
      throw new Error(`migration_completed_without_current_schema:${readiness.status}`);
    }
    process.stdout.write(
      `${JSON.stringify({
        status: "ok",
        migrationsBefore: before,
        migrationsAfter: after,
        schema: readiness.status,
        planHash: readiness.planHash,
      })}\n`,
    );
  } catch (error) {
    operationError = error;
  } finally {
    try {
      await cancellation;
    } catch (cancellationError) {
      operationError = operationError
        ? new AggregateError(
          [operationError, cancellationError],
          "migration_failed_and_query_cancel_failed",
        )
        : cancellationError;
    }
    client?.release();
    await pool.end();
  }
  if (operationError) throw operationError;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:migrate] ${message}`);
  process.exitCode = terminationSignal === "SIGINT" ? 130 : terminationSignal === "SIGTERM" ? 143 : 1;
});
