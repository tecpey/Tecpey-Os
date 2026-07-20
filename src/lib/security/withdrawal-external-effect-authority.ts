import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withDb, withTx } from "@/lib/db";
import { PLATFORM } from "@/lib/platform-config";
import { hashSensitiveAuditRequest } from "@/lib/security/sensitive-mutation-audit";
import {
  classifyWithdrawalBroadcastError,
  fingerprintBroadcastAttempt,
  fingerprintExpectedTransactionHash,
  fingerprintPreparedTransaction,
  fingerprintWithdrawalExecution,
  fingerprintWithdrawalProvider,
  fingerprintWithdrawalSigner,
  writeWithdrawalExternalEffectEvidenceTx,
  type WithdrawalBroadcastOutcomeCategory,
} from "@/lib/security/withdrawal-external-effect-evidence";
import type { ChainId, FeeSpeed } from "@/lib/wallet/types";

const EXECUTION_LEASE_SECONDS = 5 * 60;
const BROADCAST_LEASE_SECONDS = 2 * 60;

export type AuthoritativeWithdrawalExecutionRecord = {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  network: ChainId;
  state: string;
  txHash: string | null;
  rawTx: Buffer | null;
  idempotencyKey: string | null;
  feeConfig: unknown;
  requiredConfirmations: number;
  lastBroadcastAt: Date | null;
};

type ExecutionIntentRow = {
  id: string;
  generation: number;
  state: string;
  prepared_tx_fingerprint: string | null;
  expected_tx_hash_fingerprint: string | null;
};

type BroadcastAttemptRow = {
  id: string;
  execution_generation: number;
  attempt_number: number;
  state: string;
  prepared_tx_fingerprint: string;
  expected_tx_hash_fingerprint: string;
  chain_id: string;
  provider_fingerprint: string;
  outcome_category: WithdrawalBroadcastOutcomeCategory | "reconciled_present" | "reconciled_absent" | "manual_review" | null;
};

export type WithdrawalExecutionClaim =
  | {
      mode: "build" | "resume";
      withdrawal: AuthoritativeWithdrawalExecutionRecord;
      intentId: string;
      generation: number;
    }
  | {
      mode: "confirm";
      withdrawal: AuthoritativeWithdrawalExecutionRecord;
    }
  | {
      mode: "reconcile";
      withdrawal: AuthoritativeWithdrawalExecutionRecord;
      attemptId: string;
    }
  | null;

export type WithdrawalBroadcastAttempt = {
  id: string;
  withdrawalId: string;
  generation: number;
  attemptNumber: number;
  chainId: ChainId;
  expectedTxHash: string;
  rawTx: Buffer;
  preparedTransactionFingerprint: string;
  expectedTransactionHashFingerprint: string;
};

function fingerprintLeaseOwner(value: string): string {
  return createHash("sha256")
    .update("tecpey:withdrawal-lease-owner:v1\u001f")
    .update(value)
    .digest("hex");
}

function boundedFailureCategory(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (/custody|disabled/.test(message)) return "custody_disabled";
  if (/sign|key|keystore|hsm|mpc/.test(message)) return "signing_failed";
  if (/build|fee|utxo|nonce|transaction/.test(message)) return "build_failed";
  return "unknown";
}

function withdrawalSelect(forUpdate = false): string {
  return `SELECT id,
                 user_id AS "userId",
                 asset,
                 amount::text AS amount,
                 destination_address AS "destinationAddress",
                 network,
                 state,
                 tx_hash AS "txHash",
                 raw_tx AS "rawTx",
                 idempotency_key AS "idempotencyKey",
                 fee_config AS "feeConfig",
                 required_confirmations AS "requiredConfirmations",
                 last_broadcast_at AS "lastBroadcastAt"
            FROM withdrawals
           WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`;
}

async function nextExecutionGeneration(
  client: PoolClient,
  withdrawalId: string,
): Promise<number> {
  const result = await client.query<{ generation: number }>(
    `SELECT COALESCE(MAX(generation), 0)::integer + 1 AS generation
       FROM withdrawal_execution_intents
      WHERE withdrawal_id = $1`,
    [withdrawalId],
  );
  return result.rows[0]?.generation ?? 1;
}

async function writeClaimEvidence(
  client: PoolClient,
  input: {
    withdrawal: AuthoritativeWithdrawalExecutionRecord;
    generation: number;
    leaseOwnerFingerprint: string;
    requestHash: string;
    outcome?: "success" | "failed";
    failureCategory?: string;
  },
): Promise<void> {
  await writeWithdrawalExternalEffectEvidenceTx(client, {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorId: "withdrawal-executor",
    action: "withdrawal.execution.claim",
    resourceType: "withdrawal_execution",
    resourceIdentity: `${input.withdrawal.id}\u001f${input.generation}`,
    correlationIdentity: `${input.withdrawal.id}\u001f${input.generation}`,
    requestHash: input.requestHash,
    outcome: input.outcome ?? "success",
    metadata: {
      generation: input.generation,
      leaseOwnerFingerprint: input.leaseOwnerFingerprint,
      asset: input.withdrawal.asset,
      network: input.withdrawal.network,
      amount: input.withdrawal.amount,
      previousState: input.withdrawal.state,
      claimedState: input.outcome === "failed" ? "manual_review" : "building_transaction",
      failureCategory: input.failureCategory ?? null,
    },
  });
}

async function backfillPreparedIntentTx(
  client: PoolClient,
  input: {
    withdrawal: AuthoritativeWithdrawalExecutionRecord;
    workerIdentity: string;
  },
): Promise<ExecutionIntentRow> {
  if (!input.withdrawal.rawTx || !input.withdrawal.txHash) {
    throw new Error("withdrawal_prepared_state_incomplete");
  }
  const generation = await nextExecutionGeneration(client, input.withdrawal.id);
  const leaseOwnerFingerprint = fingerprintLeaseOwner(input.workerIdentity);
  const preparedFingerprint = fingerprintPreparedTransaction(input.withdrawal.rawTx);
  const expectedHashFingerprint = fingerprintExpectedTransactionHash(
    input.withdrawal.txHash,
  );
  const signerFingerprint = fingerprintWithdrawalSigner({
    signerType: "legacy-prepared",
    keyReference: "compatibility-backfill",
  });
  const requestHash = hashSensitiveAuditRequest({
    action: "withdrawal.transaction.prepare",
    withdrawalId: input.withdrawal.id,
    generation,
    preparedFingerprint,
    expectedHashFingerprint,
    compatibilityBackfill: true,
  });

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO withdrawal_execution_intents
       (withdrawal_id, generation, state, lease_owner_fingerprint,
        lease_expires_at, request_hash)
     VALUES ($1, $2, 'claimed', $3,
             NOW() + ($4::text || ' seconds')::interval, $5)
     RETURNING id`,
    [
      input.withdrawal.id,
      generation,
      leaseOwnerFingerprint,
      EXECUTION_LEASE_SECONDS,
      requestHash,
    ],
  );
  const intentId = inserted.rows[0]?.id;
  if (!intentId) throw new Error("withdrawal_execution_intent_insert_failed");

  await client.query(
    "UPDATE withdrawal_execution_intents SET state = 'building' WHERE id = $1",
    [intentId],
  );
  await client.query(
    "UPDATE withdrawal_execution_intents SET state = 'signing' WHERE id = $1",
    [intentId],
  );
  const prepared = await client.query<ExecutionIntentRow>(
    `UPDATE withdrawal_execution_intents
        SET state = 'prepared',
            prepared_tx_fingerprint = $2,
            expected_tx_hash_fingerprint = $3,
            signer_fingerprint = $4,
            prepared_at = NOW(),
            finalized_at = NOW()
      WHERE id = $1
      RETURNING id, generation, state, prepared_tx_fingerprint,
                expected_tx_hash_fingerprint`,
    [intentId, preparedFingerprint, expectedHashFingerprint, signerFingerprint],
  );

  await writeClaimEvidence(client, {
    withdrawal: input.withdrawal,
    generation,
    leaseOwnerFingerprint,
    requestHash: hashSensitiveAuditRequest({
      action: "withdrawal.execution.claim",
      withdrawalId: input.withdrawal.id,
      generation,
      compatibilityBackfill: true,
    }),
  });
  await writeWithdrawalExternalEffectEvidenceTx(client, {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorId: "withdrawal-executor",
    action: "withdrawal.transaction.prepare",
    resourceType: "withdrawal_execution",
    resourceIdentity: `${input.withdrawal.id}\u001f${generation}`,
    correlationIdentity: `${input.withdrawal.id}\u001f${generation}`,
    requestHash,
    outcome: "success",
    metadata: {
      generation,
      asset: input.withdrawal.asset,
      network: input.withdrawal.network,
      amount: input.withdrawal.amount,
      preparedTransactionFingerprint: preparedFingerprint,
      expectedTransactionHashFingerprint: expectedHashFingerprint,
      signerFingerprint,
      requiredConfirmations: input.withdrawal.requiredConfirmations,
      compatibilityBackfill: true,
      finalState: "broadcasting",
    },
  });

  const row = prepared.rows[0];
  if (!row) throw new Error("withdrawal_prepared_intent_backfill_failed");
  return row;
}

export async function claimWithdrawalExecution(input: {
  withdrawalId: string;
  workerIdentity: string;
}): Promise<WithdrawalExecutionClaim> {
  const result = await withTx(async (client) => {
    const selected = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      withdrawalSelect(true),
      [input.withdrawalId],
    );
    const withdrawal = selected.rows[0];
    if (!withdrawal) throw new Error(`Withdrawal ${input.withdrawalId} not found`);

    if (["completed", "cancelled", "timeout", "rejected", "blocked"].includes(withdrawal.state)) {
      return null;
    }
    if (["broadcasted", "confirming"].includes(withdrawal.state) && withdrawal.txHash) {
      return { mode: "confirm", withdrawal } as WithdrawalExecutionClaim;
    }

    const activeAttempt = await client.query<{ id: string; state: string }>(
      `SELECT id, state
         FROM withdrawal_broadcast_attempts
        WHERE withdrawal_id = $1
          AND state IN ('prepared', 'calling', 'ambiguous')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [withdrawal.id],
    );
    if (activeAttempt.rows[0]?.state === "ambiguous") {
      return {
        mode: "reconcile",
        withdrawal,
        attemptId: activeAttempt.rows[0].id,
      } as WithdrawalExecutionClaim;
    }
    if (activeAttempt.rows[0]) return null;

    if (withdrawal.rawTx && withdrawal.txHash) {
      let prepared = await client.query<ExecutionIntentRow>(
        `SELECT id, generation, state, prepared_tx_fingerprint,
                expected_tx_hash_fingerprint
           FROM withdrawal_execution_intents
          WHERE withdrawal_id = $1
            AND state = 'prepared'
          ORDER BY generation DESC
          LIMIT 1
          FOR SHARE`,
        [withdrawal.id],
      );
      if (!prepared.rows[0]) {
        const backfilled = await backfillPreparedIntentTx(client, {
          withdrawal,
          workerIdentity: input.workerIdentity,
        });
        prepared = { ...prepared, rows: [backfilled] };
      }

      if (["failed", "building_transaction", "signing"].includes(withdrawal.state)) {
        await client.query(
          `UPDATE withdrawals
              SET state = 'broadcasting', execution_error = NULL, updated_at = NOW()
            WHERE id = $1`,
          [withdrawal.id],
        );
        withdrawal.state = "broadcasting";
      }
      return {
        mode: "resume",
        withdrawal,
        intentId: prepared.rows[0].id,
        generation: prepared.rows[0].generation,
      } as WithdrawalExecutionClaim;
    }

    if (!["approved", "failed"].includes(withdrawal.state)) return null;

    const stale = await client.query<{
      id: string;
      state: string;
      generation: number;
      request_hash: string;
      lease_owner_fingerprint: string;
    }>(
      `SELECT id, state, generation, request_hash, lease_owner_fingerprint
         FROM withdrawal_execution_intents
        WHERE withdrawal_id = $1
          AND state IN ('claimed', 'building', 'signing')
        ORDER BY generation DESC
        LIMIT 1
        FOR UPDATE`,
      [withdrawal.id],
    );
    if (stale.rows[0]) {
      const due = await client.query<{ due: boolean }>(
        `SELECT lease_expires_at <= NOW() AS due
           FROM withdrawal_execution_intents
          WHERE id = $1`,
        [stale.rows[0].id],
      );
      if (!due.rows[0]?.due) return null;
      await client.query(
        `UPDATE withdrawal_execution_intents
            SET state = 'manual_review',
                failure_category = 'unknown',
                finalized_at = NOW()
          WHERE id = $1`,
        [stale.rows[0].id],
      );
      await writeClaimEvidence(client, {
        withdrawal,
        generation: stale.rows[0].generation,
        leaseOwnerFingerprint: stale.rows[0].lease_owner_fingerprint,
        requestHash: stale.rows[0].request_hash,
        outcome: "failed",
        failureCategory: "lease_expired",
      });
    }

    const generation = await nextExecutionGeneration(client, withdrawal.id);
    const leaseOwnerFingerprint = fingerprintLeaseOwner(input.workerIdentity);
    const requestHash = hashSensitiveAuditRequest({
      action: "withdrawal.execution.claim",
      withdrawalId: withdrawal.id,
      generation,
      asset: withdrawal.asset,
      network: withdrawal.network,
      amount: withdrawal.amount,
    });
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO withdrawal_execution_intents
         (withdrawal_id, generation, state, lease_owner_fingerprint,
          lease_expires_at, request_hash)
       VALUES ($1, $2, 'claimed', $3,
               NOW() + ($4::text || ' seconds')::interval, $5)
       RETURNING id`,
      [
        withdrawal.id,
        generation,
        leaseOwnerFingerprint,
        EXECUTION_LEASE_SECONDS,
        requestHash,
      ],
    );
    const intentId = inserted.rows[0]?.id;
    if (!intentId) throw new Error("withdrawal_execution_intent_insert_failed");

    await client.query(
      "UPDATE withdrawal_execution_intents SET state = 'building' WHERE id = $1",
      [intentId],
    );
    const updated = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      `UPDATE withdrawals
          SET state = 'building_transaction',
              execution_error = NULL,
              updated_at = NOW()
        WHERE id = $1
          AND state IN ('approved', 'failed')
          AND raw_tx IS NULL
          AND tx_hash IS NULL
        RETURNING id,
                  user_id AS "userId",
                  asset,
                  amount::text AS amount,
                  destination_address AS "destinationAddress",
                  network,
                  state,
                  tx_hash AS "txHash",
                  raw_tx AS "rawTx",
                  idempotency_key AS "idempotencyKey",
                  fee_config AS "feeConfig",
                  required_confirmations AS "requiredConfirmations",
                  last_broadcast_at AS "lastBroadcastAt"`,
      [withdrawal.id],
    );
    if (!updated.rows[0]) throw new Error("withdrawal_execution_claim_rejected");

    await writeClaimEvidence(client, {
      withdrawal,
      generation,
      leaseOwnerFingerprint,
      requestHash,
    });
    return {
      mode: "build",
      withdrawal: updated.rows[0],
      intentId,
      generation,
    } as WithdrawalExecutionClaim;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}

export async function commitPreparedWithdrawalExecution(input: {
  withdrawalId: string;
  intentId: string;
  generation: number;
  rawTx: Buffer;
  expectedTxHash: string;
  chainId: ChainId;
  networkFee: string;
  feeCurrency: string;
  requiredConfirmations: number;
  signerType: string;
  signerKeyReference?: string | null;
}): Promise<AuthoritativeWithdrawalExecutionRecord> {
  const preparedTransactionFingerprint = fingerprintPreparedTransaction(input.rawTx);
  const expectedTransactionHashFingerprint = fingerprintExpectedTransactionHash(
    input.expectedTxHash,
  );
  const signerFingerprint = fingerprintWithdrawalSigner({
    signerType: input.signerType,
    keyReference: input.signerKeyReference,
  });

  const result = await withTx(async (client) => {
    const selected = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      withdrawalSelect(true),
      [input.withdrawalId],
    );
    const withdrawal = selected.rows[0];
    if (!withdrawal) throw new Error("withdrawal_not_found");
    if (withdrawal.state !== "building_transaction") {
      throw new Error("withdrawal_preparation_state_conflict");
    }
    if (withdrawal.rawTx || withdrawal.txHash) {
      throw new Error("withdrawal_preparation_already_present");
    }

    const intent = await client.query<ExecutionIntentRow>(
      `SELECT id, generation, state, prepared_tx_fingerprint,
              expected_tx_hash_fingerprint
         FROM withdrawal_execution_intents
        WHERE id = $1
          AND withdrawal_id = $2
          AND generation = $3
        FOR UPDATE`,
      [input.intentId, input.withdrawalId, input.generation],
    );
    if (!intent.rows[0] || intent.rows[0].state !== "building") {
      throw new Error("withdrawal_execution_intent_conflict");
    }

    // Signing is not exposed as a separate withdrawal authority. Both intent
    // transitions occur inside this transaction and become visible only with
    // the durable prepared transaction and mandatory evidence.
    await client.query(
      "UPDATE withdrawal_execution_intents SET state = 'signing' WHERE id = $1",
      [input.intentId],
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
      [
        input.intentId,
        preparedTransactionFingerprint,
        expectedTransactionHashFingerprint,
        signerFingerprint,
      ],
    );

    const updated = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      `UPDATE withdrawals
          SET state = 'broadcasting',
              raw_tx = $2,
              tx_hash = $3,
              chain_id = $4,
              network_fee = $5::numeric,
              fee_currency = $6,
              required_confirmations = $7,
              execution_error = NULL,
              updated_at = NOW()
        WHERE id = $1
          AND state = 'building_transaction'
          AND raw_tx IS NULL
          AND tx_hash IS NULL
        RETURNING id,
                  user_id AS "userId",
                  asset,
                  amount::text AS amount,
                  destination_address AS "destinationAddress",
                  network,
                  state,
                  tx_hash AS "txHash",
                  raw_tx AS "rawTx",
                  idempotency_key AS "idempotencyKey",
                  fee_config AS "feeConfig",
                  required_confirmations AS "requiredConfirmations",
                  last_broadcast_at AS "lastBroadcastAt"`,
      [
        input.withdrawalId,
        input.rawTx,
        input.expectedTxHash,
        input.chainId,
        input.networkFee,
        input.feeCurrency,
        input.requiredConfirmations,
      ],
    );
    if (!updated.rows[0]) throw new Error("withdrawal_prepared_commit_rejected");

    const requestHash = hashSensitiveAuditRequest({
      action: "withdrawal.transaction.prepare",
      withdrawalId: input.withdrawalId,
      generation: input.generation,
      preparedTransactionFingerprint,
      expectedTransactionHashFingerprint,
      signerFingerprint,
      chainId: input.chainId,
      networkFee: input.networkFee,
      feeCurrency: input.feeCurrency,
      requiredConfirmations: input.requiredConfirmations,
    });
    await writeWithdrawalExternalEffectEvidenceTx(client, {
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorId: "withdrawal-executor",
      action: "withdrawal.transaction.prepare",
      resourceType: "withdrawal_execution",
      resourceIdentity: `${input.withdrawalId}\u001f${input.generation}`,
      correlationIdentity: `${input.withdrawalId}\u001f${input.generation}`,
      requestHash,
      outcome: "success",
      metadata: {
        generation: input.generation,
        asset: withdrawal.asset,
        network: input.chainId,
        amount: withdrawal.amount,
        networkFee: input.networkFee,
        feeCurrency: input.feeCurrency,
        requiredConfirmations: input.requiredConfirmations,
        preparedTransactionFingerprint,
        expectedTransactionHashFingerprint,
        signerFingerprint,
        finalState: "broadcasting",
      },
    });
    return updated.rows[0];
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}

export async function failWithdrawalPreparation(input: {
  withdrawalId: string;
  intentId: string;
  generation: number;
  error: unknown;
}): Promise<void> {
  const failureCategory = boundedFailureCategory(input.error);
  const result = await withTx(async (client) => {
    const selected = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      withdrawalSelect(true),
      [input.withdrawalId],
    );
    const withdrawal = selected.rows[0];
    if (!withdrawal) throw new Error("withdrawal_not_found");

    const intent = await client.query<{ state: string }>(
      `SELECT state
         FROM withdrawal_execution_intents
        WHERE id = $1
          AND withdrawal_id = $2
          AND generation = $3
        FOR UPDATE`,
      [input.intentId, input.withdrawalId, input.generation],
    );
    if (!intent.rows[0]) throw new Error("withdrawal_execution_intent_not_found");
    if (["failed", "manual_review", "prepared"].includes(intent.rows[0].state)) return;

    await client.query(
      `UPDATE withdrawal_execution_intents
          SET state = 'failed',
              failure_category = $2,
              finalized_at = NOW()
        WHERE id = $1`,
      [input.intentId, failureCategory],
    );
    await client.query(
      `UPDATE withdrawals
          SET state = 'failed',
              execution_error = $2,
              updated_at = NOW()
        WHERE id = $1
          AND state IN ('building_transaction', 'signing')`,
      [input.withdrawalId, failureCategory],
    );

    await writeWithdrawalExternalEffectEvidenceTx(client, {
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorId: "withdrawal-executor",
      action: "withdrawal.transaction.prepare",
      resourceType: "withdrawal_execution",
      resourceIdentity: `${input.withdrawalId}\u001f${input.generation}`,
      correlationIdentity: `${input.withdrawalId}\u001f${input.generation}\u001ffailed`,
      requestHash: hashSensitiveAuditRequest({
        action: "withdrawal.transaction.prepare",
        withdrawalId: input.withdrawalId,
        generation: input.generation,
        failureCategory,
      }),
      outcome: "failed",
      metadata: {
        generation: input.generation,
        asset: withdrawal.asset,
        network: withdrawal.network,
        amount: withdrawal.amount,
        failureCategory,
        finalState: "failed",
      },
    });
  });
  if (!result.enabled) throw new Error("Withdrawal database unavailable");
}

export async function beginWithdrawalBroadcastAttempt(input: {
  withdrawalId: string;
  workerIdentity: string;
  providerClass: string;
}): Promise<
  | { status: "ready"; attempt: WithdrawalBroadcastAttempt }
  | { status: "reconcile_required"; attemptId: string }
  | { status: "already_claimed" }
> {
  const result = await withTx(async (client) => {
    const selected = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      withdrawalSelect(true),
      [input.withdrawalId],
    );
    const withdrawal = selected.rows[0];
    if (!withdrawal) throw new Error("withdrawal_not_found");
    if (
      withdrawal.state !== "broadcasting" ||
      !withdrawal.rawTx ||
      !withdrawal.txHash
    ) {
      throw new Error("withdrawal_broadcast_state_invalid");
    }

    const active = await client.query<{ id: string; state: string }>(
      `SELECT id, state
         FROM withdrawal_broadcast_attempts
        WHERE withdrawal_id = $1
          AND state IN ('prepared', 'calling', 'ambiguous')
        ORDER BY attempt_number DESC
        LIMIT 1
        FOR UPDATE`,
      [withdrawal.id],
    );
    if (active.rows[0]?.state === "ambiguous") {
      return { status: "reconcile_required", attemptId: active.rows[0].id } as const;
    }
    if (active.rows[0]) return { status: "already_claimed" } as const;

    const preparedIntent = await client.query<ExecutionIntentRow>(
      `SELECT id, generation, state, prepared_tx_fingerprint,
              expected_tx_hash_fingerprint
         FROM withdrawal_execution_intents
        WHERE withdrawal_id = $1
          AND state = 'prepared'
        ORDER BY generation DESC
        LIMIT 1
        FOR SHARE`,
      [withdrawal.id],
    );
    const intent = preparedIntent.rows[0];
    if (
      !intent ||
      !intent.prepared_tx_fingerprint ||
      !intent.expected_tx_hash_fingerprint
    ) {
      throw new Error("withdrawal_prepared_intent_missing");
    }
    const actualPreparedFingerprint = fingerprintPreparedTransaction(withdrawal.rawTx);
    const actualExpectedHashFingerprint = fingerprintExpectedTransactionHash(
      withdrawal.txHash,
    );
    if (
      actualPreparedFingerprint !== intent.prepared_tx_fingerprint ||
      actualExpectedHashFingerprint !== intent.expected_tx_hash_fingerprint
    ) {
      throw new Error("withdrawal_prepared_fingerprint_mismatch");
    }

    const attemptNumberResult = await client.query<{ attempt_number: number }>(
      `SELECT COALESCE(MAX(attempt_number), 0)::integer + 1 AS attempt_number
         FROM withdrawal_broadcast_attempts
        WHERE withdrawal_id = $1
          AND execution_generation = $2`,
      [withdrawal.id, intent.generation],
    );
    const attemptNumber = attemptNumberResult.rows[0]?.attempt_number ?? 1;
    const providerFingerprint = fingerprintWithdrawalProvider({
      chainId: withdrawal.network,
      providerClass: input.providerClass,
    });
    const leaseOwnerFingerprint = fingerprintLeaseOwner(input.workerIdentity);
    const requestHash = hashSensitiveAuditRequest({
      action: "withdrawal.broadcast.attempt",
      withdrawalId: withdrawal.id,
      executionGeneration: intent.generation,
      attemptNumber,
      preparedTransactionFingerprint: actualPreparedFingerprint,
      expectedTransactionHashFingerprint: actualExpectedHashFingerprint,
      providerFingerprint,
    });
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO withdrawal_broadcast_attempts
         (withdrawal_id, execution_generation, attempt_number, state,
          prepared_tx_fingerprint, expected_tx_hash_fingerprint,
          chain_id, provider_fingerprint, lease_owner_fingerprint,
          lease_expires_at, request_hash)
       VALUES ($1, $2, $3, 'prepared', $4, $5, $6, $7, $8,
               NOW() + ($9::text || ' seconds')::interval, $10)
       RETURNING id`,
      [
        withdrawal.id,
        intent.generation,
        attemptNumber,
        actualPreparedFingerprint,
        actualExpectedHashFingerprint,
        withdrawal.network,
        providerFingerprint,
        leaseOwnerFingerprint,
        BROADCAST_LEASE_SECONDS,
        requestHash,
      ],
    );
    const attemptId = inserted.rows[0]?.id;
    if (!attemptId) throw new Error("withdrawal_broadcast_attempt_insert_failed");

    await client.query(
      `UPDATE withdrawal_broadcast_attempts
          SET state = 'calling', started_at = NOW()
        WHERE id = $1`,
      [attemptId],
    );
    await writeWithdrawalExternalEffectEvidenceTx(client, {
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorId: "withdrawal-executor",
      action: "withdrawal.broadcast.attempt",
      resourceType: "withdrawal_broadcast_attempt",
      resourceIdentity: `${withdrawal.id}\u001f${intent.generation}\u001f${attemptNumber}`,
      correlationIdentity: `${withdrawal.id}\u001f${intent.generation}\u001f${attemptNumber}`,
      requestHash,
      outcome: "success",
      metadata: {
        executionGeneration: intent.generation,
        attemptNumber,
        asset: withdrawal.asset,
        network: withdrawal.network,
        amount: withdrawal.amount,
        preparedTransactionFingerprint: actualPreparedFingerprint,
        expectedTransactionHashFingerprint: actualExpectedHashFingerprint,
        providerFingerprint,
        leaseOwnerFingerprint,
        attemptState: "calling",
      },
    });

    return {
      status: "ready",
      attempt: {
        id: attemptId,
        withdrawalId: withdrawal.id,
        generation: intent.generation,
        attemptNumber,
        chainId: withdrawal.network,
        expectedTxHash: withdrawal.txHash,
        rawTx: withdrawal.rawTx,
        preparedTransactionFingerprint: actualPreparedFingerprint,
        expectedTransactionHashFingerprint: actualExpectedHashFingerprint,
      },
    } as const;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}

export async function finalizeWithdrawalBroadcastAccepted(input: {
  withdrawalId: string;
  attemptId: string;
  expectedTxHash: string;
  outcome: "accepted" | "already_known";
}): Promise<void> {
  const result = await withTx(async (client) => {
    const withdrawalResult = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      withdrawalSelect(true),
      [input.withdrawalId],
    );
    const withdrawal = withdrawalResult.rows[0];
    if (!withdrawal || !withdrawal.txHash || !withdrawal.rawTx) {
      throw new Error("withdrawal_broadcast_authority_missing");
    }
    if (withdrawal.txHash.toLowerCase() !== input.expectedTxHash.toLowerCase()) {
      throw new Error("withdrawal_broadcast_expected_hash_mismatch");
    }

    const attemptResult = await client.query<BroadcastAttemptRow>(
      `SELECT id, execution_generation, attempt_number, state,
              prepared_tx_fingerprint, expected_tx_hash_fingerprint,
              chain_id, provider_fingerprint, outcome_category
         FROM withdrawal_broadcast_attempts
        WHERE id = $1
          AND withdrawal_id = $2
        FOR UPDATE`,
      [input.attemptId, input.withdrawalId],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) throw new Error("withdrawal_broadcast_attempt_not_found");
    if (["accepted", "already_known", "reconciled_present"].includes(attempt.state)) {
      return;
    }
    if (attempt.state !== "calling") throw new Error("withdrawal_broadcast_attempt_state_conflict");

    const actualPreparedFingerprint = fingerprintPreparedTransaction(withdrawal.rawTx);
    const actualExpectedHashFingerprint = fingerprintExpectedTransactionHash(
      withdrawal.txHash,
    );
    if (
      actualPreparedFingerprint !== attempt.prepared_tx_fingerprint ||
      actualExpectedHashFingerprint !== attempt.expected_tx_hash_fingerprint
    ) {
      throw new Error("withdrawal_broadcast_attempt_fingerprint_mismatch");
    }

    await client.query(
      `UPDATE withdrawal_broadcast_attempts
          SET state = $2,
              outcome_category = $2,
              finalized_at = NOW()
        WHERE id = $1`,
      [attempt.id, input.outcome],
    );
    const updated = await client.query(
      `UPDATE withdrawals
          SET state = 'broadcasted',
              broadcast_attempts = COALESCE(broadcast_attempts, 0) + 1,
              last_broadcast_at = NOW(),
              execution_error = NULL,
              updated_at = NOW()
        WHERE id = $1
          AND state = 'broadcasting'
          AND tx_hash = $2
          AND raw_tx IS NOT NULL`,
      [withdrawal.id, withdrawal.txHash],
    );
    if (updated.rowCount !== 1) {
      const current = await client.query<{ state: string }>(
        "SELECT state FROM withdrawals WHERE id = $1",
        [withdrawal.id],
      );
      if (!current.rows[0] || !["broadcasted", "confirming", "completed"].includes(current.rows[0].state)) {
        throw new Error("withdrawal_broadcast_result_transition_rejected");
      }
    }

    await client.query(
      `INSERT INTO withdrawal_confirmation_outbox
         (withdrawal_id, expected_tx_hash_fingerprint, required_confirmations)
       VALUES ($1, $2, $3)
       ON CONFLICT (withdrawal_id) DO NOTHING`,
      [
        withdrawal.id,
        actualExpectedHashFingerprint,
        withdrawal.requiredConfirmations,
      ],
    );
    await writeWithdrawalExternalEffectEvidenceTx(client, {
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorId: "withdrawal-executor",
      action: "withdrawal.broadcast.accepted",
      resourceType: "withdrawal_broadcast_attempt",
      resourceIdentity: `${withdrawal.id}\u001f${attempt.execution_generation}\u001f${attempt.attempt_number}`,
      correlationIdentity: `${withdrawal.id}\u001f${attempt.execution_generation}\u001f${attempt.attempt_number}\u001f${input.outcome}`,
      requestHash: hashSensitiveAuditRequest({
        action: "withdrawal.broadcast.accepted",
        withdrawalId: withdrawal.id,
        executionGeneration: attempt.execution_generation,
        attemptNumber: attempt.attempt_number,
        outcome: input.outcome,
        preparedTransactionFingerprint: actualPreparedFingerprint,
        expectedTransactionHashFingerprint: actualExpectedHashFingerprint,
      }),
      outcome: "success",
      metadata: {
        executionGeneration: attempt.execution_generation,
        attemptNumber: attempt.attempt_number,
        asset: withdrawal.asset,
        network: withdrawal.network,
        amount: withdrawal.amount,
        broadcastOutcome: input.outcome,
        preparedTransactionFingerprint: actualPreparedFingerprint,
        expectedTransactionHashFingerprint: actualExpectedHashFingerprint,
        providerFingerprint: attempt.provider_fingerprint,
        finalState: "broadcasted",
        confirmationOutboxPending: true,
      },
    });
  });
  if (!result.enabled) throw new Error("Withdrawal database unavailable");
}

export async function finalizeWithdrawalBroadcastFailure(input: {
  withdrawalId: string;
  attemptId: string;
  error: unknown;
}): Promise<"ambiguous" | "rejected" | "hash_mismatch"> {
  const category = classifyWithdrawalBroadcastError(input.error);
  const ambiguous = [
    "timeout",
    "network_unavailable",
    "rate_limited",
    "provider_unavailable",
    "unknown",
  ].includes(category);
  const finalState = category === "hash_mismatch" ? "hash_mismatch" : ambiguous ? "ambiguous" : "rejected";
  const action = category === "hash_mismatch"
    ? "withdrawal.broadcast.hash_mismatch"
    : ambiguous
      ? "withdrawal.broadcast.ambiguous"
      : "withdrawal.broadcast.rejected";

  const result = await withTx(async (client) => {
    const withdrawalResult = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      withdrawalSelect(true),
      [input.withdrawalId],
    );
    const withdrawal = withdrawalResult.rows[0];
    if (!withdrawal) throw new Error("withdrawal_not_found");

    const attemptResult = await client.query<BroadcastAttemptRow>(
      `SELECT id, execution_generation, attempt_number, state,
              prepared_tx_fingerprint, expected_tx_hash_fingerprint,
              chain_id, provider_fingerprint, outcome_category
         FROM withdrawal_broadcast_attempts
        WHERE id = $1
          AND withdrawal_id = $2
        FOR UPDATE`,
      [input.attemptId, input.withdrawalId],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) throw new Error("withdrawal_broadcast_attempt_not_found");
    if (attempt.state !== "calling") {
      if (["ambiguous", "rejected", "hash_mismatch"].includes(attempt.state)) {
        return finalState;
      }
      throw new Error("withdrawal_broadcast_attempt_state_conflict");
    }

    await client.query(
      `UPDATE withdrawal_broadcast_attempts
          SET state = $2,
              outcome_category = $3,
              finalized_at = CASE WHEN $2 = 'ambiguous' THEN NULL ELSE NOW() END
        WHERE id = $1`,
      [attempt.id, finalState, category],
    );
    if (!ambiguous) {
      await client.query(
        `UPDATE withdrawals
            SET state = 'failed',
                execution_error = $2,
                updated_at = NOW()
          WHERE id = $1
            AND state = 'broadcasting'`,
        [withdrawal.id, category],
      );
    }

    await writeWithdrawalExternalEffectEvidenceTx(client, {
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorId: "withdrawal-executor",
      action,
      resourceType: "withdrawal_broadcast_attempt",
      resourceIdentity: `${withdrawal.id}\u001f${attempt.execution_generation}\u001f${attempt.attempt_number}`,
      correlationIdentity: `${withdrawal.id}\u001f${attempt.execution_generation}\u001f${attempt.attempt_number}\u001f${finalState}`,
      requestHash: hashSensitiveAuditRequest({
        action,
        withdrawalId: withdrawal.id,
        executionGeneration: attempt.execution_generation,
        attemptNumber: attempt.attempt_number,
        category,
        preparedTransactionFingerprint: attempt.prepared_tx_fingerprint,
        expectedTransactionHashFingerprint: attempt.expected_tx_hash_fingerprint,
      }),
      outcome: ambiguous ? "failed" : "rejected",
      metadata: {
        executionGeneration: attempt.execution_generation,
        attemptNumber: attempt.attempt_number,
        asset: withdrawal.asset,
        network: withdrawal.network,
        amount: withdrawal.amount,
        outcomeCategory: category,
        attemptState: finalState,
        preparedTransactionFingerprint: attempt.prepared_tx_fingerprint,
        expectedTransactionHashFingerprint: attempt.expected_tx_hash_fingerprint,
        providerFingerprint: attempt.provider_fingerprint,
        finalState: ambiguous ? "broadcasting" : "failed",
        reconciliationRequired: ambiguous,
      },
    });
    return finalState;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}

export async function reconcileAmbiguousWithdrawalBroadcast(input: {
  withdrawalId: string;
  attemptId: string;
  observed: "present" | "absent" | "unknown";
}): Promise<"accepted" | "retry_allowed" | "still_ambiguous"> {
  if (input.observed === "unknown") return "still_ambiguous";

  const result = await withTx(async (client) => {
    const withdrawalResult = await client.query<AuthoritativeWithdrawalExecutionRecord>(
      withdrawalSelect(true),
      [input.withdrawalId],
    );
    const withdrawal = withdrawalResult.rows[0];
    if (!withdrawal || !withdrawal.txHash) throw new Error("withdrawal_not_found");

    const attemptResult = await client.query<BroadcastAttemptRow>(
      `SELECT id, execution_generation, attempt_number, state,
              prepared_tx_fingerprint, expected_tx_hash_fingerprint,
              chain_id, provider_fingerprint, outcome_category
         FROM withdrawal_broadcast_attempts
        WHERE id = $1
          AND withdrawal_id = $2
        FOR UPDATE`,
      [input.attemptId, input.withdrawalId],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) throw new Error("withdrawal_broadcast_attempt_not_found");
    if (attempt.state !== "ambiguous") {
      if (["reconciled_present", "accepted", "already_known"].includes(attempt.state)) {
        return "accepted" as const;
      }
      if (attempt.state === "reconciled_absent") return "retry_allowed" as const;
      throw new Error("withdrawal_broadcast_attempt_not_ambiguous");
    }

    const state = input.observed === "present" ? "reconciled_present" : "reconciled_absent";
    await client.query(
      `UPDATE withdrawal_broadcast_attempts
          SET state = $2,
              outcome_category = $2,
              finalized_at = NOW()
        WHERE id = $1`,
      [attempt.id, state],
    );

    if (input.observed === "present") {
      await client.query(
        `UPDATE withdrawals
            SET state = 'broadcasted',
                broadcast_attempts = COALESCE(broadcast_attempts, 0) + 1,
                last_broadcast_at = NOW(),
                execution_error = NULL,
                updated_at = NOW()
          WHERE id = $1
            AND state = 'broadcasting'
            AND tx_hash = $2`,
        [withdrawal.id, withdrawal.txHash],
      );
      await client.query(
        `INSERT INTO withdrawal_confirmation_outbox
           (withdrawal_id, expected_tx_hash_fingerprint, required_confirmations)
         VALUES ($1, $2, $3)
         ON CONFLICT (withdrawal_id) DO NOTHING`,
        [
          withdrawal.id,
          attempt.expected_tx_hash_fingerprint,
          withdrawal.requiredConfirmations,
        ],
      );
    }

    await writeWithdrawalExternalEffectEvidenceTx(client, {
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorId: "withdrawal-executor",
      action: input.observed === "present"
        ? "withdrawal.broadcast.accepted"
        : "withdrawal.broadcast.ambiguous",
      resourceType: "withdrawal_broadcast_attempt",
      resourceIdentity: `${withdrawal.id}\u001f${attempt.execution_generation}\u001f${attempt.attempt_number}`,
      correlationIdentity: `${withdrawal.id}\u001f${attempt.execution_generation}\u001f${attempt.attempt_number}\u001f${state}`,
      requestHash: hashSensitiveAuditRequest({
        action: "withdrawal.broadcast.reconcile",
        withdrawalId: withdrawal.id,
        executionGeneration: attempt.execution_generation,
        attemptNumber: attempt.attempt_number,
        reconciliationState: state,
        expectedTransactionHashFingerprint: attempt.expected_tx_hash_fingerprint,
      }),
      outcome: input.observed === "present" ? "success" : "no_op",
      metadata: {
        executionGeneration: attempt.execution_generation,
        attemptNumber: attempt.attempt_number,
        asset: withdrawal.asset,
        network: withdrawal.network,
        amount: withdrawal.amount,
        reconciliationState: state,
        expectedTransactionHashFingerprint: attempt.expected_tx_hash_fingerprint,
        providerFingerprint: attempt.provider_fingerprint,
        finalState: input.observed === "present" ? "broadcasted" : "broadcasting",
        retryAllowed: input.observed === "absent",
      },
    });
    return input.observed === "present" ? "accepted" as const : "retry_allowed" as const;
  });

  if (!result.enabled) throw new Error("Withdrawal database unavailable");
  return result.value;
}

export async function publishWithdrawalConfirmationOutbox(
  withdrawalId?: string,
): Promise<boolean> {
  const selected = await withDb(async (client) => {
    const result = await client.query<{
      withdrawal_id: string;
      tx_hash: string;
      network: ChainId;
      required_confirmations: number;
      last_broadcast_at: Date | null;
    }>(
      `SELECT outbox.withdrawal_id, withdrawal.tx_hash, withdrawal.network,
              outbox.required_confirmations, withdrawal.last_broadcast_at
         FROM withdrawal_confirmation_outbox outbox
         JOIN withdrawals withdrawal ON withdrawal.id = outbox.withdrawal_id
        WHERE outbox.state IN ('pending', 'dead_letter')
          AND outbox.available_at <= NOW()
          AND ($1::text IS NULL OR outbox.withdrawal_id = $1)
          AND withdrawal.state IN ('broadcasted', 'confirming')
          AND withdrawal.tx_hash IS NOT NULL
        ORDER BY outbox.created_at
        LIMIT 25`,
      [withdrawalId ?? null],
    );
    return result.rows;
  });
  if (!selected.enabled) return false;

  let allPublished = true;
  for (const row of selected.value) {
    try {
      const { enqueueConfirmationWatch } = await import(
        "@/lib/wallet/queue/withdrawal-queue"
      );
      const { buildTimeoutAt } = await import("@/lib/wallet/confirmation/engine");
      await enqueueConfirmationWatch({
        withdrawalId: row.withdrawal_id,
        txHash: row.tx_hash,
        chainId: row.network,
        requiredConfirmations: row.required_confirmations,
        broadcastedAt: (row.last_broadcast_at ?? new Date()).toISOString(),
        timeoutAt: buildTimeoutAt(row.network),
      });
      const marked = await withTx(async (client) => {
        const withdrawal = await client.query<{
          asset: string;
          amount: string;
          state: string;
        }>(
          `SELECT asset, amount::text AS amount, state
             FROM withdrawals
            WHERE id = $1
            FOR UPDATE`,
          [row.withdrawal_id],
        );
        const authority = withdrawal.rows[0];
        if (!authority) throw new Error("withdrawal_not_found");
        await client.query(
          `UPDATE withdrawal_confirmation_outbox
              SET state = 'published',
                  attempts = attempts + 1,
                  published_at = COALESCE(published_at, NOW()),
                  last_error_category = NULL
            WHERE withdrawal_id = $1
              AND state IN ('pending', 'dead_letter', 'published')`,
          [row.withdrawal_id],
        );
        if (authority.state === "broadcasted") {
          await client.query(
            `UPDATE withdrawals SET state = 'confirming', updated_at = NOW()
              WHERE id = $1 AND state = 'broadcasted'`,
            [row.withdrawal_id],
          );
        }
        await writeWithdrawalExternalEffectEvidenceTx(client, {
          tenantId: PLATFORM.DEFAULT_TENANT_ID,
          actorId: "withdrawal-confirmation",
          action: "withdrawal.confirmation.monitor",
          resourceType: "withdrawal_execution",
          resourceIdentity: row.withdrawal_id,
          correlationIdentity: `${row.withdrawal_id}\u001f${row.tx_hash.toLowerCase()}`,
          requestHash: hashSensitiveAuditRequest({
            action: "withdrawal.confirmation.monitor",
            withdrawalId: row.withdrawal_id,
            txHash: row.tx_hash.toLowerCase(),
            requiredConfirmations: row.required_confirmations,
          }),
          outcome: "success",
          metadata: {
            asset: authority.asset,
            network: row.network,
            amount: authority.amount,
            expectedTransactionHashFingerprint:
              fingerprintExpectedTransactionHash(row.tx_hash),
            requiredConfirmations: row.required_confirmations,
            confirmationProjection: "published",
            finalState: "confirming",
          },
        });
      });
      if (!marked.enabled) throw new Error("withdrawal_database_unavailable");
    } catch {
      allPublished = false;
      await withDb(async (client) => {
        await client.query(
          `UPDATE withdrawal_confirmation_outbox
              SET state = 'dead_letter',
                  attempts = attempts + 1,
                  available_at = NOW() + INTERVAL '1 minute',
                  last_error_category = 'publication_failed'
            WHERE withdrawal_id = $1
              AND state <> 'completed'`,
          [row.withdrawal_id],
        );
        return true;
      });
    }
  }
  return allPublished;
}

export async function completeWithdrawalConfirmationOutbox(
  client: PoolClient,
  withdrawalId: string,
): Promise<void> {
  await client.query(
    `UPDATE withdrawal_confirmation_outbox
        SET state = 'completed', completed_at = NOW()
      WHERE withdrawal_id = $1
        AND state <> 'completed'`,
    [withdrawalId],
  );
}

export async function markWithdrawalConfirmationOutcome(input: {
  withdrawalId: string;
  txHash: string;
  outcome: "dropped" | "timeout";
  confirmations: number;
}): Promise<void> {
  const result = await withTx(async (client) => {
    const selected = await client.query<{
      asset: string;
      amount: string;
      network: string;
      state: string;
      tx_hash: string | null;
    }>(
      `SELECT asset, amount::text AS amount, network, state, tx_hash
         FROM withdrawals
        WHERE id = $1
        FOR UPDATE`,
      [input.withdrawalId],
    );
    const withdrawal = selected.rows[0];
    if (!withdrawal || withdrawal.tx_hash !== input.txHash) {
      throw new Error("withdrawal_confirmation_authority_mismatch");
    }
    if (!["broadcasted", "confirming"].includes(withdrawal.state)) return;

    const state = input.outcome === "dropped" ? "failed" : "timeout";
    const action = input.outcome === "dropped"
      ? "withdrawal.confirmation.dropped"
      : "withdrawal.confirmation.timeout";
    await client.query(
      `UPDATE withdrawals
          SET state = $2,
              confirmation_count = $3,
              execution_error = $4,
              updated_at = NOW()
        WHERE id = $1
          AND state IN ('broadcasted', 'confirming')`,
      [input.withdrawalId, state, input.confirmations, input.outcome],
    );
    await completeWithdrawalConfirmationOutbox(client, input.withdrawalId);
    await writeWithdrawalExternalEffectEvidenceTx(client, {
      tenantId: PLATFORM.DEFAULT_TENANT_ID,
      actorId: "withdrawal-confirmation",
      action,
      resourceType: "withdrawal_execution",
      resourceIdentity: input.withdrawalId,
      correlationIdentity: `${input.withdrawalId}\u001f${input.txHash.toLowerCase()}\u001f${input.outcome}`,
      requestHash: hashSensitiveAuditRequest({
        action,
        withdrawalId: input.withdrawalId,
        txHash: input.txHash.toLowerCase(),
        confirmations: input.confirmations,
      }),
      outcome: input.outcome === "dropped" ? "failed" : "no_op",
      metadata: {
        asset: withdrawal.asset,
        network: withdrawal.network,
        amount: withdrawal.amount,
        expectedTransactionHashFingerprint:
          fingerprintExpectedTransactionHash(input.txHash),
        observedConfirmations: input.confirmations,
        confirmationOutcome: input.outcome,
        finalState: state,
      },
    });
  });
  if (!result.enabled) throw new Error("Withdrawal database unavailable");
}
