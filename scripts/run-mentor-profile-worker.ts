import { hostname } from "node:os";
import { withTx } from "../src/lib/db";
import {
  claimMentorProfileUpdates,
  failMentorProfileUpdateClaim,
  processMentorProfileUpdateClaimTx,
  type MentorProfileOutboxClaim,
} from "../src/lib/mentor-profile-update-outbox";
import {
  isTerminalMentorProfileWorkerError,
  mentorProfileWorkerErrorCode,
} from "../src/lib/mentor-profile-worker";
import {
  evaluateMentorProfileHealth,
  loadMentorProfileHealthSnapshot,
  mentorProfileHealthAlertMetadata,
} from "../src/lib/mentor-profile-health";

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

const workerId = `mentor-profile:${hostname()}:${process.pid}`;
const pollMs = boundedIntegerEnv(
  "MENTOR_PROFILE_WORKER_POLL_MS",
  1_000,
  250,
  30_000,
);
const batchSize = boundedIntegerEnv(
  "MENTOR_PROFILE_WORKER_BATCH_SIZE",
  20,
  1,
  100,
);
const concurrency = boundedIntegerEnv(
  "MENTOR_PROFILE_WORKER_CONCURRENCY",
  4,
  1,
  10,
);
const leaseSeconds = boundedIntegerEnv(
  "MENTOR_PROFILE_WORKER_LEASE_SECONDS",
  120,
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
  console.log("[mentor-profile-worker] stopping", { signal });
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

async function processClaim(claim: MentorProfileOutboxClaim): Promise<void> {
  try {
    const processed = await withTx((client) =>
      processMentorProfileUpdateClaimTx(client, claim, workerId),
    );
    if (!processed.enabled) {
      throw new Error("mentor_profile_database_unavailable");
    }
  } catch (error) {
    const code = mentorProfileWorkerErrorCode(error);
    if (code === "mentor_profile_outbox_lease_lost") {
      return;
    }
    const failed = await withTx((client) =>
      failMentorProfileUpdateClaim(client, claim, workerId, {
        errorCode: code,
        errorDetail: null,
        retryable: !isTerminalMentorProfileWorkerError(code),
      }),
    );
    if (!failed.enabled) {
      throw new Error("mentor_profile_database_unavailable");
    }
  }
}

async function processClaims(claims: MentorProfileOutboxClaim[]): Promise<void> {
  for (let index = 0; index < claims.length; index += concurrency) {
    if (stopping) return;
    await Promise.all(claims.slice(index, index + concurrency).map(processClaim));
  }
}

async function run(): Promise<void> {
  console.log("[mentor-profile-worker] started", {
    workerId,
    pollMs,
    batchSize,
    concurrency,
    leaseSeconds,
  });

  while (!stopping) {
    try {
      const claimed = await withTx((client) =>
        claimMentorProfileUpdates(client, {
          workerId,
          limit: batchSize,
          leaseSeconds,
        }),
      );
      if (!claimed.enabled) {
        throw new Error("mentor_profile_database_unavailable");
      }

      await processClaims(claimed.value);

      const now = Date.now();
      if (now - lastReconciliationAt >= 60_000) {
        const health = await withTx((client) =>
          loadMentorProfileHealthSnapshot(client),
        );
        if (!health.enabled) {
          throw new Error("mentor_profile_database_unavailable");
        }
        const evaluation = evaluateMentorProfileHealth(health.value);
        const metadata = mentorProfileHealthAlertMetadata(
          health.value,
          evaluation,
        );
        console.log("[mentor-profile-worker] health", metadata);
        lastReconciliationAt = now;
      }

      if (claimed.value.length === 0) await sleep(pollMs);
    } catch (error) {
      const code = mentorProfileWorkerErrorCode(error);
      console.error("[mentor-profile-worker] iteration failed", { code });
      await sleep(Math.max(1_000, pollMs));
    }
  }

  console.log("[mentor-profile-worker] stopped", { workerId });
}

void run().catch((error) => {
  console.error("[mentor-profile-worker] fatal", {
    code: mentorProfileWorkerErrorCode(error),
  });
  process.exitCode = 1;
});
