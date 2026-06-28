import { Pool, type PoolClient } from "pg";
import { initSchema } from "./db-schema";
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

export async function withDb<T>(
  handler: (client: PoolClient) => Promise<T>,
): Promise<{ enabled: true; value: T } | { enabled: false; value: null }> {
  const p = getPool();
  if (!p) return { enabled: false, value: null };

  if (!schemaInit) {
    schemaInit = (async () => {
      const c = await p.connect();
      try {
        await initSchema(c);
      } catch (err) {
        schemaInit = null;
        throw err;
      } finally {
        c.release();
      }
    })();
  }

  try {
    await schemaInit;
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
