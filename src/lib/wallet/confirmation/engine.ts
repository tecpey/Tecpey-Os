// Confirmation Engine — authoritative DB hydration and state-bound transitions.
// Queue payloads identify the withdrawal only; tx hash, network and policy come from PostgreSQL.

import type { ChainId, ConfirmationJobData } from "../types";
import { getProvider } from "../providers/registry";
import { withDb } from "@/lib/db";
import { trackWalletMetric } from "../observability";

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
  const withdrawal = await loadAuthoritativeConfirmation(data.withdrawalId);
  if (!withdrawal) return true;
  if (!withdrawal.txHash) {
    throw new Error(`Withdrawal ${data.withdrawalId} has no authoritative transaction hash`);
  }

  const deadlineBase = withdrawal.lastBroadcastAt ?? withdrawal.updatedAt;
  const deadline = deadlineBase.getTime() + getConfirmationTimeout(withdrawal.network);
  if (Date.now() > deadline) {
    await markWithdrawalTimeout(withdrawal.id, withdrawal.txHash);
    return true;
  }

  const startMs = Date.now();
  const provider = getProvider(withdrawal.network);
  const status = await provider.getConfirmationStatus(withdrawal.txHash);
  trackWalletMetric("confirmation_latency_ms", Date.now() - startMs);

  if (status.status === "dropped") {
    trackWalletMetric("tx_dropped_detected", 1);
    await markWithdrawalFailed(
      withdrawal.id,
      withdrawal.txHash,
      `Transaction dropped: ${withdrawal.txHash}`,
    );
    return true;
  }

  if (
    status.isComplete
    && status.confirmations >= withdrawal.requiredConfirmations
  ) {
    await markWithdrawalCompleted(
      withdrawal.id,
      withdrawal.txHash,
      status.confirmations,
      status.blockNumber,
    );
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

    if (["completed", "timeout", "cancelled"].includes(row.state)) return null;
    if (!["broadcasted", "confirming"].includes(row.state)) {
      throw new Error(`Withdrawal ${withdrawalId} is not confirmable from state ${row.state}`);
    }
    if (!row.txHash) {
      throw new Error(`Withdrawal ${withdrawalId} is confirmable without tx_hash`);
    }

    if (row.state === "broadcasted") {
      await db.query(
        `UPDATE withdrawals SET state = 'confirming', updated_at = NOW()
          WHERE id = $1 AND tx_hash = $2 AND state = 'broadcasted'`,
        [row.id, row.txHash],
      );
      row.state = "confirming";
    }
    return row;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}

async function markWithdrawalCompleted(
  withdrawalId: string,
  txHash: string,
  confirmations: number,
  blockNumber?: bigint,
): Promise<void> {
  await transitionConfirmationState(
    withdrawalId,
    txHash,
    `UPDATE withdrawals SET
       state = 'completed',
       confirmation_count = $3,
       block_number = $4,
       completed_at = NOW(),
       execution_error = NULL,
       updated_at = NOW()
     WHERE id = $1
       AND tx_hash = $2
       AND state IN ('broadcasted', 'confirming')`,
    [withdrawalId, txHash, confirmations, blockNumber ? blockNumber.toString() : null],
  );
}

async function markWithdrawalFailed(
  withdrawalId: string,
  txHash: string,
  error: string,
): Promise<void> {
  await transitionConfirmationState(
    withdrawalId,
    txHash,
    `UPDATE withdrawals SET
       state = 'failed',
       execution_error = $3,
       updated_at = NOW()
     WHERE id = $1
       AND tx_hash = $2
       AND state IN ('broadcasted', 'confirming')`,
    [withdrawalId, txHash, error],
  );
}

async function markWithdrawalTimeout(
  withdrawalId: string,
  txHash: string,
): Promise<void> {
  await transitionConfirmationState(
    withdrawalId,
    txHash,
    `UPDATE withdrawals SET
       state = 'timeout',
       execution_error = $3,
       updated_at = NOW()
     WHERE id = $1
       AND tx_hash = $2
       AND state IN ('broadcasted', 'confirming')`,
    [withdrawalId, txHash, `Confirmation timeout for tx: ${txHash}`],
  );
}

async function transitionConfirmationState(
  withdrawalId: string,
  txHash: string,
  sql: string,
  params: unknown[],
): Promise<void> {
  const result = await withDb(async (db) => db.query(sql, params));
  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  if (result.value.rowCount === 1) return;

  const current = await withDb(async (db) => db.query<{ state: string; txHash: string | null }>(
    `SELECT state, tx_hash AS "txHash" FROM withdrawals WHERE id = $1`,
    [withdrawalId],
  ));
  const row = current.enabled ? current.value.rows[0] : null;
  if (row && row.txHash === txHash && ["completed", "failed", "timeout"].includes(row.state)) {
    return;
  }
  throw new Error(`Withdrawal ${withdrawalId} confirmation transition rejected`);
}
