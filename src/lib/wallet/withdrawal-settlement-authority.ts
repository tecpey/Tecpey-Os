import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";

export type WithdrawalCompletionEvidence = {
  withdrawalId: string;
  txHash: string;
  confirmations: number;
  blockNumber: string | null;
};

export type WithdrawalCompletionResult =
  | { ok: true; replayed: boolean }
  | { ok: false; reason: string };

type LockedWithdrawal = {
  id: string;
  user_id: string;
  asset: string;
  amount: string;
  state: string;
  tx_hash: string | null;
  funds_reserved_at: Date | null;
};

async function settleCompletedWithdrawalTx(
  client: PoolClient,
  evidence: WithdrawalCompletionEvidence,
): Promise<WithdrawalCompletionResult> {
  const selected = await client.query<LockedWithdrawal>(
    `SELECT id, user_id, asset, amount::text AS amount, state, tx_hash,
            funds_reserved_at
       FROM withdrawals
      WHERE id = $1
      FOR UPDATE`,
    [evidence.withdrawalId],
  );
  const row = selected.rows[0];
  if (!row) return { ok: false, reason: "withdrawal_not_found" };
  if (row.tx_hash !== evidence.txHash) {
    return { ok: false, reason: "withdrawal_tx_hash_mismatch" };
  }

  if (row.state === "completed") {
    const ledger = await client.query(
      `SELECT 1
         FROM wallet_ledger
        WHERE reference_type = 'withdrawal'
          AND reference_id = $1
          AND type = 'withdraw'
        LIMIT 1`,
      [row.id],
    );
    return (ledger.rowCount ?? 0) === 1
      ? { ok: true, replayed: true }
      : { ok: false, reason: "completed_withdrawal_missing_ledger" };
  }

  if (!["broadcasted", "confirming"].includes(row.state)) {
    return { ok: false, reason: "withdrawal_not_confirmable" };
  }
  if (!row.funds_reserved_at) {
    return { ok: false, reason: "withdrawal_reservation_missing" };
  }

  const debited = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
        SET held_balance = held_balance - $3::numeric,
            updated_at = NOW()
      WHERE user_id = $1
        AND asset = $2
        AND held_balance >= $3::numeric
      RETURNING available_balance::text AS available_balance`,
    [row.user_id, row.asset, row.amount],
  );
  if ((debited.rowCount ?? 0) !== 1) {
    return { ok: false, reason: "withdrawal_held_balance_insufficient" };
  }

  const ledger = await client.query(
    `INSERT INTO wallet_ledger
       (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
     VALUES ($1, $2, 'withdraw', $3::numeric, $4::numeric, $5, 'withdrawal')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      row.user_id,
      row.asset,
      row.amount,
      debited.rows[0].available_balance,
      row.id,
    ],
  );
  if ((ledger.rowCount ?? 0) !== 1) {
    throw new Error("withdrawal_completion_ledger_conflict");
  }

  const completed = await client.query(
    `UPDATE withdrawals
        SET state = 'completed',
            confirmation_count = $3,
            block_number = $4,
            completed_at = NOW(),
            execution_error = NULL,
            funds_reserved_at = NULL,
            updated_at = NOW()
      WHERE id = $1
        AND tx_hash = $2
        AND state IN ('broadcasted', 'confirming')
      RETURNING id`,
    [
      row.id,
      evidence.txHash,
      evidence.confirmations,
      evidence.blockNumber,
    ],
  );
  if ((completed.rowCount ?? 0) !== 1) {
    throw new Error("withdrawal_completion_state_conflict");
  }

  return { ok: true, replayed: false };
}

export async function completeAuthoritativeWithdrawal(
  evidence: WithdrawalCompletionEvidence,
): Promise<WithdrawalCompletionResult> {
  const result = await withTx((client) => settleCompletedWithdrawalTx(client, evidence));
  if (!result.enabled) return { ok: false, reason: "withdrawal_storage_unavailable" };
  return result.value;
}
