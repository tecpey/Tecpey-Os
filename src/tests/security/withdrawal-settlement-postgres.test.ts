import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { settleConfirmedWithdrawal } from "../../lib/security/withdrawal-settlement-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

describe("Confirmed withdrawal settlement authority", () => {
  it(
    "consumes held funds and writes one withdraw ledger entry exactly once",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `withdraw-settlement-${randomUUID()}`;
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const txHash = `0x${"b".repeat(64)}`;

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
             $1,$2,'USDT','2',2,$3,'ethereum','confirming',TRUE,TRUE,
             $4,1,2,NOW()
           )`,
          [withdrawalId, userId, `0x${"a".repeat(40)}`, txHash],
        );
        await client.query(
          `INSERT INTO wallet_ledger
             (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
           VALUES ($1,'USDT','hold',2,3,$2,'withdrawal')`,
          [userId, withdrawalId],
        );
        return true;
      });
      assert.equal(seeded.enabled, true);

      try {
        assert.equal(
          await settleConfirmedWithdrawal({
            withdrawalId,
            txHash,
            confirmations: 3,
            blockNumber: 12345n,
          }),
          "settled",
        );
        assert.equal(
          await settleConfirmedWithdrawal({
            withdrawalId,
            txHash,
            confirmations: 4,
            blockNumber: 12346n,
          }),
          "replayed",
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
          const withdrawal = await client.query<{
            state: string;
            confirmation_count: number;
            block_number: string | null;
            funds_reserved_at: Date | null;
          }>(
            `SELECT state, confirmation_count, block_number, funds_reserved_at
               FROM withdrawals WHERE id = $1`,
            [withdrawalId],
          );
          const ledger = await client.query<{ count: string; amount: string }>(
            `SELECT COUNT(*)::text AS count,
                    COALESCE(MAX(amount), 0)::text AS amount
               FROM wallet_ledger
              WHERE wallet_id = $1
                AND reference_id = $2
                AND reference_type = 'withdrawal'
                AND type = 'withdraw'`,
            [userId, withdrawalId],
          );
          return {
            balance: balance.rows[0],
            withdrawal: withdrawal.rows[0],
            ledger: ledger.rows[0],
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(evidence.value.balance?.available_balance, "3.000000000000000000");
          assert.equal(evidence.value.balance?.held_balance, "0.000000000000000000");
          assert.equal(evidence.value.withdrawal?.state, "completed");
          assert.equal(evidence.value.withdrawal?.confirmation_count, 3);
          assert.equal(evidence.value.withdrawal?.block_number, "12345");
          assert.equal(evidence.value.withdrawal?.funds_reserved_at, null);
          assert.equal(evidence.value.ledger?.count, "1");
          assert.equal(evidence.value.ledger?.amount, "2.000000000000000000");
        }
      } finally {
        await withDb(async (client) => {
          await client.query("DELETE FROM wallet_ledger WHERE wallet_id = $1", [userId]);
          await client.query("DELETE FROM withdrawals WHERE id = $1", [withdrawalId]);
          await client.query("DELETE FROM wallet_balances WHERE user_id = $1", [userId]);
          return true;
        });
      }
    },
  );
});
