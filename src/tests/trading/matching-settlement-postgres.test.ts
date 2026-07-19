import { randomUUID } from "crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withDb, withTx } from "../../lib/db";
import { calculateOrderHold } from "../../lib/trading/order-financials";
import { createOrderTx, getOrder } from "../../lib/trading/order-service";
import { holdOrderFundsTx } from "../../lib/trading/wallet-service";
import { getMatchingEngine } from "../../lib/trading/engine";
import { D } from "../../lib/trading/decimal";
import type { Market, Order, PlaceOrderRequest } from "../../lib/trading/types";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));
const PLATFORM_FEE_WALLET_ID = "system:exchange-fees";

const market: Market = {
  symbol: "BTCUSDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  status: "active",
  tickSize: "0.01",
  stepSize: "0.00001",
  minOrderValue: "0.01",
  maxOrderValue: "500000",
  pricePrecision: 2,
  quantityPrecision: 5,
  makerFee: "0.001",
  takerFee: "0.001",
};

async function createHeldOrder(
  userId: string,
  request: PlaceOrderRequest,
): Promise<Order> {
  const hold = calculateOrderHold({ request, market });
  const result = await withTx(async (client) => {
    const order = await createOrderTx(client, { ...request, userId });
    if (!order) throw new Error("test_order_create_failed");
    const held = await holdOrderFundsTx(client, userId, hold.asset, hold.amount, order.id);
    if (!held) throw new Error("test_order_hold_failed");
    return order;
  });
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

async function balance(userId: string, asset: string): Promise<{ available: string; held: string }> {
  const result = await withDb(async (client) => {
    const row = await client.query<{ available: string; held: string }>(
      `SELECT available_balance::text AS available, held_balance::text AS held
         FROM wallet_balances
        WHERE user_id = $1 AND asset = $2`,
      [userId, asset],
    );
    return row.rows[0] ?? { available: "0", held: "0" };
  });
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

describe("PostgreSQL exact matching settlement", () => {
  it("conserves base, quote and both fees for a complete limit fill", {
    skip: !databaseConfigured,
    timeout: 60_000,
  }, async () => {
    const buyerId = `buyer-${randomUUID()}`;
    const sellerId = `seller-${randomUUID()}`;
    const makerRequest: PlaceOrderRequest = {
      market: market.symbol,
      side: "sell",
      type: "limit",
      quantity: "0.3",
      price: "0.10",
      timeInForce: "GTC",
    };
    const takerRequest: PlaceOrderRequest = {
      market: market.symbol,
      side: "buy",
      type: "limit",
      quantity: "0.3",
      price: "0.10",
      timeInForce: "GTC",
    };

    const initialPlatform = await balance(PLATFORM_FEE_WALLET_ID, "USDT");
    const orderIds: string[] = [];
    const tradeIds: string[] = [];

    try {
      const seeded = await withDb(async (client) => {
        await client.query(
          `INSERT INTO wallet_balances (user_id, asset, available_balance, held_balance)
           VALUES ($1, 'USDT', '1.0000000000', '0'),
                  ($2, 'BTC', '1.0000000000', '0')`,
          [buyerId, sellerId],
        );
        return true;
      });
      assert.equal(seeded.enabled, true);

      const maker = await createHeldOrder(sellerId, makerRequest);
      orderIds.push(maker.id);
      const engine = getMatchingEngine();
      await engine.rebuildFromDatabase();

      const taker = await createHeldOrder(buyerId, takerRequest);
      orderIds.push(taker.id);
      const result = await engine.placeOrder(taker);
      assert.equal(result.accepted, true);
      assert.equal(result.tradeIds.length, 1);
      tradeIds.push(...result.tradeIds);

      const [makerAfter, takerAfter] = await Promise.all([
        getOrder(maker.id, sellerId),
        getOrder(taker.id, buyerId),
      ]);
      assert.equal(makerAfter?.status, "FILLED");
      assert.equal(takerAfter?.status, "FILLED");
      assert.equal(makerAfter?.remainingQuantity, "0.0000000000");
      assert.equal(takerAfter?.remainingQuantity, "0.0000000000");
      assert.equal(takerAfter?.avgFillPrice, "0.1000000000");

      const buyerQuote = await balance(buyerId, "USDT");
      const buyerBase = await balance(buyerId, "BTC");
      const sellerBase = await balance(sellerId, "BTC");
      const sellerQuote = await balance(sellerId, "USDT");
      const platform = await balance(PLATFORM_FEE_WALLET_ID, "USDT");

      assert.deepEqual(buyerQuote, { available: "0.9699700000", held: "0.0000000000" });
      assert.deepEqual(buyerBase, { available: "0.3000000000", held: "0.0000000000" });
      assert.deepEqual(sellerBase, { available: "0.7000000000", held: "0.0000000000" });
      assert.deepEqual(sellerQuote, { available: "0.0299700000", held: "0.0000000000" });
      assert.equal(D(platform.available).minus(D(initialPlatform.available)).toFixed(10), "0.0000600000");

      const evidence = await withDb(async (client) => {
        const trade = await client.query<{
          price: string;
          quantity: string;
          fee_buyer: string;
          fee_seller: string;
        }>(
          `SELECT price::text, quantity::text, fee_buyer::text, fee_seller::text
             FROM trades WHERE id = $1`,
          [tradeIds[0]],
        );
        const ledger = await client.query<{ wallet_id: string; type: string; amount: string }>(
          `SELECT wallet_id, type, amount::text AS amount
             FROM wallet_ledger
            WHERE reference_id = $1
            ORDER BY wallet_id, type`,
          [tradeIds[0]],
        );
        return { trade: trade.rows[0], ledger: ledger.rows };
      });
      assert.equal(evidence.enabled, true);
      if (!evidence.enabled) return;
      assert.deepEqual(evidence.value.trade, {
        price: "0.1000000000",
        quantity: "0.3000000000",
        fee_buyer: "0.0000300000",
        fee_seller: "0.0000300000",
      });
      assert.equal(evidence.value.ledger.filter((row) => row.type === "fee").length, 2);
      assert.ok(evidence.value.ledger.some((row) =>
        row.wallet_id === PLATFORM_FEE_WALLET_ID && row.type === "trade_credit" && row.amount === "0.0000600000"));
    } finally {
      await withDb(async (client) => {
        if (tradeIds.length > 0) {
          await client.query("DELETE FROM wallet_ledger WHERE reference_id = ANY($1::text[])", [tradeIds]);
          await client.query("DELETE FROM trades WHERE id = ANY($1::uuid[])", [tradeIds]);
        }
        if (orderIds.length > 0) {
          await client.query("DELETE FROM wallet_ledger WHERE reference_id = ANY($1::text[])", [orderIds]);
          await client.query("DELETE FROM order_events WHERE order_id = ANY($1::uuid[])", [orderIds]);
          await client.query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [orderIds]);
        }
        await client.query("DELETE FROM wallet_balances WHERE user_id = ANY($1::text[])", [[buyerId, sellerId]]);
        await client.query(
          `UPDATE wallet_balances
              SET available_balance = $2::numeric,
                  held_balance = $3::numeric,
                  updated_at = NOW()
            WHERE user_id = $1 AND asset = 'USDT'`,
          [PLATFORM_FEE_WALLET_ID, initialPlatform.available, initialPlatform.held],
        );
        return true;
      });
      await getMatchingEngine().rebuildFromDatabase();
    }
  });
});
