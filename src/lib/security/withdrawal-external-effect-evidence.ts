import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveAuditOutcome,
  type SensitiveMutationAuditAction,
  type SensitiveMutationAuditResource,
} from "./sensitive-mutation-audit";

export const WITHDRAWAL_EXTERNAL_EFFECT_POLICY_VERSION =
  "withdrawal-external-effect-evidence-v1";

export type WithdrawalExternalEffectAction = Extract<
  SensitiveMutationAuditAction,
  | "withdrawal.execution.claim"
  | "withdrawal.transaction.prepare"
  | "withdrawal.broadcast.attempt"
  | "withdrawal.broadcast.accepted"
  | "withdrawal.broadcast.ambiguous"
  | "withdrawal.broadcast.rejected"
  | "withdrawal.broadcast.hash_mismatch"
  | "withdrawal.confirmation.monitor"
  | "withdrawal.confirmation.dropped"
  | "withdrawal.confirmation.timeout"
  | "withdrawal.settle"
>;

export type WithdrawalExternalEffectResource = Extract<
  SensitiveMutationAuditResource,
  | "withdrawal_execution"
  | "withdrawal_broadcast_attempt"
  | "withdrawal_settlement"
>;

export type WithdrawalBroadcastOutcomeCategory =
  | "accepted"
  | "already_known"
  | "timeout"
  | "network_unavailable"
  | "rate_limited"
  | "deterministic_rejection"
  | "hash_mismatch"
  | "provider_unavailable"
  | "unknown";

function fingerprint(domain: string, value: string | Uint8Array): string {
  const hash = createHash("sha256").update(`tecpey:${domain}:v1\u001f`);
  hash.update(value);
  return hash.digest("hex");
}

export function fingerprintWithdrawalExecution(withdrawalId: string): string {
  return fingerprint("withdrawal-execution", withdrawalId);
}

export function fingerprintPreparedTransaction(rawTx: Uint8Array): string {
  return fingerprint("withdrawal-prepared-transaction", rawTx);
}

export function fingerprintExpectedTransactionHash(txHash: string): string {
  return fingerprint(
    "withdrawal-expected-transaction-hash",
    txHash.trim().toLowerCase(),
  );
}

export function fingerprintWithdrawalSigner(input: {
  signerType: string;
  keyReference?: string | null;
}): string {
  return fingerprint(
    "withdrawal-signer-reference",
    `${input.signerType.trim().toLowerCase()}\u001f${
      input.keyReference?.trim() ?? "unversioned"
    }`,
  );
}

export function fingerprintWithdrawalProvider(input: {
  chainId: string;
  providerClass: string;
}): string {
  return fingerprint(
    "withdrawal-provider",
    `${input.chainId.trim().toLowerCase()}\u001f${input.providerClass
      .trim()
      .toLowerCase()}`,
  );
}

export function fingerprintBroadcastAttempt(input: {
  withdrawalId: string;
  generation: number;
  preparedTransactionFingerprint: string;
}): string {
  return fingerprint(
    "withdrawal-broadcast-attempt",
    `${input.withdrawalId}\u001f${input.generation}\u001f${
      input.preparedTransactionFingerprint
    }`,
  );
}

export function classifyWithdrawalBroadcastError(
  error: unknown,
): WithdrawalBroadcastOutcomeCategory {
  const message = (error instanceof Error ? error.message : String(error))
    .toLowerCase()
    .slice(0, 500);

  if (/already known|alreadyprocessed|txn-already-known/.test(message)) {
    return "already_known";
  }
  if (/hash mismatch/.test(message)) return "hash_mismatch";
  if (/timeout|timed out|etimedout|abort/.test(message)) return "timeout";
  if (/econnrefused|econnreset|enotfound|network|socket|fetch failed/.test(message)) {
    return "network_unavailable";
  }
  if (/429|rate limit|too many requests/.test(message)) return "rate_limited";
  if (/insufficient funds|invalid transaction|nonce too low|replacement transaction underpriced/.test(message)) {
    return "deterministic_rejection";
  }
  if (/provider|rpc unavailable|service unavailable|503/.test(message)) {
    return "provider_unavailable";
  }
  return "unknown";
}

function correlation(
  action: WithdrawalExternalEffectAction,
  identity: string,
): string {
  const suffix = action.slice("withdrawal.".length).replaceAll(".", "-");
  return `withdrawal-${suffix}:${fingerprint(
    `withdrawal-external-evidence-${suffix}`,
    identity,
  )}`;
}

function resourceFingerprint(
  resourceType: WithdrawalExternalEffectResource,
  identity: string,
): string {
  return fingerprint(resourceType.replaceAll("_", "-"), identity);
}

export async function writeWithdrawalExternalEffectEvidenceTx(
  client: PoolClient,
  input: {
    tenantId: string;
    actorId: "withdrawal-executor" | "withdrawal-confirmation" | "withdrawal-settlement";
    action: WithdrawalExternalEffectAction;
    resourceType: WithdrawalExternalEffectResource;
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
    correlationId: correlation(input.action, input.correlationIdentity),
    requestHash: input.requestHash,
    metadata: {
      policyVersion: WITHDRAWAL_EXTERNAL_EFFECT_POLICY_VERSION,
      ...(input.metadata ?? {}),
    },
  });
}
