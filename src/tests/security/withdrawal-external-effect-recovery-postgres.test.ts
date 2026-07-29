import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

function withdrawalId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 32);
}

describe("Withdrawal broadcast lease recovery authority", () => {
  it(
    "turns an expired calling lease into ambiguous reconciliation debt without a second attempt",
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
    },
  );
});
