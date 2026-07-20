import { withDb } from "@/lib/db";
import { finalizeWithdrawalBroadcastFailure } from "@/lib/security/withdrawal-external-effect-authority";

export async function recoverExpiredWithdrawalBroadcastAttempt(
  withdrawalId: string,
): Promise<"recovered" | "none"> {
  const selected = await withDb(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id
         FROM withdrawal_broadcast_attempts
        WHERE withdrawal_id = $1
          AND state = 'calling'
          AND lease_expires_at <= NOW()
        ORDER BY attempt_number DESC
        LIMIT 1`,
      [withdrawalId],
    );
    return result.rows[0]?.id ?? null;
  });
  if (!selected.enabled) {
    throw new Error("Withdrawal database unavailable");
  }
  if (!selected.value) return "none";

  // A stale `calling` attempt may have reached the provider before the worker
  // died. It is therefore unknown, never a normal retry. The canonical
  // finalizer atomically records ambiguous evidence so the next claim must
  // reconcile the deterministic expected hash before another RPC submission.
  await finalizeWithdrawalBroadcastFailure({
    withdrawalId,
    attemptId: selected.value,
    error: new Error("withdrawal_broadcast_lease_timeout"),
  });
  return "recovered";
}
