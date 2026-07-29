import { hostname } from "os";
import { withTx } from "../src/lib/db";
import {
  getNotificationOutboxReconciliation,
  processInAppNotificationBatch,
} from "../src/lib/notifications/outbox";

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name.toLowerCase()}_out_of_range`);
  }
  return parsed;
}

const workerId = `notification-in-app:${hostname()}:${process.pid}`;
const pollMs = boundedIntegerEnv("NOTIFICATION_POLL_MS", 1_000, 250, 30_000);
const batchSize = boundedIntegerEnv("NOTIFICATION_BATCH_SIZE", 20, 1, 100);
const leaseSeconds = boundedIntegerEnv(
  "NOTIFICATION_LEASE_SECONDS",
  60,
  15,
  300,
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
