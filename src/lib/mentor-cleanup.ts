// Mentor data cleanup utilities — safe to call from a cron job or on-demand API.
//
// Design constraints:
// - Batch deletes only: no single query can lock the full mentor_memories table.
// - Configurable batch size with a hard ceiling (1 000) to prevent runaway deletes.
// - Returns counts so callers can log/monitor how much was cleaned.
// - Never throws: errors are returned as { deleted: 0 } so cron jobs stay alive.

import { withDb } from "@/lib/db";

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1_000;
const DEFAULT_MAX_BATCHES = 20;

export type CleanupResult = {
  deleted: number;
  batches: number;
  limitReached: boolean;
};

/**
 * Delete one batch of expired mentor_memories rows (expires_at < NOW()).
 * Uses a subquery with LIMIT so no full-table lock is acquired.
 * Returns { deleted: 0 } when the DB pool is unavailable.
 */
export async function deleteExpiredMemoriesBatch(batchSize?: number): Promise<number> {
  const size = Math.min(batchSize ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);

  const result = await withDb(async (client) => {
    const res = await client.query(
      `DELETE FROM mentor_memories
       WHERE id IN (
         SELECT id FROM mentor_memories
         WHERE expires_at IS NOT NULL
           AND expires_at < NOW()
         ORDER BY expires_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )`,
      [size],
    );
    return res.rowCount ?? 0;
  });

  return result.enabled ? (result.value ?? 0) : 0;
}

/**
 * Run cleanup in multiple batches until nothing remains or maxBatches is reached.
 * Designed for use in scheduled jobs (cron, Vercel cron, etc.).
 *
 * @param options.batchSize  Rows per batch (default 200, ceiling 1 000).
 * @param options.maxBatches Maximum iterations before stopping (default 20 → up to 4 000 rows).
 */
export async function runMentorCleanup(options?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<CleanupResult> {
  const maxBatches = options?.maxBatches ?? DEFAULT_MAX_BATCHES;
  let totalDeleted = 0;
  let batches = 0;

  for (let i = 0; i < maxBatches; i++) {
    const deleted = await deleteExpiredMemoriesBatch(options?.batchSize);
    totalDeleted += deleted;
    batches++;
    if (deleted === 0) break;
  }

  return {
    deleted: totalDeleted,
    batches,
    limitReached: batches >= maxBatches && totalDeleted > 0,
  };
}
