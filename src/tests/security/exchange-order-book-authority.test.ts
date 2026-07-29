import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { rebuildMarketBookFromAuthority } from "../../lib/trading/order-book-recovery";
import { getOrderBookStore } from "../../lib/trading/order-book-store";
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

describe("Exchange order-book authority", () => {
  it("excludes admitted or processing commands until they are final and accepted", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const market = `B${suffix}USDT`;
    const userId = `book-authority-${randomUUID()}`;
    const seeded = await withDb(async (client) => {
      await client.query(
        `INSERT INTO markets
          (symbol, base_asset, quote_asset, status, tick_size, step_size,
           min_order_value, max_order_value, price_precision,
           quantity_precision, maker_fee, taker_fee)
         VALUES ($1, $2, 'USDT', 'active', '0.01', '0.00001',
                 '1', '1000000', 2, 5, '0.001', '0.001')`,
        [market, market.replace(/USDT$/, "")],
      );
      await client.query(
        `INSERT INTO wallet_balances
          (user_id, asset, available_balance, held_balance)
         VALUES ($1, 'USDT', '100.0000000000', 0)`,
        [userId],
      );
    });
    assert.equal(seeded.enabled, true);

    const admitted = await admitExchangeOrderCommand({
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      userId,
      idempotencyKey: `book-authority-${randomUUID()}`,
      request: {
        market,
        side: "buy",
        type: "limit",
        quantity: "0.10000",
        price: "100.00",
        timeInForce: "GTC",
      },
      hold: { asset: "USDT", amount: "10.0000000000" },
    });
    assert.equal(admitted.status, "admitted");
    if (admitted.status !== "admitted") return;

    await rebuildMarketBookFromAuthority(market);
    assert.equal(getOrderBookStore().getLevels(market, "buy").length, 0);

    const finalized = await processExchangeOrderCommand(
      admitted.commandId,
      `book-worker-${randomUUID()}`,
    );
    assert.equal(finalized.status, "final");
    if (finalized.status !== "final") return;
    assert.equal(finalized.outcome.accepted, true);
    assert.equal(finalized.order.status, "NEW");

    await rebuildMarketBookFromAuthority(market);
    const levels = getOrderBookStore().getLevels(market, "buy");
    assert.equal(levels.length, 1);
    assert.equal(levels[0]?.orders.length, 1);
    assert.equal(levels[0]?.orders[0]?.orderId, admitted.order.id);
  });
});
