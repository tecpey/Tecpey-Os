import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { D } from "../../lib/trading/decimal";
import {
  admitExchangeOrderCommand,
  processExchangeOrderCommand,
} from "../../lib/trading/order-command-service";
import { PLATFORM } from "../../lib/platform-config";
import { isolateExchangeOrderTestCache } from "./exchange-order-test-environment";

const restoreTestCache = isolateExchangeOrderTestCache();
after(restoreTestCache);

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

type BalanceEvidence = {
  user_id: string;
  asset: string;
  available_balance: string;
  held_balance: string;
};

function assertBalance(
  row: BalanceEvidence | undefined,
  input: {
    userId: string;
    asset: string;
    available: string;
    held: string;
  },
): void {
  assert.ok(row, `missing balance ${input.userId}:${input.asset}`);
  assert.equal(row.user_id, input.userId);
  assert.equal(row.asset, input.asset);
  assert.equal(D(row.available_balance).eq(input.available), true);
  assert.equal(D(row.held_balance).eq(input.held), true);
}

describe("Exchange fee-covered settlement authority", () => {
  it("fills a crossing buy when the buyer owns exactly the committed notional plus fee reserve", {
    skip: !databaseConfigured,
    timeout: 45_000,
  }, async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const baseAsset = `F${suffix}`;
    const market = `${baseAsset}USDT`;
    const buyerId = `fee-buyer-${randomUUID()}`;
    const sellerId = `fee-seller-${randomUUID()}`;

    const seeded = await withDb(async (client) => {
      await client.query(
        `INSERT INTO markets
          (symbol, base_asset, quote_asset, status, tick_size, step_size,
           min_order_value, max_order_value, price_precision,
           quantity_precision, maker_fee, taker_fee)
         VALUES ($1, $2, 'USDT', 'active', '0.01', '0.00001',
                 '1', '1000000', 2, 5, '0.001', '0.001')`,
        [market, baseAsset],
      );
      await client.query(
        `INSERT INTO wallet_balances
          (user_id, asset, available_balance, held_balance)
         VALUES
          ($1, $2, '0.1000000000', 0),
          ($3, 'USDT', '10.0100000000', 0)`,
        [sellerId, baseAsset, buyerId],
      );
    });
    assert.equal(seeded.enabled, true);

    const seller = await admitExchangeOrderCommand({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      userId: sellerId,
      idempotencyKey: `fee-seller-${randomUUID()}`,
      request: {
        market,
        side: "sell",
        type: "limit",
        quantity: "0.10000",
        price: "100.00",
        timeInForce: "GTC",
      },
      hold: { asset: baseAsset, amount: "0.1000000000" },
    });
    assert.equal(seller.status, "admitted");
    if (seller.status !== "admitted") return;

    const sellerResting = await processExchangeOrderCommand(
      seller.commandId,
      `fee-seller-worker-${randomUUID()}`,
    );
    assert.equal(sellerResting.status, "final");
    if (sellerResting.status !== "final") return;
    assert.equal(sellerResting.outcome.accepted, true);
    assert.equal(sellerResting.order.status, "NEW");

    const buyer = await admitExchangeOrderCommand({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      userId: buyerId,
      idempotencyKey: `fee-buyer-${randomUUID()}`,
      request: {
        market,
        side: "buy",
        type: "limit",
        quantity: "0.10000",
        price: "100.00",
        timeInForce: "GTC",
      },
      hold: { asset: "USDT", amount: "10.0100000000" },
    });
    assert.equal(buyer.status, "admitted");
    if (buyer.status !== "admitted") return;

    const buyerFilled = await processExchangeOrderCommand(
      buyer.commandId,
      `fee-buyer-worker-${randomUUID()}`,
    );
    assert.equal(buyerFilled.status, "final");
    if (buyerFilled.status !== "final") return;
    assert.equal(buyerFilled.outcome.accepted, true);
    assert.equal(buyerFilled.outcome.tradeIds.length, 1);
    assert.equal(buyerFilled.order.status, "FILLED");

    const evidence = await withDb(async (client) => {
      const balances = await client.query<BalanceEvidence>(
        `SELECT user_id, asset, available_balance::text, held_balance::text
           FROM wallet_balances
          WHERE user_id = ANY($1::text[])
          ORDER BY user_id, asset`,
        [[buyerId, sellerId]],
      );
      const orders = await client.query<{ user_id: string; status: string }>(
        `SELECT user_id, status
           FROM orders
          WHERE id = ANY($1::uuid[])
          ORDER BY user_id`,
        [[seller.order.id, buyer.order.id]],
      );
      const residuals = await client.query<{
        reference_id: string;
        residual: string;
      }>(
        `SELECT reference_id,
                SUM(CASE WHEN type = 'hold' THEN amount
                         WHEN type = 'release' THEN -amount
                         ELSE 0 END)::text AS residual
           FROM wallet_ledger
          WHERE reference_type = 'order'
            AND reference_id = ANY($1::text[])
          GROUP BY reference_id
          ORDER BY reference_id`,
        [[seller.order.id, buyer.order.id]],
      );
      const fees = await client.query<{ wallet_id: string; amount: string }>(
        `SELECT wallet_id, amount::text
           FROM wallet_ledger
          WHERE reference_id = $1 AND type = 'fee'
          ORDER BY wallet_id`,
        [buyerFilled.outcome.tradeIds[0]],
      );
      return {
        balances: balances.rows,
        orders: orders.rows,
        residuals: residuals.rows,
        fees: fees.rows,
      };
    });
    assert.equal(evidence.enabled, true);
    if (!evidence.enabled) return;

    assert.deepEqual(
      evidence.value.orders,
      [
        { user_id: buyerId, status: "FILLED" },
        { user_id: sellerId, status: "FILLED" },
      ].sort((left, right) => left.user_id.localeCompare(right.user_id)),
    );
    assert.equal(
      evidence.value.residuals.every((row) => D(row.residual).isZero()),
      true,
    );

    const byBalance = new Map(
      evidence.value.balances.map((row) => [`${row.user_id}:${row.asset}`, row]),
    );
    assertBalance(byBalance.get(`${buyerId}:USDT`), {
      userId: buyerId,
      asset: "USDT",
      available: "0",
      held: "0",
    });
    assertBalance(byBalance.get(`${buyerId}:${baseAsset}`), {
      userId: buyerId,
      asset: baseAsset,
      available: "0.1",
      held: "0",
    });
    assertBalance(byBalance.get(`${sellerId}:${baseAsset}`), {
      userId: sellerId,
      asset: baseAsset,
      available: "0",
      held: "0",
    });
    assertBalance(byBalance.get(`${sellerId}:USDT`), {
      userId: sellerId,
      asset: "USDT",
      available: "9.99",
      held: "0",
    });

    assert.equal(evidence.value.fees.length, 2);
    const feeByWallet = new Map(
      evidence.value.fees.map((row) => [row.wallet_id, row.amount]),
    );
    assert.equal(D(feeByWallet.get(buyerId) ?? "NaN").eq("0.01"), true);
    assert.equal(D(feeByWallet.get(sellerId) ?? "NaN").eq("0.01"), true);
  });
});
