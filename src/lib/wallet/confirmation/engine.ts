// Confirmation Engine — Phase 38
// Polls each chain for transaction confirmations.
// BTC: 6 confirmations (finality), ETH: finalized tag, SOL: finalized status.
// Timeout detection: if tx not confirmed within TTL, marks as timeout.

import type { ChainId, ConfirmationJobData } from "../types";
import { getProvider } from "../providers/registry";
import { withDb } from "@/lib/db";
import { trackWalletMetric } from "../observability";

const TIMEOUT_BY_CHAIN: Record<ChainId, number> = {
  bitcoin: 3_600_000,    // 1 hour
  ethereum: 900_000,     // 15 minutes
  bsc: 600_000,          // 10 minutes
  polygon: 1_200_000,    // 20 minutes
  tron: 600_000,         // 10 minutes
  solana: 300_000,       // 5 minutes
};

export async function checkConfirmation(data: ConfirmationJobData): Promise<boolean> {
  const { withdrawalId, txHash, chainId, requiredConfirmations, timeoutAt } = data;

  // Check for timeout
  if (new Date(timeoutAt) < new Date()) {
    await markWithdrawalTimeout(withdrawalId, txHash);
    return true; // done (with failure)
  }

  const startMs = Date.now();
  const provider = getProvider(chainId as ChainId);
  const status = await provider.getConfirmationStatus(txHash);
  const elapsedMs = Date.now() - startMs;

  trackWalletMetric("confirmation_latency_ms", elapsedMs);

  if (status.status === "dropped") {
    trackWalletMetric("tx_dropped_detected", 1);
    await markWithdrawalFailed(withdrawalId, `Transaction dropped: ${txHash}`);
    return true;
  }

  if (status.isComplete && status.confirmations >= requiredConfirmations) {
    await markWithdrawalCompleted(withdrawalId, txHash, status.confirmations, status.blockNumber);
    return true;
  }

  // Not yet confirmed — return false to retry
  return false;
}

export function getConfirmationTimeout(chainId: ChainId): number {
  return TIMEOUT_BY_CHAIN[chainId] ?? 3_600_000;
}

export function buildTimeoutAt(chainId: ChainId): string {
  return new Date(Date.now() + getConfirmationTimeout(chainId)).toISOString();
}

// ── DB state transitions ──────────────────────────────────────────────────────

async function markWithdrawalCompleted(
  withdrawalId: string,
  txHash: string,
  confirmations: number,
  blockNumber?: bigint,
): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE withdrawals SET
         state = 'completed',
         confirmation_count = $2,
         block_number = $3,
         completed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [withdrawalId, confirmations, blockNumber ? blockNumber.toString() : null],
    );
    return null;
  });
}

async function markWithdrawalFailed(withdrawalId: string, error: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE withdrawals SET
         state = 'failed',
         execution_error = $2,
         updated_at = NOW()
       WHERE id = $1`,
      [withdrawalId, error],
    );
    return null;
  });
}

async function markWithdrawalTimeout(withdrawalId: string, txHash: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE withdrawals SET
         state = 'timeout',
         execution_error = $2,
         updated_at = NOW()
       WHERE id = $1`,
      [withdrawalId, `Confirmation timeout for tx: ${txHash}`],
    );
    return null;
  });
}
