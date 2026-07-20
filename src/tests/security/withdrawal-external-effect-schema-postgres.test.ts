import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Pool, type PoolClient } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);
let pool: Pool | null = null;

async function withRollback<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool!.connect();
  await client.query("BEGIN");
  try {
    return await callback(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

let savepointSequence = 0;
async function expectSqlRejection(
  client: PoolClient,
  callback: () => Promise<unknown>,
  pattern?: RegExp,
): Promise<void> {
  savepointSequence += 1;
  const savepoint = `expected_rejection_${savepointSequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await callback();
    assert.fail("expected PostgreSQL rejection");
  } catch (error) {
    if (pattern) {
      assert.match(error instanceof Error ? error.message : String(error), pattern);
    }
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  } finally {
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
}

async function seedWithdrawal(
  client: PoolClient,
  withdrawalId: string,
  userId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO withdrawals (
       id, user_id, asset, amount, amount_usd, destination_address,
       network, state, security_gate_passed, two_fa_verified
     ) VALUES ($1, $2, 'USDT', '1', 1, $3, 'ethereum',
               'compliance_review', TRUE, TRUE)`,
    [withdrawalId, userId, `0x${"a".repeat(40)}`],
  );
}

before(async () => {
  if (!integrationConfigured || !databaseUrl) return;
  pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
});

after(async () => {
  await pool?.end();
  pool = null;
});

describe("Withdrawal external-effect evidence schema", () => {
  it(
    "enforces one active execution generation and immutable finalized preparation facts",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      await withRollback(async (client) => {
        const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
        const userId = `external-execution-${randomUUID()}`;
        const requestHash = "1".repeat(64);
        const leaseFingerprint = "2".repeat(64);
        await seedWithdrawal(client, withdrawalId, userId);

        const inserted = await client.query<{ id: string }>(
          `INSERT INTO withdrawal_execution_intents
             (withdrawal_id, generation, state, lease_owner_fingerprint,
              lease_expires_at, request_hash)
           VALUES ($1, 1, 'claimed', $2, NOW() + INTERVAL '5 minutes', $3)
           RETURNING id`,
          [withdrawalId, leaseFingerprint, requestHash],
        );
        const intentId = inserted.rows[0]?.id;
        assert.ok(intentId);

        await expectSqlRejection(
          client,
          () =>
            client.query(
              `INSERT INTO withdrawal_execution_intents
                 (withdrawal_id, generation, state, lease_owner_fingerprint,
                  lease_expires_at, request_hash)
               VALUES ($1, 2, 'claimed', $2, NOW() + INTERVAL '5 minutes', $3)`,
              [withdrawalId, "3".repeat(64), "4".repeat(64)],
            ),
          /withdrawal_execution_one_active_generation/,
        );

        await client.query(
          "UPDATE withdrawal_execution_intents SET state = 'building' WHERE id = $1",
          [intentId],
        );
        await client.query(
          "UPDATE withdrawal_execution_intents SET state = 'signing' WHERE id = $1",
          [intentId],
        );
        await client.query(
          `UPDATE withdrawal_execution_intents
              SET state = 'prepared',
                  prepared_tx_fingerprint = $2,
                  expected_tx_hash_fingerprint = $3,
                  signer_fingerprint = $4,
                  prepared_at = NOW(),
                  finalized_at = NOW()
            WHERE id = $1`,
          [intentId, "5".repeat(64), "6".repeat(64), "7".repeat(64)],
        );

        await expectSqlRejection(
          client,
          () =>
            client.query(
              "UPDATE withdrawal_execution_intents SET lease_expires_at = NOW() WHERE id = $1",
              [intentId],
            ),
          /finalized withdrawal execution intent is immutable/,
        );
        await expectSqlRejection(
          client,
          () =>
            client.query(
              "DELETE FROM withdrawal_execution_intents WHERE id = $1",
              [intentId],
            ),
          /append-preserved/,
        );
      });
    },
  );

  it(
    "blocks a new broadcast attempt until an ambiguous attempt is reconciled",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      await withRollback(async (client) => {
        const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
        const userId = `external-broadcast-${randomUUID()}`;
        await seedWithdrawal(client, withdrawalId, userId);

        const inserted = await client.query<{ id: string }>(
          `INSERT INTO withdrawal_broadcast_attempts
             (withdrawal_id, execution_generation, attempt_number, state,
              prepared_tx_fingerprint, expected_tx_hash_fingerprint,
              chain_id, provider_fingerprint, lease_owner_fingerprint,
              lease_expires_at, request_hash)
           VALUES ($1, 1, 1, 'prepared', $2, $3, 'ethereum', $4, $5,
                   NOW() + INTERVAL '2 minutes', $6)
           RETURNING id`,
          [
            withdrawalId,
            "8".repeat(64),
            "9".repeat(64),
            "a".repeat(64),
            "b".repeat(64),
            "c".repeat(64),
          ],
        );
        const attemptId = inserted.rows[0]?.id;
        assert.ok(attemptId);

        await client.query(
          `UPDATE withdrawal_broadcast_attempts
              SET state = 'calling', started_at = NOW()
            WHERE id = $1`,
          [attemptId],
        );
        await client.query(
          `UPDATE withdrawal_broadcast_attempts
              SET state = 'ambiguous', outcome_category = 'timeout'
            WHERE id = $1`,
          [attemptId],
        );

        await expectSqlRejection(
          client,
          () =>
            client.query(
              `INSERT INTO withdrawal_broadcast_attempts
                 (withdrawal_id, execution_generation, attempt_number, state,
                  prepared_tx_fingerprint, expected_tx_hash_fingerprint,
                  chain_id, provider_fingerprint, lease_owner_fingerprint,
                  lease_expires_at, request_hash)
               VALUES ($1, 1, 2, 'prepared', $2, $3, 'ethereum', $4, $5,
                       NOW() + INTERVAL '2 minutes', $6)`,
              [
                withdrawalId,
                "8".repeat(64),
                "9".repeat(64),
                "a".repeat(64),
                "d".repeat(64),
                "e".repeat(64),
              ],
            ),
          /withdrawal_broadcast_one_active_attempt/,
        );

        await client.query(
          `UPDATE withdrawal_broadcast_attempts
              SET state = 'reconciled_absent',
                  outcome_category = 'reconciled_absent',
                  finalized_at = NOW()
            WHERE id = $1`,
          [attemptId],
        );

        const second = await client.query<{ id: string }>(
          `INSERT INTO withdrawal_broadcast_attempts
             (withdrawal_id, execution_generation, attempt_number, state,
              prepared_tx_fingerprint, expected_tx_hash_fingerprint,
              chain_id, provider_fingerprint, lease_owner_fingerprint,
              lease_expires_at, request_hash)
           VALUES ($1, 1, 2, 'prepared', $2, $3, 'ethereum', $4, $5,
                   NOW() + INTERVAL '2 minutes', $6)
           RETURNING id`,
          [
            withdrawalId,
            "8".repeat(64),
            "9".repeat(64),
            "a".repeat(64),
            "d".repeat(64),
            "e".repeat(64),
          ],
        );
        assert.ok(second.rows[0]?.id);

        await expectSqlRejection(
          client,
          () =>
            client.query(
              "UPDATE withdrawal_broadcast_attempts SET outcome_category = 'unknown' WHERE id = $1",
              [attemptId],
            ),
          /finalized withdrawal broadcast attempt is immutable/,
        );
        await expectSqlRejection(
          client,
          () =>
            client.query(
              "DELETE FROM withdrawal_broadcast_attempts WHERE id = $1",
              [attemptId],
            ),
          /append-preserved/,
        );
      });
    },
  );

  it(
    "keeps confirmation projection identity immutable and completed rows permanent",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      await withRollback(async (client) => {
        const withdrawalId = randomUUID().replaceAll("-", "").slice(0, 32);
        const userId = `external-confirmation-${randomUUID()}`;
        await seedWithdrawal(client, withdrawalId, userId);

        await client.query(
          `INSERT INTO withdrawal_confirmation_outbox
             (withdrawal_id, expected_tx_hash_fingerprint, required_confirmations)
           VALUES ($1, $2, 12)`,
          [withdrawalId, "f".repeat(64)],
        );
        await client.query(
          `UPDATE withdrawal_confirmation_outbox
              SET state = 'published', published_at = NOW(), attempts = 1
            WHERE withdrawal_id = $1`,
          [withdrawalId],
        );

        await expectSqlRejection(
          client,
          () =>
            client.query(
              `UPDATE withdrawal_confirmation_outbox
                  SET expected_tx_hash_fingerprint = $2
                WHERE withdrawal_id = $1`,
              [withdrawalId, "0".repeat(64)],
            ),
          /identity is immutable/,
        );

        await client.query(
          `UPDATE withdrawal_confirmation_outbox
              SET state = 'completed', completed_at = NOW()
            WHERE withdrawal_id = $1`,
          [withdrawalId],
        );
        await expectSqlRejection(
          client,
          () =>
            client.query(
              `UPDATE withdrawal_confirmation_outbox
                  SET attempts = attempts + 1
                WHERE withdrawal_id = $1`,
              [withdrawalId],
            ),
          /completed withdrawal confirmation outbox is immutable/,
        );
        await expectSqlRejection(
          client,
          () =>
            client.query(
              "DELETE FROM withdrawal_confirmation_outbox WHERE withdrawal_id = $1",
              [withdrawalId],
            ),
          /cannot be deleted/,
        );
      });
    },
  );

  it(
    "rejects raw transaction and transaction-hash keys at the PostgreSQL evidence boundary",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      await withRollback(async (client) => {
        for (const metadata of [
          { rawTx: "signed-transaction-bytes" },
          { txHash: `0x${"1".repeat(64)}` },
          { providerResponse: { result: "unbounded" } },
          { nonce: 42 },
        ]) {
          await expectSqlRejection(client, () =>
            client.query(
              `INSERT INTO sensitive_mutation_audit_events
                 (tenant_id, actor_type, actor_id, action, resource_type,
                  resource_id, outcome, correlation_id, request_hash, metadata)
               VALUES ('tecpey', 'service', 'withdrawal-executor',
                       'withdrawal.transaction.prepare', 'withdrawal_execution',
                       $1, 'success', $2, $3, $4::jsonb)`,
              [
                "1".repeat(64),
                `withdrawal-prepare:${randomUUID()}`,
                "2".repeat(64),
                JSON.stringify(metadata),
              ],
            ),
          );
        }
      });
    },
  );
});
