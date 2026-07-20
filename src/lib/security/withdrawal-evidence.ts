import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  writeSensitiveMutationAuditTx,
  type SensitiveAuditOutcome,
  type SensitiveMutationAuditAction,
  type SensitiveMutationAuditResource,
} from "./sensitive-mutation-audit";

export const WITHDRAWAL_EVIDENCE_POLICY_VERSION =
  "withdrawal-prebroadcast-evidence-v1";

export type WithdrawalEvidenceAction = Extract<
  SensitiveMutationAuditAction,
  | "withdrawal.authorization.issue"
  | "withdrawal.authorization.reject"
  | "withdrawal.admit"
  | "withdrawal.block"
  | "withdrawal.review"
  | "withdrawal.cancel"
  | "withdrawal.admin.approve"
  | "withdrawal.admin.reject"
  | "withdrawal.admin.block"
  | "withdrawal.admin.flag_review"
>;

export type WithdrawalEvidenceResource = Extract<
  SensitiveMutationAuditResource,
  | "withdrawal_authorization"
  | "withdrawal_request"
  | "withdrawal_admin_transition"
>;

function fingerprint(domain: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey:${domain}:v1\u001f`)
    .update(value)
    .digest("hex");
}

export function fingerprintWithdrawal(withdrawalId: string): string {
  return fingerprint("withdrawal", withdrawalId);
}

export function fingerprintWithdrawalAuthorization(value: string): string {
  return fingerprint("withdrawal-authorization", value);
}

export function fingerprintWithdrawalRequest(requestHash: string): string {
  return fingerprint("withdrawal-request", requestHash);
}

export function fingerprintWithdrawalDestination(input: {
  network: string;
  destinationAddress: string;
  destinationTag?: string | null;
}): string {
  return fingerprint(
    "withdrawal-destination",
    `${input.network.trim().toLowerCase()}\u001f${input.destinationAddress.trim()}\u001f${
      input.destinationTag?.trim() ?? ""
    }`,
  );
}

export function fingerprintWithdrawalReviewReason(value: string): string {
  return fingerprint("withdrawal-review-reason", value.trim());
}

export function fingerprintWithdrawalRoleSet(roles: string[]): string {
  return fingerprint(
    "withdrawal-admin-role-set",
    [...new Set(roles.map((role) => role.trim()).filter(Boolean))]
      .sort()
      .join("\u001f"),
  );
}

export function fingerprintWithdrawalSession(value: string): string {
  return fingerprint("withdrawal-admin-session", value);
}

export function withdrawalEvidenceCorrelation(
  action: WithdrawalEvidenceAction,
  identity: string,
): string {
  const suffix = action.slice("withdrawal.".length).replaceAll(".", "-");
  return `withdrawal-${suffix}:${fingerprint(
    `withdrawal-evidence-${suffix}`,
    identity,
  )}`;
}

function resourceFingerprint(
  resourceType: WithdrawalEvidenceResource,
  identity: string,
): string {
  if (resourceType === "withdrawal_authorization") {
    return fingerprintWithdrawalAuthorization(identity);
  }
  return fingerprintWithdrawal(identity);
}

export async function writeWithdrawalEvidenceTx(
  client: PoolClient,
  input: {
    tenantId: string;
    actorType: "user" | "admin" | "service";
    actorId: string;
    action: WithdrawalEvidenceAction;
    resourceType: WithdrawalEvidenceResource;
    resourceIdentity: string;
    correlationIdentity: string;
    requestHash: string;
    outcome: SensitiveAuditOutcome;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  return writeSensitiveMutationAuditTx(client, {
    tenantId: input.tenantId,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: resourceFingerprint(
      input.resourceType,
      input.resourceIdentity,
    ),
    outcome: input.outcome,
    correlationId: withdrawalEvidenceCorrelation(
      input.action,
      input.correlationIdentity,
    ),
    requestHash: input.requestHash,
    metadata: {
      policyVersion: WITHDRAWAL_EVIDENCE_POLICY_VERSION,
      ...(input.metadata ?? {}),
    },
  });
}
