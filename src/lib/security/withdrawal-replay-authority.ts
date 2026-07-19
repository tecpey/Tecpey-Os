import { withDb } from "@/lib/db";
import { fetchWithdrawal, type WithdrawalRecord } from "./withdrawal-service";

export type WithdrawalReplayResolution =
  | { status: "none" }
  | { status: "replay"; withdrawal: WithdrawalRecord }
  | { status: "conflict" }
  | { status: "unavailable" };

/**
 * Resolve an already-committed command before consulting price, risk or
 * compliance providers. A response-loss replay must remain available even when
 * an external authority is temporarily unavailable; only the immutable request
 * hash may match the existing idempotency key.
 */
export async function resolveWithdrawalReplay(input: {
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<WithdrawalReplayResolution> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      id: string;
      request_hash: string | null;
    }>(
      `SELECT id, request_hash
         FROM withdrawals
        WHERE user_id = $1
          AND idempotency_key = $2
        LIMIT 1`,
      [input.userId, input.idempotencyKey],
    );
    return rows.rows[0] ?? null;
  });
  if (!result.enabled) return { status: "unavailable" };
  if (!result.value) return { status: "none" };
  if (result.value.request_hash !== input.requestHash) {
    return { status: "conflict" };
  }

  const withdrawal = await fetchWithdrawal(result.value.id, input.userId);
  return withdrawal
    ? { status: "replay", withdrawal }
    : { status: "unavailable" };
}
