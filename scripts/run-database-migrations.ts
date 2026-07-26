import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../src/lib/db-migration-plan";
import { checkMigrationReadiness } from "../src/lib/db-migration-readiness";

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
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const before = await migrationCount(client);
    const configuredTimeout = process.env.TECPEY_MIGRATION_LOCK_TIMEOUT_MS?.trim();
    const lockTimeoutMs = configuredTimeout === undefined ? undefined : Number(configuredTimeout);
    await applyDatabaseMigrationsWithLock(client, { lockTimeoutMs });
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
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:migrate] ${message}`);
  process.exitCode = 1;
});
