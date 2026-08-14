import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { withDb } from "../../lib/db";
import { PLATFORM } from "../../lib/platform-config";
import { hashSensitiveAuditRequest } from "../../lib/security/sensitive-mutation-audit";
import {
  claimWithdrawalExecution,
  commitPreparedWithdrawalExecution,
} from "../../lib/security/withdrawal-external-effect-authority";
import {
  fingerprintExpectedTransactionHash,
  fingerprintPreparedTransaction,
  fingerprintWithdrawalProvider,
  writeWithdrawalExternalEffectEvidenceTx,
} from "../../lib/security/withdrawal-external-effect-evidence";
import { recoverExpiredWithdrawalBroadcastAttempt } from "../../lib/security/withdrawal-external-effect-recovery";
import { executeWithdrawal } from "../../lib/wallet/withdrawal-executor";
import {
  clearWalletProviderOverridesForTest,
  setWalletProviderOverrideForTest,
} from "../../lib/wallet/providers/registry";
import type {
  WalletProvider,
  WithdrawalJobData,
} from "../../lib/wallet/types";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME") && process.env.REDIS_URL,
);

afterEach(async () => {
  clearWalletProviderOverridesForTest();
  if (!integrationConfigured) return;

  const {
    confirmationQueue,
    recoveryQueue,
    withdrawalDlq,
    withdrawalQueue,
    withdrawalQueueEvents,
    withdrawalRetryQueue,
  } = await import("../../lib/wallet/queue/withdrawal-queue");
  await Promise.all([
    withdrawalQueueEvents.close(),
    withdrawalQueue.close(),
    withdrawalDlq.close(),
    withdrawalRetryQueue.close(),
    confirmationQueue.close(),
    recoveryQueue.close(),
  ]);
});

function withdrawalId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 32);
}

describe("Withdrawal broadcast lease recovery authority", () => {
  it(
    "turns an expired calling lease into ambiguous reconciliation debt without a second attempt and recovers a provider-present transaction",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const id = withdrawalId();
      const userId = `withdraw-recovery-${randomUUID()}`;
      const seeded = await withDb(async (client) => {
        await client.query(
          `INSERT INTO withdrawals (
             id, user_id, asset, amount, amount_usd, destination_address,
             network, state, security_gate_passed, two_fa_verified,
             required_confirmations, funds_reserved_at
           ) VALUES (
             $1, $2, 'USDT', 2, 2, $3, 'ethereum', 'approved',
             TRUE, TRUE, 12, NOW()
           )`,
          [id, userId, `0x${"a".repeat(40)}`],
        );
        return true;
      });
      assert.equal(seeded.enabled, true);

      const claim = await claimWithdrawalExecution({
        withdrawalId: id,
        workerIdentity: `prepare-${randomUUID()}`,
      });
      assert.ok(claim && claim.mode === "build");
      if (!claim || claim.mode !== "build") throw new Error("test_claim_failed");

      const rawTx = Buffer.from(`signed:${id}`);
      const txHash = `0x${id.padEnd(64, "e")}`;
      await commitPreparedWithdrawalExecution({
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

      const preparedTransactionFingerprint = fingerprintPreparedTransaction(rawTx);
      const expectedTransactionHashFingerprint =
        fingerprintExpectedTransactionHash(txHash);
      const providerFingerprint = fingerprintWithdrawalProvider({
        chainId: "ethereum",
        providerClass: "TestEthereumProvider",
      });
      const requestHash = hashSensitiveAuditRequest({
        action: "withdrawal.broadcast.attempt",
        withdrawalId: id,
        executionGeneration: claim.generation,
        attemptNumber: 1,
        preparedTransactionFingerprint,
        expectedTransactionHashFingerprint,
        providerFingerprint,
      });
      const attemptId = randomUUID();

      const inserted = await withDb(async (client) => {
        await client.query(
          `INSERT INTO withdrawal_broadcast_attempts (
             id, withdrawal_id, execution_generation, attempt_number, state,
             prepared_tx_fingerprint, expected_tx_hash_fingerprint,
             chain_id, provider_fingerprint, lease_owner_fingerprint,
             lease_expires_at, request_hash
           ) VALUES (
             $1, $2, $3, 1, 'prepared', $4, $5, 'ethereum', $6, $7,
             NOW() + INTERVAL '2 minutes', $8
           )`,
          [
            attemptId,
            id,
            claim.generation,
            preparedTransactionFingerprint,
            expectedTransactionHashFingerprint,
            providerFingerprint,
            "a".repeat(64),
            requestHash,
          ],
        );
        await client.query(
          `UPDATE withdrawal_broadcast_attempts
              SET state = 'calling',
                  started_at = NOW(),
                  lease_expires_at = NOW() - INTERVAL '1 second'
            WHERE id = $1`,
          [attemptId],
        );
        await writeWithdrawalExternalEffectEvidenceTx(client, {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorId: "withdrawal-executor",
          action: "withdrawal.broadcast.attempt",
          resourceType: "withdrawal_broadcast_attempt",
          resourceIdentity: `${id}\u001f${claim.generation}\u001f1`,
          correlationIdentity: `${id}\u001f${claim.generation}\u001f1`,
          requestHash,
          outcome: "success",
          metadata: {
            executionGeneration: claim.generation,
            attemptNumber: 1,
            asset: "USDT",
            network: "ethereum",
            amount: "2",
            preparedTransactionFingerprint,
            expectedTransactionHashFingerprint,
            providerFingerprint,
            leaseOwnerFingerprint: "a".repeat(64),
            attemptState: "calling",
          },
        });
        return true;
      });
      assert.equal(inserted.enabled, true);

      assert.equal(
        await recoverExpiredWithdrawalBroadcastAttempt(id),
        "recovered",
      );

      const recoveredClaim = await claimWithdrawalExecution({
        withdrawalId: id,
        workerIdentity: `recover-${randomUUID()}`,
      });
      assert.ok(recoveredClaim && recoveredClaim.mode === "reconcile");
      if (!recoveredClaim || recoveredClaim.mode !== "reconcile") {
        throw new Error("test_reconciliation_claim_missing");
      }
      assert.equal(recoveredClaim.attemptId, attemptId);

      const evidence = await withDb(async (client) => {
        const attempts = await client.query<{
          id: string;
          state: string;
          outcome_category: string | null;
        }>(
          `SELECT id, state, outcome_category
             FROM withdrawal_broadcast_attempts
            WHERE withdrawal_id = $1
            ORDER BY attempt_number`,
          [id],
        );
        const audit = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_events
            WHERE action = 'withdrawal.broadcast.ambiguous'
              AND resource_type = 'withdrawal_broadcast_attempt'
              AND resource_id = tecpey_withdrawal_evidence_hash(
                'withdrawal-broadcast-attempt',
                $1 || chr(31) || $2::text || chr(31) || '1'
              )`,
          [id, claim.generation],
        );
        return {
          attempts: attempts.rows,
          ambiguousEvents: Number(audit.rows[0]?.count ?? "0"),
        };
      });
      assert.equal(evidence.enabled, true);
      if (evidence.enabled) {
        assert.equal(evidence.value.attempts.length, 1);
        assert.equal(evidence.value.attempts[0]?.id, attemptId);
        assert.equal(evidence.value.attempts[0]?.state, "ambiguous");
        assert.equal(evidence.value.attempts[0]?.outcome_category, "timeout");
        assert.equal(evidence.value.ambiguousEvents, 1);
      }

      // This is the post-RPC/pre-commit crash window: the provider has the
      // deterministic transaction hash, while PostgreSQL still owns an
      // expired `calling` attempt. Recovery must commit that same attempt as
      // present; it must never manufacture a second broadcast attempt.
      let confirmationLookupCount = 0;
      const provider = {
        chainId: "ethereum",
        nativeAsset: "ETH",
        getConfirmationStatus: async (observedHash: string) => {
          confirmationLookupCount += 1;
          assert.equal(observedHash, txHash);
          return {
            txHash: observedHash,
            chainId: "ethereum",
            confirmations: 1,
            required: 12,
            status: "included",
            isComplete: false,
          };
        },
      } as unknown as WalletProvider;
      setWalletProviderOverrideForTest("ethereum", provider);

      const recoveryJob: WithdrawalJobData = {
        withdrawalId: id,
        chainId: "ethereum",
        asset: "USDT",
        amount: "2",
        amountUsd: 2,
        destinationAddress: `0x${"a".repeat(40)}`,
        feeSpeed: "normal",
        enqueuedAt: new Date().toISOString(),
        priority: 5,
      };
      await executeWithdrawal(recoveryJob);
      assert.equal(
        confirmationLookupCount,
        1,
        "the executor must query the provider before mapping the ambiguous attempt to present",
      );

      const recovered = await withDb(async (client) => {
        const withdrawal = await client.query<{
          state: string;
          broadcast_attempts: number;
        }>(
          `SELECT state, broadcast_attempts
             FROM withdrawals
            WHERE id = $1`,
          [id],
        );
        const attempts = await client.query<{
          state: string;
          outcome_category: string | null;
        }>(
          `SELECT state, outcome_category
             FROM withdrawal_broadcast_attempts
            WHERE withdrawal_id = $1
            ORDER BY attempt_number`,
          [id],
        );
        const acceptedEvidence = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_events
            WHERE action = 'withdrawal.broadcast.accepted'
              AND resource_type = 'withdrawal_broadcast_attempt'
              AND resource_id = tecpey_withdrawal_evidence_hash(
                'withdrawal-broadcast-attempt',
                $1 || chr(31) || $2::text || chr(31) || '1'
              )`,
          [id, claim.generation],
        );
        const confirmationOutbox = await client.query<{
          state: string;
          attempts: number;
        }>(
          `SELECT state, attempts
             FROM withdrawal_confirmation_outbox
            WHERE withdrawal_id = $1`,
          [id],
        );
        return {
          withdrawal: withdrawal.rows[0],
          attempts: attempts.rows,
          acceptedEvents: Number(acceptedEvidence.rows[0]?.count ?? "0"),
          confirmationOutbox: confirmationOutbox.rows[0],
        };
      });
      assert.equal(recovered.enabled, true);
      if (recovered.enabled) {
        assert.equal(recovered.value.withdrawal?.state, "confirming");
        assert.equal(recovered.value.withdrawal?.broadcast_attempts, 1);
        assert.deepEqual(recovered.value.attempts, [
          {
            state: "reconciled_present",
            outcome_category: "reconciled_present",
          },
        ]);
        assert.equal(recovered.value.acceptedEvents, 1);
        assert.deepEqual(recovered.value.confirmationOutbox, {
          state: "published",
          attempts: 1,
        });
      }
    },
  );
});
