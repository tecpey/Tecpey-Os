import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { PLATFORM } from "@/lib/platform-config";
import {
  claimApiCommandTx,
  completeApiCommandTx,
  type ApiCommandScope,
} from "./api-command-idempotency";
import { trackAuthEvent } from "./auth-metrics";
import {
  readWithdrawal,
  type WithdrawalRecord,
  type WithdrawalState,
} from "./withdrawal-read-authority";

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
  try {
    const transaction = await withTx(async (client) => {
      // The receipt has to be filed under the withdrawal's own tenant, because
      // tecpey_append_withdrawal_cancel_evidence resolves it by that tenant
      // (migration 0072) before it will write the custody evidence row. So the
      // owning tenant is read first and the scope built from it, rather than
      // assumed to be the platform default.
      //
      // Reading before claiming changes one edge: a replay naming a withdrawal
      // that is not this user's now returns withdrawal_not_found instead of the
      // stored receipt. Withdrawals are never deleted and the replay branch
      // already refuses a mismatched withdrawalId, so the only requests this can
      // reach were being refused a moment later anyway.
      const owner = await client.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM withdrawals WHERE id = $1 AND user_id = $2`,
        [input.withdrawalId, input.userId],
      );
      const ownerTenantId = owner.rows[0]?.tenant_id;
      if (!ownerTenantId) throw new WithdrawalCancelError("withdrawal_not_found", 404);

      const receiptScope: ApiCommandScope = {
        tenantId: ownerTenantId,
        principalType: "user",
        principalId: input.userId,
        operation: "withdrawal.cancel",
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
      };

      // Receipts written before migration 0072 were filed under the platform
      // default whatever tenant the withdrawal belonged to. A retry of one of
      // those would miss the scope above, claim a fresh command, then find the
      // withdrawal already cancelled and answer withdrawal_cannot_be_cancelled —
      // a 409 for a request that had already succeeded, which is the opposite of
      // what an idempotency key is for.
      //
      // Only a non-default owner can have a receipt in the other scope, so the
      // default-tenant path never runs this and never pays for it.
      if (ownerTenantId !== PLATFORM.DEFAULT_TENANT_ID) {
        const legacy = await client.query<{
          request_hash: string;
          response_body: WithdrawalCancelReceipt | null;
        }>(
          `SELECT request_hash, response_body
             FROM api_command_receipts
            WHERE tenant_id = $1
              AND principal_type = 'user'
              AND principal_id = $2
              AND operation = 'withdrawal.cancel'
              AND idempotency_key = $3
              AND status = 'completed'
            LIMIT 1`,
          [PLATFORM.DEFAULT_TENANT_ID, input.userId, input.idempotencyKey],
        );
        const retained = legacy.rows[0];
        if (retained) {
          // The same key with different arguments is still a conflict, exactly
          // as it would be in the owning scope.
          if (retained.request_hash !== input.requestHash) {
            throw new WithdrawalCancelError("idempotency_conflict", 409);
          }
          if (retained.response_body?.withdrawalId !== input.withdrawalId) {
            throw new WithdrawalCancelError("idempotency_conflict", 409);
          }
          return {
            withdrawalId: retained.response_body.withdrawalId,
            replayed: true,
            tenantId: ownerTenantId,
          };
        }
      }

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
        if (claim.response.withdrawalId !== input.withdrawalId) {
          throw new WithdrawalCancelError("idempotency_conflict", 409);
        }
        return {
          withdrawalId: claim.response.withdrawalId,
          replayed: true,
          tenantId: ownerTenantId,
        };
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
      return { withdrawalId: row.id, replayed: false, tenantId: ownerTenantId };
    });

    if (!transaction.enabled) {
      return { ok: false, reason: "withdrawal_storage_unavailable", code: 503 };
    }

    // The read-back has to be scoped to the same tenant the withdrawal belongs
    // to. readWithdrawal defaults to the platform default, so for a withdrawal
    // owned by any other tenant this returned nothing and the caller was told
    // "storage unavailable" — after the cancellation had already committed. A
    // user was shown a 503 for an operation that succeeded.
    const read = await readWithdrawal(
      transaction.value.withdrawalId,
      input.userId,
      transaction.value.tenantId,
    );
    if (!read.ok || !read.withdrawal) {
      return { ok: false, reason: "withdrawal_storage_unavailable", code: 503 };
    }

    if (!transaction.value.replayed) {
      trackAuthEvent("withdrawal_cancelled");
    }

    return {
      ok: true,
      withdrawal: read.withdrawal,
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
