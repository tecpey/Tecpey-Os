import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { D } from "./decimal";
import { postLedgerEntryTx } from "./ledger-service";
import type { WalletBalance } from "./types";

const SCALE = 10;

function rowToBalance(row: Record<string, unknown>): WalletBalance {
  return {
    userId: String(row.user_id),
    asset: String(row.asset),
    availableBalance: String(row.available_balance),
    heldBalance: String(row.held_balance),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

function exactAmount(value: string | number, options?: { allowZero?: boolean }): string {
  const amount = D(value);
  const validSign = options?.allowZero ? amount.gte(0) : amount.gt(0);
  if (!amount.isFinite() || !validSign || amount.decimalPlaces() > SCALE) {
    throw new Error("invalid_exact_wallet_amount");
  }
  return amount.toFixed(SCALE);
}

export async function getWalletBalance(userId: string, asset: string): Promise<WalletBalance | null> {
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `SELECT * FROM wallet_balances WHERE user_id = $1 AND asset = $2`,
      [userId, asset.toUpperCase()],
    );
    return rows.rows[0] ? rowToBalance(rows.rows[0]) : null;
  });
  if (!result.enabled) return null;
  return result.value ?? null;
}

export async function getUserBalances(userId: string): Promise<WalletBalance[]> {
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `SELECT * FROM wallet_balances WHERE user_id = $1 ORDER BY asset`,
      [userId],
    );
    return rows.rows.map(rowToBalance);
  });
  if (!result.enabled) return [];
  return result.value ?? [];
}

export async function ensureWalletBalance(userId: string, asset: string): Promise<WalletBalance | null> {
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `INSERT INTO wallet_balances (user_id, asset, available_balance, held_balance)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (user_id, asset) DO UPDATE SET updated_at = wallet_balances.updated_at
       RETURNING *`,
      [userId, asset.toUpperCase()],
    );
    return rows.rows[0] ? rowToBalance(rows.rows[0]) : null;
  });
  if (!result.enabled) return null;
  return result.value ?? null;
}

export async function seedInitialBalance(
  userId: string,
  asset: string,
  amount: number,
): Promise<WalletBalance | null> {
  if (process.env.NODE_ENV === "production") {
    logger.error("[wallet-balance] seedInitialBalance blocked in production", { userId, asset });
    throw new Error("seed_balance_forbidden_in_production");
  }
  const canonical = exactAmount(amount);
  const result = await withDb(async (client) => {
    const rows = await client.query(
      `INSERT INTO wallet_balances (user_id, asset, available_balance, held_balance)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (user_id, asset) DO UPDATE
         SET available_balance = wallet_balances.available_balance + EXCLUDED.available_balance,
             updated_at = NOW()
       RETURNING *`,
      [userId, asset.toUpperCase(), canonical],
    );
    return rows.rows[0] ? rowToBalance(rows.rows[0]) : null;
  });
  if (!result.enabled) return null;
  return result.value ?? null;
}

export async function holdFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: string,
  orderId: string,
): Promise<boolean> {
  const canonical = exactAmount(amount);
  const result = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET available_balance = available_balance - $3::numeric,
         held_balance = held_balance + $3::numeric,
         updated_at = NOW()
     WHERE user_id = $1 AND asset = $2 AND available_balance >= $3::numeric
     RETURNING available_balance::text AS available_balance`,
    [userId, asset.toUpperCase(), canonical],
  );
  if (!result.rows[0]) return false;
  const entry = await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "hold",
    amount: canonical,
    balanceAfter: result.rows[0].available_balance,
    referenceId: orderId,
    referenceType: "order",
  });
  if (!entry) throw new Error("hold_ledger_write_failed");
  return true;
}

export async function releaseFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: string,
  orderId: string,
): Promise<boolean> {
  const canonical = exactAmount(amount);
  const result = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET available_balance = available_balance + $3::numeric,
         held_balance = held_balance - $3::numeric,
         updated_at = NOW()
     WHERE user_id = $1 AND asset = $2 AND held_balance >= $3::numeric
     RETURNING available_balance::text AS available_balance`,
    [userId, asset.toUpperCase(), canonical],
  );
  if (!result.rows[0]) return false;
  const entry = await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "release",
    amount: canonical,
    balanceAfter: result.rows[0].available_balance,
    referenceId: orderId,
    referenceType: "order",
  });
  if (!entry) throw new Error("release_ledger_write_failed");
  return true;
}

export async function creditFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: string,
  referenceId: string,
): Promise<boolean> {
  const canonical = exactAmount(amount, { allowZero: true });
  if (D(canonical).isZero()) return true;
  const result = await client.query<{ available_balance: string }>(
    `INSERT INTO wallet_balances (user_id, asset, available_balance, held_balance)
     VALUES ($1, $2, $3::numeric, 0)
     ON CONFLICT (user_id, asset) DO UPDATE
       SET available_balance = wallet_balances.available_balance + EXCLUDED.available_balance,
           updated_at = NOW()
     RETURNING available_balance::text AS available_balance`,
    [userId, asset.toUpperCase(), canonical],
  );
  if (!result.rows[0]) return false;
  const entry = await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "trade_credit",
    amount: canonical,
    balanceAfter: result.rows[0].available_balance,
    referenceId,
    referenceType: "trade",
  });
  if (!entry) throw new Error("credit_ledger_write_failed");
  return true;
}

export async function debitFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: string,
  referenceId: string,
): Promise<boolean> {
  const canonical = exactAmount(amount, { allowZero: true });
  if (D(canonical).isZero()) return true;
  const result = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET available_balance = available_balance - $3::numeric,
         updated_at = NOW()
     WHERE user_id = $1 AND asset = $2 AND available_balance >= $3::numeric
     RETURNING available_balance::text AS available_balance`,
    [userId, asset.toUpperCase(), canonical],
  );
  if (!result.rows[0]) return false;
  const entry = await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "trade_debit",
    amount: canonical,
    balanceAfter: result.rows[0].available_balance,
    referenceId,
    referenceType: "trade",
  });
  if (!entry) throw new Error("debit_ledger_write_failed");
  return true;
}

export async function chargeFeeTx(
  client: PoolClient,
  userId: string,
  asset: string,
  fee: string,
  tradeId: string,
): Promise<boolean> {
  const canonical = exactAmount(fee, { allowZero: true });
  if (D(canonical).isZero()) return true;
  const result = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
     SET available_balance = available_balance - $3::numeric,
         updated_at = NOW()
     WHERE user_id = $1 AND asset = $2 AND available_balance >= $3::numeric
     RETURNING available_balance::text AS available_balance`,
    [userId, asset.toUpperCase(), canonical],
  );
  if (!result.rows[0]) return false;
  const entry = await postLedgerEntryTx(client, {
    walletId: userId,
    asset: asset.toUpperCase(),
    type: "fee",
    amount: canonical,
    balanceAfter: result.rows[0].available_balance,
    referenceId: tradeId,
    referenceType: "trade",
  });
  if (!entry) throw new Error("fee_ledger_write_failed");
  return true;
}

export async function releaseOutstandingOrderHoldTx(
  client: PoolClient,
  userId: string,
  asset: string,
  orderId: string,
): Promise<string> {
  const result = await client.query<{ outstanding: string }>(
    `SELECT GREATEST(
       COALESCE(SUM(CASE WHEN type = 'hold' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'release' THEN amount ELSE 0 END), 0),
       0
     )::text AS outstanding
     FROM wallet_ledger
     WHERE wallet_id = $1
       AND asset = $2
       AND reference_type = 'order'
       AND reference_id = $3
       AND type IN ('hold', 'release')`,
    [userId, asset.toUpperCase(), orderId],
  );
  const outstanding = exactAmount(result.rows[0]?.outstanding ?? "0", { allowZero: true });
  if (D(outstanding).isZero()) return outstanding;
  const released = await releaseFundsTx(client, userId, asset, outstanding, orderId);
  if (!released) throw new Error("outstanding_hold_release_failed");
  return outstanding;
}

export async function holdFunds(userId: string, asset: string, amount: string | number, orderId: string): Promise<boolean> {
  const canonical = exactAmount(amount);
  const result = await withDb((client) => holdFundsTx(client, userId, asset, canonical, orderId));
  return result.enabled && (result.value ?? false);
}

export async function releaseFunds(userId: string, asset: string, amount: string | number, orderId: string): Promise<boolean> {
  const canonical = exactAmount(amount);
  const result = await withDb((client) => releaseFundsTx(client, userId, asset, canonical, orderId));
  return result.enabled && (result.value ?? false);
}

export async function creditFunds(userId: string, asset: string, amount: string | number, referenceId: string): Promise<boolean> {
  const canonical = exactAmount(amount, { allowZero: true });
  const result = await withDb((client) => creditFundsTx(client, userId, asset, canonical, referenceId));
  return result.enabled && (result.value ?? false);
}

export async function debitFunds(userId: string, asset: string, amount: string | number, referenceId: string): Promise<boolean> {
  const canonical = exactAmount(amount, { allowZero: true });
  const result = await withDb((client) => debitFundsTx(client, userId, asset, canonical, referenceId));
  return result.enabled && (result.value ?? false);
}

export async function chargeFee(userId: string, asset: string, fee: string | number, tradeId: string): Promise<boolean> {
  const canonical = exactAmount(fee, { allowZero: true });
  const result = await withDb((client) => chargeFeeTx(client, userId, asset, canonical, tradeId));
  return result.enabled && (result.value ?? false);
}
