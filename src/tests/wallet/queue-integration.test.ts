import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Worker, type Queue } from "bullmq";
import type { ConfirmationJobData } from "../../lib/wallet/types";
import { WITHDRAWAL_QUEUE_NAMES } from "../../lib/wallet/queue/names";
import { createWalletQueueJobId } from "../../lib/wallet/queue/policy";

function redisConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 6379,
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

async function waitForState(
  queue: Queue<ConfirmationJobData>,
  jobId: string,
  expected: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId);
    if (job && await job.getState() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const job = await queue.getJob(jobId);
  throw new Error(`job ${jobId} did not reach ${expected}; current=${job ? await job.getState() : "missing"}`);
}

describe("Withdrawal BullMQ runtime policy", () => {
  it("deduplicates live watches and restores completed and failed watches", {
    skip: !process.env.REDIS_URL,
    timeout: 30_000,
  }, async () => {
    const redisUrl = process.env.REDIS_URL as string;
    const connection = redisConnection(redisUrl);
    const queueModule = await import("../../lib/wallet/queue/withdrawal-queue");
    const {
      confirmationQueue,
      enqueueConfirmationWatch,
      withdrawalQueue,
      withdrawalDlq,
      withdrawalRetryQueue,
      recoveryQueue,
      withdrawalQueueEvents,
    } = queueModule;

    let successWorker: Worker<ConfirmationJobData> | null = null;
    let failureWorker: Worker<ConfirmationJobData> | null = null;

    const base: ConfirmationJobData = {
      withdrawalId: "bullmq-integration-withdrawal",
      txHash: "0xconfirmation-success",
      chainId: "ethereum",
      requiredConfirmations: 12,
      broadcastedAt: new Date().toISOString(),
      timeoutAt: new Date(Date.now() + 900_000).toISOString(),
    };

    try {
      await confirmationQueue.obliterate({ force: true });

      const successJobId = createWalletQueueJobId(
        "confirmation",
        base.withdrawalId,
        base.txHash,
      );

      await enqueueConfirmationWatch(base);
      await enqueueConfirmationWatch(base);
      assert.equal(await confirmationQueue.getDelayedCount(), 1, "a live delayed watch must be deduplicated");

      successWorker = new Worker<ConfirmationJobData>(
        WITHDRAWAL_QUEUE_NAMES.confirmation,
        async () => true,
        { connection, concurrency: 1 },
      );
      const delayed = await confirmationQueue.getJob(successJobId);
      assert.ok(delayed, "confirmation job must exist");
      await delayed.promote();
      await waitForState(confirmationQueue, successJobId, "completed");
      await successWorker.close();
      successWorker = null;

      await enqueueConfirmationWatch(base);
      await waitForState(confirmationQueue, successJobId, "delayed");
      assert.equal(await confirmationQueue.getDelayedCount(), 1, "a completed watch must be restored once");
      await (await confirmationQueue.getJob(successJobId))?.remove();

      const failedData: ConfirmationJobData = {
        ...base,
        txHash: "0xconfirmation-failed",
      };
      const failedJobId = createWalletQueueJobId(
        "confirmation",
        failedData.withdrawalId,
        failedData.txHash,
      );

      failureWorker = new Worker<ConfirmationJobData>(
        WITHDRAWAL_QUEUE_NAMES.confirmation,
        async () => {
          throw new Error("expected integration failure");
        },
        { connection, concurrency: 1 },
      );
      await confirmationQueue.add("watch", failedData, {
        jobId: failedJobId,
        attempts: 1,
        removeOnFail: false,
      });
      await waitForState(confirmationQueue, failedJobId, "failed");
      await failureWorker.close();
      failureWorker = null;

      await enqueueConfirmationWatch(failedData);
      await waitForState(confirmationQueue, failedJobId, "delayed");
      assert.equal(await confirmationQueue.getDelayedCount(), 1, "a failed watch must be restored once");
    } finally {
      await successWorker?.close();
      await failureWorker?.close();
      await confirmationQueue.obliterate({ force: true }).catch(() => undefined);
      await Promise.all([
        withdrawalQueueEvents.close(),
        confirmationQueue.close(),
        withdrawalQueue.close(),
        withdrawalDlq.close(),
        withdrawalRetryQueue.close(),
        recoveryQueue.close(),
      ]);
    }
  });
});
