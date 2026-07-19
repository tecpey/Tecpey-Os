import { randomUUID } from "crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withDb, withTx } from "../../lib/db";
import { holdOrderFundsTx } from "../../lib/trading/wallet-service";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(databaseUrl && !databaseUrl.includes("CHANGE_ME"));

describe("PostgreSQL exact order hold authority", () => {
  it("allows only one concurrent hold and preserves exact balance plus ledger evidence", {
    skip: !databaseConfigured,
    timeout: 30_000,
  }, async () => {
    const userId = `order-hold-${randomUUID()}`;
    const firstOrderId = randomUUID();
    const secondOrderId = randomUUID();
    const expectedOrderIds = new Set<string>([firstOrderId, secondOrderId]);

    const seeded = await withDb(async (client) => {
      await client.query(
        `INSERT INTO wallet_balances (user_id, asset, available_balance, held_balance)
         VALUES ($1, 'USDT', '0.1500000001', '0.0000000000')`,
        [userId],
      );
      return true;
    });
    assert.equal(seeded.enabled, true);

    try {
      const attempts = await Promise.all([
        withTx((client) => holdOrderFundsTx(
          client,
          userId,
          "USDT",
          "0.1000000001",
          firstOrderId,
        )),
        withTx((client) => holdOrderFundsTx(
          client,
          userId,
          "USDT",
          "0.1000000001",
          secondOrderId,
        )),
      ]);

      assert.equal(attempts.every((attempt) => attempt.enabled), true);
      assert.deepEqual(
        attempts.map((attempt) => attempt.enabled ? attempt.value : false).sort(),
        [false, true],
      );

      const evidence = await withDb(async (client) => {
        const balance = await client.query<{
          available_balance: string;
          held_balance: string;
        }>(
          `SELECT available_balance::text AS available_balance,
                  held_balance::text AS held_balance
             FROM wallet_balances
            WHERE user_id = $1 AND asset = 'USDT'`,
          [userId],
        );
        const ledger = await client.query<{ amount: string; reference_id: string }>(
          `SELECT amount::text AS amount, reference_id
             FROM wallet_ledger
            WHERE wallet_id = $1
              AND asset = 'USDT'
              AND type = 'hold'
              AND reference_type = 'order'`,
          [userId],
        );
        return { balance: balance.rows[0], ledger: ledger.rows };
      });

      assert.equal(evidence.enabled, true);
      if (!evidence.enabled) return;
      assert.equal(evidence.value.balance?.available_balance, "0.0500000000");
      assert.equal(evidence.value.balance?.held_balance, "0.1000000001");
      assert.equal(evidence.value.ledger.length, 1);
      assert.equal(evidence.value.ledger[0]?.amount, "0.1000000001");
      assert.ok(expectedOrderIds.has(evidence.value.ledger[0]?.reference_id ?? ""));
    } finally {
      await withDb(async (client) => {
        await client.query("DELETE FROM wallet_ledger WHERE wallet_id = $1", [userId]);
        await client.query("DELETE FROM wallet_balances WHERE user_id = $1", [userId]);
        return true;
      });
    }
  });
});
