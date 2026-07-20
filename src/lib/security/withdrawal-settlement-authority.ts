import { withTx } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import { hashSensitiveAuditRequest } from "@/lib/security/sensitive-mutation-audit";
import {
  completeWithdrawalConfirmationOutbox,
} from "@/lib/security/withdrawal-external-effect-authority";
import {
  fingerprintExpectedTransactionHash,
  writeWithdrawalExternalEffectEvidenceTx,
} from "@/lib/security/withdrawal-external-effect-evidence";

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
      network: string;
      state: string;
      tx_hash: string | null;
      funds_reserved_at: Date | null;
      confirmation_count: number;
      required_confirmations: number;
      block_number: string | null;
    }>(
      `SELECT user_id, asset, amount::text AS amount, network, state, tx_hash,
              funds_reserved_at, confirmation_count, required_confirmations,
              block_number
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

      // Compatibility-safe replay: current rows create the event in the same
      // settlement transaction. A legacy completed row is backfilled exactly
      // once from its locked authoritative facts rather than trusted from a
      // caller-supplied payload.
      await completeWithdrawalConfirmationOutbox(client, input.withdrawalId);
      await writeSettlementEvidence(client, {
        withdrawalId: input.withdrawalId,
        txHash: input.txHash,
        asset: row.asset,
        network: row.network,
        amount: row.amount,
        requiredConfirmations: row.required_confirmations,
        confirmations: row.confirmation_count,
        blockNumber: row.block_number,
      });
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
    if (input.confirmations < row.required_confirmations) {
      throw new Error(
        `Withdrawal ${input.withdrawalId} does not meet required confirmations`,
      );
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

    await completeWithdrawalConfirmationOutbox(client, input.withdrawalId);
    await writeSettlementEvidence(client, {
      withdrawalId: input.withdrawalId,
      txHash: input.txHash,
      asset: row.asset,
      network: row.network,
      amount: row.amount,
      requiredConfirmations: row.required_confirmations,
      confirmations: input.confirmations,
      blockNumber: input.blockNumber?.toString() ?? null,
    });
    return "settled" as const;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}

async function writeSettlementEvidence(
  client: Parameters<typeof writeWithdrawalExternalEffectEvidenceTx>[0],
  input: {
    withdrawalId: string;
    txHash: string;
    asset: string;
    network: string;
    amount: string;
    requiredConfirmations: number;
    confirmations: number;
    blockNumber: string | null;
  },
): Promise<void> {
  const transactionFingerprint = fingerprintExpectedTransactionHash(input.txHash);
  await writeWithdrawalExternalEffectEvidenceTx(client, {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorId: "withdrawal-settlement",
    action: "withdrawal.settle",
    resourceType: "withdrawal_settlement",
    resourceIdentity: `${input.withdrawalId}\u001f${input.txHash.toLowerCase()}`,
    correlationIdentity: `${input.withdrawalId}\u001f${input.txHash.toLowerCase()}`,
    requestHash: hashSensitiveAuditRequest({
      action: "withdrawal.settle",
      withdrawalId: input.withdrawalId,
      txHash: input.txHash.toLowerCase(),
      asset: input.asset,
      network: input.network,
      amount: input.amount,
      requiredConfirmations: input.requiredConfirmations,
      confirmations: input.confirmations,
      blockNumber: input.blockNumber,
    }),
    outcome: "success",
    metadata: {
      asset: input.asset,
      network: input.network.toLowerCase(),
      amount: input.amount,
      requiredConfirmations: input.requiredConfirmations,
      observedConfirmations: input.confirmations,
      blockNumber: input.blockNumber,
      transactionFingerprint,
      ledgerType: "withdraw",
      heldConsumed: true,
      finalState: "completed",
    },
  });
}
