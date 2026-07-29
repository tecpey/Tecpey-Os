import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertQueueIdentityMatchesRecord,
  hasDurablePreparedTransaction,
  resolveAuthoritativeFeeSpeed,
} from "../../lib/wallet/withdrawal-authority";
import type { WithdrawalJobData } from "../../lib/wallet/types";

const staleJob: WithdrawalJobData = {
  withdrawalId: "withdrawal-1",
  chainId: "bsc",
  asset: "BTC",
  amount: "999999",
  amountUsd: 999999,
  destinationAddress: "0xstale-queue-value",
  feeSpeed: "priority",
  enqueuedAt: new Date(0).toISOString(),
  priority: 10,
};

describe("Withdrawal queue authority boundary", () => {
  it("accepts the queue only as an identity trigger", () => {
    assert.doesNotThrow(() => assertQueueIdentityMatchesRecord(staleJob, { id: "withdrawal-1" }));
  });

  it("rejects a queue message for another withdrawal", () => {
    assert.throws(
      () => assertQueueIdentityMatchesRecord(staleJob, { id: "withdrawal-2" }),
      /identity mismatch/,
    );
  });

  it("ignores queue fee policy and resolves only a valid DB fee_config", () => {
    assert.equal(resolveAuthoritativeFeeSpeed({ speed: "fast" }), "fast");
    assert.equal(resolveAuthoritativeFeeSpeed({ speed: "invalid" }), "normal");
    assert.equal(resolveAuthoritativeFeeSpeed(null), "normal");
  });

  it("requires both durable raw bytes and deterministic hash before broadcast", () => {
    assert.equal(
      hasDurablePreparedTransaction({ rawTx: new Uint8Array([1, 2, 3]), txHash: "0xabc" }),
      true,
    );
    assert.equal(
      hasDurablePreparedTransaction({ rawTx: new Uint8Array(), txHash: "0xabc" }),
      false,
    );
    assert.equal(
      hasDurablePreparedTransaction({ rawTx: new Uint8Array([1]), txHash: null }),
      false,
    );
  });
});
