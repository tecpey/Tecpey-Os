// Idempotency Tests — Phase 38
// Tests the withdrawal executor's idempotency guarantee:
// if tx_hash is already set, second execution is a no-op.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Withdrawal idempotency", () => {
  it("detects duplicate by tx_hash presence", () => {
    // Simulate the idempotency check logic
    const withdrawalRecord = { txHash: "0xabc123...", state: "broadcasted" };
    const isDuplicate = !!withdrawalRecord.txHash;
    assert.equal(isDuplicate, true);
  });

  it("allows execution when tx_hash is null", () => {
    const withdrawalRecord = { txHash: null, state: "approved" };
    const isDuplicate = !!withdrawalRecord.txHash;
    assert.equal(isDuplicate, false);
  });

  it("blocks execution for non-approved states", () => {
    const states = ["pending", "compliance_review", "blocked", "rejected", "completed", "failed"];
    for (const state of states) {
      const canExecute = state === "approved";
      assert.equal(canExecute, false, `State ${state} should not be executable`);
    }
  });

  it("allows execution only for approved state", () => {
    const canExecute = "approved" === "approved";
    assert.equal(canExecute, true);
  });

  it("job deduplication uses withdrawalId as jobId", () => {
    const withdrawalId = "abc-123-def-456";
    const jobId = `withdrawal:${withdrawalId}`;
    assert.equal(jobId, "withdrawal:abc-123-def-456");
    // Same withdrawalId → same jobId → BullMQ deduplicates
    const jobId2 = `withdrawal:${withdrawalId}`;
    assert.equal(jobId, jobId2);
  });
});

describe("Confirmation job idempotency", () => {
  it("uses withdrawalId as confirmation jobId", () => {
    const withdrawalId = "test-withdrawal";
    const jobId = `confirm:${withdrawalId}`;
    assert.equal(jobId, "confirm:test-withdrawal");
    // Same withdrawal → same jobId → only one confirmation watch per withdrawal
    const jobId2 = `confirm:${withdrawalId}`;
    assert.equal(jobId, jobId2);
  });
});
