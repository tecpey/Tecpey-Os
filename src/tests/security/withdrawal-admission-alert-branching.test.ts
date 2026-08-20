import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The withdrawal admission service fires user-facing security alerts about money
// movement: "submitted", "blocked", "under review". Which alert fires for which
// admission outcome — and that a replayed (idempotent retry) admission fires none
// — is load-bearing: the surrounding tests assert the resulting withdrawal STATE,
// but nothing guarded the alert branching itself. A regression could tell a user
// their blocked withdrawal was "submitted", or re-spam them on every client retry.
const SRC = readFileSync("src/lib/security/withdrawal-admission-service.ts", "utf8");

const GUARD_OPEN = "if (!transactionResult.replayed) {";
const FINAL_RETURN = "replayed: transactionResult.replayed,";
const NOTIFY_BLOCKED = "notifyWithdrawalBlocked(command.userId, {";
const NOTIFY_REQUESTED = "notifyWithdrawalRequested(command.userId, {";
const NOTIFY_RISKY = "notifyRiskyWithdrawal(command.userId, {";
const BLOCKED_CHECK = 'if (withdrawal.state === "blocked") {';
const REVIEW_CHECK = 'if (withdrawal.state === "compliance_review") {';

function occurrences(needle: string): number {
  return SRC.split(needle).length - 1;
}

test("every withdrawal alert is emitted only on a non-replayed admission", () => {
  const guardIdx = SRC.indexOf(GUARD_OPEN);
  const finalReturnIdx = SRC.indexOf(FINAL_RETURN);
  assert.ok(guardIdx > 0, "the replay guard must exist");
  assert.ok(finalReturnIdx > guardIdx, "the guarded section must close before the success return");

  // Each alert appears exactly once, so a single in-range check proves containment.
  for (const callSite of [NOTIFY_BLOCKED, NOTIFY_REQUESTED, NOTIFY_RISKY]) {
    assert.equal(occurrences(callSite), 1, `${callSite} must have exactly one call site`);
    const idx = SRC.indexOf(callSite);
    assert.ok(
      idx > guardIdx && idx < finalReturnIdx,
      `${callSite} must sit inside the !replayed guard so retries never re-alert`,
    );
  }
});

test("a blocked withdrawal alerts blocked and short-circuits before the submitted alert", () => {
  const blockedCheckIdx = SRC.indexOf(BLOCKED_CHECK);
  const notifyBlockedIdx = SRC.indexOf(NOTIFY_BLOCKED);
  const notifyRequestedIdx = SRC.indexOf(NOTIFY_REQUESTED);
  const blockedReturn403Idx = SRC.indexOf("code: 403", notifyBlockedIdx);

  assert.ok(blockedCheckIdx > 0, "the blocked-state branch must exist");
  assert.ok(
    blockedCheckIdx < notifyBlockedIdx && notifyBlockedIdx < notifyRequestedIdx,
    "the blocked alert must fire in the blocked branch, before the generic submitted alert",
  );
  assert.ok(
    blockedReturn403Idx > notifyBlockedIdx && blockedReturn403Idx < notifyRequestedIdx,
    "the blocked branch must return 403 before reaching the submitted alert",
  );
});

test("a compliance-review withdrawal alerts submitted then adds the risk-review alert", () => {
  const notifyRequestedIdx = SRC.indexOf(NOTIFY_REQUESTED);
  const reviewCheckIdx = SRC.indexOf(REVIEW_CHECK);
  const notifyRiskyIdx = SRC.indexOf(NOTIFY_RISKY);

  assert.ok(reviewCheckIdx > 0, "the compliance-review branch must exist");
  assert.ok(
    notifyRequestedIdx < reviewCheckIdx && reviewCheckIdx < notifyRiskyIdx,
    "the risk-review alert must be gated on compliance_review and follow the submitted alert",
  );
});
