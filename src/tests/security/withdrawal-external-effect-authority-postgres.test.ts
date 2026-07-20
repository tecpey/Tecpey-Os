import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import {
  beginWithdrawalBroadcastAttempt,
  claimWithdrawalExecution,
  commitPreparedWithdrawalExecution,
  finalizeWithdrawalBroadcastAccepted,
  finalizeWithdrawalBroadcastFailure,
  reconcileAmbiguousWithdrawalBroadcast,
} from "../../lib/security/withdrawal-external-effect-authority";
import {
  fingerprintExpectedTransactionHash,
  fingerprintPreparedTransaction,
  writeWithdrawalExternalEffectEvidenceTx,
} from "../../lib/security/withdrawal-external-effect-evidence";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

function withdrawalId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 32);
}

async function seedApprovedWithdrawal(id: string, userId: string): Promise<void> {
  const seeded = await withDb(async (client) => {
    await client.query(
      `INSERT INTO withdrawals (
         id, user_id, asset, amount, amount_usd, destination_address,
         network, state, security_gate_passed, two_fa_verified,
         required_confirmations, funds_reserved_at
       ) VALUES ($1, $2, 'USDT', 2, 2, $3, 'ethereum', 'approved',
                 TRUE, TRUE, 12, NOW())`,
      [id, userId, `0x${"a".repeat(40)}`],
    );
    return true;
  });
  assert.equal(seeded.enabled, true);
}

async function loadState(id: string) {
  const result = await withDb(async (client) => {
    const withdrawal = await client.query<{
      state: string;
      raw_tx: Buffer | null;
      tx_hash: string | null;
      broadcast_attempts: number;
      execution_error: string | null;
    }>(
      `SELECT state, raw_tx, tx_hash, broadcast_attempts, execution_error
         FROM withdrawals WHERE id = $1`,
      [id],
    );
    const intents = await client.query<{
      id: string;
      generation: number;
      state: string;
      prepared_tx_fingerprint: string | null;
    }>(
      `SELECT id, generation, state, prepared_tx_fingerprint
         FROM withdrawal_execution_intents
        WHERE withdrawal_id = $1
        ORDER BY generation`,
      [id],
    );
    const attempts = await client.query<{
      id: string;
      attempt_number: number;
      state: string;
      outcome_category: string | null;
    }>(
      `SELECT id, attempt_number, state, outcome_category
         FROM withdrawal_broadcast_attempts
        WHERE withdrawal_id = $1
        ORDER BY attempt_number`,
      [id],
    );
    const outbox = await client.query<{ state: string }>(
      `SELECT state FROM withdrawal_confirmation_outbox
        WHERE withdrawal_id = $1`,
      [id],
    );
    const audit = await client.query<{
      action: string;
      document: string;
    }>(
      `SELECT action, row_to_json(event)::text AS document
         FROM sensitive_mutation_audit_events event
        WHERE actor_type = 'service'
          AND resource_id IN (
            SELECT tecpey_withdrawal_evidence_hash(
              'withdrawal-execution', $1 || chr(31) || generation::text
            )
              FROM withdrawal_execution_intents
             WHERE withdrawal_id = $1
            UNION
            SELECT tecpey_withdrawal_evidence_hash(
              'withdrawal-broadcast-attempt',
              $1 || chr(31) || execution_generation::text
                || chr(31) || attempt_number::text
            )
              FROM withdrawal_broadcast_attempts
             WHERE withdrawal_id = $1
          )
        ORDER BY created_at`,
      [id],
    );
    return {
      withdrawal: withdrawal.rows[0],
      intents: intents.rows,
      attempts: attempts.rows,
      outbox: outbox.rows[0] ?? null,
      audit: audit.rows,
    };
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) throw new Error("test_database_unavailable");
  return result.value;
}

async function prepare(id: string) {
  const claim = await claimWithdrawalExecution({
    withdrawalId: id,
    workerIdentity: `worker-${randomUUID()}`,
  });
  assert.ok(claim && claim.mode === "build");
  if (!claim || claim.mode !== "build") throw new Error("test_claim_failed");

  const rawTx = Buffer.from(`signed:${id}`);
  const txHash = `0x${id.padEnd(64, "b")}`;
  const withdrawal = await commitPreparedWithdrawalExecution({
    withdrawalId: id,
    intentId: claim.intentId,
    generation: claim.generation,
    rawTx,
    expectedTxHash: txHash,
    chainId: "ethereum",
    networkFee: "0.001",
    feeCurrency: "ETH",
    requiredConfirmations: 12,
    signerType: "TestKeyStore",
    signerKeyReference: "test-key-v1",
  });
  return { claim, withdrawal, rawTx, txHash };
}

describe("Withdrawal external-effect transaction authority", () => {
  it(
    "allows one concurrent execution claim and commits typed claim evidence",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const id = withdrawalId();
      const userId = `external-claim-${randomUUID()}`;
      await seedApprovedWithdrawal(id, userId);

      const results = await Promise.all([
        claimWithdrawalExecution({
          withdrawalId: id,
          workerIdentity: `claim-a-${randomUUID()}`,
        }),
        claimWithdrawalExecution({
          withdrawalId: id,
          workerIdentity: `claim-b-${randomUUID()}`,
        }),
      ]);
      assert.equal(results.filter((result) => result?.mode === "build").length, 1);
      assert.equal(results.filter((result) => result === null).length, 1);

      const state = await loadState(id);
      assert.equal(state.withdrawal?.state, "building_transaction");
      assert.equal(state.intents.length, 1);
      assert.equal(state.intents[0]?.state, "building");
      assert.deepEqual(state.audit.map((row) => row.action), [
        "withdrawal.execution.claim",
      ]);
      for (const row of state.audit) {
        assert.equal(row.document.includes(id), false);
        assert.equal(row.document.includes(userId), false);
      }
    },
  );

  it(
    "rolls back raw transaction, hash and intent finalization when preparation evidence conflicts",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const id = withdrawalId();
      const userId = `external-prepare-conflict-${randomUUID()}`;
      await seedApprovedWithdrawal(id, userId);
      const claim = await claimWithdrawalExecution({
        withdrawalId: id,
        workerIdentity: `prepare-${randomUUID()}`,
      });
      assert.ok(claim && claim.mode === "build");
      if (!claim || claim.mode !== "build") throw new Error("test_claim_failed");

      const rawTx = Buffer.from(`signed:${id}`);
      const txHash = `0x${id.padEnd(64, "c")}`;
      const conflict = await withDb(async (client) => {
        await writeWithdrawalExternalEffectEvidenceTx(client, {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorId: "withdrawal-executor",
          action: "withdrawal.transaction.prepare",
          resourceType: "withdrawal_execution",
          resourceIdentity: `${id}\u001f${claim.generation}`,
          correlationIdentity: `${id}\u001f${claim.generation}`,
          requestHash: "f".repeat(64),
          outcome: "success",
          metadata: { marker: "forced-conflict" },
        });
        return true;
      });
      assert.equal(conflict.enabled, true);

      await assert.rejects(
        commitPreparedWithdrawalExecution({
          withdrawalId: id,
          intentId: claim.intentId,
          generation: claim.generation,
          rawTx,
          expectedTxHash: txHash,
          chainId: "ethereum",
          networkFee: "0.001",
          feeCurrency: "ETH",
          requiredConfirmations: 12,
          signerType: "TestKeyStore",
          signerKeyReference: "test-key-v1",
        }),
        /sensitive_audit_correlation_conflict/,
      );

      const state = await loadState(id);
      assert.equal(state.withdrawal?.state, "building_transaction");
      assert.equal(state.withdrawal?.raw_tx, null);
      assert.equal(state.withdrawal?.tx_hash, null);
      assert.equal(state.intents[0]?.state, "building");
      assert.equal(state.intents[0]?.prepared_tx_fingerprint, null);
    },
  );

  it(
    "requires ambiguity reconciliation before a second durable broadcast attempt",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const id = withdrawalId();
      const userId = `external-ambiguous-${randomUUID()}`;
      await seedApprovedWithdrawal(id, userId);
      const prepared = await prepare(id);

      const first = await beginWithdrawalBroadcastAttempt({
        withdrawalId: id,
        workerIdentity: `broadcast-a-${randomUUID()}`,
        providerClass: "TestEthereumProvider",
      });
      assert.equal(first.status, "ready");
      if (first.status !== "ready") throw new Error("test_attempt_not_ready");

      assert.equal(
        await finalizeWithdrawalBroadcastFailure({
          withdrawalId: id,
          attemptId: first.attempt.id,
          error: new Error("rpc timeout"),
        }),
        "ambiguous",
      );

      const blocked = await beginWithdrawalBroadcastAttempt({
        withdrawalId: id,
        workerIdentity: `broadcast-b-${randomUUID()}`,
        providerClass: "TestEthereumProvider",
      });
      assert.deepEqual(blocked, {
        status: "reconcile_required",
        attemptId: first.attempt.id,
      });

      assert.equal(
        await reconcileAmbiguousWithdrawalBroadcast({
          withdrawalId: id,
          attemptId: first.attempt.id,
          observed: "absent",
        }),
        "retry_allowed",
      );

      const second = await beginWithdrawalBroadcastAttempt({
        withdrawalId: id,
        workerIdentity: `broadcast-c-${randomUUID()}`,
        providerClass: "TestEthereumProvider",
      });
      assert.equal(second.status, "ready");
      if (second.status !== "ready") throw new Error("test_second_attempt_not_ready");
      assert.equal(second.attempt.attemptNumber, 2);
      assert.equal(
        second.attempt.preparedTransactionFingerprint,
        fingerprintPreparedTransaction(prepared.rawTx),
      );
      assert.equal(
        second.attempt.expectedTransactionHashFingerprint,
        fingerprintExpectedTransactionHash(prepared.txHash),
      );
    },
  );

  it(
    "commits accepted broadcast, durable confirmation projection and secret-free evidence together",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const id = withdrawalId();
      const userId = `external-accepted-${randomUUID()}`;
      await seedApprovedWithdrawal(id, userId);
      const prepared = await prepare(id);
      const attempt = await beginWithdrawalBroadcastAttempt({
        withdrawalId: id,
        workerIdentity: `broadcast-${randomUUID()}`,
        providerClass: "TestEthereumProvider",
      });
      assert.equal(attempt.status, "ready");
      if (attempt.status !== "ready") throw new Error("test_attempt_not_ready");

      await finalizeWithdrawalBroadcastAccepted({
        withdrawalId: id,
        attemptId: attempt.attempt.id,
        expectedTxHash: prepared.txHash,
        outcome: "accepted",
      });

      const state = await loadState(id);
      assert.equal(state.withdrawal?.state, "broadcasted");
      assert.equal(state.withdrawal?.broadcast_attempts, 1);
      assert.equal(state.attempts[0]?.state, "accepted");
      assert.equal(state.outbox?.state, "pending");
      assert.equal(
        state.audit.filter(
          (row) => row.action === "withdrawal.broadcast.accepted",
        ).length,
        1,
      );
      for (const row of state.audit) {
        assert.equal(row.document.includes(id), false);
        assert.equal(row.document.includes(prepared.txHash), false);
        assert.equal(row.document.includes(userId), false);
      }
    },
  );

  it(
    "records deterministic rejection and prevents the prepared transaction from blind rebroadcast",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const id = withdrawalId();
      const userId = `external-rejected-${randomUUID()}`;
      await seedApprovedWithdrawal(id, userId);
      await prepare(id);
      const attempt = await beginWithdrawalBroadcastAttempt({
        withdrawalId: id,
        workerIdentity: `broadcast-${randomUUID()}`,
        providerClass: "TestEthereumProvider",
      });
      assert.equal(attempt.status, "ready");
      if (attempt.status !== "ready") throw new Error("test_attempt_not_ready");

      assert.equal(
        await finalizeWithdrawalBroadcastFailure({
          withdrawalId: id,
          attemptId: attempt.attempt.id,
          error: new Error("invalid transaction"),
        }),
        "rejected",
      );
      const state = await loadState(id);
      assert.equal(state.withdrawal?.state, "failed");
      assert.equal(state.withdrawal?.execution_error, "deterministic_rejection");
      assert.equal(state.attempts[0]?.state, "rejected");

      await assert.rejects(
        claimWithdrawalExecution({
          withdrawalId: id,
          workerIdentity: `retry-${randomUUID()}`,
        }),
        /withdrawal broadcast retry requires reconciliation authority/,
      );
    },
  );
});
