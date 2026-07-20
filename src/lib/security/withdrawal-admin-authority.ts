import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { PLATFORM } from "@/lib/platform-config";
import { isCustodyCapabilityEnabled } from "@/lib/wallet/custody-launch-policy";
import {
  claimApiCommandTx,
  completeApiCommandTx,
  type ApiCommandScope,
} from "./api-command-idempotency";
import { trackAuthEvent } from "./auth-metrics";
import { writeAudit } from "./audit-log";

export type AuthoritativeAdminWithdrawalAction =
  | "approve"
  | "reject"
  | "block"
  | "flag_review";

export type AuthoritativeAdminWithdrawalResult =
  | { ok: true; replayed: boolean; state: string; userId: string; asset: string; amount: string }
  | { ok: false; reason: string; code: number };

type AdminWithdrawalReceipt = {
  state: string;
  userId: string;
  asset: string;
  amount: string;
};

class AdminWithdrawalError extends Error {
  constructor(
    readonly reason: string,
    readonly code: number,
  ) {
    super(reason);
  }
}

function complianceApprovalReady(evidence: unknown): boolean {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
  const root = evidence as Record<string, unknown>;
  const kyc = root.kyc as Record<string, unknown> | undefined;
  const aml = root.aml as Record<string, unknown> | undefined;
  const sanctions = root.sanctions as Record<string, unknown> | undefined;
  return (
    kyc?.status === "approved" &&
    aml?.status === "ok" &&
    aml?.riskScore === "low" &&
    aml?.requiresReview === false &&
    sanctions?.status === "ok" &&
    sanctions?.matched === false
  );
}

async function releaseReservedFundsTx(
  client: import("pg").PoolClient,
  input: { userId: string; asset: string; amount: string; withdrawalId: string },
): Promise<void> {
  const existing = await client.query(
    `SELECT 1
       FROM wallet_ledger
      WHERE reference_type = 'withdrawal'
        AND reference_id = $1
        AND type = 'release'
      LIMIT 1`,
    [input.withdrawalId],
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
    [input.userId, input.asset, input.amount],
  );
  if ((released.rowCount ?? 0) !== 1) {
    throw new AdminWithdrawalError("withdrawal_release_failed", 503);
  }

  const ledger = await client.query(
    `INSERT INTO wallet_ledger
       (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
     VALUES ($1, $2, 'release', $3::numeric, $4::numeric, $5, 'withdrawal')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      input.userId,
      input.asset,
      input.amount,
      released.rows[0].available_balance,
      input.withdrawalId,
    ],
  );
  if ((ledger.rowCount ?? 0) !== 1) {
    throw new Error("withdrawal_release_ledger_conflict");
  }
}

export async function adminActOnAuthoritativeWithdrawal(input: {
  withdrawalId: string;
  adminId: string;
  action: AuthoritativeAdminWithdrawalAction;
  notes?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
  requestHash: string;
}): Promise<AuthoritativeAdminWithdrawalResult> {
  const stateMap: Record<AuthoritativeAdminWithdrawalAction, string> = {
    approve: "approved",
    reject: "rejected",
    block: "blocked",
    flag_review: "compliance_review",
  };
  const requestedState = stateMap[input.action];
  const receiptScope: ApiCommandScope = {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    principalType: "admin",
    principalId: input.adminId,
    operation: "withdrawal.admin_action",
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
  };

  try {
    const result = await withTx(async (client) => {
      const claim = await claimApiCommandTx<AdminWithdrawalReceipt>(client, receiptScope);
      if (claim.status === "conflict") {
        throw new AdminWithdrawalError("idempotency_conflict", 409);
      }
      if (claim.status === "in_progress") {
        throw new AdminWithdrawalError("idempotency_in_progress", 409);
      }
      if (claim.status === "replayed") {
        return { ...claim.response, replayed: true };
      }

      const current = await client.query<{
        user_id: string;
        asset: string;
        amount: string;
        state: string;
        funds_reserved_at: Date | null;
        compliance_evidence: unknown;
      }>(
        `SELECT user_id, asset, amount::text AS amount, state,
                funds_reserved_at, compliance_evidence
           FROM withdrawals
          WHERE id = $1
          FOR UPDATE`,
        [input.withdrawalId],
      );
      const row = current.rows[0];
      if (!row) throw new AdminWithdrawalError("withdrawal_not_found", 404);

      if (row.state === requestedState) {
        const response = {
          replayed: true,
          state: row.state,
          userId: row.user_id,
          asset: row.asset,
          amount: row.amount,
        };
        await completeApiCommandTx(client, receiptScope, {
          httpStatus: 200,
          response: {
            state: response.state,
            userId: response.userId,
            asset: response.asset,
            amount: response.amount,
          },
        });
        return response;
      }

      if (!["pending", "compliance_review"].includes(row.state)) {
        throw new AdminWithdrawalError("invalid_state_transition", 409);
      }

      if (input.action === "approve") {
        if (!isCustodyCapabilityEnabled("withdrawal_approval")) {
          throw new AdminWithdrawalError("custody_launch_gate_disabled", 409);
        }
        if (!row.funds_reserved_at) {
          throw new AdminWithdrawalError("withdrawal_reservation_missing", 409);
        }
        if (!complianceApprovalReady(row.compliance_evidence)) {
          throw new AdminWithdrawalError("compliance_evidence_incomplete", 409);
        }
      }

      if (
        (input.action === "reject" || input.action === "block") &&
        row.funds_reserved_at
      ) {
        await releaseReservedFundsTx(client, {
          userId: row.user_id,
          asset: row.asset,
          amount: row.amount,
          withdrawalId: input.withdrawalId,
        });
      }

      await client.query(
        `UPDATE withdrawals
            SET state = $1,
                reviewed_by = $2,
                reviewed_at = NOW(),
                review_notes = $3,
                updated_at = NOW()
          WHERE id = $4`,
        [requestedState, input.adminId, input.notes ?? null, input.withdrawalId],
      );

      await client.query(
        `INSERT INTO withdrawal_admin_actions
           (id, withdrawal_id, admin_id, action, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          input.withdrawalId,
          input.adminId,
          input.action,
          input.notes ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      await client.query(
        `UPDATE withdrawal_admission_outbox
            SET status = CASE
                  WHEN $2 IN ('reject', 'block') THEN 'cancelled'
                  ELSE status
                END,
                updated_at = NOW()
          WHERE withdrawal_id = $1
            AND status IN ('pending', 'failed_retryable')`,
        [input.withdrawalId, input.action],
      );

      const response = {
        replayed: false,
        state: requestedState,
        userId: row.user_id,
        asset: row.asset,
        amount: row.amount,
      };
      await completeApiCommandTx(client, receiptScope, {
        httpStatus: 200,
        response: {
          state: response.state,
          userId: response.userId,
          asset: response.asset,
          amount: response.amount,
        },
      });
      return response;
    });

    if (!result.enabled) {
      return { ok: false, reason: "withdrawal_storage_unavailable", code: 503 };
    }

    if (!result.value.replayed) {
      if (input.action === "approve") trackAuthEvent("withdrawal_approved");
      else if (input.action === "reject") trackAuthEvent("withdrawal_rejected");
      else if (input.action === "block") trackAuthEvent("withdrawal_blocked");

      writeAudit({
        actorId: input.adminId,
        action: "admin_action",
        resourceType: "withdrawal",
        resourceId: input.withdrawalId,
        metadata: {
          action: input.action,
          notes: input.notes ?? null,
          resultingState: result.value.state,
        },
      });
    }

    return { ok: true, ...result.value };
  } catch (error) {
    if (error instanceof AdminWithdrawalError) {
      return { ok: false, reason: error.reason, code: error.code };
    }
    logger.error("[withdrawal-admin-authority] transition failed", {
      withdrawalId: input.withdrawalId,
      action: input.action,
      error: String(error),
    });
    return { ok: false, reason: "withdrawal_admin_action_failed", code: 503 };
  }
}
