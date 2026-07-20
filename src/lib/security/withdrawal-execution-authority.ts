import type { PoolClient } from "pg";
import { PLATFORM } from "@/lib/platform-config";
import {
  hashSensitiveAuditRequest,
  type SensitiveAuditOutcome,
} from "./sensitive-mutation-audit";
import {
  fingerprintWithdrawalExecutionError,
  fingerprintWithdrawalExecutionAttempt,
  fingerprintWithdrawalProviderPolicy,
  fingerprintWithdrawalSignedPayload,
  fingerprintWithdrawalSignerIdentity,
  fingerprintWithdrawalTxHash,
  withdrawalExecutionCorrelation,
  writeWithdrawalExecutionEvidenceTx,
  type WithdrawalExecutionEvidenceAction,
  type WithdrawalExecutionEvidenceResource,
} from "./withdrawal-execution-evidence";

export const WITHDRAWAL_EXECUTION_POLICY_VERSION =
  "withdrawal-execution-attempt-v1";

export type WithdrawalExecutionEventType =
  | "claim"
  | "build"
  | "sign"
  | "broadcast_attempt"
  | "broadcast_accept"
  | "broadcast_ambiguous"
  | "broadcast_reject"
  | "reconcile"
  | "confirming"
  | "dropped"
  | "timeout"
  | "settle"
  | "complete";

export type WithdrawalExecutionEventOutcome =
  | "started"
  | "success"
  | "rejected"
  | "ambiguous"
  | "failed"
  | "no_op";

export type WithdrawalExecutionAttempt = {
  id: string;
  withdrawalId: string;
  leaseOwner: string;
  leaseOwnerFingerprint: string;
  serviceActorId: string;
  requestHash: string;
};

const EVENT_ACTION: Record<
  WithdrawalExecutionEventType,
  WithdrawalExecutionEvidenceAction
> = {
  claim: "withdrawal.execution.claim",
  build: "withdrawal.transaction.build",
  sign: "withdrawal.transaction.sign",
  broadcast_attempt: "withdrawal.broadcast.attempt",
  broadcast_accept: "withdrawal.broadcast.accept",
  broadcast_ambiguous: "withdrawal.broadcast.ambiguous",
  broadcast_reject: "withdrawal.broadcast.reject",
  reconcile: "withdrawal.reconcile",
  confirming: "withdrawal.confirming",
  dropped: "withdrawal.dropped",
  timeout: "withdrawal.timeout",
  settle: "withdrawal.settle",
  complete: "withdrawal.complete",
};

const EVENT_RESOURCE: Record<
  WithdrawalExecutionEventType,
  WithdrawalExecutionEvidenceResource
> = {
  claim: "withdrawal_execution",
  build: "withdrawal_execution",
  sign: "withdrawal_execution",
  broadcast_attempt: "withdrawal_broadcast_attempt",
  broadcast_accept: "withdrawal_broadcast_attempt",
  broadcast_ambiguous: "withdrawal_broadcast_attempt",
  broadcast_reject: "withdrawal_broadcast_attempt",
  reconcile: "withdrawal_broadcast_attempt",
  confirming: "withdrawal_execution",
  dropped: "withdrawal_execution",
  timeout: "withdrawal_execution",
  settle: "withdrawal_settlement",
  complete: "withdrawal_settlement",
};

function requireServiceActor(value: string): string {
  const actor = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(actor)) {
    throw new Error("invalid_withdrawal_execution_service_actor");
  }
  return actor;
}

function requireHash(value: string, reason: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(reason);
  return normalized;
}

function requireLeaseOwner(value: string): string {
  const owner = value.trim();
  if (!owner || owner.length > 200) {
    throw new Error("invalid_withdrawal_execution_lease_owner");
  }
  return owner;
}

function evidenceOutcome(
  outcome: WithdrawalExecutionEventOutcome,
): SensitiveAuditOutcome {
  if (outcome === "success") return "success";
  if (outcome === "no_op") return "no_op";
  if (outcome === "rejected") return "rejected";
  return "failed";
}

export async function createWithdrawalExecutionAttemptTx(
  client: PoolClient,
  input: {
    withdrawalId: string;
    leaseOwner: string;
    serviceActorId: string;
    requestHash: string;
    network: string;
    asset: string;
    amount: string;
    leaseLifetimeSeconds: number;
  },
): Promise<WithdrawalExecutionAttempt> {
  const leaseOwner = requireLeaseOwner(input.leaseOwner);
  const serviceActorId = requireServiceActor(input.serviceActorId);
  const requestHash = requireHash(
    input.requestHash,
    "invalid_withdrawal_execution_request_hash",
  );
  if (
    !Number.isSafeInteger(input.leaseLifetimeSeconds) ||
    input.leaseLifetimeSeconds <= 0 ||
    input.leaseLifetimeSeconds > 3600
  ) {
    throw new Error("invalid_withdrawal_execution_lease_lifetime");
  }

  const leaseOwnerFingerprint = hashSensitiveAuditRequest({
    domain: "withdrawal-execution-lease-owner-v1",
    value: leaseOwner,
  });
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO withdrawal_execution_attempts
       (withdrawal_id, tenant_id, service_actor_id, lease_owner,
        lease_owner_fingerprint, request_hash, policy_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (withdrawal_id, lease_owner) DO NOTHING
     RETURNING id`,
    [
      input.withdrawalId,
      PLATFORM.DEFAULT_TENANT_ID,
      serviceActorId,
      leaseOwner,
      leaseOwnerFingerprint,
      requestHash,
      WITHDRAWAL_EXECUTION_POLICY_VERSION,
    ],
  );
  let attemptId = inserted.rows[0]?.id;
  if (!attemptId) {
    const existing = await client.query<{
      id: string;
      service_actor_id: string;
      lease_owner_fingerprint: string;
      request_hash: string;
    }>(
      `SELECT id, service_actor_id, lease_owner_fingerprint, request_hash
         FROM withdrawal_execution_attempts
        WHERE withdrawal_id = $1
          AND lease_owner = $2
        LIMIT 1`,
      [input.withdrawalId, leaseOwner],
    );
    const row = existing.rows[0];
    if (
      !row ||
      row.service_actor_id !== serviceActorId ||
      row.lease_owner_fingerprint !== leaseOwnerFingerprint ||
      row.request_hash !== requestHash
    ) {
      throw new Error("withdrawal_execution_attempt_conflict");
    }
    attemptId = row.id;
  }

  const correlationId = withdrawalExecutionCorrelation(
    "withdrawal.execution.claim",
    `${attemptId}:claim`,
  );
  await client.query(
    `INSERT INTO withdrawal_execution_events
       (attempt_id, withdrawal_id, event_type, outcome, correlation_id,
        request_hash, metadata)
     VALUES ($1, $2, 'claim', 'success', $3, $4, $5::jsonb)
     ON CONFLICT (attempt_id, event_type, correlation_id) DO NOTHING`,
    [
      attemptId,
      input.withdrawalId,
      correlationId,
      requestHash,
      JSON.stringify({
        policyVersion: WITHDRAWAL_EXECUTION_POLICY_VERSION,
        network: input.network.trim().toLowerCase(),
        asset: input.asset.trim().toUpperCase(),
        amount: input.amount,
        leaseOwnerFingerprint,
        leaseLifetimeSeconds: input.leaseLifetimeSeconds,
      }),
    ],
  );
  await writeWithdrawalExecutionEvidenceTx(client, {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorId: serviceActorId,
    action: "withdrawal.execution.claim",
    resourceType: "withdrawal_execution",
    resourceIdentity: input.withdrawalId,
    correlationIdentity: `${attemptId}:claim`,
    requestHash,
    outcome: "success",
    metadata: {
      executionPolicyVersion: WITHDRAWAL_EXECUTION_POLICY_VERSION,
      attemptFingerprint: fingerprintWithdrawalExecutionAttempt(attemptId),
      leaseOwnerFingerprint,
      leaseLifetimeSeconds: input.leaseLifetimeSeconds,
      network: input.network.trim().toLowerCase(),
      asset: input.asset.trim().toUpperCase(),
      amount: input.amount,
    },
  });

  return {
    id: attemptId,
    withdrawalId: input.withdrawalId,
    leaseOwner,
    leaseOwnerFingerprint,
    serviceActorId,
    requestHash,
  };
}

export async function appendWithdrawalExecutionEventTx(
  client: PoolClient,
  input: {
    attempt: WithdrawalExecutionAttempt;
    eventType: WithdrawalExecutionEventType;
    outcome: WithdrawalExecutionEventOutcome;
    correlationIdentity: string;
    requestHash: string;
    network: string;
    asset: string;
    amount: string;
    expectedTxHash?: string | null;
    signedPayload?: string | null;
    signerIdentity?: string | null;
    providerPolicy?: string | null;
    errorClass?: string | null;
    confirmationCount?: number | null;
    requiredConfirmations?: number | null;
    blockHeight?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const requestHash = requireHash(
    input.requestHash,
    "invalid_withdrawal_execution_event_request_hash",
  );
  const action = EVENT_ACTION[input.eventType];
  const resourceType = EVENT_RESOURCE[input.eventType];
  const correlationId = withdrawalExecutionCorrelation(
    action,
    input.correlationIdentity,
  );
  const expectedTxHashFingerprint = input.expectedTxHash
    ? fingerprintWithdrawalTxHash(input.expectedTxHash)
    : null;
  const signedPayloadFingerprint = input.signedPayload
    ? fingerprintWithdrawalSignedPayload(input.signedPayload)
    : null;
  const signerIdentityFingerprint = input.signerIdentity
    ? fingerprintWithdrawalSignerIdentity(input.signerIdentity)
    : null;
  const providerPolicyFingerprint = input.providerPolicy
    ? fingerprintWithdrawalProviderPolicy(input.providerPolicy)
    : null;
  const errorClassFingerprint = input.errorClass
    ? fingerprintWithdrawalExecutionError(input.errorClass)
    : null;
  const eventMetadata = {
    policyVersion: WITHDRAWAL_EXECUTION_POLICY_VERSION,
    attemptFingerprint: fingerprintWithdrawalExecutionAttempt(input.attempt.id),
    network: input.network.trim().toLowerCase(),
    asset: input.asset.trim().toUpperCase(),
    amount: input.amount,
    ...(input.metadata ?? {}),
  };

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO withdrawal_execution_events
       (attempt_id, withdrawal_id, event_type, outcome, correlation_id,
        request_hash, expected_tx_hash_fingerprint,
        signed_payload_fingerprint, signer_identity_fingerprint,
        provider_policy_fingerprint, error_class_fingerprint,
        confirmation_count, required_confirmations, block_height, metadata)
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb
     )
     ON CONFLICT (attempt_id, event_type, correlation_id) DO NOTHING
     RETURNING id`,
    [
      input.attempt.id,
      input.attempt.withdrawalId,
      input.eventType,
      input.outcome,
      correlationId,
      requestHash,
      expectedTxHashFingerprint,
      signedPayloadFingerprint,
      signerIdentityFingerprint,
      providerPolicyFingerprint,
      errorClassFingerprint,
      input.confirmationCount ?? null,
      input.requiredConfirmations ?? null,
      input.blockHeight ?? null,
      JSON.stringify(eventMetadata),
    ],
  );
  if (!inserted.rows[0]?.id) {
    const existing = await client.query<{ id: string; request_hash: string }>(
      `SELECT id, request_hash
         FROM withdrawal_execution_events
        WHERE attempt_id = $1
          AND event_type = $2
          AND correlation_id = $3
        LIMIT 1`,
      [input.attempt.id, input.eventType, correlationId],
    );
    if (!existing.rows[0] || existing.rows[0].request_hash !== requestHash) {
      throw new Error("withdrawal_execution_event_conflict");
    }
  }

  const resourceIdentity =
    resourceType === "withdrawal_broadcast_attempt"
      ? input.attempt.id
      : input.attempt.withdrawalId;
  await writeWithdrawalExecutionEvidenceTx(client, {
    tenantId: PLATFORM.DEFAULT_TENANT_ID,
    actorId: input.attempt.serviceActorId,
    action,
    resourceType,
    resourceIdentity,
    correlationIdentity: input.correlationIdentity,
    requestHash,
    outcome: evidenceOutcome(input.outcome),
    metadata: {
      executionPolicyVersion: WITHDRAWAL_EXECUTION_POLICY_VERSION,
      attemptFingerprint: fingerprintWithdrawalExecutionAttempt(input.attempt.id),
      network: input.network.trim().toLowerCase(),
      asset: input.asset.trim().toUpperCase(),
      amount: input.amount,
      expectedTxHashFingerprint,
      signedPayloadFingerprint,
      signerIdentityFingerprint,
      providerPolicyFingerprint,
      errorClassFingerprint,
      confirmationCount: input.confirmationCount ?? null,
      requiredConfirmations: input.requiredConfirmations ?? null,
      blockHeight: input.blockHeight ?? null,
      ...(input.metadata ?? {}),
    },
  });

  return inserted.rows[0]?.id ?? "replayed";
}

export async function enqueueWithdrawalReconciliationTx(
  client: PoolClient,
  input: {
    attempt: WithdrawalExecutionAttempt;
    expectedTxHash: string;
    reason:
      | "broadcast_ambiguous"
      | "broadcast_state_commit_failed"
      | "provider_unknown"
      | "confirmation_unknown"
      | "manual_review";
    availableAt?: Date;
    errorClass?: string | null;
  },
): Promise<void> {
  const expectedTxHashFingerprint = fingerprintWithdrawalTxHash(
    input.expectedTxHash,
  );
  const errorClassFingerprint = input.errorClass
    ? fingerprintWithdrawalExecutionError(input.errorClass)
    : null;
  await client.query(
    `INSERT INTO withdrawal_reconciliation_outbox
       (withdrawal_id, attempt_id, expected_tx_hash_fingerprint, reason,
        available_at, last_error_class_fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (withdrawal_id, attempt_id, reason) DO UPDATE
       SET status = CASE
             WHEN withdrawal_reconciliation_outbox.status = 'completed'
               THEN withdrawal_reconciliation_outbox.status
             ELSE 'pending'
           END,
           available_at = LEAST(
             withdrawal_reconciliation_outbox.available_at,
             EXCLUDED.available_at
           ),
           last_error_class_fingerprint = COALESCE(
             EXCLUDED.last_error_class_fingerprint,
             withdrawal_reconciliation_outbox.last_error_class_fingerprint
           ),
           updated_at = NOW()`,
    [
      input.attempt.withdrawalId,
      input.attempt.id,
      expectedTxHashFingerprint,
      input.reason,
      input.availableAt ?? new Date(),
      errorClassFingerprint,
    ],
  );
}
