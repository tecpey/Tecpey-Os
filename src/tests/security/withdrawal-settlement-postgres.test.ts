import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import {
  fingerprintWithdrawalSettlement,
  writeWithdrawalExternalEffectEvidenceTx,
} from "../../lib/security/withdrawal-external-effect-evidence";
import { settleConfirmedWithdrawal } from "../../lib/security/withdrawal-settlement-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

async function seedSettleableWithdrawal(input: {
  userId: string;
  withdrawalId: string;
  txHash: string;
  amount?: string;
}): Promise<void> {
  const amount = input.amount ?? "2";
  const seeded = await withDb(async (client) => {
    await client.query(
      `INSERT INTO wallet_balances
         (user_id, asset, available_balance, held_balance)
       VALUES ($1, 'USDT', 3, $2::numeric)`,
      [input.userId, amount],
    );
    await client.query(
      `INSERT INTO withdrawals (
         id, user_id, asset, amount, amount_usd, destination_address,
         network, state, security_gate_passed, two_fa_verified,
         tx_hash, confirmation_count, required_confirmations,
         funds_reserved_at
       ) VALUES (
         $1,$2,'USDT',$3::numeric,$3::numeric,$4,'ethereum','confirming',TRUE,TRUE,
         $5,1,2,NOW()
       )`,
      [
        input.withdrawalId,
        input.userId,
        amount,
        `0x${"a".repeat(40)}`,
        input.txHash,
      ],
    );
    await client.query(
      `INSERT INTO wallet_ledger
         (wallet_id, asset, type, amount, balance_after, reference_id, reference_type)
       VALUES ($1,'USDT','hold',$3::numeric,3,$2,'withdrawal')`,
      [input.userId, input.withdrawalId, amount],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);
}

async function cleanup(input: {
  userId: string;
  withdrawalId: string;
}): Promise<void> {
  await withDb(async (client) => {
    await client.query("DELETE FROM wallet_ledger WHERE wallet_id = $1", [
      input.userId,
    ]);
    await client.query("DELETE FROM withdrawals WHERE id = $1", [
      input.withdrawalId,
    ]);
    await client.query("DELETE FROM wallet_balances WHERE user_id = $1", [
      input.userId,
    ]);
    return true;
  });
}

describe("Confirmed withdrawal settlement authority", () => {
  it(
    "consumes held funds and commits one ledger row plus one secret-free mandatory event exactly once",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `withdraw-settlement-${randomUUID()}`;
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const txHash = `0x${"b".repeat(64)}`;
      await seedSettleableWithdrawal({ userId, withdrawalId, txHash });

      try {
        assert.equal(
          await settleConfirmedWithdrawal({
            withdrawalId,
            txHash,
            confirmations: 3,
            blockNumber: BigInt(12345),
          }),
          "settled",
        );
        assert.equal(
          await settleConfirmedWithdrawal({
            withdrawalId,
            txHash,
            confirmations: 4,
            blockNumber: BigInt(12346),
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
          const audit = await client.query<{
            count: string;
            document: string;
            metadata: Record<string, unknown>;
          }>(
            `SELECT COUNT(*)::text AS count,
                    MAX(row_to_json(event)::text) AS document,
                    MAX(metadata::text)::jsonb AS metadata
               FROM sensitive_mutation_audit_events event
              WHERE action = 'withdrawal.settle'
                AND resource_type = 'withdrawal_settlement'
                AND resource_id = $1`,
            [fingerprintWithdrawalSettlement({ withdrawalId, txHash })],
          );
          return {
            balance: balance.rows[0],
            withdrawal: withdrawal.rows[0],
            ledger: ledger.rows[0],
            audit: audit.rows[0],
          };
        });
        assert.equal(evidence.enabled, true);
        if (evidence.enabled) {
          assert.equal(
            evidence.value.balance?.available_balance,
            "3.000000000000000000",
          );
          assert.equal(
            evidence.value.balance?.held_balance,
            "0.000000000000000000",
          );
          assert.equal(evidence.value.withdrawal?.state, "completed");
          assert.equal(evidence.value.withdrawal?.confirmation_count, 3);
          assert.equal(evidence.value.withdrawal?.block_number, "12345");
          assert.equal(evidence.value.withdrawal?.funds_reserved_at, null);
          assert.equal(evidence.value.ledger?.count, "1");
          assert.equal(evidence.value.ledger?.amount, "2.000000000000000000");
          assert.equal(evidence.value.audit?.count, "1");
          assert.equal(evidence.value.audit?.metadata.amount, "2.000000000000000000");
          assert.equal(evidence.value.audit?.metadata.observedConfirmations, 3);
          assert.equal(evidence.value.audit?.metadata.blockNumber, "12345");
          assert.equal(evidence.value.audit?.metadata.finalState, "completed");
          for (const raw of [withdrawalId, txHash, userId]) {
            assert.equal(evidence.value.audit?.document.includes(raw), false);
          }
        }
      } finally {
        await cleanup({ userId, withdrawalId });
      }
    },
  );

  it(
    "rolls back held-balance consumption, ledger and completed state when mandatory evidence conflicts",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const userId = `withdraw-settlement-conflict-${randomUUID()}`;
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const txHash = `0x${"c".repeat(64)}`;
      await seedSettleableWithdrawal({ userId, withdrawalId, txHash });

      try {
        const conflicting = await withDb(async (client) => {
          await writeWithdrawalExternalEffectEvidenceTx(client, {
            tenantId: PLATFORM.DEFAULT_TENANT_ID,
            actorId: "withdrawal-settlement",
            action: "withdrawal.settle",
            resourceType: "withdrawal_settlement",
            resourceIdentity: `${withdrawalId}\u001f${txHash.toLowerCase()}`,
            correlationIdentity: `${withdrawalId}\u001f${txHash.toLowerCase()}`,
            requestHash: "f".repeat(64),
            outcome: "success",
            metadata: {
              marker: "forced-correlation-conflict",
            },
          });
          return true;
        });
        assert.equal(conflicting.enabled, true);

        await assert.rejects(
          settleConfirmedWithdrawal({
            withdrawalId,
            txHash,
            confirmations: 3,
            blockNumber: BigInt(54321),
          }),
          /sensitive_audit_correlation_conflict/,
        );

        const state = await withDb(async (client) => {
          const balance = await client.query<{ held_balance: string }>(
            `SELECT held_balance::text AS held_balance
               FROM wallet_balances
              WHERE user_id = $1 AND asset = 'USDT'`,
            [userId],
          );
          const withdrawal = await client.query<{
            state: string;
            funds_reserved_at: Date | null;
          }>(
            `SELECT state, funds_reserved_at
               FROM withdrawals
              WHERE id = $1`,
            [withdrawalId],
          );
          const ledger = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM wallet_ledger
              WHERE wallet_id = $1
                AND reference_id = $2
                AND reference_type = 'withdrawal'
                AND type = 'withdraw'`,
            [userId, withdrawalId],
          );
          return {
            held: balance.rows[0]?.held_balance,
            withdrawal: withdrawal.rows[0],
            ledgerCount: Number(ledger.rows[0]?.count ?? "0"),
          };
        });
        assert.equal(state.enabled, true);
        if (state.enabled) {
          assert.equal(state.value.held, "2.000000000000000000");
          assert.equal(state.value.withdrawal?.state, "confirming");
          assert.ok(state.value.withdrawal?.funds_reserved_at instanceof Date);
          assert.equal(state.value.ledgerCount, 0);
        }
      } finally {
        await cleanup({ userId, withdrawalId });
      }
    },
  );
});
