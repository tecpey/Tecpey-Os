import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWithdrawalAdminDecisionEvidence,
  buildWithdrawalAdmissionEvidence,
  buildWithdrawalCancellationEvidence,
  fingerprintWithdrawal,
  fingerprintWithdrawalDestination,
} from "../../lib/security/withdrawal-evidence";

const rawAddress = "0xAABBCCDDEEFF0011223344556677889900AABBCC";
const rawTag = "memo-991122";
const rawNotes = "Customer called support and supplied sensitive operational context";

const userContext = {
  tenantId: "tecpey",
  actorType: "user" as const,
  actorId: "withdrawal-user-1",
  correlationSeed: "withdrawal-idempotency-key-0001",
  requestHash: "a".repeat(64),
};

const adminContext = {
  tenantId: "tecpey",
  actorType: "admin" as const,
  actorId: "withdrawal-admin-1",
  correlationSeed: "withdrawal-admin-idempotency-key-0001",
  requestHash: "b".repeat(64),
};

const financial = {
  withdrawalId: "withdrawal-authority-0001",
  asset: "USDT",
  amount: "10.0100000000",
  amountUsd: "10.0100000000",
  network: "ETHEREUM",
  destinationAddress: rawAddress,
  destinationTag: rawTag,
};

function assertNoRawAuthority(value: unknown): void {
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes(financial.withdrawalId), false);
  assert.equal(encoded.includes(rawAddress), false);
  assert.equal(encoded.includes(rawTag), false);
  assert.equal(encoded.includes(rawNotes), false);
  assert.equal(encoded.includes(userContext.correlationSeed), false);
  assert.equal(encoded.includes(adminContext.correlationSeed), false);
}

describe("Withdrawal mandatory evidence builders", () => {
  it("builds deterministic admitted evidence from exact financial strings without raw destination authority", () => {
    const first = buildWithdrawalAdmissionEvidence({
      context: userContext,
      ...financial,
      resultingState: "approved",
      reserveFunds: true,
      reservedAmount: "10.0100000000",
      complianceReason: "approved",
      kycStatus: "verified",
      amlRisk: "low",
      sanctionsHit: false,
      riskTier: "normal",
      priceSnapshotId: "snapshot-0001",
      admissionPolicyVersion: "withdrawal-admission-v1",
      compliancePolicyVersion: "withdrawal-compliance-v1",
    });
    const second = buildWithdrawalAdmissionEvidence({
      context: userContext,
      ...financial,
      asset: "usdt",
      network: "ethereum",
      resultingState: "approved",
      reserveFunds: true,
      reservedAmount: "10.0100000000",
      complianceReason: "approved",
      kycStatus: "verified",
      amlRisk: "low",
      sanctionsHit: false,
      riskTier: "normal",
      priceSnapshotId: "snapshot-0001",
      admissionPolicyVersion: "withdrawal-admission-v1",
      compliancePolicyVersion: "withdrawal-compliance-v1",
    });

    assert.deepEqual(first, second);
    assert.equal(first.action, "withdrawal.admit");
    assert.equal(first.resourceType, "withdrawal");
    assert.equal(first.outcome, "success");
    assert.equal(first.resourceId, fingerprintWithdrawal(financial.withdrawalId));
    assert.equal(first.metadata?.amount, "10.01");
    assert.equal(first.metadata?.amountUsd, "10.01");
    assert.equal(first.metadata?.reservedAmount, "10.01");
    assert.equal(first.metadata?.assetCode, "USDT");
    assert.equal(first.metadata?.networkCode, "ETHEREUM");
    assert.equal(
      first.metadata?.destinationFingerprint,
      fingerprintWithdrawalDestination({
        network: financial.network,
        address: rawAddress,
        tag: rawTag,
      }),
    );
    assertNoRawAuthority(first);
  });

  it("records a committed blocked admission as rejected with zero reserve", () => {
    const event = buildWithdrawalAdmissionEvidence({
      context: userContext,
      ...financial,
      resultingState: "blocked",
      reserveFunds: false,
      reservedAmount: "0.0000000000",
      complianceReason: "sanctions_match",
      kycStatus: "verified",
      amlRisk: "high",
      sanctionsHit: true,
      riskTier: "blocked",
      priceSnapshotId: "snapshot-0002",
      admissionPolicyVersion: "withdrawal-admission-v1",
      compliancePolicyVersion: "withdrawal-compliance-v1",
    });

    assert.equal(event.action, "withdrawal.admit");
    assert.equal(event.outcome, "rejected");
    assert.equal(event.metadata?.resultingState, "blocked");
    assert.equal(event.metadata?.reserveFunds, false);
    assert.equal(event.metadata?.reservedAmount, "0");
    assert.equal(event.metadata?.sanctionsHit, true);
    assertNoRawAuthority(event);
  });

  it("builds cancellation evidence with the exact released reserve", () => {
    const event = buildWithdrawalCancellationEvidence({
      context: userContext,
      ...financial,
      previousState: "compliance_review",
      releasedAmount: "10.0100000000",
      fundsWereReserved: true,
    });

    assert.equal(event.action, "withdrawal.cancel");
    assert.equal(event.outcome, "success");
    assert.equal(
      event.metadata?.stateTransition,
      "compliance_review->cancelled",
    );
    assert.equal(event.metadata?.releasedAmount, "10.01");
    assert.equal(event.metadata?.fundsWereReserved, true);
    assertNoRawAuthority(event);
  });

  it("builds bounded Admin decision evidence without raw notes or Admin action identity", () => {
    const approved = buildWithdrawalAdminDecisionEvidence({
      context: adminContext,
      ...financial,
      action: "approve",
      previousState: "compliance_review",
      resultingState: "approved",
      releasedAmount: "0",
      fundsWereReleased: false,
      custodyGatePassed: true,
      complianceComplete: true,
      adminActionId: "admin-action-0001",
      reviewNotes: rawNotes,
    });
    const rejected = buildWithdrawalAdminDecisionEvidence({
      context: { ...adminContext, correlationSeed: "withdrawal-admin-key-0002" },
      ...financial,
      action: "reject",
      previousState: "pending",
      resultingState: "rejected",
      releasedAmount: "10.0100000000",
      fundsWereReleased: true,
      custodyGatePassed: false,
      complianceComplete: false,
      adminActionId: "admin-action-0002",
      reviewNotes: rawNotes,
    });

    assert.equal(approved.action, "withdrawal.admin.approve");
    assert.equal(approved.metadata?.releasedAmount, "0");
    assert.equal(approved.metadata?.custodyGatePassed, true);
    assert.equal(approved.metadata?.complianceComplete, true);
    assert.equal(typeof approved.metadata?.reviewNotesFingerprint, "string");
    assert.equal(typeof approved.metadata?.adminActionFingerprint, "string");
    assert.equal(rejected.action, "withdrawal.admin.reject");
    assert.equal(rejected.metadata?.releasedAmount, "10.01");
    assert.equal(rejected.metadata?.fundsWereReleased, true);
    assertNoRawAuthority(approved);
    assertNoRawAuthority(rejected);
  });

  it("fails closed on scientific notation, reserve/release mismatch and unsafe decision codes", () => {
    assert.throws(
      () => buildWithdrawalAdmissionEvidence({
        context: userContext,
        ...financial,
        amount: "1e3",
        resultingState: "approved",
        reserveFunds: true,
        reservedAmount: "1000",
        sanctionsHit: false,
        priceSnapshotId: "snapshot-0003",
        admissionPolicyVersion: "withdrawal-admission-v1",
        compliancePolicyVersion: "withdrawal-compliance-v1",
      }),
      /invalid_withdrawal_evidence_amount/,
    );
    assert.throws(
      () => buildWithdrawalAdmissionEvidence({
        context: userContext,
        ...financial,
        resultingState: "blocked",
        reserveFunds: true,
        reservedAmount: "10.01",
        sanctionsHit: true,
        priceSnapshotId: "snapshot-0004",
        admissionPolicyVersion: "withdrawal-admission-v1",
        compliancePolicyVersion: "withdrawal-compliance-v1",
      }),
      /withdrawal_evidence_blocked_reserve_mismatch/,
    );
    assert.throws(
      () => buildWithdrawalCancellationEvidence({
        context: userContext,
        ...financial,
        previousState: "pending",
        releasedAmount: "0",
        fundsWereReserved: true,
      }),
      /withdrawal_evidence_release_mismatch/,
    );
    assert.throws(
      () => buildWithdrawalAdmissionEvidence({
        context: userContext,
        ...financial,
        resultingState: "compliance_review",
        reserveFunds: true,
        reservedAmount: "10.01",
        complianceReason: "unsafe unrestricted text with spaces",
        sanctionsHit: false,
        priceSnapshotId: "snapshot-0005",
        admissionPolicyVersion: "withdrawal-admission-v1",
        compliancePolicyVersion: "withdrawal-compliance-v1",
      }),
      /invalid_withdrawal_evidence_compliance_reason/,
    );
    assert.throws(
      () => buildWithdrawalAdminDecisionEvidence({
        context: adminContext,
        ...financial,
        action: "approve",
        previousState: "pending",
        resultingState: "approved",
        releasedAmount: "0",
        fundsWereReleased: false,
        custodyGatePassed: false,
        complianceComplete: true,
        adminActionId: "admin-action-0003",
      }),
      /withdrawal_evidence_custody_gate_mismatch/,
    );
  });
});
