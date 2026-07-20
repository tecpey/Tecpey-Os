import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const testPath =
  "src/tests/security/withdrawal-admission-race-postgres.test.ts";

describe("Withdrawal owner isolation and race source authority", () => {
  it("permanently requires cross-principal and cancel/Admin race evidence", async () => {
    const source = await readFile(testPath, "utf8");

    for (const invariant of [
      "cross-principal cancellation cannot reveal, mutate or release another user's withdrawal",
      "cancel racing Admin reject produces one terminal result, one release and one mandatory event",
      "withdrawal_not_found",
      "attackerReceipts",
      "Promise.all",
      "releases, 1",
      "receipts, 1",
      "events, 1",
    ]) {
      assert.equal(
        source.includes(invariant),
        true,
        `missing withdrawal race invariant: ${invariant}`,
      );
    }
  });
});
