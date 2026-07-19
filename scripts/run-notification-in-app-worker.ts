import { hostname } from "os";
import { withTx } from "../src/lib/db";
import {
  getNotificationOutboxReconciliation,
  processInAppNotificationBatch,
} from "../src/lib/notifications/outbox";

const workerId = `notification-in-app:${hostname()}:${process.pid}`;
const pollMs = Math.min(
  30_000,
  Math.max(250, Number.parseInt(process.env.NOTIFICATION_POLL_MS ?? "1000", 10)),
);
const batchSize = Math.min(
  100,
  Math.max(1, Number.parseInt(process.env.NOTIFICATION_BATCH_SIZE ?? "20", 10)),
);
const leaseSeconds = Math.min(
  300,
  Math.max(
    15,
    Number.parseInt(process.env.NOTIFICATION_LEASE_SECONDS ?? "60", 10),
  ),
);

let stopping = false;
let lastReconciliationAt = 0;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`[notification-in-app-worker] received ${signal}; stopping safely`);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

async function run(): Promise<void> {
  console.log("[notification-in-app-worker] started", {
    workerId,
    pollMs,
    batchSize,
    leaseSeconds,
  });

  while (!stopping) {
    try {
      const result = await withTx((client) =>
        processInAppNotificationBatch(client, {
          workerId,
          limit: batchSize,
          leaseSeconds,
        }),
      );
      if (!result.enabled) {
        throw new Error("notification_database_unavailable");
      }

      if (result.value.claimed > 0) {
        console.log("[notification-in-app-worker] batch complete", result.value);
      }

      const now = Date.now();
      if (now - lastReconciliationAt >= 60_000) {
        const reconciliation = await withTx((client) =>
          getNotificationOutboxReconciliation(client),
        );
        if (reconciliation.enabled) {
          console.log(
            "[notification-in-app-worker] reconciliation",
            reconciliation.value,
          );
        }
        lastReconciliationAt = now;
      }

      if (result.value.claimed === 0) await sleep(pollMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[notification-in-app-worker] iteration failed", { message });
      await sleep(Math.max(1_000, pollMs));
    }
  }

  console.log("[notification-in-app-worker] stopped", { workerId });
}

void run().catch((error) => {
  console.error("[notification-in-app-worker] fatal", error);
  process.exitCode = 1;
});
