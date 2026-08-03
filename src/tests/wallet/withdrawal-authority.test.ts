import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

// #29 fund-safety invariant, enforced structurally so it cannot silently
// regress: the withdrawal executor must treat the BullMQ job as an identity
// trigger only. Every value that can move money — amount, destination, asset,
// chain, fee — must come from the approved PostgreSQL record, never from the
// (untrusted, replayable, forgeable) queue payload. A future edit that reads,
// say, job.destinationAddress into the signing path would be a fund-redirection
// hole; this test fails closed on any such reference.
describe("Withdrawal executor consumes the queue as identity only", () => {
  const executorSource = readFile(
    new URL("../../lib/wallet/withdrawal-executor.ts", import.meta.url),
    "utf8",
  );

  it("reads no value-bearing queue field — only job.withdrawalId selects the record", async () => {
    const source = await executorSource;
    const referenced = [
      ...new Set([...source.matchAll(/\bjob\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1])),
    ].sort();
    assert.deepEqual(
      referenced,
      ["withdrawalId"],
      `executor must read only job.withdrawalId; found value-bearing queue reads: ${referenced.join(", ")}`,
    );
    for (const forbidden of [
      "amount",
      "amountUsd",
      "destinationAddress",
      "asset",
      "chainId",
      "feeSpeed",
      "priority",
    ] as const) {
      assert.ok(
        !referenced.includes(forbidden),
        `queue field job.${forbidden} must never grant execution authority`,
      );
    }
  });

  it("selects the approved record by id and derives the fee from the DB record", async () => {
    const source = await executorSource;
    assert.match(
      source,
      /assertQueueIdentityMatchesRecord\(job, plan\.withdrawal\)/,
      "the queue job must be validated against the claimed DB record before execution",
    );
    assert.match(
      source,
      /resolveAuthoritativeFeeSpeed\(withdrawal\.feeConfig\)/,
      "the fee must be resolved from the DB record's fee_config, not job.feeSpeed",
    );
    assert.doesNotMatch(
      source,
      /job\.feeSpeed/,
      "the executor must never read the queue-supplied fee speed",
    );
  });
});
