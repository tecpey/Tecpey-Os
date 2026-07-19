import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { D } from "./decimal";
import { holdFunds, releaseFunds } from "./wallet-balance-service";
import { postLedgerEntryTx } from "./ledger-service";
import { parsePositiveOrderDecimal, toHoldAmount } from "./order-financials";

/** Exact financial value for authorization, comparison and mutation decisions. */
export async function getAvailableBalanceAmount(userId: string, asset: string): Promise<string> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ available_balance: string }>(
      `SELECT available_balance::text AS available_balance
         FROM wallet_balances
        WHERE user_id = $1 AND asset = $2`,
      [userId, asset.toUpperCase()],
    );
    return rows.rows[0]?.available_balance ?? "0";
  });
  if (!result.enabled) throw new Error("wallet_storage_unavailable");
  return result.value ?? "0";
}

/** Compatibility/display helper. Never use this number for financial authority. */
export async function getAvailableBalance(userId: string, asset: string): Promise<number> {
  return D(await getAvailableBalanceAmount(userId, asset)).toNumber();
}

async function ensureWalletBalanceRowTx(
  client: PoolClient,
  userId: string,
  asset: string,
): Promise<void> {
  await client.query(
    `INSERT INTO wallet_balances (user_id, asset, available_balance, held_balance)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (user_id, asset) DO NOTHING`,
    [userId, asset.toUpperCase()],
  );
}

/**
 * Exact, transactional order hold authority. No JavaScript number conversion is
 * allowed between validation, balance mutation and immutable ledger evidence.
 */
export async function holdOrderFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: string,
  orderId: string,
): Promise<boolean> {
  const parsed = parsePositiveOrderDecimal(amount);
  if (!parsed) throw new Error("invalid_order_hold_amount");
  const canonical = toHoldAmount(parsed);
  const normalizedAsset = asset.toUpperCase();

  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`exchange-order-hold:${orderId}`],
  );

  const existing = await client.query<{ amount: string }>(
    `SELECT amount::text AS amount
       FROM wallet_ledger
      WHERE wallet_id = $1
        AND asset = $2
        AND type = 'hold'
        AND reference_type = 'order'
        AND reference_id = $3
      ORDER BY created_at
      LIMIT 1`,
    [userId, normalizedAsset, orderId],
  );
  if (existing.rows[0]) {
    if (!D(existing.rows[0].amount).eq(canonical)) {
      throw new Error("order_hold_ledger_mismatch");
    }
    return true;
  }

  await ensureWalletBalanceRowTx(client, userId, normalizedAsset);
  const balance = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
        SET available_balance = available_balance - $3::numeric,
            held_balance = held_balance + $3::numeric,
            updated_at = NOW()
      WHERE user_id = $1
        AND asset = $2
        AND available_balance >= $3::numeric
      RETURNING available_balance::text AS available_balance`,
    [userId, normalizedAsset, canonical],
  );
  if (!balance.rows[0]) return false;

  const ledger = await postLedgerEntryTx(client, {
    walletId: userId,
    asset: normalizedAsset,
    type: "hold",
    amount: canonical,
    balanceAfter: balance.rows[0].available_balance,
    referenceId: orderId,
    referenceType: "order",
  });
  if (!ledger || !D(ledger.amount).eq(canonical)) {
    throw new Error("order_hold_ledger_mismatch");
  }
  return true;
}

/** Net unreleased amount for one order, derived from immutable ledger evidence. */
export async function getOrderHoldResidualTx(
  client: PoolClient,
  userId: string,
  asset: string,
  orderId: string,
): Promise<string> {
  const result = await client.query<{ residual: string }>(
    `SELECT COALESCE(SUM(
       CASE
         WHEN type = 'hold' THEN amount
         WHEN type = 'release' THEN -amount
         ELSE 0
       END
     ), 0)::text AS residual
       FROM wallet_ledger
      WHERE wallet_id = $1
        AND asset = $2
        AND reference_type = 'order'
        AND reference_id = $3`,
    [userId, asset.toUpperCase(), orderId],
  );
  const residual = result.rows[0]?.residual ?? "0";
  if (D(residual).isNegative()) throw new Error("order_hold_over_released");
  return residual;
}

/**
 * Releases exactly the remaining order hold. The per-order advisory lock and
 * ledger-derived residual make retries idempotent and prevent double release.
 */
export async function releaseOrderHoldResidualTx(
  client: PoolClient,
  userId: string,
  asset: string,
  orderId: string,
): Promise<string> {
  const normalizedAsset = asset.toUpperCase();
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`exchange-order-hold:${orderId}`],
  );
  const residual = await getOrderHoldResidualTx(
    client,
    userId,
    normalizedAsset,
    orderId,
  );
  if (D(residual).isZero()) return "0";

  const balance = await client.query<{ available_balance: string }>(
    `UPDATE wallet_balances
        SET available_balance = available_balance + $3::numeric,
            held_balance = held_balance - $3::numeric,
            updated_at = NOW()
      WHERE user_id = $1
        AND asset = $2
        AND held_balance >= $3::numeric
      RETURNING available_balance::text AS available_balance`,
    [userId, normalizedAsset, residual],
  );
  if (!balance.rows[0]) throw new Error("order_hold_balance_mismatch");

  const ledger = await postLedgerEntryTx(client, {
    walletId: userId,
    asset: normalizedAsset,
    type: "release",
    amount: residual,
    balanceAfter: balance.rows[0].available_balance,
    referenceId: orderId,
    referenceType: "order",
  });
  if (!ledger || !D(ledger.amount).eq(residual)) {
    throw new Error("order_release_ledger_mismatch");
  }
  return residual;
}

export async function assertOrderHoldClosedTx(
  client: PoolClient,
  userId: string,
  asset: string,
  orderId: string,
): Promise<void> {
  const residual = await getOrderHoldResidualTx(client, userId, asset, orderId);
  if (!D(residual).isZero()) {
    throw new Error("order_terminal_hold_not_closed");
  }
}

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
