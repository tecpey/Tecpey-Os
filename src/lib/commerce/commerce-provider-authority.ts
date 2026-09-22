import type { PoolClient } from "pg";
import { hashApiCommand } from "../security/api-command-idempotency";

export type CommercePurchaseReadinessReason =
  | "provider_not_configured"
  | "provider_idempotency_unproven"
  | "webhook_verification_not_configured"
  | "pricing_not_configured"
  | "refund_policy_not_configured"
  | "cancellation_policy_not_configured"
  | "legal_disclosure_not_configured"
  | "legal_copy_mismatch";

export type CommercePurchaseReadiness =
  | { enabled: true }
  | { enabled: false; reasons: readonly CommercePurchaseReadinessReason[] };

function configuredVersion(value: string | null | undefined): boolean {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(value);
}

export function evaluateCommercePurchaseReadiness(input: {
  providerConfigured: boolean;
  providerSupportsIdempotency: boolean;
  webhookVerificationConfigured: boolean;
  pricingConfigured: boolean;
  refundPolicyVersion?: string | null;
  cancellationPolicyVersion?: string | null;
  legalDisclosureVersion?: string | null;
  planLegalCopyVersion?: string | null;
}): CommercePurchaseReadiness {
  const reasons: CommercePurchaseReadinessReason[] = [];
  if (!input.providerConfigured) reasons.push("provider_not_configured");
  if (!input.providerSupportsIdempotency) reasons.push("provider_idempotency_unproven");
  if (!input.webhookVerificationConfigured) reasons.push("webhook_verification_not_configured");
  if (!input.pricingConfigured) reasons.push("pricing_not_configured");
  if (!configuredVersion(input.refundPolicyVersion)) reasons.push("refund_policy_not_configured");
  if (!configuredVersion(input.cancellationPolicyVersion)) reasons.push("cancellation_policy_not_configured");
  if (!configuredVersion(input.legalDisclosureVersion)) reasons.push("legal_disclosure_not_configured");
  if (
    configuredVersion(input.legalDisclosureVersion) &&
    configuredVersion(input.planLegalCopyVersion) &&
    input.legalDisclosureVersion !== input.planLegalCopyVersion
  ) {
    reasons.push("legal_copy_mismatch");
  } else if (!configuredVersion(input.planLegalCopyVersion) && configuredVersion(input.legalDisclosureVersion)) {
    reasons.push("legal_copy_mismatch");
  }
  return reasons.length === 0 ? { enabled: true } : { enabled: false, reasons };
}

export type CommerceProviderOperationType = "checkout_create" | "cancel" | "refund";

export function hashCommerceProviderOperation(input: {
  tenantId: string;
  workspaceId: string;
  provider: string;
  operationType: CommerceProviderOperationType;
  accountId?: string;
  planKey?: string;
  planVersion?: number;
  providerSubscriptionId?: string;
  providerPaymentId?: string;
  amountMinor?: bigint;
  currency?: string;
}): string {
  return hashApiCommand(input);
}

type ProviderOperationRow = {
  request_sha256: string;
  provider_object_id: string | null;
  status: "started" | "succeeded" | "failed" | "unknown";
  updated_at: Date;
};

export type CommerceProviderOperationClaim =
  | { status: "claimed"; requestHash: string }
  | { status: "replayed"; requestHash: string; providerObjectId: string | null }
  | { status: "conflict"; requestHash: string }
  | { status: "in_progress"; requestHash: string }
  | { status: "retry_same_key"; requestHash: string };

function validateOperationScope(input: {
  tenantId: string; workspaceId: string; provider: string; idempotencyKey: string; requestHash: string;
}): void {
  if (!input.tenantId || input.tenantId.length > 120) throw new Error("invalid_commerce_tenant");
  if (!input.workspaceId || input.workspaceId.length > 120) throw new Error("invalid_commerce_workspace");
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(input.provider)) throw new Error("invalid_commerce_provider");
  if (!/^[A-Za-z0-9._:-]{16,180}$/.test(input.idempotencyKey)) throw new Error("invalid_commerce_idempotency_key");
  if (!/^[0-9a-f]{64}$/.test(input.requestHash)) throw new Error("invalid_commerce_request_hash");
}

export async function claimCommerceProviderOperationTx(
  client: PoolClient,
  input: {
    tenantId: string;
    workspaceId: string;
    provider: string;
    operationType: CommerceProviderOperationType;
    idempotencyKey: string;
    requestHash: string;
    staleAfterMs?: number;
  },
): Promise<CommerceProviderOperationClaim> {
  validateOperationScope(input);
  const staleAfterMs = input.staleAfterMs ?? 120_000;
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 5_000 || staleAfterMs > 3_600_000) {
    throw new Error("invalid_commerce_operation_lease");
  }
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
    [`${input.tenantId}\0${input.workspaceId}\0${input.provider}\0${input.idempotencyKey}`],
  );
  const existing = await client.query<ProviderOperationRow>(
    `SELECT request_sha256, provider_object_id, status, updated_at
       FROM commerce_provider_operations
      WHERE tenant_id=$1 AND workspace_id=$2 AND provider=$3 AND idempotency_key=$4
      FOR UPDATE`,
    [input.tenantId, input.workspaceId, input.provider, input.idempotencyKey],
  );
  const row = existing.rows[0];
  if (row) {
    if (row.request_sha256 !== input.requestHash) return { status: "conflict", requestHash: input.requestHash };
    if (row.status === "succeeded") {
      return { status: "replayed", requestHash: input.requestHash, providerObjectId: row.provider_object_id };
    }
    if (row.status === "failed") return { status: "conflict", requestHash: input.requestHash };
    if (row.status === "unknown") return { status: "retry_same_key", requestHash: input.requestHash };
    if (Date.now() - row.updated_at.getTime() < staleAfterMs) {
      return { status: "in_progress", requestHash: input.requestHash };
    }
    await client.query(
      `UPDATE commerce_provider_operations SET updated_at=NOW()
        WHERE tenant_id=$1 AND workspace_id=$2 AND provider=$3 AND idempotency_key=$4 AND status='started'`,
      [input.tenantId, input.workspaceId, input.provider, input.idempotencyKey],
    );
    return { status: "retry_same_key", requestHash: input.requestHash };
  }
  await client.query(
    `INSERT INTO commerce_provider_operations
      (tenant_id,workspace_id,provider,operation_type,idempotency_key,request_sha256,status)
     VALUES ($1,$2,$3,$4,$5,$6,'started')`,
    [input.tenantId, input.workspaceId, input.provider, input.operationType, input.idempotencyKey, input.requestHash],
  );
  return { status: "claimed", requestHash: input.requestHash };
}

export async function completeCommerceProviderOperationTx(
  client: PoolClient,
  input: {
    tenantId: string; workspaceId: string; provider: string; idempotencyKey: string;
    requestHash: string; providerObjectId?: string | null;
  },
): Promise<void> {
  validateOperationScope(input);
  const result = await client.query(
    `UPDATE commerce_provider_operations
        SET status='succeeded', provider_object_id=$5, updated_at=NOW()
      WHERE tenant_id=$1 AND workspace_id=$2 AND provider=$3 AND idempotency_key=$4
        AND request_sha256=$6 AND status IN ('started','unknown')`,
    [input.tenantId, input.workspaceId, input.provider, input.idempotencyKey, input.providerObjectId ?? null, input.requestHash],
  );
  if (result.rowCount !== 1) throw new Error("commerce_provider_operation_completion_conflict");
}

export async function markCommerceProviderOperationUnknownTx(
  client: PoolClient,
  input: {
    tenantId: string; workspaceId: string; provider: string; idempotencyKey: string; requestHash: string;
  },
): Promise<void> {
  validateOperationScope(input);
  const result = await client.query(
    `UPDATE commerce_provider_operations SET status='unknown', updated_at=NOW()
      WHERE tenant_id=$1 AND workspace_id=$2 AND provider=$3 AND idempotency_key=$4
        AND request_sha256=$5 AND status IN ('started','unknown')`,
    [input.tenantId, input.workspaceId, input.provider, input.idempotencyKey, input.requestHash],
  );
  if (result.rowCount !== 1) throw new Error("commerce_provider_operation_unknown_conflict");
}
