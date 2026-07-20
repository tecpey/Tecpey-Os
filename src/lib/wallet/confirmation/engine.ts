// Confirmation Engine — authoritative DB hydration and state-bound transitions.
// Queue payloads identify the withdrawal only; tx hash, network and policy come from PostgreSQL.

import type { ChainId, ConfirmationJobData } from "../types";
import { getProvider } from "../providers/registry";
import { withDb } from "@/lib/db";
import { trackWalletMetric } from "../observability";
import {
  markWithdrawalConfirmationOutcome,
  publishWithdrawalConfirmationOutbox,
} from "@/lib/security/withdrawal-external-effect-authority";
import { settleConfirmedWithdrawal } from "@/lib/security/withdrawal-settlement-authority";

const TIMEOUT_BY_CHAIN: Record<ChainId, number> = {
  bitcoin: 3_600_000,
  ethereum: 900_000,
  bsc: 600_000,
  polygon: 1_200_000,
  tron: 600_000,
  solana: 300_000,
};

type ConfirmationRecord = {
  id: string;
  txHash: string | null;
  network: ChainId;
  state: string;
  requiredConfirmations: number;
  lastBroadcastAt: Date | null;
  updatedAt: Date;
};

export async function checkConfirmation(data: ConfirmationJobData): Promise<boolean> {
  // Enqueue may race the post-commit publication transaction. Re-running the
  // idempotent publisher here establishes outbox state, confirming transition
  // and mandatory monitor evidence before any provider observation is trusted.
  await publishWithdrawalConfirmationOutbox(data.withdrawalId);

  const withdrawal = await loadAuthoritativeConfirmation(data.withdrawalId);
  if (!withdrawal) return true;
  if (!withdrawal.txHash) {
    throw new Error("withdrawal_confirmation_hash_missing");
  }

  const deadlineBase = withdrawal.lastBroadcastAt ?? withdrawal.updatedAt;
  const deadline = deadlineBase.getTime() + getConfirmationTimeout(withdrawal.network);
  if (Date.now() > deadline) {
    await markWithdrawalConfirmationOutcome({
      withdrawalId: withdrawal.id,
      txHash: withdrawal.txHash,
      outcome: "timeout",
      confirmations: 0,
    });
    return true;
  }

  const startMs = Date.now();
  const provider = getProvider(withdrawal.network);
  const status = await provider.getConfirmationStatus(withdrawal.txHash);
  trackWalletMetric("confirmation_latency_ms", Date.now() - startMs);

  if (status.status === "dropped") {
    trackWalletMetric("tx_dropped_detected", 1);
    await markWithdrawalConfirmationOutcome({
      withdrawalId: withdrawal.id,
      txHash: withdrawal.txHash,
      outcome: "dropped",
      confirmations: status.confirmations,
    });
    return true;
  }

  if (
    status.isComplete &&
    status.confirmations >= withdrawal.requiredConfirmations
  ) {
    await settleConfirmedWithdrawal({
      withdrawalId: withdrawal.id,
      txHash: withdrawal.txHash,
      confirmations: status.confirmations,
      blockNumber: status.blockNumber,
    });
    return true;
  }

  return false;
}

export function getConfirmationTimeout(chainId: ChainId): number {
  return TIMEOUT_BY_CHAIN[chainId] ?? 3_600_000;
}

export function buildTimeoutAt(chainId: ChainId): string {
  return new Date(Date.now() + getConfirmationTimeout(chainId)).toISOString();
}

async function loadAuthoritativeConfirmation(
  withdrawalId: string,
): Promise<ConfirmationRecord | null> {
  const result = await withDb(async (db) => {
    const selected = await db.query<ConfirmationRecord>(
      `SELECT id,
              tx_hash AS "txHash",
              network,
              state,
              required_confirmations AS "requiredConfirmations",
              last_broadcast_at AS "lastBroadcastAt",
              updated_at AS "updatedAt"
         FROM withdrawals
        WHERE id = $1`,
      [withdrawalId],
    );
    const row = selected.rows[0];
    if (!row) throw new Error(`Withdrawal ${withdrawalId} not found`);

    if (["completed", "timeout", "cancelled", "failed"].includes(row.state)) {
      return null;
    }
    if (!["broadcasted", "confirming"].includes(row.state)) {
      throw new Error(
        `Withdrawal ${withdrawalId} is not confirmable from state ${row.state}`,
      );
    }
    if (!row.txHash) {
      throw new Error("withdrawal_confirmation_hash_missing");
    }

    return row;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}
