import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { postLedgerEntryTx } from "./ledger-service";
import { D, toFixed } from "./decimal";

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
      available: D(r.available_balance).toNumber(),
      held: D(r.held_balance).toNumber(),
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
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) return false;

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "hold",
    amount: toFixed(amount, 10),
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
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) {
    logger.warn("[wallet-balance-service] releaseFunds: no balance row", { userId, asset, amount });
    return false;
  }

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "release",
    amount: toFixed(amount, 10),
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
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) return false;

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "trade_credit",
    amount: toFixed(amount, 10),
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
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
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
    amount: toFixed(amount, 10),
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
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) {
    logger.warn("[wallet-balance-service] chargeFee: no balance row", { userId, asset, tradeId });
    return false;
  }

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "fee",
    amount: toFixed(amount, 10),
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
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) return false;

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "deposit",
    amount: toFixed(amount, 10),
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

// ══════════════════════════════════════════════════════════════════════════════
// WA-04A — Withdrawal accounting primitives
// ══════════════════════════════════════════════════════════════════════════════
//
// Three-phase model — every withdrawal goes through these steps:
//
//   1. reserve  —  available -= amount, held += amount   (type: "hold")
//   2. settle   —  held -= amount                         (type: "withdraw")
//   3. release  —  held -= amount, available += amount    (type: "release")
//
// Each step is a *Tx variant (production canonical API). The convenience
// wrappers at the bottom exist for consistency with the rest of this file
// but MUST NOT be used in withdrawal lifecycle code (WA-04C) — they run
// outside a managed transaction, so a crash between the UPDATE and the
// ledger INSERT would produce an unreconciled balance.
//
// Idempotency is enforced by a partial unique index on wallet_ledger:
//   UNIQUE (reference_type, reference_id, type)
//   WHERE reference_type = 'withdrawal' AND reference_id IS NOT NULL
//
// Within a *Tx function the idempotency SELECT is an optimisation — the
// index is the real enforcement.
// ──────────────────────────────────────────────────────────────────────────────

// ── 1. Reserve ────────────────────────────────────────────────────────────────
//
// Moves `amount` from available → held. This earmarks the funds so they
// cannot be spent by trading or another withdrawal.
// The WHERE clause rejects the operation when available is insufficient.

export async function reserveForWithdrawalTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  withdrawalId: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  // Idempotency — ledger unique index is the real enforcement
  const done = await client.query(
    `SELECT 1 FROM wallet_ledger
     WHERE reference_type = 'withdrawal'
       AND reference_id   = $1
       AND type           = 'hold'
     LIMIT 1`,
    [withdrawalId],
  );
  if (done.rows.length > 0) return true;

  await ensureRowTx(client, userId, asset);

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET
       available_balance = available_balance - $3,
       held_balance      = held_balance      + $3,
       updated_at        = NOW()
     WHERE user_id = $1 AND asset = $2 AND available_balance >= $3
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) return false;

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "hold",
    amount: toFixed(amount, 10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId: withdrawalId,
    referenceType: "withdrawal",
  });

  return true;
}

// Convenience wrapper — NOT safe for lifecycle use (see note above).
export async function reserveForWithdrawal(
  userId: string,
  asset: string,
  amount: number,
  withdrawalId: string,
): Promise<boolean> {
  const result = await withDb((client) =>
    reserveForWithdrawalTx(client, userId, asset, amount, withdrawalId),
  );
  return result.enabled ? (result.value ?? false) : false;
}

// ── 2. Settle (consume from held) ────────────────────────────────────────────
//
// Deducts `amount` from held_balance only.  This is the final accounting
// event — the funds are gone (broadcast on chain).
// Available_balance is NEVER touched.  The WHERE guard prevents settling
// more than was reserved.

export async function consumeHeldWithdrawalTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  withdrawalId: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  // Idempotency — ledger unique index is the real enforcement
  const done = await client.query(
    `SELECT 1 FROM wallet_ledger
     WHERE reference_type = 'withdrawal'
       AND reference_id   = $1
       AND type           = 'withdraw'
     LIMIT 1`,
    [withdrawalId],
  );
  if (done.rows.length > 0) return true;

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET
       held_balance = held_balance - $3,
       updated_at   = NOW()
     WHERE user_id = $1 AND asset = $2 AND held_balance >= $3
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) {
    logger.error("[wallet-balance-service] consumeHeldWithdrawal: insufficient held", {
      userId, asset, amount, withdrawalId,
    });
    return false;
  }

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "withdraw",
    amount: toFixed(amount, 10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId: withdrawalId,
    referenceType: "withdrawal",
  });

  return true;
}

// Convenience wrapper — NOT safe for lifecycle use (see note above).
export async function consumeHeldWithdrawal(
  userId: string,
  asset: string,
  amount: number,
  withdrawalId: string,
): Promise<boolean> {
  const result = await withDb((client) =>
    consumeHeldWithdrawalTx(client, userId, asset, amount, withdrawalId),
  );
  return result.enabled ? (result.value ?? false) : false;
}

// ── 3. Release ───────────────────────────────────────────────────────────────
//
// Returns earmarked funds from held back to available.
// Used when a withdrawal fails / is cancelled.
// Enforces held_balance >= amount so a caller cannot fabricate funds.

export async function releaseWithdrawalTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number,
  withdrawalId: string,
): Promise<boolean> {
  if (amount <= 0) return true;

  // Idempotency — ledger unique index is the real enforcement
  const done = await client.query(
    `SELECT 1 FROM wallet_ledger
     WHERE reference_type = 'withdrawal'
       AND reference_id   = $1
       AND type           = 'release'
     LIMIT 1`,
    [withdrawalId],
  );
  if (done.rows.length > 0) return true;

  const rows = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET
       available_balance = available_balance + $3,
       held_balance      = held_balance - $3,
       updated_at        = NOW()
     WHERE user_id = $1 AND asset = $2 AND held_balance >= $3
     RETURNING available_balance`,
    [userId, asset.toUpperCase(), toFixed(amount, 10)],
  );

  if (!rows.rowCount || rows.rowCount === 0) {
    logger.error("[wallet-balance-service] releaseWithdrawal: insufficient held", {
      userId, asset, amount, withdrawalId,
    });
    return false;
  }

  await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "release",
    amount: toFixed(amount, 10),
    balanceAfter: rows.rows[0].available_balance,
    referenceId: withdrawalId,
    referenceType: "withdrawal",
  });

  return true;
}

// Convenience wrapper — NOT safe for lifecycle use (see note above).
export async function releaseWithdrawal(
  userId: string,
  asset: string,
  amount: number,
  withdrawalId: string,
): Promise<boolean> {
  const result = await withDb((client) =>
    releaseWithdrawalTx(client, userId, asset, amount, withdrawalId),
  );
  return result.enabled ? (result.value ?? false) : false;
}
