// Withdrawal Worker — Phase 38
// Starts all BullMQ workers for the withdrawal pipeline.
// Invoked from server.ts during application bootstrap.

import { logger } from "@/lib/logger";
import {
  createWithdrawalWorker,
  createConfirmationWorker,
  createRecoveryWorker,
} from "@/lib/wallet/queue/processor";
import { assertSupportedWalletKeyStoreConfig } from "@/lib/wallet/signing/runtime-guard";
import type { Worker } from "bullmq";

let workers: Worker[] = [];

export function startWithdrawalWorkers(): void {
  if (workers.length > 0) {
    logger.warn("[worker] withdrawal workers already running");
    return;
  }

  // Fail before any queue starts consuming approved withdrawals. HSM/MPC are
  // currently interface stubs and must never be selected by production config.
  assertSupportedWalletKeyStoreConfig();

  const concurrency = parseInt(process.env.WITHDRAWAL_WORKER_CONCURRENCY ?? "5");

  workers = [
    createWithdrawalWorker(concurrency),
    createConfirmationWorker(20),
    createRecoveryWorker(),
  ];

  logger.info("[worker] withdrawal pipeline workers started", {
    withdrawalConcurrency: concurrency,
    confirmationConcurrency: 20,
    recoveryConcurrency: 2,
  });
}

export async function stopWithdrawalWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
  logger.info("[worker] withdrawal pipeline workers stopped");
}
