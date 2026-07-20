import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { settleConfirmedWithdrawal } from "../../lib/security/withdrawal-settlement-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

function withdrawalId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 32);
}

describe("Withdrawal confirmation monitor authority gate", () => {
  it(
    "prevents settlement from broadcasted before monitor authority commits",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `withdraw-monitor-gate-${randomUUID()}`;
      const id = withdrawalId();
      const txHash = `0x${"d".repeat(64)}`;

      const seeded = await withDb(async (client) => {
        await client.query(
          `INSERT INTO wallet_balances
             (user_id, asset, available_balance, held_balance)
           VALUES ($1, 'USDT', 3, 2)`,
          [userId],
        );
        await client.query(
          `INSERT INTO withdrawals (
             id, user_id, asset, amount, amount_usd, destination_address,
             network, state, security_gate_passed, two_fa_verified,
             tx_hash, confirmation_count, required_confirmations,
             funds_reserved_at
           ) VALUES (
             $1, $2, 'USDT', 2, 2, $3, 'ethereum', 'broadcasted',
             TRUE, TRUE, $4, 3, 2, NOW()
           )`,
          [id, userId, `0x${"a".repeat(40)}`, txHash],
        );
        return true;
      });
      assert.equal(seeded.enabled, true);

      try {
        await assert.rejects(
          settleConfirmedWithdrawal({
            withdrawalId: id,
            txHash,
            confirmations: 3,
            blockNumber: BigInt(12345),
          }),
          /not settleable from state broadcasted/,
        );

        const state = await withDb(async (client) => {
          const withdrawal = await client.query<{
            state: string;
            funds_reserved_at: Date | null;
          }>(
            `SELECT state, funds_reserved_at
               FROM withdrawals
              WHERE id = $1`,
            [id],
          );
          const balance = await client.query<{ held_balance: string }>(
            `SELECT held_balance::text AS held_balance
               FROM wallet_balances
              WHERE user_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          const ledger = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM wallet_ledger
              WHERE wallet_id = $1
                AND reference_type = 'withdrawal'
                AND reference_id = $2
                AND type = 'withdraw'`,
            [userId, id],
          );
          return {
            withdrawal: withdrawal.rows[0],
            heldBalance: balance.rows[0]?.held_balance,
            ledgerCount: Number(ledger.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.equal(state.value.withdrawal?.state, "broadcasted");
          assert.ok(state.value.withdrawal?.funds_reserved_at instanceof Date);
          assert.equal(state.value.heldBalance, "2.000000000000000000");
          assert.equal(state.value.ledgerCount, 0);
        }
      } finally {
        await withDb(async (client) => {
          await client.query("DELETE FROM wallet_ledger WHERE wallet_id = $1", [
            userId,
          ]);
          await client.query("DELETE FROM withdrawals WHERE id = $1", [id]);
          await client.query("DELETE FROM wallet_balances WHERE user_id = $1", [
            userId,
          ]);
          return true;
        });
      }
    },
  );
});
