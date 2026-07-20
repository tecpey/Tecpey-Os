// Queue Processor — Phase 38
// BullMQ job handlers for withdrawal execution, confirmation and recovery.

import { Worker, type Job } from "bullmq";
import { logger } from "@/lib/logger";
import { executeWithdrawal } from "../withdrawal-executor";
import { checkConfirmation } from "../confirmation/engine";
import { moveToDeadLetter } from "./withdrawal-queue";
import { WITHDRAWAL_QUEUE_NAMES } from "./names";
import type { ConfirmationJobData, WithdrawalJobData } from "../types";
import {
  assertCustodyObservationAllowed,
  assertCustodyWorkerStartupAllowed,
} from "../custody-policy";

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

export function createWithdrawalWorker(concurrency = 5): Worker<WithdrawalJobData> {
  assertCustodyWorkerStartupAllowed();
  const worker = new Worker<WithdrawalJobData>(
    WITHDRAWAL_QUEUE_NAMES.execution,
    async (job: Job<WithdrawalJobData>) => {
      logger.info("[queue] processing withdrawal job", {
        jobId: job.id,
        withdrawalId: job.data.withdrawalId,
        attempt: job.attemptsMade + 1,
      });
      await executeWithdrawal(job.data);
    },
    { connection, concurrency },
  );

  worker.on("completed", (job) => {
    logger.info("[queue] withdrawal job completed", {
      jobId: job.id,
      withdrawalId: job.data.withdrawalId,
    });
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

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      await moveToDeadLetter(job.data, err.message);
    }
  });

  return worker;
}

export function createConfirmationWorker(concurrency = 20): Worker<ConfirmationJobData> {
  assertCustodyObservationAllowed();
  const worker = new Worker<ConfirmationJobData>(
    WITHDRAWAL_QUEUE_NAMES.confirmation,
    async (job: Job<ConfirmationJobData>) => {
      const done = await checkConfirmation(job.data);
      if (!done) {
        throw new Error(`Not yet confirmed: ${job.data.withdrawalId}`);
      }
    },
    { connection, concurrency },
  );

  worker.on("completed", (job) => {
    logger.info("[queue] confirmation job completed", {
      jobId: job.id,
      withdrawalId: job.data.withdrawalId,
    });
  });

  worker.on("failed", (job, err) => {
    if (!job) return;
    if (!err.message.startsWith("Not yet confirmed")) {
      logger.error("[queue] confirmation job error", {
        jobId: job.id,
        withdrawalId: job.data.withdrawalId,
        error: err.message,
      });
    }
  });

  return worker;
}

export function createRecoveryWorker(): Worker<WithdrawalJobData> {
  assertCustodyWorkerStartupAllowed();
  const worker = new Worker<WithdrawalJobData>(
    WITHDRAWAL_QUEUE_NAMES.recovery,
    async (job: Job<WithdrawalJobData>) => {
      logger.info("[queue] running recovery for withdrawal", {
        withdrawalId: job.data.withdrawalId,
      });
      await executeWithdrawal(job.data);
    },
    { connection, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    logger.error("[queue] recovery failed", {
      withdrawalId: job.data.withdrawalId,
      error: err.message,
    });
  });

  return worker;
}
