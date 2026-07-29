import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCommunityReputationEvidencePayload } from "../../lib/community-reputation-evidence-client";

const HASH = "a".repeat(64);

function latest() {
  return {
    evidenceVersion: "community-reputation-evidence-v1",
    sourceType: "official_journal_challenge_finalization",
    challengeId: "journal-reflection-week",
    challengeVersion: "journal-reflection-v1",
    cycle: {
      key: "2026-W29",
      startsAt: "2026-07-13T00:00:00.000Z",
      endsAt: "2026-07-20T00:00:00.000Z",
    },
    outcome: "completed",
    finalizedAt: "2026-07-20T00:05:00.000Z",
    eligibleClosedTrades: 5,
    validReflections: 4,
    coverageBasisPoints: 8000,
    completionCriteriaMet: true,
    finalizationSource: "worker",
    sourceDigest: HASH,
  };
}

function nonEmptyPayload() {
  return {
    ok: true,
    summary: {
      evidenceVersion: "community-reputation-evidence-v1",
      policyStatus: "evidence_only",
      finalizedCycles: 2,
      completedCycles: 1,
      notCompletedCycles: 1,
      eligibleClosedTrades: 9,
      validReflections: 7,
      aggregateCoverageBasisPoints: 7778,
      firstFinalizedAt: "2026-07-13T00:05:00.000Z",
      latestFinalizedAt: "2026-07-20T00:05:00.000Z",
      latest: latest(),
      score: null,
      rank: null,
      rewardEligibility: false,
      mentorDecisionEligible: false,
      instructorDecisionEligible: false,
    },
  };
}

function emptyPayload() {
  return {
    ok: true,
    summary: {
      evidenceVersion: "community-reputation-evidence-v1",
      policyStatus: "evidence_only",
      finalizedCycles: 0,
      completedCycles: 0,
      notCompletedCycles: 0,
      eligibleClosedTrades: 0,
      validReflections: 0,
      aggregateCoverageBasisPoints: 0,
      firstFinalizedAt: null,
      latestFinalizedAt: null,
      latest: null,
      score: null,
      rank: null,
      rewardEligibility: false,
      mentorDecisionEligible: false,
      instructorDecisionEligible: false,
    },
  };
}

describe("Community reputation evidence client parser", () => {
  it("accepts an exact empty evidence-only summary", () => {
    const parsed = parseCommunityReputationEvidencePayload(emptyPayload());
    assert.ok(parsed);
    assert.equal(parsed.finalizedCycles, 0);
    assert.equal(parsed.score, null);
    assert.equal(parsed.rank, null);
    assert.equal(parsed.rewardEligibility, false);
  });

  it("accepts a consistent non-empty immutable evidence summary", () => {
    const parsed = parseCommunityReputationEvidencePayload(nonEmptyPayload());
    assert.ok(parsed);
    assert.equal(parsed.finalizedCycles, 2);
    assert.equal(parsed.aggregateCoverageBasisPoints, 7778);
    assert.equal(parsed.latest?.sourceDigest, HASH);
    assert.equal(parsed.latest?.completionCriteriaMet, true);
  });

  it("rejects unknown root, summary, latest and cycle fields", () => {
    assert.equal(
      parseCommunityReputationEvidencePayload({ ...nonEmptyPayload(), extra: true }),
      undefined,
    );

    const summaryExtra = nonEmptyPayload();
    Object.assign(summaryExtra.summary, { reputationScore: 80 });
    assert.equal(parseCommunityReputationEvidencePayload(summaryExtra), undefined);

    const latestExtra = nonEmptyPayload();
    Object.assign(latestExtra.summary.latest, { enrollmentId: "private" });
    assert.equal(parseCommunityReputationEvidencePayload(latestExtra), undefined);

    const cycleExtra = nonEmptyPayload();
    Object.assign(cycleExtra.summary.latest.cycle, { timezone: "UTC" });
    assert.equal(parseCommunityReputationEvidencePayload(cycleExtra), undefined);
  });

  it("rejects forged score, rank, reward, Mentor and Instructor authority", () => {
    for (const [field, value] of [
      ["score", 80],
      ["rank", 1],
      ["rewardEligibility", true],
      ["mentorDecisionEligible", true],
      ["instructorDecisionEligible", true],
    ] as const) {
      const payload = nonEmptyPayload();
      (payload.summary as Record<string, unknown>)[field] = value;
      assert.equal(
        parseCommunityReputationEvidencePayload(payload),
        undefined,
        `expected forged ${field} to fail`,
      );
    }
  });

  it("rejects inconsistent aggregate counts and coverage", () => {
    const cycleCount = nonEmptyPayload();
    cycleCount.summary.completedCycles = 2;
    assert.equal(parseCommunityReputationEvidencePayload(cycleCount), undefined);

    const reflectionCount = nonEmptyPayload();
    reflectionCount.summary.validReflections = 10;
    assert.equal(parseCommunityReputationEvidencePayload(reflectionCount), undefined);

    const coverage = nonEmptyPayload();
    coverage.summary.aggregateCoverageBasisPoints = 7777;
    assert.equal(parseCommunityReputationEvidencePayload(coverage), undefined);
  });

  it("rejects latest evidence with invalid coverage, outcome, criteria or digest", () => {
    const coverage = nonEmptyPayload();
    coverage.summary.latest.coverageBasisPoints = 7999;
    assert.equal(parseCommunityReputationEvidencePayload(coverage), undefined);

    const criteria = nonEmptyPayload();
    criteria.summary.latest.completionCriteriaMet = false;
    assert.equal(parseCommunityReputationEvidencePayload(criteria), undefined);

    const outcome = nonEmptyPayload();
    outcome.summary.latest.outcome = "not_completed";
    assert.equal(parseCommunityReputationEvidencePayload(outcome), undefined);

    const digest = nonEmptyPayload();
    digest.summary.latest.sourceDigest = "short";
    assert.equal(parseCommunityReputationEvidencePayload(digest), undefined);
  });

  it("rejects inconsistent chronology and empty/non-empty shape confusion", () => {
    const chronology = nonEmptyPayload();
    chronology.summary.latestFinalizedAt = "2026-07-20T00:06:00.000Z";
    assert.equal(parseCommunityReputationEvidencePayload(chronology), undefined);

    const reverse = nonEmptyPayload();
    reverse.summary.firstFinalizedAt = "2026-07-21T00:00:00.000Z";
    assert.equal(parseCommunityReputationEvidencePayload(reverse), undefined);

    const emptyWithLatest = emptyPayload();
    emptyWithLatest.summary.latest = latest() as never;
    assert.equal(parseCommunityReputationEvidencePayload(emptyWithLatest), undefined);
  });

  it("rounds basis points deterministically at one-third and two-thirds", () => {
    const oneThird = nonEmptyPayload();
    oneThird.summary.finalizedCycles = 1;
    oneThird.summary.completedCycles = 0;
    oneThird.summary.notCompletedCycles = 1;
    oneThird.summary.eligibleClosedTrades = 3;
    oneThird.summary.validReflections = 1;
    oneThird.summary.aggregateCoverageBasisPoints = 3333;
    oneThird.summary.latest.eligibleClosedTrades = 3;
    oneThird.summary.latest.validReflections = 1;
    oneThird.summary.latest.coverageBasisPoints = 3333;
    oneThird.summary.latest.completionCriteriaMet = false;
    oneThird.summary.latest.outcome = "not_completed";
    assert.ok(parseCommunityReputationEvidencePayload(oneThird));

    const twoThirds = structuredClone(oneThird);
    twoThirds.summary.validReflections = 2;
    twoThirds.summary.aggregateCoverageBasisPoints = 6667;
    twoThirds.summary.latest.validReflections = 2;
    twoThirds.summary.latest.coverageBasisPoints = 6667;
    assert.ok(parseCommunityReputationEvidencePayload(twoThirds));
  });
});
