import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import {
  WITHDRAWAL_ADMISSION_POLICY_VERSION,
  WITHDRAWAL_AUTHORIZATION_TTL_SECONDS,
} from "./withdrawal-command-authority";

export async function issueWithdrawalAuthorizationTx(
  client: PoolClient,
  input: {
    userId: string;
    requestHash: string;
    verificationStep: number;
  },
): Promise<{ id: string; expiresAt: Date } | null> {
  if (!/^[a-f0-9]{64}$/.test(input.requestHash)) return null;
  if (!Number.isSafeInteger(input.verificationStep) || input.verificationStep <= 0) {
    return null;
  }

  const expiresAt = new Date(
    Date.now() + WITHDRAWAL_AUTHORIZATION_TTL_SECONDS * 1000,
  );
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO withdrawal_authorizations
       (user_id, request_hash, verification_step, policy_version, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.userId,
      input.requestHash,
      input.verificationStep,
      WITHDRAWAL_ADMISSION_POLICY_VERSION,
      expiresAt,
    ],
  );
  const id = inserted.rows[0]?.id;
  return id ? { id, expiresAt } : null;
}

/**
 * Cheap PostgreSQL preflight used before any external price/risk/compliance
 * work. It does not consume the authorization; the admission transaction must
 * still perform the authoritative atomic consume.
 */
export async function inspectWithdrawalAuthorization(input: {
  authorizationId: string;
  userId: string;
  requestHash: string;
}): Promise<"valid" | "invalid" | "unavailable"> {
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `SELECT 1
         FROM withdrawal_authorizations
        WHERE id = $1
          AND user_id = $2
          AND request_hash = $3
          AND policy_version = $4
          AND consumed_at IS NULL
          AND expires_at > NOW()
        LIMIT 1`,
      [
        input.authorizationId,
        input.userId,
        input.requestHash,
        WITHDRAWAL_ADMISSION_POLICY_VERSION,
      ],
    );
    return (rows.rowCount ?? 0) === 1;
  });
  if (!result.enabled) return "unavailable";
  return result.value ? "valid" : "invalid";
}

export async function consumeWithdrawalAuthorizationTx(
  client: PoolClient,
  input: { authorizationId: string; userId: string; requestHash: string },
): Promise<boolean> {
  const consumed = await client.query(
    `UPDATE withdrawal_authorizations
        SET consumed_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND request_hash = $3
        AND policy_version = $4
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING id`,
    [
      input.authorizationId,
      input.userId,
      input.requestHash,
      WITHDRAWAL_ADMISSION_POLICY_VERSION,
    ],
  );
  return (consumed.rowCount ?? 0) === 1;
}
