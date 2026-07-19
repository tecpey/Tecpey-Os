import Decimal from "decimal.js";
import type { PoolClient } from "pg";
import { withDb } from "@/lib/db";
import { D, toFixed } from "./decimal";
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

async function strictLedgerMutationTx(input: {
  client: PoolClient;
  userId: string;
  asset: string;
  amount: number | string;
  referenceId: string;
  kind: "release" | "trade_debit" | "trade_credit" | "fee";
}): Promise<void> {
  const amount = toFixed(input.amount, 10);
  if (!D(amount).isPositive()) return;
  const asset = input.asset.toUpperCase();
  if (input.kind === "trade_credit") {
    await ensureWalletBalanceRowTx(input.client, input.userId, asset);
  }

  const balanceColumn = input.kind === "release" ? "held_balance" : "available_balance";
  const update = input.kind === "release"
    ? `UPDATE wallet_balances
          SET available_balance = available_balance + $3::numeric,
              held_balance = held_balance - $3::numeric,
              updated_at = NOW()
        WHERE user_id = $1 AND asset = $2 AND held_balance >= $3::numeric
        RETURNING available_balance::text AS balance_after`
    : input.kind === "trade_credit"
      ? `UPDATE wallet_balances
            SET available_balance = available_balance + $3::numeric,
                updated_at = NOW()
          WHERE user_id = $1 AND asset = $2
          RETURNING available_balance::text AS balance_after`
      : `UPDATE wallet_balances
            SET available_balance = available_balance - $3::numeric,
                updated_at = NOW()
          WHERE user_id = $1 AND asset = $2 AND available_balance >= $3::numeric
          RETURNING available_balance::text AS balance_after`;

  const updated = await input.client.query<{ balance_after: string }>(update, [
    input.userId,
    asset,
    amount,
  ]);
  if (!updated.rows[0]) {
    throw new Error(
      input.kind === "release"
        ? "order_hold_balance_mismatch"
        : `${input.kind}_${balanceColumn}_insufficient`,
    );
  }

  const ledger = await postLedgerEntryTx(input.client, {
    walletId: input.userId,
    asset,
    type: input.kind,
    amount,
    balanceAfter: updated.rows[0].balance_after,
    referenceId: input.referenceId,
    referenceType: input.kind === "release" ? "order" : "trade",
  });
  if (!ledger || !D(ledger.amount).eq(amount)) {
    throw new Error(`${input.kind}_ledger_mismatch`);
  }
}

async function matchedReleaseAmountTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number | string,
  orderId: string,
): Promise<string> {
  const normalizedAsset = asset.toUpperCase();
  const basis = D(toFixed(amount, 10));
  const authority = await client.query<{
    side: string;
    type: string;
    quote_asset: string;
    maker_fee: string;
    taker_fee: string;
  }>(
    `SELECT orders.side, orders.type, markets.quote_asset,
            markets.maker_fee::text, markets.taker_fee::text
       FROM orders
       JOIN markets ON markets.symbol = orders.market
      WHERE orders.id = $1::uuid AND orders.user_id = $2
      FOR SHARE OF orders, markets`,
    [orderId, userId],
  );
  const row = authority.rows[0];
  if (!row) throw new Error("order_hold_authority_missing");
  if (row.side !== "buy" || row.quote_asset !== normalizedAsset) {
    return basis.toFixed(10);
  }

  const feeRate = row.type === "market"
    ? D(row.taker_fee)
    : Decimal.max(D(row.maker_fee), D(row.taker_fee));
  const feeCovered = basis
    .times(D(1).plus(feeRate))
    .toDecimalPlaces(10, Decimal.ROUND_UP);
  const residual = D(
    await getOrderHoldResidualTx(client, userId, normalizedAsset, orderId),
  );
  if (residual.isZero()) throw new Error("order_hold_exhausted_before_trade");
  return Decimal.min(feeCovered, residual).toFixed(10);
}

export async function releaseMatchedOrderFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number | string,
  orderId: string,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`exchange-order-hold:${orderId}`],
  );
  const feeCoveredAmount = await matchedReleaseAmountTx(
    client,
    userId,
    asset,
    amount,
    orderId,
  );
  await strictLedgerMutationTx({
    client,
    userId,
    asset,
    amount: feeCoveredAmount,
    referenceId: orderId,
    kind: "release",
  });
}

export async function debitTradeFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number | string,
  tradeId: string,
): Promise<void> {
  await strictLedgerMutationTx({
    client,
    userId,
    asset,
    amount,
    referenceId: tradeId,
    kind: "trade_debit",
  });
}

export async function creditTradeFundsTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number | string,
  tradeId: string,
): Promise<void> {
  await strictLedgerMutationTx({
    client,
    userId,
    asset,
    amount,
    referenceId: tradeId,
    kind: "trade_credit",
  });
}

export async function chargeTradeFeeTx(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: number | string,
  tradeId: string,
): Promise<void> {
  await strictLedgerMutationTx({
    client,
    userId,
    asset,
    amount,
    referenceId: tradeId,
    kind: "fee",
  });
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
