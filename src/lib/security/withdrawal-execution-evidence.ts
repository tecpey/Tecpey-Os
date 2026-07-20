import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveAuditOutcome,
  type SensitiveMutationAuditAction,
  type SensitiveMutationAuditResource,
} from "./sensitive-mutation-audit";

export const WITHDRAWAL_EXECUTION_EVIDENCE_POLICY_VERSION =
  "withdrawal-execution-evidence-v1";

export type WithdrawalExecutionEvidenceAction = Extract<
  SensitiveMutationAuditAction,
  | "withdrawal.execution.claim"
  | "withdrawal.transaction.build"
  | "withdrawal.transaction.sign"
  | "withdrawal.broadcast.attempt"
  | "withdrawal.broadcast.accept"
  | "withdrawal.broadcast.ambiguous"
  | "withdrawal.broadcast.reject"
  | "withdrawal.reconcile"
  | "withdrawal.confirming"
  | "withdrawal.dropped"
  | "withdrawal.timeout"
  | "withdrawal.settle"
  | "withdrawal.complete"
>;

export type WithdrawalExecutionEvidenceResource = Extract<
  SensitiveMutationAuditResource,
  | "withdrawal_execution"
  | "withdrawal_broadcast_attempt"
  | "withdrawal_settlement"
>;

function fingerprint(domain: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey:${domain}:v1\u001f`)
    .update(value)
    .digest("hex");
}

export function fingerprintWithdrawalExecution(withdrawalId: string): string {
  return fingerprint("withdrawal-execution", withdrawalId);
}

export function fingerprintWithdrawalExecutionAttempt(attemptId: string): string {
  return fingerprint("withdrawal-execution-attempt", attemptId);
}

export function fingerprintWithdrawalTxHash(txHash: string): string {
  return fingerprint("withdrawal-tx-hash", txHash.trim().toLowerCase());
}

export function fingerprintWithdrawalSignedPayload(rawTransaction: string): string {
  return fingerprint("withdrawal-signed-payload", rawTransaction);
}

export function fingerprintWithdrawalSignerIdentity(value: string): string {
  return fingerprint("withdrawal-signer-identity", value);
}

export function fingerprintWithdrawalProviderPolicy(value: string): string {
  return fingerprint("withdrawal-provider-policy", value);
}

export function fingerprintWithdrawalExecutionError(value: string): string {
  return fingerprint("withdrawal-execution-error", value.trim());
}

export function withdrawalExecutionCorrelation(
  action: WithdrawalExecutionEvidenceAction,
  identity: string,
): string {
  const suffix = action.slice("withdrawal.".length).replaceAll(".", "-");
  return `withdrawal-${suffix}:${fingerprint(
    `withdrawal-execution-evidence-${suffix}`,
    identity,
  )}`;
}

function resourceFingerprint(
  resourceType: WithdrawalExecutionEvidenceResource,
  identity: string,
): string {
  if (resourceType === "withdrawal_broadcast_attempt") {
    return fingerprintWithdrawalExecutionAttempt(identity);
  }
  return fingerprintWithdrawalExecution(identity);
}

export async function writeWithdrawalExecutionEvidenceTx(
  client: PoolClient,
  input: {
    tenantId: string;
    actorId: string;
    action: WithdrawalExecutionEvidenceAction;
    resourceType: WithdrawalExecutionEvidenceResource;
    resourceIdentity: string;
    correlationIdentity: string;
    requestHash: string;
    outcome: SensitiveAuditOutcome;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  return writeSensitiveMutationAuditTx(client, {
    tenantId: input.tenantId,
    actorType: "service",
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: resourceFingerprint(
      input.resourceType,
      input.resourceIdentity,
    ),
    outcome: input.outcome,
    correlationId: withdrawalExecutionCorrelation(
      input.action,
      input.correlationIdentity,
    ),
    requestHash: input.requestHash,
    metadata: {
      policyVersion: WITHDRAWAL_EXECUTION_EVIDENCE_POLICY_VERSION,
      ...(input.metadata ?? {}),
    },
  });
}
