import "server-only";

import { withDb } from "@/lib/db";

export const WITHDRAWAL_READ_AUTHORITY_VERSION =
  "withdrawal-read-authority-v1" as const;

export type WithdrawalState =
  | "pending"
  | "compliance_review"
  | "approved"
  | "rejected"
  | "blocked"
  | "completed"
  | "cancelled";

export type WithdrawalRecord = {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  amountUsd: number;
  destinationAddress: string;
  network: string;
  state: WithdrawalState;
  securityGatePassed: boolean;
  twoFaVerified: boolean;
  kycStatus: string | null;
  amlRisk: string | null;
  sanctionsHit: boolean;
  complianceResult: Record<string, unknown>;
  complianceCheckedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type WithdrawalReadResult =
  | { ok: true; withdrawal: WithdrawalRecord | null }
  | { ok: false; reason: "withdrawal_storage_unavailable" };

export type WithdrawalListResult =
  | { ok: true; withdrawals: WithdrawalRecord[] }
  | { ok: false; reason: "withdrawal_storage_unavailable" };

type WithdrawalRow = {
  id: string;
  user_id: string;
  asset: string;
  amount: string;
  amount_usd: string;
  destination_address: string;
  network: string;
  state: string;
  security_gate_passed: boolean;
  two_fa_verified: boolean;
  kyc_status: string | null;
  aml_risk: string | null;
  sanctions_hit: boolean;
  compliance_result: Record<string, unknown> | null;
  compliance_checked_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const WITHDRAWAL_PROJECTION_COLUMNS = `
  id,
  user_id,
  asset,
  amount::text AS amount,
  amount_usd::text AS amount_usd,
  destination_address,
  network,
  state,
  security_gate_passed,
  two_fa_verified,
  kyc_status,
  aml_risk,
  sanctions_hit,
  compliance_result,
  compliance_checked_at::text AS compliance_checked_at,
  reviewed_by,
  reviewed_at::text AS reviewed_at,
  review_notes,
  created_at::text AS created_at,
  updated_at::text AS updated_at,
  completed_at::text AS completed_at
`;

function toWithdrawalRecord(row: WithdrawalRow): WithdrawalRecord {
  return {
    id: row.id,
    userId: row.user_id,
    asset: row.asset,
    amount: row.amount,
    amountUsd: Number.parseFloat(row.amount_usd),
    destinationAddress: row.destination_address,
    network: row.network,
    state: row.state as WithdrawalState,
    securityGatePassed: row.security_gate_passed,
    twoFaVerified: row.two_fa_verified,
    kycStatus: row.kyc_status,
    amlRisk: row.aml_risk,
    sanctionsHit: row.sanctions_hit,
    complianceResult: row.compliance_result ?? {},
    complianceCheckedAt: row.compliance_checked_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function boundedLimit(value: number, fallback: number, maximum: number): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(Math.max(value, 1), maximum);
}

function boundedOffset(value: number): number {
  if (!Number.isSafeInteger(value)) return 0;
  return Math.max(value, 0);
}

export async function readWithdrawal(
  withdrawalId: string,
  ownerUserId?: string,
): Promise<WithdrawalReadResult> {
  const result = await withDb(async (client) => {
    const selected = await client.query<WithdrawalRow>(
      ownerUserId
        ? `SELECT ${WITHDRAWAL_PROJECTION_COLUMNS}
             FROM withdrawals
            WHERE id = $1
              AND user_id = $2
            LIMIT 1`
        : `SELECT ${WITHDRAWAL_PROJECTION_COLUMNS}
             FROM withdrawals
            WHERE id = $1
            LIMIT 1`,
      ownerUserId ? [withdrawalId, ownerUserId] : [withdrawalId],
    );
    return selected.rows[0] ?? null;
  });

  if (!result.enabled) {
    return { ok: false, reason: "withdrawal_storage_unavailable" };
  }
  return {
    ok: true,
    withdrawal: result.value ? toWithdrawalRecord(result.value) : null,
  };
}

export async function listUserWithdrawalsStrict(
  userId: string,
  limit: number,
  offset: number,
): Promise<WithdrawalListResult> {
  const result = await withDb(async (client) => {
    const selected = await client.query<WithdrawalRow>(
      `SELECT ${WITHDRAWAL_PROJECTION_COLUMNS}
         FROM withdrawals
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [userId, boundedLimit(limit, 20, 100), boundedOffset(offset)],
    );
    return selected.rows;
  });

  if (!result.enabled) {
    return { ok: false, reason: "withdrawal_storage_unavailable" };
  }
  return {
    ok: true,
    withdrawals: result.value.map(toWithdrawalRecord),
  };
}

export async function listPendingReviewWithdrawalsStrict(
  limit: number,
  offset: number,
): Promise<WithdrawalListResult> {
  const result = await withDb(async (client) => {
    const selected = await client.query<WithdrawalRow>(
      `SELECT ${WITHDRAWAL_PROJECTION_COLUMNS}
         FROM withdrawals
        WHERE state IN ('pending', 'compliance_review')
        ORDER BY created_at ASC, id ASC
        LIMIT $1 OFFSET $2`,
      [boundedLimit(limit, 50, 200), boundedOffset(offset)],
    );
    return selected.rows;
  });

  if (!result.enabled) {
    return { ok: false, reason: "withdrawal_storage_unavailable" };
  }
  return {
    ok: true,
    withdrawals: result.value.map(toWithdrawalRecord),
  };
}
