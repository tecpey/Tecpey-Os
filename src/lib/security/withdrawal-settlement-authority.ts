import { withTx } from "@/lib/db";

export async function settleConfirmedWithdrawal(input: {
  withdrawalId: string;
  txHash: string;
  confirmations: number;
  blockNumber?: bigint;
}): Promise<"settled" | "replayed"> {
  const result = await withTx(async (client) => {
    const selected = await client.query<{
      user_id: string;
      asset: string;
      amount: string;
      state: string;
      tx_hash: string | null;
      funds_reserved_at: Date | null;
    }>(
      `SELECT user_id, asset, amount::text AS amount, state, tx_hash,
              funds_reserved_at
         FROM withdrawals
        WHERE id = $1
        FOR UPDATE`,
      [input.withdrawalId],
    );
    const row = selected.rows[0];
    if (!row) throw new Error(`Withdrawal ${input.withdrawalId} not found`);
    if (row.tx_hash !== input.txHash) {
      throw new Error(`Withdrawal ${input.withdrawalId} tx hash mismatch`);
    }

    const existingLedger = await client.query(
      `SELECT 1 FROM wallet_ledger
        WHERE wallet_id = $1
          AND reference_type = 'withdrawal'
          AND reference_id = $2
          AND type = 'withdraw'
        LIMIT 1`,
      [row.user_id, input.withdrawalId],
    );
    if (row.state === "completed") {
      if ((existingLedger.rowCount ?? 0) !== 1) {
        throw new Error(`Completed withdrawal ${input.withdrawalId} lacks withdraw ledger evidence`);
      }
      return "replayed" as const;
    }
    if (!["broadcasted", "confirming"].includes(row.state)) {
      throw new Error(
        `Withdrawal ${input.withdrawalId} is not settleable from state ${row.state}`,
      );
    }
    if (!row.funds_reserved_at) {
      throw new Error(`Withdrawal ${input.withdrawalId} has no reserved funds evidence`);
    }
    if ((existingLedger.rowCount ?? 0) !== 0) {
      throw new Error(`Withdrawal ${input.withdrawalId} has premature withdraw ledger evidence`);
    }

    const consumed = await client.query<{ available_balance: string }>(
      `UPDATE wallet_balances
          SET held_balance = held_balance - $3::numeric,
              updated_at = NOW()
        WHERE user_id = $1
          AND asset = $2
          AND held_balance >= $3::numeric
        RETURNING available_balance::text AS available_balance`,
      [row.user_id, row.asset, row.amount],
    );
    if ((consumed.rowCount ?? 0) !== 1) {
      throw new Error(`Withdrawal ${input.withdrawalId} held balance is insufficient`);
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
        consumed.rows[0].available_balance,
        input.withdrawalId,
      ],
    );
    if ((ledger.rowCount ?? 0) !== 1) {
      throw new Error(`Withdrawal ${input.withdrawalId} withdraw ledger conflict`);
    }

    const updated = await client.query(
      `UPDATE withdrawals SET
         state = 'completed',
         confirmation_count = $3,
         block_number = $4,
         completed_at = NOW(),
         funds_reserved_at = NULL,
         execution_error = NULL,
         updated_at = NOW()
       WHERE id = $1
         AND tx_hash = $2
         AND state IN ('broadcasted', 'confirming')
       RETURNING id`,
      [
        input.withdrawalId,
        input.txHash,
        input.confirmations,
        input.blockNumber ? input.blockNumber.toString() : null,
      ],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      throw new Error(`Withdrawal ${input.withdrawalId} completion transition rejected`);
    }
    return "settled" as const;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}
