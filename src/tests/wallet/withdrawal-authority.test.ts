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

  it("reads no value-bearing queue field via any access form", async () => {
    const source = await executorSource;

    // Collect every field the executor pulls off `job`, across all access forms
    // a regression could hide behind (per Codex review): direct dot access,
    // bracket access, and object destructuring.
    const dotRefs = [...source.matchAll(/\bjob\.([A-Za-z_]\w*)/g)].map((m) => m[1]);
    const bracketRefs = [...source.matchAll(/\bjob\[\s*['"]([^'"]+)['"]\s*\]/g)].map((m) => m[1]);
    const destructuredRefs = [...source.matchAll(/\{([^}]*)\}\s*=\s*job\b/g)].flatMap((m) =>
      m[1]
        .split(",")
        .map((entry) => entry.trim().split(":")[0].trim())
        .filter(Boolean),
    );
    const referenced = [...new Set([...dotRefs, ...bracketRefs, ...destructuredRefs])].sort();

    assert.deepEqual(
      referenced,
      ["withdrawalId"],
      `executor must read only the withdrawal id off the queue; found: ${referenced.join(", ")}`,
    );

    // Defense in depth: forbid dynamic/computed access to the queue payload
    // entirely — `job[expr]` could read a value-bearing field the static scan
    // above cannot resolve.
    assert.doesNotMatch(
      source,
      /\bjob\[/,
      "computed access job[...] to the queue payload is forbidden",
    );

    // The queue object itself may only be handed to a small allowlist of
    // callees whose contracts do not derive execution authority from it
    // (assertQueueIdentityMatchesRecord trusts only the id; enqueueRecovery
    // re-enqueues the hint for a later id-authoritative run). Any new function
    // receiving `job` must be reviewed and added here deliberately, so a helper
    // that reaches into job.destinationAddress cannot slip in unnoticed.
    // Match `fn(job,` / `fn(job)` — the whole queue object as an argument —
    // but not `fn(job.withdrawalId)`, where only the id crosses the boundary.
    const jobArgCallees = [...source.matchAll(/\b([A-Za-z_]\w*)\s*\(\s*job\s*[,)]/g)].map((m) => m[1]);
    const allowedJobConsumers = new Set(["assertQueueIdentityMatchesRecord", "enqueueRecovery"]);
    for (const callee of jobArgCallees) {
      assert.ok(
        allowedJobConsumers.has(callee),
        `queue job passed to un-vetted helper ${callee}(job, …); it could read value-bearing fields — review it and add to the allowlist`,
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
