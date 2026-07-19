import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { D } from "@/lib/trading/decimal";
import { trackAuthEvent } from "./auth-metrics";
import { writeAudit } from "./audit-log";
import {
  notifyRiskyWithdrawal,
  notifyWithdrawalBlocked,
  notifyWithdrawalRequested,
} from "./security-notifications";
import {
  canonicalizeWithdrawalCommand,
  consumeWithdrawalAuthorizationTx,
  evaluateWithdrawalCompliance,
  getAuthoritativeUsdValuation,
  getStrictWithdrawalRiskLevel,
  WITHDRAWAL_ADMISSION_POLICY_VERSION,
  WITHDRAWAL_COMPLIANCE_POLICY_VERSION,
  type CanonicalWithdrawalCommand,
  type WithdrawalComplianceDecision,
  type WithdrawalPriceEvidence,
} from "./withdrawal-admission-authority";
import {
  fetchWithdrawal,
  type WithdrawalRecord,
  type WithdrawalState,
} from "./withdrawal-service";

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
    return value.toFixed(18);
  } catch {
    return DEFAULT_DAILY_LIMIT_USD;
  }
}

function withdrawalIdFor(command: CanonicalWithdrawalCommand): string {
  return createHash("sha256")
    .update(`${command.userId}\0${command.idempotencyKey}`)
    .digest("hex")
    .slice(0, 32);
}

function withdrawalEventType(
  state: "approved" | "compliance_review" | "blocked",
): "withdrawal_admitted" | "compliance_review_required" | "withdrawal_blocked" {
  if (state === "approved") return "withdrawal_admitted";
  if (state === "blocked") return "withdrawal_blocked";
  return "compliance_review_required";
}

async function findExistingByIdempotency(
  client: PoolClient,
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
      FOR UPDATE`,
    [command.userId, command.idempotencyKey],
  );
  return existing.rows[0] ?? null;
}

async function enforceVelocityTx(
  client: PoolClient,
  userId: string,
  amountUsd: string,
): Promise<void> {
  const velocity = await client.query<{ total_usd: string }>(
    `SELECT COALESCE(SUM(amount_usd), 0)::text AS total_usd
       FROM withdrawals
      WHERE user_id = $1
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND state NOT IN ('rejected', 'blocked', 'cancelled')`,
    [userId],
  );
  const usedUsd = D(velocity.rows[0]?.total_usd ?? "0");
  if (usedUsd.plus(amountUsd).gt(dailyLimitUsd())) {
    throw new AdmissionError("withdrawal_velocity_exceeded", 403);
  }
}

async function reserveExactWithdrawalTx(
  client: PoolClient,
  command: CanonicalWithdrawalCommand,
  withdrawalId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO wallet_balances
       (user_id, asset, available_balance, held_balance)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (user_id, asset) DO NOTHING`,
    [command.userId, command.asset],
  );

  const reserved = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
        SET available_balance = available_balance - $3::numeric,
            held_balance = held_balance + $3::numeric,
            updated_at = NOW()
      WHERE user_id = $1
        AND asset = $2
        AND available_balance >= $3::numeric
      RETURNING available_balance::text AS available_balance`,
    [command.userId, command.asset, command.amount],
  );
  if ((reserved.rowCount ?? 0) !== 1) {
    throw new AdmissionError("insufficient_balance", 409);
  }

  const ledger = await client.query(
    `INSERT INTO wallet_ledger
       (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
     VALUES ($1, $2, 'hold', $3::numeric, $4::numeric, $5, 'withdrawal')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      command.userId,
      command.asset,
      command.amount,
      reserved.rows[0].available_balance,
      withdrawalId,
    ],
  );
  if ((ledger.rowCount ?? 0) !== 1) {
    throw new Error("withdrawal_hold_ledger_conflict");
  }
}

async function releaseExactWithdrawalTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: string,
  withdrawalId: string,
): Promise<void> {
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
    throw new AdmissionError("withdrawal_release_failed", 503);
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

function applyRiskReview(
  compliance: WithdrawalComplianceDecision,
  riskReview: boolean,
): WithdrawalComplianceDecision {
  if (!riskReview || compliance.state !== "approved") return compliance;
  return {
    ...compliance,
    state: "compliance_review",
    reason: "account_risk_review",
    evidence: {
      ...compliance.evidence,
      riskAuthority: { status: "review" },
    },
  };
}

async function insertWithdrawalTx(input: {
  client: PoolClient;
  command: CanonicalWithdrawalCommand;
  requestHash: string;
  withdrawalId: string;
  authorizationId: string;
  valuation: WithdrawalPriceEvidence;
  compliance: WithdrawalComplianceDecision;
  deviceFingerprint: string;
  ip: string;
  userAgent: string;
}): Promise<void> {
  const {
    client,
    command,
    requestHash,
    withdrawalId,
    authorizationId,
    valuation,
    compliance,
    deviceFingerprint,
    ip,
    userAgent,
  } = input;
  const reserveFunds = compliance.state !== "blocked";

  if (reserveFunds) {
    await enforceVelocityTx(client, command.userId, valuation.amountUsd);
    await reserveExactWithdrawalTx(client, command, withdrawalId);
  }

  const evidence = {
    ...compliance.evidence,
    decision: compliance.state,
    reason: compliance.reason,
    price: {
      snapshotId: valuation.snapshotId,
      source: valuation.source,
      priceUsd: valuation.priceUsd,
      amountUsd: valuation.amountUsd,
      observedAt: valuation.observedAt.toISOString(),
      policyVersion: valuation.policyVersion,
    },
  };

  await client.query(
    `INSERT INTO withdrawals (
       id, user_id, asset, amount, amount_usd, destination_address,
       destination_tag, network, state, security_gate_passed,
       device_fingerprint, ip, user_agent, two_fa_verified, velocity_used,
       request_hash, idempotency_key, price_snapshot_id, price_usd,
       price_observed_at, admission_policy_version,
       compliance_policy_version, compliance_result, compliance_evidence,
       compliance_checked_at, authorization_id, funds_reserved_at,
       admission_completed_at, kyc_status, aml_risk, sanctions_hit
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11,$12,TRUE,$13,
       $14,$15,$16,$17,$18,$19,$20,$21,$21,NOW(),$22,
       CASE WHEN $23 THEN NOW() ELSE NULL END,NOW(),$24,$25,$26
     )`,
    [
      withdrawalId,
      command.userId,
      command.asset,
      command.amount,
      valuation.amountUsd,
      command.destinationAddress,
      command.destinationTag,
      command.network,
      compliance.state,
      deviceFingerprint.slice(0, 64),
      ip.slice(0, 80),
      userAgent.slice(0, 500),
      valuation.amountUsd,
      requestHash,
      command.idempotencyKey,
      valuation.snapshotId,
      valuation.priceUsd,
      valuation.observedAt,
      WITHDRAWAL_ADMISSION_POLICY_VERSION,
      WITHDRAWAL_COMPLIANCE_POLICY_VERSION,
      JSON.stringify(evidence),
      authorizationId,
      reserveFunds,
      compliance.kycStatus,
      compliance.amlRisk,
      compliance.sanctionsHit,
    ],
  );

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
        amountUsd: valuation.amountUsd,
        state: compliance.state,
        reason: compliance.reason,
        policyVersion: WITHDRAWAL_ADMISSION_POLICY_VERSION,
      }),
    ],
  );
}

export async function createAuthoritativeWithdrawal(
  input: CreateAuthoritativeWithdrawalInput,
): Promise<AuthoritativeWithdrawalCreateResult> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.authorizationId.trim(),
    )
  ) {
    return { ok: false, reason: "withdrawal_authorization_required", code: 403 };
  }

  const canonical = canonicalizeWithdrawalCommand(input);
  if (!canonical.ok) {
    return { ok: false, reason: canonical.reason, code: 400 };
  }
  const { command, requestHash } = canonical;

  const risk = await getStrictWithdrawalRiskLevel(command.userId);
  if (!risk.ok) return { ok: false, reason: risk.reason, code: 503 };
  if (risk.level === "withdraw_blocked" || risk.level === "all_blocked") {
    return { ok: false, reason: "account_withdraw_restricted", code: 403 };
  }

  const valuation = await getAuthoritativeUsdValuation(command.asset, command.amount);
  if (!valuation.ok) {
    return { ok: false, reason: valuation.reason, code: 503 };
  }

  const withdrawalId = withdrawalIdFor(command);
  const compliance = applyRiskReview(
    await evaluateWithdrawalCompliance({
      withdrawalId,
      userId: command.userId,
      asset: command.asset,
      amount: command.amount,
      destinationAddress: command.destinationAddress,
    }),
    risk.level === "review",
  );

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
        authorizationId: input.authorizationId.trim(),
        userId: command.userId,
        requestHash,
      });
      if (!authorizationConsumed) {
        throw new AdmissionError("withdrawal_authorization_invalid", 403);
      }

      await insertWithdrawalTx({
        client,
        command,
        requestHash,
        withdrawalId,
        authorizationId: input.authorizationId.trim(),
        valuation: valuation.evidence,
        compliance,
        deviceFingerprint: input.deviceFingerprint,
        ip: input.ip,
        userAgent: input.userAgent,
      });

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
      userAgent: input.userAgent,
      resourceType: "withdrawal",
      resourceId: withdrawal.id,
      metadata: {
        event: "withdrawal_admitted",
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

export async function listUserWithdrawalsStrict(
  userId: string,
  limit: number,
  offset: number,
): Promise<
  | { ok: true; withdrawals: WithdrawalRecord[] }
  | { ok: false; reason: "withdrawal_storage_unavailable" }
> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ id: string }>(
      `SELECT id
         FROM withdrawals
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, Math.min(limit, 100), Math.max(offset, 0)],
    );
    return rows.rows.map((row) => row.id);
  });
  if (!result.enabled) return { ok: false, reason: "withdrawal_storage_unavailable" };

  const records = await Promise.all(
    result.value.map((id) => fetchWithdrawal(id, userId)),
  );
  if (records.some((record) => record === null)) {
    return { ok: false, reason: "withdrawal_storage_unavailable" };
  }
  return {
    ok: true,
    withdrawals: records.filter((record): record is WithdrawalRecord => record !== null),
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
        `SELECT state, asset, amount, funds_reserved_at
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
        await releaseExactWithdrawalTx(
          client,
          userId,
          row.asset,
          row.amount,
          withdrawalId,
        );
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
    logger.error("[withdrawal-admission] cancellation failed", {
      withdrawalId,
      userId,
      error: String(error),
    });
    return { ok: false, reason: "withdrawal_cancel_failed", code: 503 };
  }

  trackAuthEvent("withdrawal_cancelled");
  return { ok: true };
}
