import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;

type ExecutionColumns = {
  rawTransaction: string;
  txHash: string;
  requiredConfirmations: string | null;
  confirmations: string | null;
  blockHeight: string | null;
};

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`unsafe_identifier:${value}`);
  }
  return `"${value}"`;
}

async function resolveExecutionColumns(
  client: PoolClient,
): Promise<ExecutionColumns> {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'withdrawals'`,
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  const rawTransaction = [
    "raw_transaction",
    "raw_tx",
    "signed_transaction",
  ].find((column) => columns.has(column));
  const txHash = ["tx_hash", "transaction_hash"].find((column) =>
    columns.has(column),
  );
  if (!rawTransaction || !txHash) {
    throw new Error("withdrawal_execution_columns_missing");
  }
  return {
    rawTransaction,
    txHash,
    requiredConfirmations: columns.has("required_confirmations")
      ? "required_confirmations"
      : null,
    confirmations: columns.has("confirmations") ? "confirmations" : null,
    blockHeight: columns.has("block_height") ? "block_height" : null,
  };
}

async function seedExecutionWithdrawal(input: {
  withdrawalId: string;
  userId: string;
  requestHash: string;
}): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO withdrawals (
         id, user_id, asset, amount, amount_usd, destination_address,
         network, state, security_gate_passed, two_fa_verified,
         funds_reserved_at, request_hash
       ) VALUES (
         $1, $2, 'USDT', 2, 2, $3, 'ethereum', 'approved', TRUE, TRUE,
         NOW(), $4
       )`,
      [
        input.withdrawalId,
        input.userId,
        `0x${"f".repeat(40)}`,
        input.requestHash,
      ],
    );
    await client.query(
      `INSERT INTO wallet_balances
         (user_id, asset, available_balance, held_balance)
       VALUES ($1, 'USDT', 3, 2)
       ON CONFLICT (user_id, asset) DO UPDATE
         SET available_balance = 3,
             held_balance = 2,
             updated_at = NOW()`,
      [input.userId],
    );
  });
}

async function claimAndPersistSigned(input: {
  withdrawalId: string;
  leaseOwner: string;
  rawTransaction: string;
  txHash: string;
}): Promise<{ attemptId: string; columns: ExecutionColumns }> {
  return withClient(async (client) => {
    const columns = await resolveExecutionColumns(client);
    await client.query(
      `UPDATE withdrawals
          SET state = 'building',
              execution_lock_owner = $2,
              execution_lock_expires_at = NOW() + INTERVAL '5 minutes'
        WHERE id = $1`,
      [input.withdrawalId, input.leaseOwner],
    );
    await client.query(
      `UPDATE withdrawals
          SET state = 'signing',
              ${quoteIdentifier(columns.rawTransaction)} = $2,
              ${quoteIdentifier(columns.txHash)} = $3
        WHERE id = $1`,
      [input.withdrawalId, input.rawTransaction, input.txHash],
    );
    const attempt = await client.query<{ id: string }>(
      `SELECT id
         FROM withdrawal_execution_attempts
        WHERE withdrawal_id = $1
          AND lease_owner = $2
        LIMIT 1`,
      [input.withdrawalId, input.leaseOwner],
    );
    const attemptId = attempt.rows[0]?.id;
    if (!attemptId) throw new Error("execution_attempt_missing");
    return { attemptId, columns };
  });
}

async function transitionState(
  withdrawalId: string,
  state: string,
): Promise<void> {
  await withClient(async (client) => {
    await client.query("UPDATE withdrawals SET state = $2 WHERE id = $1", [
      withdrawalId,
      state,
    ]);
  });
}

async function settleInOneTransaction(input: {
  withdrawalId: string;
  userId: string;
  columns: ExecutionColumns;
}): Promise<void> {
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE wallet_balances
            SET held_balance = held_balance - 2,
                updated_at = NOW()
          WHERE user_id = $1
            AND asset = 'USDT'
            AND held_balance >= 2`,
        [input.userId],
      );
      await client.query(
        `INSERT INTO wallet_ledger
           (wallet_id, asset, type, amount, balance_after,
            reference_type, reference_id)
         VALUES ($1, 'USDT', 'withdraw', 2, 3, 'withdrawal', $2)`,
        [input.userId, input.withdrawalId],
      );

      const assignments = ["state = 'completed'", "funds_reserved_at = NULL"];
      if (input.columns.requiredConfirmations) {
        assignments.push(
          `${quoteIdentifier(input.columns.requiredConfirmations)} = 2`,
        );
      }
      if (input.columns.confirmations) {
        assignments.push(`${quoteIdentifier(input.columns.confirmations)} = 2`);
      }
      if (input.columns.blockHeight) {
        assignments.push(`${quoteIdentifier(input.columns.blockHeight)} = '123456'`);
      }
      await client.query(
        `UPDATE withdrawals SET ${assignments.join(", ")} WHERE id = $1`,
        [input.withdrawalId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

before(async () => {
  if (!databaseConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 8,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  await withClient((client) => applyDatabaseMigrationsWithLock(client));
  await withClient(async (client) => {
    await client.query(`
      CREATE OR REPLACE FUNCTION tecpey_test_reject_settlement_evidence()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.action = 'withdrawal.settle'
           AND NEW.request_hash = repeat('f', 64) THEN
          RAISE EXCEPTION 'forced_withdrawal_settlement_evidence_rejection';
        END IF;
        RETURN NEW;
      END;
      $$;
      DROP TRIGGER IF EXISTS withdrawal_settlement_evidence_test_reject
        ON sensitive_mutation_audit_events;
      CREATE TRIGGER withdrawal_settlement_evidence_test_reject
        BEFORE INSERT ON sensitive_mutation_audit_events
        FOR EACH ROW
        EXECUTE FUNCTION tecpey_test_reject_settlement_evidence();
    `);
  });
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      await client.query(
        `DROP TRIGGER IF EXISTS withdrawal_settlement_evidence_test_reject
           ON sensitive_mutation_audit_events`,
      );
      await client.query(
        "DROP FUNCTION IF EXISTS tecpey_test_reject_settlement_evidence()",
      );
    });
  }
  await pool?.end();
  pool = null;
});

describe("Withdrawal execution transition evidence gates", () => {
  it(
    "couples claim, signed persistence and pre-effect broadcast attempt to one immutable attempt",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-transition-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      const rawTransaction = `signed:${randomUUID()}`;
      const txHash = `0x${"a".repeat(64)}`;
      await seedExecutionWithdrawal({
        withdrawalId,
        userId,
        requestHash: "a".repeat(64),
      });

      const prepared = await claimAndPersistSigned({
        withdrawalId,
        leaseOwner,
        rawTransaction,
        txHash,
      });
      const evidence = await withClient(async (client) => {
        const events = await client.query<{
          event_type: string;
          expected_tx_hash_fingerprint: string | null;
          signed_payload_fingerprint: string | null;
        }>(
          `SELECT event_type, expected_tx_hash_fingerprint,
                  signed_payload_fingerprint
             FROM withdrawal_execution_events
            WHERE attempt_id = $1
            ORDER BY created_at, event_type`,
          [prepared.attemptId],
        );
        const audits = await client.query<{ document: string }>(
          `SELECT row_to_json(audit)::text AS document
             FROM sensitive_mutation_audit_events audit
            WHERE action IN (
              'withdrawal.execution.claim',
              'withdrawal.transaction.build',
              'withdrawal.transaction.sign',
              'withdrawal.broadcast.attempt'
            )
              AND metadata->>'attemptFingerprint' =
                tecpey_withdrawal_evidence_hash(
                  'withdrawal-execution-attempt', $1
                )`,
          [prepared.attemptId],
        );
        return { events: events.rows, audits: audits.rows };
      });

      assert.deepEqual(
        new Set(evidence.events.map((event) => event.event_type)),
        new Set(["claim", "build", "sign", "broadcast_attempt"]),
      );
      assert.equal(evidence.audits.length, 4);
      for (const event of evidence.events.filter(
        (row) => row.event_type !== "claim",
      )) {
        assert.match(event.expected_tx_hash_fingerprint ?? "", /^[0-9a-f]{64}$/);
        assert.match(event.signed_payload_fingerprint ?? "", /^[0-9a-f]{64}$/);
      }
      for (const audit of evidence.audits) {
        assert.equal(audit.document.includes(rawTransaction), false);
        assert.equal(audit.document.includes(txHash), false);
        assert.equal(audit.document.includes(leaseOwner), false);
      }
    },
  );

  it(
    "classifies a signed retry as ambiguous, queues reconciliation and blocks blind rebroadcast",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-ambiguous-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      const txHash = `0x${"b".repeat(64)}`;
      await seedExecutionWithdrawal({
        withdrawalId,
        userId,
        requestHash: "b".repeat(64),
      });
      const prepared = await claimAndPersistSigned({
        withdrawalId,
        leaseOwner,
        rawTransaction: `signed:${randomUUID()}`,
        txHash,
      });

      await transitionState(withdrawalId, "retryable");
      const authority = await withClient(async (client) => {
        const event = await client.query<{ outcome: string }>(
          `SELECT outcome
             FROM withdrawal_execution_events
            WHERE attempt_id = $1
              AND event_type = 'broadcast_ambiguous'`,
          [prepared.attemptId],
        );
        const reconciliation = await client.query<{
          status: string;
          reason: string;
        }>(
          `SELECT status, reason
             FROM withdrawal_reconciliation_outbox
            WHERE attempt_id = $1`,
          [prepared.attemptId],
        );
        return {
          outcome: event.rows[0]?.outcome,
          reconciliation: reconciliation.rows[0],
        };
      });
      assert.equal(authority.outcome, "ambiguous");
      assert.deepEqual(authority.reconciliation, {
        status: "pending",
        reason: "broadcast_ambiguous",
      });

      await assert.rejects(
        transitionState(withdrawalId, "signing"),
        /withdrawal reconciliation is required before rebroadcast/,
      );

      await transitionState(withdrawalId, "broadcasted");
      const reconciled = await withClient(async (client) => {
        const row = await client.query<{ status: string }>(
          `SELECT status
             FROM withdrawal_reconciliation_outbox
            WHERE attempt_id = $1`,
          [prepared.attemptId],
        );
        return row.rows[0]?.status;
      });
      assert.equal(reconciled, "completed");
    },
  );

  it(
    "rolls back held consumption, ledger and completed state when settlement evidence is rejected",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-settle-reject-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      await seedExecutionWithdrawal({
        withdrawalId,
        userId,
        requestHash: "f".repeat(64),
      });
      const prepared = await claimAndPersistSigned({
        withdrawalId,
        leaseOwner,
        rawTransaction: `signed:${randomUUID()}`,
        txHash: `0x${"c".repeat(64)}`,
      });
      await transitionState(withdrawalId, "broadcasted");
      await transitionState(withdrawalId, "confirming");

      await assert.rejects(
        settleInOneTransaction({
          withdrawalId,
          userId,
          columns: prepared.columns,
        }),
        /forced_withdrawal_settlement_evidence_rejection/,
      );
      const state = await withClient(async (client) => {
        const withdrawal = await client.query<{
          state: string;
          funds_reserved_at: Date | null;
        }>(
          "SELECT state, funds_reserved_at FROM withdrawals WHERE id = $1",
          [withdrawalId],
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
            WHERE reference_type = 'withdrawal'
              AND reference_id = $1
              AND type = 'withdraw'`,
          [withdrawalId],
        );
        return {
          withdrawal: withdrawal.rows[0],
          heldBalance: balance.rows[0]?.held_balance,
          ledgerCount: Number(ledger.rows[0]?.count ?? "0"),
        };
      });
      assert.equal(state.withdrawal?.state, "confirming");
      assert.ok(state.withdrawal?.funds_reserved_at);
      assert.equal(state.heldBalance, "2.000000000000000000");
      assert.equal(state.ledgerCount, 0);
    },
  );

  it(
    "commits one settlement ledger plus one settle and one complete event",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-settle-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      await seedExecutionWithdrawal({
        withdrawalId,
        userId,
        requestHash: "e".repeat(64),
      });
      const prepared = await claimAndPersistSigned({
        withdrawalId,
        leaseOwner,
        rawTransaction: `signed:${randomUUID()}`,
        txHash: `0x${"d".repeat(64)}`,
      });
      await transitionState(withdrawalId, "broadcasted");
      await transitionState(withdrawalId, "confirming");
      await settleInOneTransaction({
        withdrawalId,
        userId,
        columns: prepared.columns,
      });

      const authority = await withClient(async (client) => {
        const withdrawal = await client.query<{
          state: string;
          funds_reserved_at: Date | null;
        }>(
          "SELECT state, funds_reserved_at FROM withdrawals WHERE id = $1",
          [withdrawalId],
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
            WHERE reference_type = 'withdrawal'
              AND reference_id = $1
              AND type = 'withdraw'`,
          [withdrawalId],
        );
        const events = await client.query<{ event_type: string }>(
          `SELECT event_type
             FROM withdrawal_execution_events
            WHERE attempt_id = $1
              AND event_type IN ('settle', 'complete')
            ORDER BY event_type`,
          [prepared.attemptId],
        );
        const audits = await client.query<{ action: string }>(
          `SELECT action
             FROM sensitive_mutation_audit_events
            WHERE action IN ('withdrawal.settle', 'withdrawal.complete')
              AND metadata->>'attemptFingerprint' =
                tecpey_withdrawal_evidence_hash(
                  'withdrawal-execution-attempt', $1
                )
            ORDER BY action`,
          [prepared.attemptId],
        );
        return {
          withdrawal: withdrawal.rows[0],
          heldBalance: balance.rows[0]?.held_balance,
          ledgerCount: Number(ledger.rows[0]?.count ?? "0"),
          events: events.rows.map((row) => row.event_type),
          audits: audits.rows.map((row) => row.action),
        };
      });
      assert.equal(authority.withdrawal?.state, "completed");
      assert.equal(authority.withdrawal?.funds_reserved_at, null);
      assert.equal(authority.heldBalance, "0.000000000000000000");
      assert.equal(authority.ledgerCount, 1);
      assert.deepEqual(authority.events, ["complete", "settle"]);
      assert.deepEqual(authority.audits, [
        "withdrawal.complete",
        "withdrawal.settle",
      ]);
    },
  );
});
