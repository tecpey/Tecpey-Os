import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";
import { applyDatabaseMigrationsWithLock } from "../../lib/db-migration-plan";
import { withTx } from "../../lib/db";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";
import {
  appendWithdrawalExecutionEventTx,
  createWithdrawalExecutionAttemptTx,
  enqueueWithdrawalReconciliationTx,
} from "../../lib/security/withdrawal-execution-authority";

const databaseUrl = process.env.DATABASE_URL?.trim();
const databaseConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;

async function withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool!.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function seedClaimableWithdrawal(input: {
  userId: string;
  withdrawalId: string;
  leaseOwner: string;
}): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO withdrawals (
         id, user_id, asset, amount, amount_usd, destination_address,
         network, state, security_gate_passed, two_fa_verified,
         execution_lock_owner, execution_lock_expires_at
       ) VALUES (
         $1, $2, 'USDT', 2, 2, $3, 'ethereum', 'approved', TRUE, TRUE,
         $4, NOW() + INTERVAL '5 minutes'
       )`,
      [input.withdrawalId, input.userId, `0x${"d".repeat(40)}`, input.leaseOwner],
    );
  });
}

function attemptInput(input: {
  withdrawalId: string;
  leaseOwner: string;
  actorId?: string;
}) {
  return {
    withdrawalId: input.withdrawalId,
    leaseOwner: input.leaseOwner,
    serviceActorId: input.actorId ?? "withdrawal-executor-test",
    requestHash: hashSensitiveAuditRequest({
      withdrawalId: input.withdrawalId,
      leaseOwner: input.leaseOwner,
      purpose: "withdrawal_execution_claim",
    }),
    network: "ethereum",
    asset: "USDT",
    amount: "2",
    leaseLifetimeSeconds: 300,
  };
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
      CREATE OR REPLACE FUNCTION tecpey_test_reject_execution_evidence()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.actor_id LIKE 'withdraw-execution-reject-%'
           AND NEW.action = 'withdrawal.execution.claim' THEN
          RAISE EXCEPTION 'forced_withdrawal_execution_evidence_rejection';
        END IF;
        RETURN NEW;
      END;
      $$;
      DROP TRIGGER IF EXISTS withdrawal_execution_evidence_test_reject
        ON sensitive_mutation_audit_events;
      CREATE TRIGGER withdrawal_execution_evidence_test_reject
        BEFORE INSERT ON sensitive_mutation_audit_events
        FOR EACH ROW
        EXECUTE FUNCTION tecpey_test_reject_execution_evidence();
    `);
  });
});

after(async () => {
  if (pool) {
    await withClient(async (client) => {
      await client.query(
        `DROP TRIGGER IF EXISTS withdrawal_execution_evidence_test_reject
           ON sensitive_mutation_audit_events`,
      );
      await client.query(
        "DROP FUNCTION IF EXISTS tecpey_test_reject_execution_evidence()",
      );
    });
  }
  await pool?.end();
  pool = null;
});

describe("Withdrawal execution attempt authority", () => {
  it(
    "commits a lease-bound attempt, claim event and secret-free mandatory evidence atomically",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-owner-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      await seedClaimableWithdrawal({ userId, withdrawalId, leaseOwner });

      const transaction = await withTx(async (client) =>
        createWithdrawalExecutionAttemptTx(
          client,
          attemptInput({ withdrawalId, leaseOwner }),
        ),
      );
      assert.equal(transaction.enabled, true);
      if (!transaction.enabled) return;

      const evidence = await withClient(async (client) => {
        const attempt = await client.query<{
          withdrawal_id: string;
          service_actor_id: string;
          lease_owner_fingerprint: string;
          request_hash: string;
        }>(
          `SELECT withdrawal_id, service_actor_id, lease_owner_fingerprint,
                  request_hash
             FROM withdrawal_execution_attempts
            WHERE id = $1`,
          [transaction.value.id],
        );
        const event = await client.query<{
          event_type: string;
          outcome: string;
          metadata: Record<string, unknown>;
        }>(
          `SELECT event_type, outcome, metadata
             FROM withdrawal_execution_events
            WHERE attempt_id = $1`,
          [transaction.value.id],
        );
        const audit = await client.query<{ document: string }>(
          `SELECT row_to_json(audit)::text AS document
             FROM sensitive_mutation_audit_events audit
            WHERE actor_id = 'withdrawal-executor-test'
              AND action = 'withdrawal.execution.claim'
            ORDER BY created_at DESC
            LIMIT 1`,
        );
        return {
          attempt: attempt.rows[0],
          event: event.rows[0],
          document: audit.rows[0]?.document ?? "",
        };
      });

      assert.equal(evidence.attempt.withdrawal_id, withdrawalId);
      assert.equal(evidence.attempt.service_actor_id, "withdrawal-executor-test");
      assert.match(evidence.attempt.lease_owner_fingerprint, /^[0-9a-f]{64}$/);
      assert.match(evidence.attempt.request_hash, /^[0-9a-f]{64}$/);
      assert.equal(evidence.event.event_type, "claim");
      assert.equal(evidence.event.outcome, "success");
      assert.equal(evidence.event.metadata.network, "ethereum");
      assert.equal(evidence.event.metadata.amount, "2");
      assert.equal(evidence.document.includes(withdrawalId), false);
      assert.equal(evidence.document.includes(leaseOwner), false);
    },
  );

  it(
    "rolls back attempt and claim event when mandatory evidence is rejected",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-reject-owner-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      await seedClaimableWithdrawal({ userId, withdrawalId, leaseOwner });

      await assert.rejects(
        withTx((client) =>
          createWithdrawalExecutionAttemptTx(
            client,
            attemptInput({
              withdrawalId,
              leaseOwner,
              actorId: `withdraw-execution-reject-${randomUUID()}`,
            }),
          ),
        ),
        /forced_withdrawal_execution_evidence_rejection/,
      );

      const counts = await withClient(async (client) => {
        const rows = await client.query<{
          attempts: string;
          events: string;
        }>(
          `SELECT
             (SELECT COUNT(*)::text
                FROM withdrawal_execution_attempts
               WHERE withdrawal_id = $1) AS attempts,
             (SELECT COUNT(*)::text
                FROM withdrawal_execution_events
               WHERE withdrawal_id = $1) AS events`,
          [withdrawalId],
        );
        return rows.rows[0];
      });
      assert.deepEqual(counts, { attempts: "0", events: "0" });
    },
  );

  it(
    "rejects attempts from a stale or foreign lease owner",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-lease-owner-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      await seedClaimableWithdrawal({ userId, withdrawalId, leaseOwner });

      await assert.rejects(
        withTx((client) =>
          createWithdrawalExecutionAttemptTx(
            client,
            attemptInput({
              withdrawalId,
              leaseOwner: `foreign-${randomUUID()}`,
            }),
          ),
        ),
        /withdrawal execution attempt lease owner mismatch/,
      );

      await withClient(async (client) => {
        await client.query(
          `UPDATE withdrawals
              SET execution_lock_expires_at = NOW() - INTERVAL '1 second'
            WHERE id = $1`,
          [withdrawalId],
        );
      });
      await assert.rejects(
        withTx((client) =>
          createWithdrawalExecutionAttemptTx(
            client,
            attemptInput({ withdrawalId, leaseOwner }),
          ),
        ),
        /withdrawal execution attempt lease is expired/,
      );
    },
  );

  it(
    "keeps attempt and event rows append-only",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-append-owner-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      await seedClaimableWithdrawal({ userId, withdrawalId, leaseOwner });
      const transaction = await withTx((client) =>
        createWithdrawalExecutionAttemptTx(
          client,
          attemptInput({ withdrawalId, leaseOwner }),
        ),
      );
      assert.equal(transaction.enabled, true);
      if (!transaction.enabled) return;

      await assert.rejects(
        withClient((client) =>
          client.query(
            `UPDATE withdrawal_execution_attempts
                SET policy_version = 'tampered'
              WHERE id = $1`,
            [transaction.value.id],
          ),
        ),
        /withdrawal execution authority is append-only/,
      );
      await assert.rejects(
        withClient((client) =>
          client.query(
            "DELETE FROM withdrawal_execution_events WHERE attempt_id = $1",
            [transaction.value.id],
          ),
        ),
        /withdrawal execution authority is append-only/,
      );
    },
  );

  it(
    "deduplicates reconciliation work for one attempt and reason",
    { skip: !databaseConfigured, timeout: 30_000 },
    async () => {
      const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
      const userId = `execution-reconcile-owner-${randomUUID()}`;
      const leaseOwner = `executor-${randomUUID()}`;
      await seedClaimableWithdrawal({ userId, withdrawalId, leaseOwner });
      const transaction = await withTx(async (client) => {
        const attempt = await createWithdrawalExecutionAttemptTx(
          client,
          attemptInput({ withdrawalId, leaseOwner }),
        );
        await appendWithdrawalExecutionEventTx(client, {
          attempt,
          eventType: "broadcast_ambiguous",
          outcome: "ambiguous",
          correlationIdentity: `${attempt.id}:broadcast:1:ambiguous`,
          requestHash: hashSensitiveAuditRequest({
            withdrawalId,
            attemptId: attempt.id,
            event: "broadcast_ambiguous",
          }),
          network: "ethereum",
          asset: "USDT",
          amount: "2",
          expectedTxHash: `0x${"e".repeat(64)}`,
          providerPolicy: "ethereum-json-rpc-v1",
          errorClass: "transport_timeout",
        });
        await enqueueWithdrawalReconciliationTx(client, {
          attempt,
          expectedTxHash: `0x${"e".repeat(64)}`,
          reason: "broadcast_ambiguous",
          errorClass: "transport_timeout",
        });
        await enqueueWithdrawalReconciliationTx(client, {
          attempt,
          expectedTxHash: `0x${"e".repeat(64)}`,
          reason: "broadcast_ambiguous",
          errorClass: "transport_timeout",
        });
        return attempt;
      });
      assert.equal(transaction.enabled, true);
      if (!transaction.enabled) return;

      const count = await withClient(async (client) => {
        const rows = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM withdrawal_reconciliation_outbox
            WHERE attempt_id = $1
              AND reason = 'broadcast_ambiguous'`,
          [transaction.value.id],
        );
        return Number(rows.rows[0]?.count ?? "0");
      });
      assert.equal(count, 1);
    },
  );
});
