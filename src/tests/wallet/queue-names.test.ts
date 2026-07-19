import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WITHDRAWAL_QUEUE_NAMES } from "../../lib/wallet/queue/names";

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
});
