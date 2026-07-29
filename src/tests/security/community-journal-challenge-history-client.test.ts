import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOfficialJournalChallengeHistoryPayload } from "../../lib/community-journal-challenge-history-client";

function fixture(status: "completed" | "not_completed" = "completed") {
  return {
    challengeId: "journal-reflection-week",
    challengeVersion: "journal-reflection-v1",
    cycle: {
      key: "2026-W29",
      startsAt: "2026-07-13T00:00:00.000Z",
      endsAt: "2026-07-20T00:00:00.000Z",
    },
    status,
    finalizedAt: status === "completed"
      ? "2026-07-18T10:00:00.000Z"
      : "2026-07-20T00:05:00.000Z",
    progress: status === "completed"
      ? {
          eligibleClosedTrades: 5,
          validReflections: 4,
          coverageRate: 0.8,
          minimumTrades: 3,
          requiredRate: 0.8,
          eligibleToComplete: true,
        }
      : {
          eligibleClosedTrades: 4,
          validReflections: 3,
          coverageRate: 0.75,
          minimumTrades: 3,
          requiredRate: 0.8,
          eligibleToComplete: false,
        },
    rewards: { xp: 0, badge: null, financialReward: null, status: "disabled" },
  };
}

describe("Finalized journal challenge history client", () => {
  it("accepts interactive completion before cycle end", () => {
    const parsed = parseOfficialJournalChallengeHistoryPayload({
      ok: true,
      latestFinalized: fixture("completed"),
    });
    assert.ok(parsed);
    assert.equal(parsed.status, "completed");
  });

  it("accepts worker not-completed result after cycle end", () => {
    const parsed = parseOfficialJournalChallengeHistoryPayload({
      ok: true,
      latestFinalized: fixture("not_completed"),
    });
    assert.ok(parsed);
    assert.equal(parsed.status, "not_completed");
  });

  it("distinguishes no history from an invalid payload", () => {
    assert.equal(parseOfficialJournalChallengeHistoryPayload({ ok: true, latestFinalized: null }), null);
    assert.equal(parseOfficialJournalChallengeHistoryPayload({ ok: true }), undefined);
    assert.equal(parseOfficialJournalChallengeHistoryPayload({ ok: false, latestFinalized: null }), undefined);
  });

  it("rejects forged thresholds, status and rewards", () => {
    const forgedRate = fixture("completed");
    forgedRate.progress.coverageRate = 1;
    assert.equal(parseOfficialJournalChallengeHistoryPayload({ ok: true, latestFinalized: forgedRate }), undefined);

    const forgedStatus = fixture("not_completed");
    forgedStatus.progress.validReflections = 4;
    forgedStatus.progress.coverageRate = 1;
    forgedStatus.progress.eligibleToComplete = true;
    assert.equal(parseOfficialJournalChallengeHistoryPayload({ ok: true, latestFinalized: forgedStatus }), undefined);

    const forgedReward = fixture("completed");
    forgedReward.rewards.xp = 100;
    assert.equal(parseOfficialJournalChallengeHistoryPayload({ ok: true, latestFinalized: forgedReward }), undefined);
  });
});
