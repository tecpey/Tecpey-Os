import { createHash } from "node:crypto";
import { D } from "@/lib/trading/decimal";
import type {
  SensitiveMutationAuditAction,
  SensitiveMutationAuditEvent,
} from "./sensitive-mutation-audit";

export const WITHDRAWAL_EVIDENCE_POLICY_VERSION =
  "withdrawal-transactional-evidence-v1";

export type WithdrawalEvidenceContext = {
  tenantId: string;
  actorType: "user" | "admin";
  actorId: string;
  correlationSeed: string;
  requestHash: string;
};

export type WithdrawalAdmissionState =
  | "approved"
  | "compliance_review"
  | "blocked";

export type WithdrawalAdminAction =
  | "approve"
  | "reject"
  | "block"
  | "flag_review";

const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const CODE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
const STATE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

function domainHash(domain: string, value: string): string {
  return createHash("sha256")
    .update(`tecpey:${domain}:v1\u001f`)
    .update(value)
    .digest("hex");
}

function assertContext(context: WithdrawalEvidenceContext): void {
  if (!/^[a-z][a-z0-9._-]{1,79}$/.test(context.tenantId)) {
    throw new Error("invalid_withdrawal_evidence_tenant");
  }
  if (!context.actorId || context.actorId.length > 300) {
    throw new Error("invalid_withdrawal_evidence_actor");
  }
  if (!context.correlationSeed || context.correlationSeed.length > 500) {
    throw new Error("invalid_withdrawal_evidence_correlation_seed");
  }
  if (!/^[0-9a-f]{64}$/.test(context.requestHash)) {
    throw new Error("invalid_withdrawal_evidence_request_hash");
  }
}

function canonicalDecimal(
  value: string,
  field: string,
  options: { positive: boolean },
): string {
  const candidate = value.trim();
  if (!DECIMAL_PATTERN.test(candidate) || candidate.length > 120) {
    throw new Error(`invalid_withdrawal_evidence_${field}`);
  }
  const parsed = D(candidate);
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new Error(`invalid_withdrawal_evidence_${field}`);
  }
  if (options.positive && parsed.lte(0)) {
    throw new Error(`invalid_withdrawal_evidence_${field}`);
  }
  return parsed.toFixed();
}

function normalizedAsset(value: string): string {
  const asset = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,19}$/.test(asset)) {
    throw new Error("invalid_withdrawal_evidence_asset");
  }
  return asset;
}

function normalizedNetwork(value: string): string {
  const network = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._:-]{1,39}$/.test(network)) {
    throw new Error("invalid_withdrawal_evidence_network");
  }
  return network;
}

function normalizedCode(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === null || value === undefined || !value.trim()) return null;
  const code = value.trim().toLowerCase();
  if (!CODE_PATTERN.test(code)) {
    throw new Error(`invalid_withdrawal_evidence_${field}`);
  }
  return code;
}

function normalizedState(value: string, field: string): string {
  const state = value.trim().toLowerCase();
  if (!STATE_PATTERN.test(state)) {
    throw new Error(`invalid_withdrawal_evidence_${field}`);
  }
  return state;
}

function boundedFingerprint(
  domain: string,
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === null || value === undefined || value.length === 0) return null;
  if (value.length > 4_000) {
    throw new Error(`invalid_withdrawal_evidence_${field}`);
  }
  return `${domain}-${domainHash(domain, value)}`;
}

function correlationId(
  action: SensitiveMutationAuditAction,
  seed: string,
): string {
  return `${action.replaceAll(".", "-")}-${domainHash(action, seed).slice(0, 48)}`;
}

export function fingerprintWithdrawal(withdrawalId: string): string {
  const id = withdrawalId.trim();
  if (!id || id.length > 300) {
    throw new Error("invalid_withdrawal_evidence_withdrawal");
  }
  return `withdrawal-${domainHash("withdrawal", id)}`;
}

export function fingerprintWithdrawalDestination(input: {
  network: string;
  address: string;
  tag?: string | null;
}): string {
  const network = normalizedNetwork(input.network);
  const address = input.address.trim();
  const tag = input.tag?.trim() ?? "";
  if (!address || address.length > 1_000 || tag.length > 500) {
    throw new Error("invalid_withdrawal_evidence_destination");
  }
  return `withdrawal-destination-${domainHash(
    "withdrawal-destination",
    `${network}\u001f${address}\u001f${tag}`,
  )}`;
}

function baseEvent(
  context: WithdrawalEvidenceContext,
  action: SensitiveMutationAuditAction,
  withdrawalId: string,
): Omit<SensitiveMutationAuditEvent, "outcome" | "metadata"> {
  assertContext(context);
  return {
    tenantId: context.tenantId,
    actorType: context.actorType,
    actorId: context.actorId,
    action,
    resourceType: "withdrawal",
    resourceId: fingerprintWithdrawal(withdrawalId),
    correlationId: correlationId(action, context.correlationSeed),
    requestHash: context.requestHash,
  };
}

function financialIdentity(input: {
  asset: string;
  amount: string;
  amountUsd: string;
  network: string;
  destinationAddress: string;
  destinationTag?: string | null;
}): Record<string, unknown> {
  return {
    policyVersion: WITHDRAWAL_EVIDENCE_POLICY_VERSION,
    assetCode: normalizedAsset(input.asset),
    networkCode: normalizedNetwork(input.network),
    amount: canonicalDecimal(input.amount, "amount", { positive: true }),
    amountUsd: canonicalDecimal(input.amountUsd, "amount_usd", { positive: true }),
    destinationFingerprint: fingerprintWithdrawalDestination({
      network: input.network,
      address: input.destinationAddress,
      tag: input.destinationTag,
    }),
  };
}

export function buildWithdrawalAdmissionEvidence(input: {
  context: WithdrawalEvidenceContext;
  withdrawalId: string;
  asset: string;
  amount: string;
  amountUsd: string;
  network: string;
  destinationAddress: string;
  destinationTag?: string | null;
  resultingState: WithdrawalAdmissionState;
  reserveFunds: boolean;
  reservedAmount: string;
  complianceReason?: string | null;
  kycStatus?: string | null;
  amlRisk?: string | null;
  sanctionsHit: boolean;
  riskTier?: string | null;
  priceSnapshotId: string;
  admissionPolicyVersion: string;
  compliancePolicyVersion: string;
}): SensitiveMutationAuditEvent {
  const resultingState = normalizedState(input.resultingState, "resulting_state");
  const reservedAmount = canonicalDecimal(
    input.reservedAmount,
    "reserved_amount",
    { positive: false },
  );
  if (input.reserveFunds !== !D(reservedAmount).isZero()) {
    throw new Error("withdrawal_evidence_reserve_mismatch");
  }
  if (resultingState === "blocked" && input.reserveFunds) {
    throw new Error("withdrawal_evidence_blocked_reserve_mismatch");
  }

  return {
    ...baseEvent(input.context, "withdrawal.admit", input.withdrawalId),
    outcome: resultingState === "blocked" ? "rejected" : "success",
    metadata: {
      ...financialIdentity(input),
      resultingState,
      reserveFunds: input.reserveFunds,
      reservedAmount,
      complianceReasonCode: normalizedCode(
        input.complianceReason,
        "compliance_reason",
      ),
      kycStatusCode: normalizedCode(input.kycStatus, "kyc_status"),
      amlRiskCode: normalizedCode(input.amlRisk, "aml_risk"),
      sanctionsHit: input.sanctionsHit,
      riskTierCode: normalizedCode(input.riskTier, "risk_tier"),
      priceSnapshotFingerprint: boundedFingerprint(
        "withdrawal-price-snapshot",
        input.priceSnapshotId,
        "price_snapshot",
      ),
      admissionPolicyCode: normalizedCode(
        input.admissionPolicyVersion,
        "admission_policy",
      ),
      compliancePolicyCode: normalizedCode(
        input.compliancePolicyVersion,
        "compliance_policy",
      ),
    },
  };
}

export function buildWithdrawalCancellationEvidence(input: {
  context: WithdrawalEvidenceContext;
  withdrawalId: string;
  asset: string;
  amount: string;
  amountUsd: string;
  network: string;
  destinationAddress: string;
  destinationTag?: string | null;
  previousState: string;
  releasedAmount: string;
  fundsWereReserved: boolean;
}): SensitiveMutationAuditEvent {
  const releasedAmount = canonicalDecimal(
    input.releasedAmount,
    "released_amount",
    { positive: false },
  );
  if (input.fundsWereReserved !== !D(releasedAmount).isZero()) {
    throw new Error("withdrawal_evidence_release_mismatch");
  }

  return {
    ...baseEvent(input.context, "withdrawal.cancel", input.withdrawalId),
    outcome: "success",
    metadata: {
      ...financialIdentity(input),
      stateTransition: `${normalizedState(input.previousState, "previous_state")}->cancelled`,
      fundsWereReserved: input.fundsWereReserved,
      releasedAmount,
    },
  };
}

export function buildWithdrawalAdminDecisionEvidence(input: {
  context: WithdrawalEvidenceContext;
  withdrawalId: string;
  action: WithdrawalAdminAction;
  asset: string;
  amount: string;
  amountUsd: string;
  network: string;
  destinationAddress: string;
  destinationTag?: string | null;
  previousState: string;
  resultingState: string;
  releasedAmount: string;
  fundsWereReleased: boolean;
  custodyGatePassed: boolean;
  complianceComplete: boolean;
  adminActionId: string;
  reviewNotes?: string | null;
}): SensitiveMutationAuditEvent {
  const actionMap: Record<WithdrawalAdminAction, SensitiveMutationAuditAction> = {
    approve: "withdrawal.admin.approve",
    reject: "withdrawal.admin.reject",
    block: "withdrawal.admin.block",
    flag_review: "withdrawal.admin.flag_review",
  };
  const action = actionMap[input.action];
  const releasedAmount = canonicalDecimal(
    input.releasedAmount,
    "released_amount",
    { positive: false },
  );
  if (input.fundsWereReleased !== !D(releasedAmount).isZero()) {
    throw new Error("withdrawal_evidence_admin_release_mismatch");
  }
  if (input.action === "approve" && !input.custodyGatePassed) {
    throw new Error("withdrawal_evidence_custody_gate_mismatch");
  }
  if (input.action === "approve" && !input.complianceComplete) {
    throw new Error("withdrawal_evidence_compliance_mismatch");
  }

  return {
    ...baseEvent(input.context, action, input.withdrawalId),
    outcome: "success",
    metadata: {
      ...financialIdentity(input),
      stateTransition: `${normalizedState(input.previousState, "previous_state")}->${normalizedState(input.resultingState, "resulting_state")}`,
      decisionCode: input.action,
      fundsWereReleased: input.fundsWereReleased,
      releasedAmount,
      custodyGatePassed: input.custodyGatePassed,
      complianceComplete: input.complianceComplete,
      adminActionFingerprint: boundedFingerprint(
        "withdrawal-admin-action",
        input.adminActionId,
        "admin_action",
      ),
      reviewNotesFingerprint: boundedFingerprint(
        "withdrawal-review-notes",
        input.reviewNotes,
        "review_notes",
      ),
    },
  };
}
