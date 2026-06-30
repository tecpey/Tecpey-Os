import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { postLedgerEntry } from "./ledger-service";

// Phase 29 convention: walletId === userId.
// A dedicated wallets table with proper foreign keys belongs in a future phase.

// ── Available balance ─────────────────────────────────────────────────────────
//
// Available balance = sum of all credits/returns − sum of all debits/locks.
// `hold` reduces available (funds earmarked for an open order).
// `release` restores available (order cancelled or partially expired).
// `trade_debit` is the actual financial deduction when a fill executes.
// `adjustment` is treated as additive (admin top-up); negative adjustments
// are not supported in Phase 29 — document as a gap.

export async function getAvailableBalance(userId: string, asset: string): Promise<number> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ available: string }>(
      `SELECT COALESCE(SUM(
         CASE
           WHEN type IN ('deposit', 'trade_credit', 'release', 'adjustment') THEN  amount
           WHEN type IN ('withdraw', 'trade_debit', 'fee', 'hold')           THEN -amount
           ELSE 0
         END
       ), 0)::TEXT AS available
       FROM wallet_ledger
       WHERE wallet_id = $1 AND asset = $2`,
      [userId, asset.toUpperCase()],
    );
    return rows.rows[0]?.available ?? "0";
  });
  if (!result.enabled) return 0;
  return parseFloat(result.value ?? "0");
}

// ── Internal helper ───────────────────────────────────────────────────────────
//
// Fetches current available balance then appends the ledger entry with the
// computed balance_after. Not perfectly atomic at high concurrency — the
// in-process engine serialises calls so this is safe for Phase 29.

async function appendEntry(
  userId: string,
  asset: string,
  type: "hold" | "release" | "trade_debit" | "trade_credit" | "fee",
  amount: number,
  referenceId: string,
  referenceType: string,
): Promise<boolean> {
  if (amount <= 0) return true; // no-op for zero amounts

  const current = await getAvailableBalance(userId, asset);
  const balanceAfter =
    type === "trade_credit" || type === "release"
      ? current + amount
      : current - amount;

  const entry = await postLedgerEntry({
    walletId: userId,
    asset: asset.toUpperCase(),
    type,
    amount: amount.toFixed(10),
    balanceAfter: balanceAfter.toFixed(10),
    referenceId,
    referenceType,
  });

  if (!entry) {
    logger.error("[wallet-service] failed to post ledger entry", {
      userId, asset, type, amount, referenceId,
    });
    return false;
  }
  return true;
}

// ── Public functions ──────────────────────────────────────────────────────────

export async function postHold(
  userId: string,
  asset: string,
  amount: number,
  orderId: string,
): Promise<boolean> {
  return appendEntry(userId, asset, "hold", amount, orderId, "order");
}

export async function postRelease(
  userId: string,
  asset: string,
  amount: number,
  orderId: string,
): Promise<boolean> {
  return appendEntry(userId, asset, "release", amount, orderId, "order");
}

export async function postTradeDebit(
  userId: string,
  asset: string,
  amount: number,
  tradeId: string,
): Promise<boolean> {
  return appendEntry(userId, asset, "trade_debit", amount, tradeId, "trade");
}

export async function postTradeCredit(
  userId: string,
  asset: string,
  amount: number,
  tradeId: string,
): Promise<boolean> {
  return appendEntry(userId, asset, "trade_credit", amount, tradeId, "trade");
}

export async function postFee(
  userId: string,
  asset: string,
  amount: number,
  tradeId: string,
): Promise<boolean> {
  return appendEntry(userId, asset, "fee", amount, tradeId, "trade");
}
