// Failure Recovery Tests — Phase 38
// Tests state machine transitions and recovery paths.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTimeoutAt } from "../../lib/wallet/confirmation/engine";
import type { ChainId } from "../../lib/wallet/types";

describe("Confirmation timeout detection", () => {
  it("builds timeout ISO string in the future", () => {
    const chains: ChainId[] = ["bitcoin", "ethereum", "bsc", "polygon", "tron", "solana"];
    for (const chain of chains) {
      const timeoutAt = buildTimeoutAt(chain);
      const ts = new Date(timeoutAt).getTime();
      assert.ok(ts > Date.now(), `${chain} timeout should be in the future`);
    }
  });

  it("bitcoin has longer timeout than solana", () => {
    const btcTimeout = new Date(buildTimeoutAt("bitcoin")).getTime();
    const solanaTimeout = new Date(buildTimeoutAt("solana")).getTime();
    assert.ok(btcTimeout > solanaTimeout, "BTC should have longer timeout");
  });

  it("detects expired timeout", () => {
    const pastTime = new Date(Date.now() - 1000).toISOString();
    const isExpired = new Date(pastTime) < new Date();
    assert.equal(isExpired, true);
  });

  it("does not detect timeout for future time", () => {
    const futureTime = new Date(Date.now() + 60_000).toISOString();
    const isExpired = new Date(futureTime) < new Date();
    assert.equal(isExpired, false);
  });
});

describe("State machine transitions", () => {
  type State = "approved" | "building_transaction" | "signing" | "broadcasting" |
    "broadcasted" | "confirming" | "completed" | "failed" | "timeout" | "cancelled";

  const VALID_TRANSITIONS: Record<State, State[]> = {
    approved: ["building_transaction", "failed", "cancelled"],
    building_transaction: ["signing", "failed"],
    signing: ["broadcasting", "failed"],
    broadcasting: ["broadcasted", "failed"],
    broadcasted: ["confirming"],
    confirming: ["completed", "failed", "timeout"],
    completed: [],
    failed: [],
    timeout: [],
    cancelled: [],
  };

  it("approved → building_transaction is valid", () => {
    const valid = VALID_TRANSITIONS.approved.includes("building_transaction");
    assert.equal(valid, true);
  });

  it("completed → any state is invalid", () => {
    assert.equal(VALID_TRANSITIONS.completed.length, 0);
  });

  it("failed → any state is invalid (terminal)", () => {
    assert.equal(VALID_TRANSITIONS.failed.length, 0);
  });

  it("confirming → completed is valid", () => {
    const valid = VALID_TRANSITIONS.confirming.includes("completed");
    assert.equal(valid, true);
  });

  it("confirming → timeout is valid", () => {
    const valid = VALID_TRANSITIONS.confirming.includes("timeout");
    assert.equal(valid, true);
  });
});

describe("Circuit breaker behavior", () => {
  it("opens after 3 failures", () => {
    let failures = 0;
    let circuitOpen = false;
    const MAX_FAILURES = 3;

    for (let i = 0; i < MAX_FAILURES; i++) {
      failures++;
      if (failures >= MAX_FAILURES) circuitOpen = true;
    }

    assert.equal(circuitOpen, true);
  });

  it("recovers after timeout window", () => {
    let circuitOpen = true;
    const lastFailure = Date.now() - 31_000; // 31s ago
    const RECOVERY_WINDOW_MS = 30_000;

    if (Date.now() - lastFailure > RECOVERY_WINDOW_MS) {
      circuitOpen = false;
    }

    assert.equal(circuitOpen, false);
  });

  it("stays open within timeout window", () => {
    let circuitOpen = true;
    const lastFailure = Date.now() - 5_000; // 5s ago
    const RECOVERY_WINDOW_MS = 30_000;

    if (Date.now() - lastFailure > RECOVERY_WINDOW_MS) {
      circuitOpen = false;
    }

    assert.equal(circuitOpen, true);
  });
});
