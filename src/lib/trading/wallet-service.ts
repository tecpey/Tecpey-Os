import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { D } from "./decimal";
import { holdFunds, holdFundsTx, releaseFunds } from "./wallet-balance-service";
import { parsePositiveOrderDecimal, toHoldAmount } from "./order-financials";

/** Exact financial value for authorization, comparison and mutation decisions. */
export async function getAvailableBalanceAmount(userId: string, asset: string): Promise<string> {
  const result = await withDb(async (client) => {
    const rows = await client.query<{ available_balance: string }>(
      `SELECT available_balance FROM wallet_balances WHERE user_id = $1 AND asset = $2`,
      [userId, asset.toUpperCase()],
    );
    return rows.rows[0]?.available_balance ?? "0";
  });
  return result.enabled ? (result.value ?? "0") : "0";
}

/** Compatibility/display helper. Never use this number for financial authority. */
export async function getAvailableBalance(userId: string, asset: string): Promise<number> {
  return D(await getAvailableBalanceAmount(userId, asset)).toNumber();
}

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

  const held = await holdFundsTx(client, userId, asset, canonical, orderId);
  if (!held) return false;

  const ledger = await client.query<{ amount: string }>(
    `SELECT amount::text AS amount
       FROM wallet_ledger
      WHERE wallet_id = $1
        AND asset = $2
        AND type = 'hold'
        AND reference_type = 'order'
        AND reference_id = $3
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, asset.toUpperCase(), orderId],
  );
  const ledgerAmount = ledger.rows[0]?.amount;
  if (!ledgerAmount || !D(ledgerAmount).eq(canonical)) {
    throw new Error("order_hold_ledger_mismatch");
  }
  return true;
}

export async function postHold(
  userId: string,
  asset: string,
  amount: string | number,
  orderId: string,
): Promise<boolean> {
  return holdFunds(userId, asset, amount, orderId);
}

export async function postRelease(
  userId: string,
  asset: string,
  amount: string | number,
  orderId: string,
): Promise<boolean> {
  return releaseFunds(userId, asset, amount, orderId);
}
