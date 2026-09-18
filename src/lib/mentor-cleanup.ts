import { withDb } from "@/lib/db";

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1_000;
const DEFAULT_MAX_BATCHES = 20;
const MAX_BATCHES = 100;

type DeleteBatchResult = Readonly<{
  storageAvailable: boolean;
  deleted: number;
}>;

export type CleanupResult = Readonly<{
  deleted: number;
  memoryDeleted: number;
  conversationDeleted: number;
  batches: number;
  memoryBatches: number;
  conversationBatches: number;
  limitReached: boolean;
  storageAvailable: boolean;
}>;

function boundedBatchSize(value?: number): number {
  if (value === undefined) return DEFAULT_BATCH_SIZE;
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(value)));
}

function boundedMaxBatches(value?: number): number {
  if (value === undefined) return DEFAULT_MAX_BATCHES;
  if (!Number.isFinite(value)) return DEFAULT_MAX_BATCHES;
  return Math.min(MAX_BATCHES, Math.max(1, Math.trunc(value)));
}

async function deleteExpiredMemoriesBatchResult(
  batchSize?: number,
): Promise<DeleteBatchResult> {
  const size = boundedBatchSize(batchSize);
  const result = await withDb(async (client) => {
    const deleted = await client.query(
      `DELETE FROM mentor_memories
        WHERE id IN (
          SELECT id
            FROM mentor_memories
           WHERE expires_at IS NOT NULL
             AND expires_at < NOW()
           ORDER BY expires_at ASC, id ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )`,
      [size],
    );
    return deleted.rowCount ?? 0;
  });
  return result.enabled
    ? { storageAvailable: true, deleted: result.value ?? 0 }
    : { storageAvailable: false, deleted: 0 };
}

async function deleteExpiredConversationsBatchResult(
  batchSize?: number,
): Promise<DeleteBatchResult> {
  const size = boundedBatchSize(batchSize);
  const result = await withDb(async (client) => {
    const deleted = await client.query(
      `DELETE FROM mentor_conversations
        WHERE id IN (
          SELECT id
            FROM mentor_conversations
           WHERE retention_class = 'mentor_history_90d'
             AND created_at < NOW() - INTERVAL '90 days'
           ORDER BY created_at ASC, id ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )`,
      [size],
    );
    return deleted.rowCount ?? 0;
  });
  return result.enabled
    ? { storageAvailable: true, deleted: result.value ?? 0 }
    : { storageAvailable: false, deleted: 0 };
}

/**
 * Backward-compatible single-batch memory cleanup.
 * For operational jobs use runMentorCleanup(), which preserves DB-availability truth.
 */
export async function deleteExpiredMemoriesBatch(
  batchSize?: number,
): Promise<number> {
  return (await deleteExpiredMemoriesBatchResult(batchSize)).deleted;
}

export async function deleteExpiredConversationsBatch(
  batchSize?: number,
): Promise<number> {
  return (await deleteExpiredConversationsBatchResult(batchSize)).deleted;
}

async function drain(
  deleteBatch: (batchSize?: number) => Promise<DeleteBatchResult>,
  batchSize: number,
  maxBatches: number,
): Promise<{
  storageAvailable: boolean;
  deleted: number;
  batches: number;
  limitReached: boolean;
}> {
  let deleted = 0;
  let batches = 0;

  for (let index = 0; index < maxBatches; index += 1) {
    const batch = await deleteBatch(batchSize);
    if (!batch.storageAvailable) {
      return {
        storageAvailable: false,
        deleted,
        batches,
        limitReached: false,
      };
    }
    deleted += batch.deleted;
    batches += 1;
    if (batch.deleted === 0) {
      return {
        storageAvailable: true,
        deleted,
        batches,
        limitReached: false,
      };
    }
  }

  return {
    storageAvailable: true,
    deleted,
    batches,
    limitReached: true,
  };
}

/**
 * Enforces Mentor TTL/retention in bounded, skip-locked batches.
 *
 * Operational semantics are fail-observable: database unavailability is distinct
 * from "nothing to delete", so a scheduler cannot report a false-success cleanup.
 */
export async function runMentorCleanup(options?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<CleanupResult> {
  const batchSize = boundedBatchSize(options?.batchSize);
  const maxBatches = boundedMaxBatches(options?.maxBatches);

  const memories = await drain(
    deleteExpiredMemoriesBatchResult,
    batchSize,
    maxBatches,
  );
  if (!memories.storageAvailable) {
    return {
      deleted: memories.deleted,
      memoryDeleted: memories.deleted,
      conversationDeleted: 0,
      batches: memories.batches,
      memoryBatches: memories.batches,
      conversationBatches: 0,
      limitReached: false,
      storageAvailable: false,
    };
  }

  const conversations = await drain(
    deleteExpiredConversationsBatchResult,
    batchSize,
    maxBatches,
  );

  return {
    deleted: memories.deleted + conversations.deleted,
    memoryDeleted: memories.deleted,
    conversationDeleted: conversations.deleted,
    batches: memories.batches + conversations.batches,
    memoryBatches: memories.batches,
    conversationBatches: conversations.batches,
    limitReached: memories.limitReached || conversations.limitReached,
    storageAvailable: conversations.storageAvailable,
  };
}
