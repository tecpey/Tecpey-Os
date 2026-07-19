import { hostname } from "os";
import { withTx } from "../src/lib/db";
import {
  claimNotificationDomainOutbox,
  failNotificationDomainEvent,
  getNotificationDomainOutboxReconciliation,
  processClaimedNotificationDomainEvent,
  type NotificationDomainOutboxClaim,
} from "../src/lib/notifications/domain-outbox";
import {
  isTerminalNotificationDomainError,
  loadEffectiveNotificationDomainClaim,
  notificationDomainWorkerErrorCode,
} from "../src/lib/notifications/domain-worker";

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

const workerId = `notification-domain:${hostname()}:${process.pid}`;
const pollMs = boundedIntegerEnv(
  "NOTIFICATION_DOMAIN_POLL_MS",
  1_000,
  250,
  30_000,
);
const batchSize = boundedIntegerEnv(
  "NOTIFICATION_DOMAIN_BATCH_SIZE",
  20,
  1,
  100,
);
const leaseSeconds = boundedIntegerEnv(
  "NOTIFICATION_DOMAIN_LEASE_SECONDS",
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
  console.log(`[notification-domain-worker] received ${signal}; stopping safely`);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

async function processClaim(claim: NotificationDomainOutboxClaim): Promise<void> {
  try {
    const processed = await withTx(async (client) => {
      const effectiveClaim = await loadEffectiveNotificationDomainClaim(
        client,
        claim,
      );
      return processClaimedNotificationDomainEvent(
        client,
        effectiveClaim,
        workerId,
      );
    });
    if (!processed.enabled) {
      throw new Error("notification_database_unavailable");
    }
  } catch (error) {
    const code = notificationDomainWorkerErrorCode(error);
    const detail = error instanceof Error ? error.message.slice(0, 2_000) : null;
    const failed = await withTx((client) =>
      failNotificationDomainEvent(client, claim, workerId, {
        errorCode: code,
        errorDetail: detail,
        retryable: !isTerminalNotificationDomainError(code),
      }),
    );
    if (!failed.enabled) {
      throw new Error("notification_database_unavailable");
    }
  }
}

async function run(): Promise<void> {
  console.log("[notification-domain-worker] started", {
    workerId,
    pollMs,
    batchSize,
    leaseSeconds,
  });

  while (!stopping) {
    try {
      const claimed = await withTx((client) =>
        claimNotificationDomainOutbox(client, {
          workerId,
          limit: batchSize,
          leaseSeconds,
        }),
      );
      if (!claimed.enabled) {
        throw new Error("notification_database_unavailable");
      }

      for (const claim of claimed.value) {
        if (stopping) break;
        await processClaim(claim);
      }

      const now = Date.now();
      if (now - lastReconciliationAt >= 60_000) {
        const reconciliation = await withTx((client) =>
          getNotificationDomainOutboxReconciliation(client),
        );
        if (reconciliation.enabled) {
          console.log(
            "[notification-domain-worker] reconciliation",
            reconciliation.value,
          );
        }
        lastReconciliationAt = now;
      }

      if (claimed.value.length === 0) await sleep(pollMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[notification-domain-worker] iteration failed", { message });
      await sleep(Math.max(1_000, pollMs));
    }
  }

  console.log("[notification-domain-worker] stopped", { workerId });
}

void run().catch((error) => {
  console.error("[notification-domain-worker] fatal", error);
  process.exitCode = 1;
});
