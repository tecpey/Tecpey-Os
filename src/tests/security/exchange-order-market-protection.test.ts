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

describe("Exchange market-buy total-spend protection", () => {
  it("rejects and releases a market buy whose quote cap covers notional but not fee", {
    skip: !databaseConfigured,
    timeout: 45_000,
  }, async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const baseAsset = `P${suffix}`;
    const market = `${baseAsset}USDT`;
    const sellerId = `protection-seller-${randomUUID()}`;
    const buyerId = `protection-buyer-${randomUUID()}`;

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
          ($3, 'USDT', '10.0050000000', 0)`,
        [sellerId, baseAsset, buyerId],
      );
    });
    assert.equal(seeded.enabled, true);

    const seller = await admitExchangeOrderCommand({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      userId: sellerId,
      idempotencyKey: `protection-seller-${randomUUID()}`,
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
    const sellerResult = await processExchangeOrderCommand(
      seller.commandId,
      `protection-seller-worker-${randomUUID()}`,
    );
    assert.equal(sellerResult.status, "final");
    if (sellerResult.status !== "final") return;
    assert.equal(sellerResult.outcome.accepted, true);

    const buyer = await admitExchangeOrderCommand({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      userId: buyerId,
      idempotencyKey: `protection-buyer-${randomUUID()}`,
      request: {
        market,
        side: "buy",
        type: "market",
        quantity: "0.10000",
        timeInForce: "IOC",
      },
      hold: { asset: "USDT", amount: "10.0050000000" },
    });
    assert.equal(buyer.status, "admitted");
    if (buyer.status !== "admitted") return;

    const rejected = await processExchangeOrderCommand(
      buyer.commandId,
      `protection-buyer-worker-${randomUUID()}`,
    );
    assert.equal(rejected.status, "final");
    if (rejected.status !== "final") return;
    assert.equal(rejected.outcome.accepted, false);
    assert.equal(rejected.outcome.reason, "market_price_protection");
    assert.equal(rejected.outcome.tradeIds.length, 0);
    assert.equal(rejected.order.status, "EXPIRED");

    const evidence = await withDb(async (client) => {
      const balance = await client.query<{
        available_balance: string;
        held_balance: string;
      }>(
        `SELECT available_balance::text, held_balance::text
           FROM wallet_balances
          WHERE user_id = $1 AND asset = 'USDT'`,
        [buyerId],
      );
      const trades = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM trades
          WHERE buyer_order_id = $1::uuid`,
        [buyer.order.id],
      );
      const residual = await client.query<{ residual: string }>(
        `SELECT COALESCE(SUM(CASE WHEN type = 'hold' THEN amount
                                 WHEN type = 'release' THEN -amount
                                 ELSE 0 END), 0)::text AS residual
           FROM wallet_ledger
          WHERE wallet_id = $1
            AND reference_type = 'order'
            AND reference_id = $2`,
        [buyerId, buyer.order.id],
      );
      return {
        balance: balance.rows[0],
        trades: trades.rows[0]?.count ?? "0",
        residual: residual.rows[0]?.residual ?? "NaN",
      };
    });
    assert.equal(evidence.enabled, true);
    if (!evidence.enabled) return;
    assert.equal(
      D(evidence.value.balance?.available_balance ?? "NaN").eq("10.005"),
      true,
    );
    assert.equal(
      D(evidence.value.balance?.held_balance ?? "NaN").isZero(),
      true,
    );
    assert.equal(evidence.value.trades, "0");
    assert.equal(D(evidence.value.residual).isZero(), true);
  });
});
