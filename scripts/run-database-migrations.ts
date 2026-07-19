import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../src/lib/db-migration-plan";

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
    await applyDatabaseMigrationsWithLock(client);
    const after = await migrationCount(client);
    process.stdout.write(
      `${JSON.stringify({ status: "ok", migrationsBefore: before, migrationsAfter: after })}\n`,
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
