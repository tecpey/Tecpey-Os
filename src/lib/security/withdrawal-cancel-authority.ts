import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  claimApiCommandTx,
  completeApiCommandTx,
  type ApiCommandScope,
} from "./api-command-idempotency";
import { trackAuthEvent } from "./auth-metrics";
import { writeAudit } from "./audit-log";
import {
  fetchWithdrawal,
  type WithdrawalRecord,
  type WithdrawalState,
} from "./withdrawal-service";

export type IdempotentWithdrawalCancelResult =
  | { ok: true; withdrawal: WithdrawalRecord; replayed: boolean }
  | { ok: false; reason: string; code: number };

type WithdrawalCancelReceipt = { withdrawalId: string };

class WithdrawalCancelError extends Error {
  constructor(
    readonly reason: string,
    readonly code: number,
  ) {
    super(reason);
  }
}

async function releaseExactWithdrawalTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: string,
  withdrawalId: string,
): Promise<void> {
  const existing = await client.query(
    `SELECT 1
       FROM wallet_ledger
      WHERE reference_type = 'withdrawal'
        AND reference_id = $1
        AND type = 'release'
      LIMIT 1`,
    [withdrawalId],
  );
  if (existing.rows.length > 0) return;

  const released = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
        SET available_balance = available_balance + $3::numeric,
            held_balance = held_balance - $3::numeric,
            updated_at = NOW()
      WHERE user_id = $1
        AND asset = $2
        AND held_balance >= $3::numeric
      RETURNING available_balance::text AS available_balance`,
    [userId, asset, amount],
  );
  if ((released.rowCount ?? 0) !== 1) {
    throw new WithdrawalCancelError("withdrawal_release_failed", 503);
  }

  const ledger = await client.query(
    `INSERT INTO wallet_ledger
       (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
     VALUES ($1, $2, 'release', $3::numeric, $4::numeric, $5, 'withdrawal')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [userId, asset, amount, released.rows[0].available_balance, withdrawalId],
  );
  if ((ledger.rowCount ?? 0) !== 1) {
    throw new Error("withdrawal_release_ledger_conflict");
  }
}

export async function cancelWithdrawalIdempotently(input: {
  withdrawalId: string;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<IdempotentWithdrawalCancelResult> {
  const receiptScope: ApiCommandScope = {
    principalType: "user",
    principalId: input.userId,
    operation: "withdrawal.cancel",
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
  };

  try {
    const transaction = await withTx(async (client) => {
      const claim = await claimApiCommandTx<WithdrawalCancelReceipt>(
        client,
        receiptScope,
      );
      if (claim.status === "conflict") {
        throw new WithdrawalCancelError("idempotency_conflict", 409);
      }
      if (claim.status === "in_progress") {
        throw new WithdrawalCancelError("idempotency_in_progress", 409);
      }
      if (claim.status === "replayed") {
        return { withdrawalId: claim.response.withdrawalId, replayed: true };
      }

      const locked = await client.query<{
        id: string;
        user_id: string;
        state: WithdrawalState;
        asset: string;
        amount: string;
        funds_reserved_at: Date | null;
      }>(
        `SELECT id, user_id, state, asset, amount::text AS amount, funds_reserved_at
           FROM withdrawals
          WHERE id = $1
            AND user_id = $2
          FOR UPDATE`,
        [input.withdrawalId, input.userId],
      );
      const row = locked.rows[0];
      if (!row) throw new WithdrawalCancelError("withdrawal_not_found", 404);
      if (!new Set<WithdrawalState>(["pending", "compliance_review"]).has(row.state)) {
        throw new WithdrawalCancelError("withdrawal_cannot_be_cancelled", 409);
      }

      if (row.funds_reserved_at) {
        await releaseExactWithdrawalTx(
          client,
          row.user_id,
          row.asset,
          row.amount,
          row.id,
        );
      }

      const updated = await client.query(
        `UPDATE withdrawals
            SET state = 'cancelled',
                funds_reserved_at = NULL,
                updated_at = NOW()
          WHERE id = $1
            AND user_id = $2
            AND state IN ('pending', 'compliance_review')`,
        [row.id, row.user_id],
      );
      if ((updated.rowCount ?? 0) !== 1) {
        throw new WithdrawalCancelError("withdrawal_cancel_race_lost", 409);
      }

      await client.query(
        `UPDATE withdrawal_admission_outbox
            SET status = 'cancelled', updated_at = NOW()
          WHERE withdrawal_id = $1
            AND status IN ('pending', 'failed_retryable')`,
        [row.id],
      );

      await completeApiCommandTx(client, receiptScope, {
        httpStatus: 200,
        response: { withdrawalId: row.id },
      });
      return { withdrawalId: row.id, replayed: false };
    });

    if (!transaction.enabled) {
      return { ok: false, reason: "withdrawal_storage_unavailable", code: 503 };
    }

    const withdrawal = await fetchWithdrawal(
      transaction.value.withdrawalId,
      input.userId,
    );
    if (!withdrawal) {
      return { ok: false, reason: "withdrawal_storage_unavailable", code: 503 };
    }

    if (!transaction.value.replayed) {
      trackAuthEvent("withdrawal_cancelled");
      writeAudit({
        actorId: input.userId,
        action: "wallet_withdrawal",
        resourceType: "withdrawal",
        resourceId: input.withdrawalId,
        metadata: {
          event: "withdrawal_cancelled",
          previousState: "pending_or_review",
          resultingState: "cancelled",
        },
      });
    }

    return {
      ok: true,
      withdrawal,
      replayed: transaction.value.replayed,
    };
  } catch (error) {
    if (error instanceof WithdrawalCancelError) {
      return { ok: false, reason: error.reason, code: error.code };
    }
    logger.error("[withdrawal-cancel-authority] cancellation failed", {
      withdrawalId: input.withdrawalId,
      userId: input.userId,
      error: String(error),
    });
    return { ok: false, reason: "withdrawal_cancel_failed", code: 503 };
  }
}
