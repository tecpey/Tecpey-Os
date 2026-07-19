import { createHash } from "crypto";
import { getConfirmationTimeout } from "../confirmation/engine";
import type { ChainId } from "../types";

export const CONFIRMATION_INITIAL_DELAY_MS = 15_000;
export const CONFIRMATION_POLL_DELAY_MS = 30_000;
export const CONFIRMATION_SAFETY_POLLS = 2;

export const SUPPORTED_WALLET_CHAINS = [
  "bitcoin",
  "ethereum",
  "bsc",
  "polygon",
  "tron",
  "solana",
] as const satisfies readonly ChainId[];

export type WalletQueueJobKind = "withdrawal" | "confirmation" | "recovery" | "dead-letter";

/**
 * BullMQ reserves `:` inside custom job IDs. Hashing all authority inputs keeps
 * identifiers deterministic, bounded, opaque, and valid even if an upstream ID
 * contains a reserved separator.
 */
export function createWalletQueueJobId(
  kind: WalletQueueJobKind,
  withdrawalId: string,
  discriminator = "",
): string {
  if (!withdrawalId.trim()) throw new Error("wallet_queue_withdrawal_id_required");
  const digest = createHash("sha256")
    .update(`${kind}\u0000${withdrawalId}\u0000${discriminator}`)
    .digest("hex");
  const id = `${kind}-${digest}`;
  if (id.includes(":")) throw new Error("wallet_queue_job_id_invalid");
  return id;
}

/** The final attempt must occur after the authoritative chain timeout. */
export function confirmationAttemptBudget(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("confirmation_timeout_invalid");
  }
  const retriesNeeded = Math.ceil(
    Math.max(0, timeoutMs - CONFIRMATION_INITIAL_DELAY_MS) / CONFIRMATION_POLL_DELAY_MS,
  );
  return 1 + retriesNeeded + CONFIRMATION_SAFETY_POLLS;
}

export function confirmationCoverageMs(attempts: number): number {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("confirmation_attempts_invalid");
  }
  return CONFIRMATION_INITIAL_DELAY_MS + Math.max(0, attempts - 1) * CONFIRMATION_POLL_DELAY_MS;
}

export const MAX_CONFIRMATION_ATTEMPTS = Math.max(
  ...SUPPORTED_WALLET_CHAINS.map((chainId) => confirmationAttemptBudget(getConfirmationTimeout(chainId))),
);
