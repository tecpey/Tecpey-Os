import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseJournalChallengeClaimPayload,
  parseJournalChallengeStatusPayload,
} from "../../lib/community-challenge-client";
import {
  getChallengeCycle,
  getCurrentChallenge,
  getNextChallenge,
} from "../../lib/community-challenges";

function status() {
  return {
    challengeId: "journal-reflection-week",
    weekKey: "2026-cycle-28",
    startsAt: "2026-07-16T00:00:00.000Z",
    endsAt: "2026-07-23T00:00:00.000Z",
    active: true,
    consentEnabled: true,
    closedTradeCount: 5,
    reflectedTradeCount: 4,
    reflectionRate: 0.8,
    score: 80,
    minTrades: 3,
    minRate: 0.8,
    eligible: true,
    completed: false,
    rewardedAt: null,
    reward: { xp: 200, badge: "journal-master" },
  };
}

describe("Community challenge UTC cycle", () => {
  it("selects the journal-reflection challenge for the audited July 2026 cycle", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const cycle = getChallengeCycle(now);
    assert.equal(cycle.weekNumber, 28);
    assert.equal(cycle.weekKey, "2026-cycle-28");
    assert.equal(cycle.startsAt, "2026-07-16T00:00:00.000Z");
    assert.equal(cycle.endsAt, "2026-07-23T00:00:00.000Z");
    assert.equal(cycle.challenge.id, "journal-reflection-week");
    assert.equal(getCurrentChallenge(now).id, "journal-reflection-week");
    assert.equal(getNextChallenge(now).id, "news-reaction-week");
  });

  it("uses UTC boundaries and resets deterministically at a new year", () => {
    const final = getChallengeCycle(new Date("2026-12-31T23:59:59.999Z"));
    const next = getChallengeCycle(new Date("2027-01-01T00:00:00.000Z"));
    assert.equal(final.year, 2026);
    assert.equal(next.year, 2027);
    assert.equal(next.weekNumber, 0);
    assert.equal(next.weekKey, "2027-cycle-00");
    assert.equal(next.startsAt, "2027-01-01T00:00:00.000Z");
  });

  it("rejects invalid cycle time", () => {
    assert.throws(() => getChallengeCycle(new Date("invalid")), /challenge_cycle_time_invalid/);
  });
});

describe("Community challenge client contract", () => {
  it("accepts a mathematically consistent status and claim response", () => {
    const parsedStatus = parseJournalChallengeStatusPayload({ ok: true, challenge: status() });
    assert.equal(parsedStatus?.eligible, true);
    assert.equal(parsedStatus?.score, 80);

    const parsedClaim = parseJournalChallengeClaimPayload({
      ok: true,
      challenge: {
        ...status(),
        completed: true,
        rewardedAt: "2026-07-21T12:30:00.000Z",
      },
      progress: { xp: 200, earnedBadges: ["journal-master"] },
      progressRevision: 2,
      changed: true,
      replayed: false,
    });
    assert.equal(parsedClaim?.challenge.completed, true);
    assert.equal(parsedClaim?.progressRevision, 2);
  });

  it("rejects forged counts, rates, score, reward and completion", () => {
    for (const forged of [
      { ...status(), reflectedTradeCount: 6 },
      { ...status(), reflectionRate: 1 },
      { ...status(), score: 99 },
      { ...status(), reward: { xp: 2_000, badge: "journal-master" } },
      { ...status(), completed: true, rewardedAt: null },
      { ...status(), minTrades: 1 },
    ]) {
      assert.equal(
        parseJournalChallengeStatusPayload({ ok: true, challenge: forged }),
        null,
      );
    }
  });

  it("rejects malformed claim wrappers", () => {
    assert.equal(parseJournalChallengeClaimPayload({ ok: true, challenge: status() }), null);
    assert.equal(parseJournalChallengeClaimPayload({
      ok: true,
      challenge: status(),
      progress: {},
      progressRevision: -1,
      changed: true,
      replayed: false,
    }), null);
  });
});
