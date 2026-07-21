import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJournalDisciplineScorePayload } from "../../lib/community-journal-discipline-score-client";

function availableScore() {
  return {
    policyVersion: "journal-discipline-score-v1",
    scope: "journal_discipline_only",
    status: "available",
    lookbackCycles: 12,
    minimumCycles: 4,
    remainingCycles: 0,
    evaluatedCycles: 4,
    completedCycles: 3,
    notCompletedCycles: 1,
    completionConsistencyBasisPoints: 7_500,
    meanCoverageBasisPoints: 8_000,
    scoreBasisPoints: 7_700,
    windowStartsAt: "2026-06-22T00:00:00.000Z",
    windowEndsAt: "2026-07-20T00:00:00.000Z",
    rank: null,
    percentile: null,
    publicLeaderboardEligible: false,
    rewardEligibility: false,
    mentorDecisionEligible: false,
    instructorDecisionEligible: false,
    scholarshipEligibility: false,
    evaluatedEvidenceDigest: "a".repeat(64),
  };
}

describe("Journal Discipline Score client contract", () => {
  it("accepts an exact mathematically coherent private score", () => {
    const parsed = parseJournalDisciplineScorePayload({
      ok: true,
      score: availableScore(),
    });
    assert.equal(parsed?.status, "available");
    assert.equal(parsed?.scoreBasisPoints, 7_700);
    assert.equal(parsed?.rank, null);
  });

  it("accepts insufficient evidence only with a null score", () => {
    const score = {
      ...availableScore(),
      status: "insufficient_evidence",
      remainingCycles: 1,
      evaluatedCycles: 3,
      completedCycles: 2,
      notCompletedCycles: 1,
      completionConsistencyBasisPoints: 6_667,
      meanCoverageBasisPoints: 8_000,
      scoreBasisPoints: null,
    };
    const parsed = parseJournalDisciplineScorePayload({ ok: true, score });
    assert.equal(parsed?.status, "insufficient_evidence");
    assert.equal(parsed?.scoreBasisPoints, null);
  });

  it("rejects unknown fields and forged decision outcomes", () => {
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: { ...availableScore(), unexpected: true },
      }),
      undefined,
    );
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: { ...availableScore(), rank: 1 },
      }),
      undefined,
    );
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: { ...availableScore(), rewardEligibility: true },
      }),
      undefined,
    );
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: { ...availableScore(), mentorDecisionEligible: true },
      }),
      undefined,
    );
  });

  it("rejects inconsistent counts, completion arithmetic and weighted score", () => {
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: { ...availableScore(), notCompletedCycles: 2 },
      }),
      undefined,
    );
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: {
          ...availableScore(),
          completionConsistencyBasisPoints: 7_499,
        },
      }),
      undefined,
    );
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: { ...availableScore(), scoreBasisPoints: 7_701 },
      }),
      undefined,
    );
  });

  it("rejects premature score activation and malformed evidence digest", () => {
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: {
          ...availableScore(),
          status: "available",
          evaluatedCycles: 3,
          completedCycles: 3,
          notCompletedCycles: 0,
          completionConsistencyBasisPoints: 10_000,
          remainingCycles: 1,
          scoreBasisPoints: 9_200,
        },
      }),
      undefined,
    );
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: { ...availableScore(), evaluatedEvidenceDigest: "forged" },
      }),
      undefined,
    );
  });

  it("rejects corrupt or contradictory evidence windows", () => {
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: {
          ...availableScore(),
          windowStartsAt: "2026-07-21T00:00:00.000Z",
          windowEndsAt: "2026-07-20T00:00:00.000Z",
        },
      }),
      undefined,
    );
    assert.equal(
      parseJournalDisciplineScorePayload({
        ok: true,
        score: {
          ...availableScore(),
          evaluatedCycles: 0,
          completedCycles: 0,
          notCompletedCycles: 0,
          completionConsistencyBasisPoints: 0,
          meanCoverageBasisPoints: 0,
          status: "insufficient_evidence",
          remainingCycles: 4,
          scoreBasisPoints: null,
        },
      }),
      undefined,
    );
  });
});
