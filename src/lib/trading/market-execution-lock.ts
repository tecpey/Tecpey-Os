import { withDb } from "@/lib/db";

export type MarketExecutionLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false; reason: "storage_unavailable" | "market_busy" };

/**
 * Holds a PostgreSQL session advisory lock for the complete matching/cancellation
 * critical section. Every process and every web/worker instance shares this
 * ownership boundary; the in-process Promise lock remains only an optimization.
 */
export async function withExchangeMarketExecutionLock<T>(
  market: string,
  handler: () => Promise<T>,
  options?: { tryOnly?: boolean },
): Promise<MarketExecutionLockResult<T>> {
  const lockName = `exchange-market:${market.toUpperCase()}`;
  const result = await withDb(async (client) => {
    let acquired = false;
    if (options?.tryOnly) {
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        [lockName],
      );
      acquired = lock.rows[0]?.acquired === true;
    } else {
      await client.query(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        [lockName],
      );
      acquired = true;
    }

    if (!acquired) {
      return { acquired: false as const, reason: "market_busy" as const };
    }

    try {
      return { acquired: true as const, value: await handler() };
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        [lockName],
      );
    }
  });

  if (!result.enabled) {
    return { acquired: false, reason: "storage_unavailable" };
  }
  return result.value;
}
