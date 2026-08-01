import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import {
  EXCHANGE_RECONCILIATION_POLICY_VERSION,
  reconcileExchangeLedger,
} from "../../lib/trading/exchange-reconciliation";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

// Reconciliation is global by design, and a shared database carries fixtures
// from every other suite. Assertions therefore filter to identities this suite
// created, and every identity is unique per run so the suite stays re-runnable
// against one database.
const wallet = `recon-${randomUUID()}`;
const orderId = randomUUID();
const counterOrderId = randomUUID();
const tradeId = randomUUID();
const asset = "USDT";

function subjectsFor(deltas: Array<{ subject: string; code: string }>) {
  const mine = new Set([`${wallet}:${asset}`, orderId, counterOrderId, tradeId]);
  return deltas.filter((delta) => mine.has(delta.subject));
}

async function seedConsistentState(): Promise<void> {
  const seeded = await withDb(async (client) => {
    await client.query(
      `INSERT INTO wallet_balances (user_id, asset, available_balance, held_balance)
       VALUES ($1, $2, 70, 30)`,
      [wallet, asset],
    );
    await client.query(
      `INSERT INTO wallet_ledger
         (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
       VALUES ($1, $2, 'deposit', 100, 100, $3, 'admin'),
              ($1, $2, 'hold', 30, 70, $4, 'order')`,
      [wallet, asset, `seed-${wallet}`, orderId],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);
}

after(async () => {
  if (!integrationConfigured) return;
  await withDb(async (client) => {
    await client.query(`DELETE FROM wallet_ledger WHERE wallet_id = $1`, [wallet]);
    await client.query(`DELETE FROM wallet_balances WHERE user_id = $1`, [wallet]);
    await client.query(`DELETE FROM trades WHERE id = $1::uuid`, [tradeId]);
    await client.query(`DELETE FROM orders WHERE id = ANY($1::uuid[])`, [
      [orderId, counterOrderId],
    ]);
    return true;
  });
});

describe("Exchange reconciliation authority", () => {
  it(
    "reports no delta for state that agrees with the immutable ledger",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      await seedConsistentState();

      const report = await reconcileExchangeLedger();
      assert.equal(report.policyVersion, EXCHANGE_RECONCILIATION_POLICY_VERSION);
      assert.equal(report.checks.length, 6);
      assert.deepEqual(subjectsFor(report.deltas), []);
    },
  );

  it(
    "detects an injected one-unit balance discrepancy and fails closed",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const injected = await withDb(async (client) => {
        await client.query(
          `UPDATE wallet_balances
              SET available_balance = available_balance + 1
            WHERE user_id = $1 AND asset = $2`,
          [wallet, asset],
        );
        return true;
      });
      assert.equal(injected.enabled, true);

      const report = await reconcileExchangeLedger();
      assert.equal(report.reconciled, false);

      const mine = subjectsFor(report.deltas);
      assert.equal(mine.length, 1);
      assert.equal(mine[0]?.code, "wallet_available_ledger_divergence");

      const restored = await withDb(async (client) => {
        await client.query(
          `UPDATE wallet_balances
              SET available_balance = available_balance - 1
            WHERE user_id = $1 AND asset = $2`,
          [wallet, asset],
        );
        return true;
      });
      assert.equal(restored.enabled, true);
      assert.deepEqual(subjectsFor((await reconcileExchangeLedger()).deltas), []);
    },
  );

  it(
    "detects a terminal order that still holds funds",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const seeded = await withDb(async (client) => {
        await client.query(
          `INSERT INTO orders
             (id, user_id, market, side, type, status, price, quantity,
              filled_quantity, remaining_quantity)
           VALUES ($1::uuid, $2, 'BTCUSDT', 'buy', 'limit', 'CANCELLED',
                   100, 1, 0, 1)`,
          [orderId, wallet],
        );
        return true;
      });
      assert.equal(seeded.enabled, true);

      const report = await reconcileExchangeLedger();
      const mine = subjectsFor(report.deltas);
      assert.equal(mine.length, 1);
      assert.equal(mine[0]?.code, "terminal_order_residual_hold");

      // Releasing the hold through the ledger closes the delta without ever
      // rewriting history.
      const released = await withDb(async (client) => {
        await client.query(
          `INSERT INTO wallet_ledger
             (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
           VALUES ($1, $2, 'release', 30, 100, $3, 'order')`,
          [wallet, asset, orderId],
        );
        await client.query(
          `UPDATE wallet_balances
              SET available_balance = 100, held_balance = 0
            WHERE user_id = $1 AND asset = $2`,
          [wallet, asset],
        );
        return true;
      });
      assert.equal(released.enabled, true);
      assert.deepEqual(subjectsFor((await reconcileExchangeLedger()).deltas), []);
    },
  );

  it(
    "detects fills and fees that disagree with the trades that produced them",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const seeded = await withDb(async (client) => {
        await client.query(
          `INSERT INTO orders
             (id, user_id, market, side, type, status, price, quantity,
              filled_quantity, remaining_quantity)
           VALUES ($1::uuid, $2, 'BTCUSDT', 'sell', 'limit', 'PARTIALLY_FILLED',
                   100, 10, 4, 6)`,
          [counterOrderId, wallet],
        );
        await client.query(
          `INSERT INTO trades
             (id, market, buyer_order_id, seller_order_id, price, quantity,
              fee_buyer, fee_seller, maker_side)
           VALUES ($1::uuid, 'BTCUSDT', $2::uuid, $3::uuid, 100, 3, 0.5, 0.5, 'buy')`,
          [tradeId, orderId, counterOrderId],
        );
        return true;
      });
      assert.equal(seeded.enabled, true);

      const codes = subjectsFor((await reconcileExchangeLedger()).deltas)
        .map((delta) => delta.code)
        .sort();

      // The sell order claims 4 filled while the trade only produced 3, the
      // buy order's own fill is now short by 3, and neither trade fee was posted.
      assert.deepEqual(codes, [
        "order_fill_trade_divergence",
        "order_fill_trade_divergence",
        "trade_fee_ledger_divergence",
      ]);
    },
  );
});
