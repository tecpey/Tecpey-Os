// Withdrawal Queue — Phase 38
// BullMQ queue definitions: main, retry, DLQ, recovery, confirmation queues.
// All queues backed by Redis (shared connection with app Redis).

import { Queue, QueueEvents } from "bullmq";
import type { WithdrawalJobData, ConfirmationJobData } from "../types";
import { WITHDRAWAL_QUEUE_NAMES } from "./names";
import {
  CONFIRMATION_INITIAL_DELAY_MS,
  CONFIRMATION_POLL_DELAY_MS,
  MAX_CONFIRMATION_ATTEMPTS,
  createWalletQueueJobId,
} from "./policy";

function redisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 6379,
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

const connection = redisConnection();

export const withdrawalQueue = new Queue<WithdrawalJobData>(WITHDRAWAL_QUEUE_NAMES.execution, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
});

export const withdrawalDlq = new Queue<WithdrawalJobData>(WITHDRAWAL_QUEUE_NAMES.deadLetter, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false,
  },
});

export const withdrawalRetryQueue = new Queue<WithdrawalJobData>(WITHDRAWAL_QUEUE_NAMES.retry, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: false,
  },
});

export const confirmationQueue = new Queue<ConfirmationJobData>(WITHDRAWAL_QUEUE_NAMES.confirmation, {
  connection,
  defaultJobOptions: {
    attempts: MAX_CONFIRMATION_ATTEMPTS,
    backoff: { type: "fixed", delay: CONFIRMATION_POLL_DELAY_MS },
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
});

export const recoveryQueue = new Queue<WithdrawalJobData>(WITHDRAWAL_QUEUE_NAMES.recovery, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
  },
});

export const withdrawalQueueEvents = new QueueEvents(WITHDRAWAL_QUEUE_NAMES.execution, { connection });

/**
 * Preserve deduplication for waiting/delayed/active jobs, but remove retained
 * terminal jobs so an authoritative retry can schedule real work again.
 */
async function prepareRestorableJobSlot<T>(queue: Queue<T>, jobId: string): Promise<boolean> {
  const existing = await queue.getJob(jobId);
  if (!existing) return true;

  const state = await existing.getState();
  if (state === "unknown") return true;
  if (state !== "completed" && state !== "failed") return false;

  try {
    await existing.remove();
    return true;
  } catch (error) {
    const current = await queue.getJob(jobId);
    if (!current) return true;
    const currentState = await current.getState();
    if (currentState !== "completed" && currentState !== "failed") return false;
    throw error;
  }
}

export async function enqueueWithdrawal(
  data: WithdrawalJobData,
  opts?: { priority?: number; delay?: number },
): Promise<string> {
  const jobId = createWalletQueueJobId("withdrawal", data.withdrawalId);
  const mayAdd = await prepareRestorableJobSlot(withdrawalQueue, jobId);
  if (!mayAdd) return jobId;

  const job = await withdrawalQueue.add("process", data, {
    priority: opts?.priority ?? data.priority,
    delay: opts?.delay ?? 0,
    jobId,
  });
  return job.id ?? jobId;
}

export async function enqueueConfirmationWatch(data: ConfirmationJobData): Promise<void> {
  const jobId = createWalletQueueJobId("confirmation", data.withdrawalId, data.txHash);
  const mayAdd = await prepareRestorableJobSlot(confirmationQueue, jobId);
  if (!mayAdd) return;

  await confirmationQueue.add("watch", data, {
    jobId,
    delay: CONFIRMATION_INITIAL_DELAY_MS,
    attempts: MAX_CONFIRMATION_ATTEMPTS,
    backoff: { type: "fixed", delay: CONFIRMATION_POLL_DELAY_MS },
  });
}

export async function moveToDeadLetter(data: WithdrawalJobData, reason: string): Promise<void> {
  await withdrawalDlq.add(
    "failed",
    { ...data, _failReason: reason } as WithdrawalJobData & { _failReason: string },
    { jobId: createWalletQueueJobId("dead-letter", data.withdrawalId, reason) },
  );
}

export async function enqueueRecovery(data: WithdrawalJobData): Promise<void> {
  const jobId = createWalletQueueJobId("recovery", data.withdrawalId);
  const mayAdd = await prepareRestorableJobSlot(recoveryQueue, jobId);
  if (!mayAdd) return;

  await recoveryQueue.add("recover", data, {
    jobId,
    delay: 60_000,
  });
}

export async function getQueueHealth(): Promise<{
  withdrawal: { waiting: number; active: number; failed: number };
  confirmation: { waiting: number; active: number };
  dlq: { count: number };
}> {
  const [wWaiting, wActive, wFailed, cWaiting, cActive, dlqCount] = await Promise.all([
    withdrawalQueue.getWaitingCount(),
    withdrawalQueue.getActiveCount(),
    withdrawalQueue.getFailedCount(),
    confirmationQueue.getWaitingCount(),
    confirmationQueue.getActiveCount(),
    withdrawalDlq.getWaitingCount(),
  ]);

  return {
    withdrawal: { waiting: wWaiting, active: wActive, failed: wFailed },
    confirmation: { waiting: cWaiting, active: cActive },
    dlq: { count: dlqCount },
  };
}
