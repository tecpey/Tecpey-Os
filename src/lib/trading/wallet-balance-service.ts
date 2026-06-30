import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { postLedgerEntryTx } from "./ledger-service";

// ── Wallet balance service ────────────────────────────────────────────────────
//
// Provides atomic balance operations against the wallet_balances table.
// Each function updates available_balance / held_balance via a single SQL
// statement — no separate SELECT + UPDATE round-trip, so no TOCTOU race.
//
// Every operation also appends an immutable row to wallet_ledger for audit.
// Both the balance UPDATE and the ledger INSERT run inside the same transaction
// when using the *Tx variants.
//
// Pattern:
//   - holdFundsTx(client, ...)  — uses caller-provided tx client
//   - holdFunds(...)            — acquires its own connection via withDb

export type WalletBalance = {
  userId: string;
  asset: string;
  available: number;
  held: number;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

// Upsert a zero-balance row so UPDATE statements always find a row to modify.
async function ensureRowTx(client: PoolClient, userId: string, asset: string): Promise<void> {
  await client.query(
    `INSERT INTO wallet_balances (user_id, asset, available_balance, held_balance)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (user_id, asset) DO NOTHING`,
    [userId, asset.toUpperCase()],
  );
}

// ── Read balance ──────────────────────────────────────────────────────────────

export async function getBalance(userId: string, asset: string): Promise<WalletBalance | null> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{
      user_id: string;
      asset: string;
      available_balance: string;
      held_balance: string;
    }>(
      `SELECT user_id, asset, available_balance, held_balance
       FROM wallet_balances
       WHERE user_id = $1 AND asset = $2`,
      [userId, asset.toUpperCase()],
    );
    if (!rows.rows[0]) return null;
    const r = rows.rows[0];
    return {
      userId: r.user_id,
      asset: r.asset,
      available: parseFloat(r.available_balance),
      held: parseFloat(r.held_balance),
    };
  });
  if (!result.enabled) return null;
  return result.value;
}

// ── Hold ──────────────────────────────────────────────────────────────────────
//
// Moves `amount` from available_balance to held_balance.
// The WHERE clause enforces available_balance >= amount — if the constraint
// fails (0 rows updated), the order is rejected for insufficient balance.

export async function holdFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  orderId: string,
): Promise<boolean> {
  await ensureRowTx(client, userId, asset);

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET
       available_balance = available_balance - $3,
       held_balance      = held_balance      + $3,
       updated_at        = NOW()
     WHERE user_id = $1 AND asset = $2 AND available_balance >= $3
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), amount.toFixed(10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) return false;

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "hold",
    amount: amount.toFixed(10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId: orderId,
    referenceType: "order",
  });

  return true;
}

export async function holdFunds(
  userId: string,
  asset: string,
  amount: number,
  orderId: string,
): Promise<boolean> {
  const result = await withDb((client) => holdFundsTx(client, userId, asset, amount, orderId));
  return result.enabled ? (result.value ?? false) : false;
}

// ── Release ───────────────────────────────────────────────────────────────────
//
// Returns earmarked funds to available_balance.
// Uses GREATEST(0, ...) on held_balance to tolerate minor accounting skew
// (e.g., if a hold was partially released already).

export async function releaseFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  referenceId: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET
       available_balance = available_balance + $3,
       held_balance      = GREATEST(0, held_balance - $3),
       updated_at        = NOW()
     WHERE user_id = $1 AND asset = $2
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), amount.toFixed(10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) {
    logger.warn("[wallet-balance-service] releaseFunds: no balance row", { userId, asset, amount });
    return false;
  }

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "release",
    amount: amount.toFixed(10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId,
    referenceType: "order",
  });

  return true;
}

export async function releaseFunds(
  userId: string,
  asset: string,
  amount: number,
  referenceId: string,
): Promise<boolean> {
  const result = await withDb((client) =>
    releaseFundsTx(client, userId, asset, amount, referenceId),
  );
  return result.enabled ? (result.value ?? false) : false;
}

// ── Credit ────────────────────────────────────────────────────────────────────
//
// Increases available_balance — used for trade_credit (receiving purchased asset).

export async function creditFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  tradeId: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  await ensureRowTx(client, userId, asset);

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET available_balance = available_balance + $3, updated_at = NOW()
     WHERE user_id = $1 AND asset = $2
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), amount.toFixed(10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) return false;

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "trade_credit",
    amount: amount.toFixed(10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId: tradeId,
    referenceType: "trade",
  });

  return true;
}

// ── Debit ─────────────────────────────────────────────────────────────────────
//
// Decreases available_balance — used for trade_debit (spending the sold asset).
// Called AFTER release restores the earmarked funds to available, so available
// should be >= amount. Enforces available >= amount to prevent negative balance.

export async function debitFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  tradeId: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET available_balance = available_balance - $3, updated_at = NOW()
     WHERE user_id = $1 AND asset = $2 AND available_balance >= $3
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), amount.toFixed(10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) {
    logger.error("[wallet-balance-service] debitFunds: insufficient available", {
      userId, asset, amount, tradeId,
    });
    return false;
  }

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "trade_debit",
    amount: amount.toFixed(10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId: tradeId,
    referenceType: "trade",
  });

  return true;
}

// ── Fee ───────────────────────────────────────────────────────────────────────
//
// Deducts fee from available_balance. Uses LEAST($amount, available) to avoid
// a constraint violation when the fee is marginally larger than the remaining
// available due to floating-point rounding.

export async function chargeFeeTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  tradeId: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET available_balance = available_balance - LEAST($3, available_balance), updated_at = NOW()
     WHERE user_id = $1 AND asset = $2
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), amount.toFixed(10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) {
    logger.warn("[wallet-balance-service] chargeFee: no balance row", { userId, asset, tradeId });
    return false;
  }

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "fee",
    amount: amount.toFixed(10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId: tradeId,
    referenceType: "trade",
  });

  return true;
}

// ── Admin deposit ─────────────────────────────────────────────────────────────
//
// Credits available_balance unconditionally (admin top-up / test seeding).
// Phase 30: no deposit rails — this function exists for seed scripts only.

export async function depositFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  referenceId: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  await ensureRowTx(client, userId, asset);

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET available_balance = available_balance + $3, updated_at = NOW()
     WHERE user_id = $1 AND asset = $2
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), amount.toFixed(10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) return false;

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "deposit",
    amount: amount.toFixed(10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId,
    referenceType: "admin",
  });

  return true;
}

export async function depositFunds(
  userId: string,
  asset: string,
  amount: number,
  referenceId: string,
): Promise<boolean> {
  const result = await withDb((client) =>
    depositFundsTx(client, userId, asset, amount, referenceId),
  );
  return result.enabled ? (result.value ?? false) : false;
}
