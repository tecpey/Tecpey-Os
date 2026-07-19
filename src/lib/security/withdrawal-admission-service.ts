import { withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { D } from "@/lib/trading/decimal";
import { reserveForWithdrawalTx, releaseWithdrawalTx } from "@/lib/trading/wallet-balance-service";
import { trackAuthEvent } from "./auth-metrics";
import { writeAudit } from "./audit-log";
import {
  canonicalizeWithdrawalCommand,
  consumeWithdrawalAuthorizationTx,
  evaluateWithdrawalCompliance,
  getAuthoritativeUsdValuation,
  getStrictWithdrawalRiskLevel,
  WITHDRAWAL_ADMISSION_POLICY_VERSION,
  WITHDRAWAL_COMPLIANCE_POLICY_VERSION,
  type CanonicalWithdrawalCommand,
} from "./withdrawal-admission-authority";
import {
  fetchWithdrawal,
  type WithdrawalRecord,
  type WithdrawalState,
} from "./withdrawal-service";
import {
  notifyRiskyWithdrawal,
  notifyWithdrawalBlocked,
  notifyWithdrawalRequested,
} from "./security-notifications";

const DEFAULT_DAILY_LIMIT_USD = "10000";

export type CreateAuthoritativeWithdrawalInput = {
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  destinationTag?: string | null;
  network: string;
  idempotencyKey: string;
  authorizationId: string;
  deviceFingerprint: string;
  ip: string;
  userAgent: string;
};

export type AuthoritativeWithdrawalCreateResult =
  | {
      ok: true;
      withdrawal: WithdrawalRecord;
      replayed: boolean;
      httpStatus: 201 | 202;
    }
  | {
      ok: false;
      reason: string;
      code: number;
      withdrawalId?: string;
    };

class AdmissionError extends Error {
  constructor(
    readonly reason: string,
    readonly code: number,
  ) {
    super(reason);
  }
}

function dailyLimitUsd(): string {
  const raw = process.env.TECPEY_WITHDRAWAL_DAILY_LIMIT_USD?.trim();
  if (!raw) return DEFAULT_DAILY_LIMIT_USD;
  try {
    const value = D(raw);
    if (!value.isFinite() || value.lte(0) || value.gt(1_000_000)) {
      return DEFAULT_DAILY_LIMIT_USD;
    }
    return value.toFixed(2);
  } catch {
    return DEFAULT_DAILY_LIMIT_USD;
  }
}

function withdrawalEventType(
  state: "approved" | "compliance_review" | "blocked",
): "withdrawal_admitted" | "compliance_review_required" | "withdrawal_blocked" {
  if (state === "approved") return "withdrawal_admitted";
  if (state === "blocked") return "withdrawal_blocked";
  return "compliance_review_required";
}

async function findExistingByIdempotency(
  client: import("pg").PoolClient,
  command: CanonicalWithdrawalCommand,
): Promise<{ id: string; request_hash: string | null; state: string } | null> {
  const existing = await client.query<{
    id: string;
    request_hash: string | null;
    state: string;
  }>(
    `SELECT id, request_hash, state
       FROM withdrawals
      WHERE user_id = $1
        AND idempotency_key = $2
      LIMIT 1`,
    [command.userId, command.idempotencyKey],
  );
  return existing.rows[0] ?? null;
}

export async function createAuthoritativeWithdrawal(
  input: CreateAuthoritativeWithdrawalInput,
): Promise<AuthoritativeWithdrawalCreateResult> {
  if (!input.authorizationId || input.authorizationId.length > 100) {
    return { ok: false, reason: "withdrawal_authorization_required", code: 403 };
  }

  const canonical = canonicalizeWithdrawalCommand(input);
  if (!canonical.ok) {
    return { ok: false, reason: canonical.reason, code: 400 };
  }
  const { command, requestHash } = canonical;

  const risk = await getStrictWithdrawalRiskLevel(command.userId);
  if (!risk.ok) {
    return { ok: false, reason: risk.reason, code: 503 };
  }
  if (risk.level === "withdraw_blocked" || risk.level === "all_blocked") {
    return { ok: false, reason: "account_withdraw_restricted", code: 403 };
  }

  const valuation = await getAuthoritativeUsdValuation(command.asset, command.amount);
  if (!valuation.ok) {
    return { ok: false, reason: valuation.reason, code: 503 };
  }

  const withdrawalId = crypto.randomUUID();
  const compliance = await evaluateWithdrawalCompliance({
    withdrawalId,
    userId: command.userId,
    asset: command.asset,
    amount: command.amount,
    destinationAddress: command.destinationAddress,
  });
  if (risk.level === "review" && compliance.state === "approved") {
    compliance.state = "compliance_review";
    compliance.reason = "account_risk_review";
    compliance.evidence = {
      ...compliance.evidence,
      riskAuthority: { status: "review" },
    };
  }

  let transactionResult:
    | { withdrawalId: string; replayed: boolean; state: WithdrawalState }
    | null = null;

  try {
    const tx = await withTx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `withdrawal:${command.userId}`,
      ]);

      const existing = await findExistingByIdempotency(client, command);
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new AdmissionError("idempotency_conflict", 409);
        }
        return {
          withdrawalId: existing.id,
          replayed: true,
          state: existing.state as WithdrawalState,
        };
      }

      const authorizationConsumed = await consumeWithdrawalAuthorizationTx(client, {
        authorizationId: input.authorizationId,
        userId: command.userId,
        requestHash,
      });
      if (!authorizationConsumed) {
        throw new AdmissionError("withdrawal_authorization_invalid", 403);
      }

      const velocity = await client.query<{ total_usd: string }>(
        `SELECT COALESCE(SUM(amount_usd), 0)::text AS total_usd
           FROM withdrawals
          WHERE user_id = $1
            AND created_at >= NOW() - INTERVAL '24 hours'
            AND state NOT IN ('rejected', 'blocked', 'cancelled')`,
        [command.userId],
      );
      const usedUsd = D(velocity.rows[0]?.total_usd ?? "0");
      const proposedUsd = D(valuation.evidence.amountUsd);
      const limitUsd = D(dailyLimitUsd());
      if (usedUsd.plus(proposedUsd).gt(limitUsd)) {
        throw new AdmissionError("withdrawal_velocity_exceeded", 403);
      }

      await client.query(
        `INSERT INTO withdrawals
           (id, user_id, asset, amount, amount_usd, destination_address,
            destination_tag, network, state, security_gate_passed,
            device_fingerprint, ip, user_agent, two_fa_verified, velocity_used,
            request_hash, idempotency_key, price_snapshot_id, price_usd,
            price_observed_at, admission_policy_version,
            compliance_policy_version, compliance_result, compliance_evidence,
            compliance_checked_at, authorization_id)
         VALUES
           ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,$12,TRUE,$13,
            $14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),$23)`,
        [
          withdrawalId,
          command.userId,
          command.asset,
          command.amount,
          valuation.evidence.amountUsd,
          command.destinationAddress,
          command.destinationTag,
          command.network,
          compliance.state,
          input.deviceFingerprint.slice(0, 64),
          input.ip.slice(0, 80),
          input.userAgent.slice(0, 500),
          valuation.evidence.amountUsd,
          requestHash,
          command.idempotencyKey,
          valuation.evidence.snapshotId,
          valuation.evidence.priceUsd,
          valuation.evidence.observedAt,
          WITHDRAWAL_ADMISSION_POLICY_VERSION,
          WITHDRAWAL_COMPLIANCE_POLICY_VERSION,
          JSON.stringify(compliance.evidence),
          JSON.stringify(compliance.evidence),
          input.authorizationId,
        ],
      );

      if (compliance.state !== "blocked") {
        const reserved = await reserveForWithdrawalTx(
          client,
          command.userId,
          command.asset,
          command.amount as unknown as number,
          withdrawalId,
        );
        if (!reserved) throw new AdmissionError("insufficient_balance", 409);
        await client.query(
          `UPDATE withdrawals
              SET funds_reserved_at = NOW(),
                  admission_completed_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [withdrawalId],
        );
      } else {
        await client.query(
          `UPDATE withdrawals
              SET admission_completed_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [withdrawalId],
        );
      }

      const eventType = withdrawalEventType(compliance.state);
      await client.query(
        `INSERT INTO withdrawal_admission_outbox
           (withdrawal_id, event_type, idempotency_key, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          withdrawalId,
          eventType,
          `withdrawal-admission:${withdrawalId}:${eventType}`,
          JSON.stringify({
            userId: command.userId,
            asset: command.asset,
            amount: command.amount,
            amountUsd: valuation.evidence.amountUsd,
            state: compliance.state,
            reason: compliance.reason,
            policyVersion: WITHDRAWAL_ADMISSION_POLICY_VERSION,
          }),
        ],
      );

      return {
        withdrawalId,
        replayed: false,
        state: compliance.state as WithdrawalState,
      };
    });

    if (!tx.enabled) {
      return { ok: false, reason: "withdrawal_storage_unavailable", code: 503 };
    }
    transactionResult = tx.value;
  } catch (error) {
    if (error instanceof AdmissionError) {
      return { ok: false, reason: error.reason, code: error.code };
    }
    logger.error("[withdrawal-admission] transaction failed", {
      userId: command.userId,
      requestHash,
      error: String(error),
    });
    return { ok: false, reason: "withdrawal_admission_failed", code: 503 };
  }

  const withdrawal = await fetchWithdrawal(
    transactionResult.withdrawalId,
    command.userId,
  );
  if (!withdrawal) {
    return {
      ok: false,
      reason: "withdrawal_evidence_unavailable",
      code: 503,
      withdrawalId: transactionResult.withdrawalId,
    };
  }

  if (!transactionResult.replayed) {
    trackAuthEvent("withdrawal_requested");
    writeAudit({
      actorId: command.userId,
      action: "wallet_withdrawal",
      ip: input.ip,
      metadata: {
        event: "withdrawal_admitted",
        withdrawalId: withdrawal.id,
        requestHash,
        asset: command.asset,
        amount: command.amount,
        amountUsd: valuation.evidence.amountUsd,
        state: withdrawal.state,
        complianceReason: compliance.reason,
        priceSnapshotId: valuation.evidence.snapshotId,
      },
    });

    if (withdrawal.state === "blocked") {
      trackAuthEvent("withdrawal_blocked");
      notifyWithdrawalBlocked(command.userId, {
        withdrawalId: withdrawal.id,
        asset: command.asset,
        amount: command.amount,
        reason: compliance.reason,
      });
      return {
        ok: false,
        reason: compliance.reason,
        code: 403,
        withdrawalId: withdrawal.id,
      };
    }

    notifyWithdrawalRequested(command.userId, {
      withdrawalId: withdrawal.id,
      asset: command.asset,
      amount: command.amount,
      amountUsd: Number(valuation.evidence.amountUsd),
      network: command.network,
    });
    if (withdrawal.state === "compliance_review") {
      trackAuthEvent("withdrawal_compliance_review");
      notifyRiskyWithdrawal(command.userId, {
        withdrawalId: withdrawal.id,
        asset: command.asset,
        amount: command.amount,
        reason: compliance.reason,
      });
    }
  }

  return {
    ok: true,
    withdrawal,
    replayed: transactionResult.replayed,
    httpStatus: withdrawal.state === "approved" ? 201 : 202,
  };
}

export async function cancelAuthoritativeWithdrawal(
  withdrawalId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: string; code: number }> {
  try {
    const tx = await withTx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `withdrawal:${userId}`,
      ]);
      const current = await client.query<{
        state: string;
        asset: string;
        amount: string;
        funds_reserved_at: Date | null;
      }>(
        `SELECT state, asset, amount::text AS amount, funds_reserved_at
           FROM withdrawals
          WHERE id = $1 AND user_id = $2
          FOR UPDATE`,
        [withdrawalId, userId],
      );
      const row = current.rows[0];
      if (!row) throw new AdmissionError("withdrawal_not_found", 404);
      if (!["pending", "compliance_review"].includes(row.state)) {
        throw new AdmissionError("cannot_cancel_in_current_state", 409);
      }

      if (row.funds_reserved_at) {
        const released = await releaseWithdrawalTx(
          client,
          userId,
          row.asset,
          row.amount as unknown as number,
          withdrawalId,
        );
        if (!released) throw new AdmissionError("withdrawal_release_failed", 503);
      }

      await client.query(
        `UPDATE withdrawals
            SET state = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND user_id = $2`,
        [withdrawalId, userId],
      );
      await client.query(
        `UPDATE withdrawal_admission_outbox
            SET status = 'cancelled', updated_at = NOW()
          WHERE withdrawal_id = $1
            AND status IN ('pending', 'failed_retryable')`,
        [withdrawalId],
      );
      return true;
    });
    if (!tx.enabled) {
      return { ok: false, reason: "withdrawal_storage_unavailable", code: 503 };
    }
  } catch (error) {
    if (error instanceof AdmissionError) {
      return { ok: false, reason: error.reason, code: error.code };
    }
    return { ok: false, reason: "withdrawal_cancel_failed", code: 503 };
  }

  trackAuthEvent("withdrawal_cancelled");
  return { ok: true };
}
