import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseOfficialJournalChallengePayload,
} from "../../lib/community-journal-challenge-client";

type ChallengeFixture = {
  challengeId: string;
  challengeVersion: string;
  cycle: {
    key: string;
    startsAt: string;
    endsAt: string;
  };
  consentEnabled: boolean;
  status: string;
  enrollmentId: string | null;
  revision: number | null;
  startedAt: string | null;
  evaluatedAt: string | null;
  completedAt: string | null;
  progress: {
    eligibleClosedTrades: number;
    validReflections: number;
    coverageRate: number;
    minimumTrades: number;
    requiredRate: number;
    eligibleToComplete: boolean;
  };
  rewards: {
    xp: number;
    badge: string | null;
    financialReward: string | null;
    status: string;
  };
};

function validState(): ChallengeFixture {
  return {
    challengeId: "journal-reflection-week",
    challengeVersion: "journal-reflection-v1",
    cycle: {
      key: "2026-W30",
      startsAt: "2026-07-20T00:00:00.000Z",
      endsAt: "2026-07-27T00:00:00.000Z",
    },
    consentEnabled: true,
    status: "active",
    enrollmentId: "80ad5b3a-f6cf-49bb-bcc3-ecb812ec31f7",
    revision: 2,
    startedAt: "2026-07-21T06:00:00.000Z",
    evaluatedAt: "2026-07-21T07:00:00.000Z",
    completedAt: null,
    progress: {
      eligibleClosedTrades: 5,
      validReflections: 3,
      coverageRate: 0.6,
      minimumTrades: 3,
      requiredRate: 0.8,
      eligibleToComplete: false,
    },
    rewards: {
      xp: 0,
      badge: null,
      financialReward: null,
      status: "disabled",
    },
  };
}

describe("Official journal challenge client contract", () => {
  it("accepts a coherent active state", () => {
    const parsed = parseOfficialJournalChallengePayload({ ok: true, state: validState() });
    assert.ok(parsed);
    assert.equal(parsed.status, "active");
    assert.equal(parsed.progress.coverageRate, 0.6);
  });

  it("rejects forged progress and reward fields", () => {
    for (const mutate of [
      (state: ChallengeFixture) => { state.progress.coverageRate = 0.8; },
      (state: ChallengeFixture) => { state.progress.eligibleToComplete = true; },
      (state: ChallengeFixture) => { state.rewards.xp = 10; },
      (state: ChallengeFixture) => { state.rewards.badge = "journal-master"; },
    ]) {
      const state = validState();
      mutate(state);
      assert.equal(parseOfficialJournalChallengePayload({ ok: true, state }), null);
    }
  });

  it("rejects completion below the canonical threshold", () => {
    const state = validState();
    state.status = "completed";
    state.completedAt = "2026-07-21T07:00:00.000Z";
    assert.equal(parseOfficialJournalChallengePayload({ ok: true, state }), null);
  });

  it("accepts five eligible trades with four reflections as completed", () => {
    const state = validState();
    state.status = "completed";
    state.completedAt = "2026-07-21T07:00:00.000Z";
    state.progress.validReflections = 4;
    state.progress.coverageRate = 0.8;
    state.progress.eligibleToComplete = true;
    const parsed = parseOfficialJournalChallengePayload({ ok: true, state });
    assert.ok(parsed);
    assert.equal(parsed.status, "completed");
  });

  it("rejects enrollment fields on not-joined state", () => {
    const state = validState();
    state.status = "not_joined";
    state.progress.eligibleClosedTrades = 0;
    state.progress.validReflections = 0;
    state.progress.coverageRate = 0;
    state.enrollmentId = null;
    state.revision = null;
    state.startedAt = null;
    state.evaluatedAt = null;
    assert.ok(parseOfficialJournalChallengePayload({ ok: true, state }));

    state.enrollmentId = "forged-enrollment-id";
    assert.equal(parseOfficialJournalChallengePayload({ ok: true, state }), null);
  });
});
