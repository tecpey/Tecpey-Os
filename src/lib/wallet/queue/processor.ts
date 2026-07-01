// Queue Processor — Phase 38
// BullMQ job handlers for withdrawal and confirmation queues.

import { Worker, type Job } from "bullmq";
import { logger } from "@/lib/logger";
import { executeWithdrawal } from "../withdrawal-executor";
import { checkConfirmation } from "../confirmation/engine";
import { moveToDeadLetter } from "./withdrawal-queue";
import type { ConfirmationJobData, WithdrawalJobData } from "../types";

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

// ── Withdrawal Worker ─────────────────────────────────────────────────────────

export function createWithdrawalWorker(concurrency = 5): Worker<WithdrawalJobData> {
  const worker = new Worker<WithdrawalJobData>(
    "withdrawal",
    async (job: Job<WithdrawalJobData>) => {
      logger.info("[queue] processing withdrawal job", {
        jobId: job.id,
        withdrawalId: job.data.withdrawalId,
        chainId: job.data.chainId,
        attempt: job.attemptsMade + 1,
      });
      await executeWithdrawal(job.data);
    },
    { connection, concurrency },
  );

  worker.on("completed", (job) => {
    logger.info("[queue] withdrawal job completed", { jobId: job.id, withdrawalId: job.data.withdrawalId });
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    logger.error("[queue] withdrawal job failed", {
      jobId: job.id,
      withdrawalId: job.data.withdrawalId,
      attempt: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      error: err.message,
    });

    // On final failure, send to DLQ
    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      await moveToDeadLetter(job.data, err.message);
    }
  });

  return worker;
}

// ── Confirmation Worker ───────────────────────────────────────────────────────

export function createConfirmationWorker(concurrency = 20): Worker<ConfirmationJobData> {
  const worker = new Worker<ConfirmationJobData>(
    "withdrawal:confirmation",
    async (job: Job<ConfirmationJobData>) => {
      const done = await checkConfirmation(job.data);
      if (!done) {
        // Throw to trigger retry (BullMQ will re-schedule per backoff)
        throw new Error(`Not yet confirmed: ${job.data.txHash}`);
      }
    },
    { connection, concurrency },
  );

  worker.on("completed", (job) => {
    logger.info("[queue] confirmation job completed", { jobId: job.id, txHash: job.data.txHash });
  });

  worker.on("failed", (job, err) => {
    if (!job) return;
    // Suppress "not yet confirmed" noise — these are expected retry errors
    if (!err.message.startsWith("Not yet confirmed")) {
      logger.error("[queue] confirmation job error", {
        jobId: job.id,
        txHash: job.data.txHash,
        error: err.message,
      });
    }
  });

  return worker;
}

// ── Recovery Worker ───────────────────────────────────────────────────────────

export function createRecoveryWorker(): Worker<WithdrawalJobData> {
  const worker = new Worker<WithdrawalJobData>(
    "withdrawal:recovery",
    async (job: Job<WithdrawalJobData>) => {
      logger.info("[queue] running recovery for withdrawal", { withdrawalId: job.data.withdrawalId });
      // Recovery re-tries execution from scratch
      await executeWithdrawal(job.data);
    },
    { connection, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    logger.error("[queue] recovery failed", { withdrawalId: job.data.withdrawalId, error: err.message });
  });

  return worker;
}
