import { withDb } from "@/lib/db";
import { holdFunds, releaseFunds } from "./wallet-balance-service";

// ── Available balance ─────────────────────────────────────────────────────────
//
// Phase 30: O(1) read from wallet_balances — no longer a full ledger aggregate.
// Returns 0 if no balance row exists (new user, untouched asset).

export async function getAvailableBalance(userId: string, asset: string): Promise<number> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ available_balance: string }>(
      `SELECT available_balance FROM wallet_balances WHERE user_id = $1 AND asset = $2`,
      [userId, asset.toUpperCase()],
    );
    return rows.rows[0]?.available_balance ?? "0";
  });
  if (!result.enabled) return 0;
  return parseFloat(result.value ?? "0");
}

// ── Hold / release ────────────────────────────────────────────────────────────
//
// Delegates to wallet-balance-service for atomic single-SQL operations.
// Kept here so existing call sites (e.g. orders/route.ts) need no import changes.

export async function postHold(
  userId: string,
  asset: string,
  amount: number,
  orderId: string,
): Promise<boolean> {
  return holdFunds(userId, asset, amount, orderId);
}

export async function postRelease(
  userId: string,
  asset: string,
  amount: number,
  orderId: string,
): Promise<boolean> {
  return releaseFunds(userId, asset, amount, orderId);
}
