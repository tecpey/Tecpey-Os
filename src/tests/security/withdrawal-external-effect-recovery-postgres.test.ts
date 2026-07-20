import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withDb } from "../../lib/db";
import {
  beginWithdrawalBroadcastAttempt,
  claimWithdrawalExecution,
  commitPreparedWithdrawalExecution,
} from "../../lib/security/withdrawal-external-effect-authority";
import { recoverExpiredWithdrawalBroadcastAttempt } from "../../lib/security/withdrawal-external-effect-recovery";

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationConfigured = Boolean(
  databaseUrl && !databaseUrl.includes("CHANGE_ME"),
);

function withdrawalId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 32);
}

async function seedPreparedWithdrawal(id: string, userId: string): Promise<void> {
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

  const claim = await claimWithdrawalExecution({
    withdrawalId: id,
    workerIdentity: `prepare-${randomUUID()}`,
  });
  assert.ok(claim && claim.mode === "build");
  if (!claim || claim.mode !== "build") throw new Error("test_claim_failed");

  await commitPreparedWithdrawalExecution({
    withdrawalId: id,
    intentId: claim.intentId,
    generation: claim.generation,
    rawTx: Buffer.from(`signed:${id}`),
    expectedTxHash: `0x${id.padEnd(64, "b")}`,
    chainId: "ethereum",
    networkFee: "0.001",
    feeCurrency: "ETH",
    requiredConfirmations: 12,
    signerType: "TestKeyStore",
    signerKeyReference: "test-key-v1",
  });
}

describe("Withdrawal broadcast lease recovery", () => {
  it(
    "keeps a live calling lease unchanged and converts an expired lease to reconciliation-only ambiguity",
    { skip: !integrationConfigured, timeout: 30_000 },
    async () => {
      const id = withdrawalId();
      const userId = `external-recovery-${randomUUID()}`;
      await seedPreparedWithdrawal(id, userId);

      const attempt = await beginWithdrawalBroadcastAttempt({
        withdrawalId: id,
        workerIdentity: `broadcast-${randomUUID()}`,
        providerClass: "TestEthereumProvider",
      });
      assert.equal(attempt.status, "ready");
      if (attempt.status !== "ready") throw new Error("test_attempt_not_ready");

      assert.equal(
        await recoverExpiredWithdrawalBroadcastAttempt(id),
        "active",
      );

      const live = await withDb(async (client) =>
        client.query<{ state: string }>(
          "SELECT state FROM withdrawal_broadcast_attempts WHERE id = $1",
          [attempt.attempt.id],
        ),
      );
      assert.equal(live.enabled, true);
      if (live.enabled) assert.equal(live.value.rows[0]?.state, "calling");

      const expired = await withDb(async (client) => {
        await client.query(
          `UPDATE withdrawal_broadcast_attempts
              SET lease_expires_at = NOW() - INTERVAL '1 second'
            WHERE id = $1`,
          [attempt.attempt.id],
        );
        return true;
      });
      assert.equal(expired.enabled, true);

      assert.equal(
        await recoverExpiredWithdrawalBroadcastAttempt(id),
        "recovered",
      );

      const state = await withDb(async (client) => {
        const attemptState = await client.query<{
          state: string;
          outcome_category: string | null;
        }>(
          `SELECT state, outcome_category
             FROM withdrawal_broadcast_attempts
            WHERE id = $1`,
          [attempt.attempt.id],
        );
        const evidence = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM sensitive_mutation_audit_events
            WHERE action = 'withdrawal.broadcast.ambiguous'
              AND resource_type = 'withdrawal_broadcast_attempt'
              AND resource_id = tecpey_withdrawal_evidence_hash(
                'withdrawal-broadcast-attempt',
                $1 || chr(31) || $2::text || chr(31) || $3::text
              )`,
          [id, attempt.attempt.generation, attempt.attempt.attemptNumber],
        );
        return {
          attempt: attemptState.rows[0],
          evidenceCount: Number(evidence.rows[0]?.count ?? "0"),
        };
      });
      assert.equal(state.enabled, true);
      if (state.enabled) {
        assert.equal(state.value.attempt?.state, "ambiguous");
        assert.equal(state.value.attempt?.outcome_category, "timeout");
        assert.equal(state.value.evidenceCount, 1);
      }

      const nextClaim = await claimWithdrawalExecution({
        withdrawalId: id,
        workerIdentity: `retry-${randomUUID()}`,
      });
      assert.ok(nextClaim && nextClaim.mode === "reconcile");
      if (nextClaim && nextClaim.mode === "reconcile") {
        assert.equal(nextClaim.attemptId, attempt.attempt.id);
      }
    },
  );
});
