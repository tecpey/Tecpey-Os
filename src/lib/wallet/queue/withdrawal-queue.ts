// Withdrawal Queue — Phase 38
// BullMQ queue definitions: main, retry, DLQ, recovery, confirmation queues.
// All queues backed by Redis (shared connection with app Redis).

import { Queue, QueueEvents } from "bullmq";
import type { WithdrawalJobData, ConfirmationJobData } from "../types";

// ── Redis connection ──────────────────────────────────────────────────────────
// BullMQ requires its own connection (it uses blocking commands).

function redisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 6379,
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null, // required by BullMQ
  };
}

const connection = redisConnection();

// ── Queue instances ───────────────────────────────────────────────────────────

export const withdrawalQueue = new Queue<WithdrawalJobData>("withdrawal", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false, // keep for DLQ analysis
  },
});

export const withdrawalDlq = new Queue<WithdrawalJobData>("withdrawal:dlq", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false,
  },
});

export const withdrawalRetryQueue = new Queue<WithdrawalJobData>("withdrawal:retry", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 }, // 30s, 1m, 2m, 4m, 8m
    removeOnComplete: { count: 200 },
    removeOnFail: false,
  },
});

export const confirmationQueue = new Queue<ConfirmationJobData>("withdrawal:confirmation", {
  connection,
  defaultJobOptions: {
    attempts: 50,               // poll up to 50 times
    backoff: { type: "fixed", delay: 30_000 }, // check every 30s
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
});

export const recoveryQueue = new Queue<WithdrawalJobData>("withdrawal:recovery", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
  },
});

export const withdrawalQueueEvents = new QueueEvents("withdrawal", { connection });

// ── Queue helpers ─────────────────────────────────────────────────────────────

export async function enqueueWithdrawal(
  data: WithdrawalJobData,
  opts?: { priority?: number; delay?: number },
): Promise<string> {
  const job = await withdrawalQueue.add("process", data, {
    priority: opts?.priority ?? data.priority,
    delay: opts?.delay ?? 0,
    jobId: `withdrawal:${data.withdrawalId}`, // idempotency: deduplicate by withdrawalId
  });
  return job.id ?? data.withdrawalId;
}

export async function enqueueConfirmationWatch(data: ConfirmationJobData): Promise<void> {
  await confirmationQueue.add("watch", data, {
    jobId: `confirm:${data.withdrawalId}`,
    delay: 15_000, // wait 15s before first check
  });
}

export async function moveToDeadLetter(data: WithdrawalJobData, reason: string): Promise<void> {
  await withdrawalDlq.add("failed", { ...data, _failReason: reason } as WithdrawalJobData & { _failReason: string }, {
    jobId: `dlq:${data.withdrawalId}`,
  });
}

export async function enqueueRecovery(data: WithdrawalJobData): Promise<void> {
  await recoveryQueue.add("recover", data, {
    jobId: `recovery:${data.withdrawalId}`,
    delay: 60_000, // 1 min delay before recovery attempt
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
