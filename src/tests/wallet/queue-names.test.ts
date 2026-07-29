import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getConfirmationTimeout } from "../../lib/wallet/confirmation/engine";
import { WITHDRAWAL_QUEUE_NAMES } from "../../lib/wallet/queue/names";
import {
  MAX_CONFIRMATION_ATTEMPTS,
  SUPPORTED_WALLET_CHAINS,
  confirmationAttemptBudget,
  confirmationCoverageMs,
  createWalletQueueJobId,
} from "../../lib/wallet/queue/policy";

describe("Withdrawal queue topology", () => {
  it("uses stable, unique producer and consumer names", () => {
    assert.deepEqual(WITHDRAWAL_QUEUE_NAMES, {
      execution: "withdrawal",
      confirmation: "withdrawal-confirmation",
      recovery: "withdrawal-recovery",
      retry: "withdrawal-retry",
      deadLetter: "withdrawal-dlq",
    });
    assert.equal(new Set(Object.values(WITHDRAWAL_QUEUE_NAMES)).size, 5);
  });

  it("creates deterministic BullMQ-safe custom job IDs", () => {
    const first = createWalletQueueJobId("confirmation", "withdrawal:unsafe", "0xabc:def");
    const repeated = createWalletQueueJobId("confirmation", "withdrawal:unsafe", "0xabc:def");
    const nextTransaction = createWalletQueueJobId("confirmation", "withdrawal:unsafe", "0xdef");

    assert.equal(first, repeated);
    assert.notEqual(first, nextTransaction);
    assert.equal(first.includes(":"), false);
    assert.match(first, /^confirmation-[a-f0-9]{64}$/);
    assert.throws(
      () => createWalletQueueJobId("withdrawal", "   "),
      /wallet_queue_withdrawal_id_required/,
    );
  });

  it("covers every authoritative chain timeout before attempts can exhaust", () => {
    for (const chainId of SUPPORTED_WALLET_CHAINS) {
      const timeout = getConfirmationTimeout(chainId);
      const requiredAttempts = confirmationAttemptBudget(timeout);
      assert.ok(confirmationCoverageMs(requiredAttempts) > timeout, `${chainId} budget`);
      assert.ok(confirmationCoverageMs(MAX_CONFIRMATION_ATTEMPTS) > timeout, `${chainId} max`);
    }

    assert.ok(
      confirmationCoverageMs(50) < getConfirmationTimeout("bitcoin"),
      "the previous 50-attempt policy must remain a proven regression case",
    );
  });
});
