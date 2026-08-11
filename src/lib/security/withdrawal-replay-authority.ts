import { withDb } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import {
  readWithdrawal,
  type WithdrawalRecord,
} from "./withdrawal-read-authority";

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
  tenantId?: string;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<WithdrawalReplayResolution> {
  const tenantId = input.tenantId?.trim() || PLATFORM.DEFAULT_TENANT_ID;
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      id: string;
      request_hash: string | null;
    }>(
      `SELECT id, request_hash
         FROM withdrawals
        WHERE tenant_id = $1
          AND user_id = $2
          AND idempotency_key = $3
        LIMIT 1`,
      [tenantId, input.userId, input.idempotencyKey],
    );
    return rows.rows[0] ?? null;
  });
  if (!result.enabled) return { status: "unavailable" };
  if (!result.value) return { status: "none" };
  if (result.value.request_hash !== input.requestHash) {
    return { status: "conflict" };
  }

  const read = await readWithdrawal(result.value.id, input.userId, tenantId);
  if (!read.ok) return { status: "unavailable" };
  return read.withdrawal
    ? { status: "replay", withdrawal: read.withdrawal }
    : { status: "unavailable" };
}
