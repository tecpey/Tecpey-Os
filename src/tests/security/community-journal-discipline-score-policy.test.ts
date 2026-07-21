import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateJournalDisciplineScore,
  JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES,
  JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES,
  type JournalDisciplineScoreCycleInput,
} from "../../lib/community-journal-discipline-score-policy";

function cycle(input: {
  index: number;
  outcome: "completed" | "not_completed";
  coverageBasisPoints: number;
}): JournalDisciplineScoreCycleInput {
  const end = new Date(Date.UTC(2026, 6, 20 - input.index * 7));
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const week = 30 - input.index;
  return {
    sourceEnrollmentId: `00000000-0000-4000-8000-${String(input.index + 1).padStart(12, "0")}`,
    cycleKey: `2026-W${String(week).padStart(2, "0")}`,
    cycleStartsAt: start.toISOString(),
    cycleEndsAt: end.toISOString(),
    outcome: input.outcome,
    completionCriteriaMet: input.outcome === "completed",
    coverageBasisPoints: input.coverageBasisPoints,
    sourceDigest: input.index.toString(16).padStart(64, "0"),
  };
}

describe("Journal Discipline Score v1 policy", () => {
  it("never produces a score before four finalized cycles", () => {
    for (let count = 0; count < JOURNAL_DISCIPLINE_SCORE_MINIMUM_CYCLES; count += 1) {
      const cycles = Array.from({ length: count }, (_, index) => cycle({
        index,
        outcome: "completed",
        coverageBasisPoints: 10_000,
      }));
      const result = evaluateJournalDisciplineScore(cycles).projection;
      assert.equal(result.status, "insufficient_evidence");
      assert.equal(result.scoreBasisPoints, null);
      assert.equal(result.remainingCycles, 4 - count);
      assert.equal(result.rank, null);
      assert.equal(result.rewardEligibility, false);
    }
  });

  it("activates at exactly four cycles and reaches exact endpoints", () => {
    const perfect = evaluateJournalDisciplineScore(
      Array.from({ length: 4 }, (_, index) => cycle({
        index,
        outcome: "completed",
        coverageBasisPoints: 10_000,
      })),
    ).projection;
    assert.equal(perfect.status, "available");
    assert.equal(perfect.completionConsistencyBasisPoints, 10_000);
    assert.equal(perfect.meanCoverageBasisPoints, 10_000);
    assert.equal(perfect.scoreBasisPoints, 10_000);

    const zero = evaluateJournalDisciplineScore(
      Array.from({ length: 4 }, (_, index) => cycle({
        index,
        outcome: "not_completed",
        coverageBasisPoints: 0,
      })),
    ).projection;
    assert.equal(zero.status, "available");
    assert.equal(zero.completionConsistencyBasisPoints, 0);
    assert.equal(zero.meanCoverageBasisPoints, 0);
    assert.equal(zero.scoreBasisPoints, 0);
  });

  it("uses exact half-up integer arithmetic and equal cycle weighting", () => {
    const result = evaluateJournalDisciplineScore([
      cycle({ index: 0, outcome: "completed", coverageBasisPoints: 3_333 }),
      cycle({ index: 1, outcome: "not_completed", coverageBasisPoints: 6_667 }),
      cycle({ index: 2, outcome: "not_completed", coverageBasisPoints: 7_500 }),
      cycle({ index: 3, outcome: "not_completed", coverageBasisPoints: 8_000 }),
    ]).projection;
    assert.equal(result.completionConsistencyBasisPoints, 2_500);
    assert.equal(result.meanCoverageBasisPoints, 6_375);
    assert.equal(result.scoreBasisPoints, 4_050);
  });

  it("accepts at most the canonical latest twelve-cycle window", () => {
    const twelve = Array.from(
      { length: JOURNAL_DISCIPLINE_SCORE_LOOKBACK_CYCLES },
      (_, index) => cycle({
        index,
        outcome: index % 2 === 0 ? "completed" : "not_completed",
        coverageBasisPoints: 8_000 - index,
      }),
    );
    const result = evaluateJournalDisciplineScore(twelve).projection;
    assert.equal(result.evaluatedCycles, 12);
    assert.equal(result.completedCycles, 6);
    assert.equal(result.windowEndsAt, twelve[0].cycleEndsAt);
    assert.equal(result.windowStartsAt, twelve[11].cycleStartsAt);
    assert.throws(
      () => evaluateJournalDisciplineScore([
        ...twelve,
        cycle({ index: 12, outcome: "completed", coverageBasisPoints: 8_000 }),
      ]),
      /journal_discipline_window_exceeded/,
    );
  });

  it("rejects duplicate cycles, duplicate sources and noncanonical order", () => {
    const first = cycle({ index: 0, outcome: "completed", coverageBasisPoints: 8_000 });
    const second = cycle({ index: 1, outcome: "completed", coverageBasisPoints: 8_000 });
    assert.throws(
      () => evaluateJournalDisciplineScore([
        first,
        { ...second, cycleKey: first.cycleKey },
      ]),
      /journal_discipline_duplicate_cycle/,
    );
    assert.throws(
      () => evaluateJournalDisciplineScore([
        first,
        { ...second, sourceEnrollmentId: first.sourceEnrollmentId },
      ]),
      /journal_discipline_duplicate_cycle/,
    );
    assert.throws(
      () => evaluateJournalDisciplineScore([second, first]),
      /journal_discipline_cycle_order_invalid/,
    );
  });

  it("rejects forged outcome, coverage and digest evidence", () => {
    const valid = cycle({ index: 0, outcome: "completed", coverageBasisPoints: 8_000 });
    assert.throws(
      () => evaluateJournalDisciplineScore([
        { ...valid, completionCriteriaMet: false },
      ]),
      /journal_discipline_cycle_invalid/,
    );
    assert.throws(
      () => evaluateJournalDisciplineScore([
        { ...valid, coverageBasisPoints: 10_001 },
      ]),
      /journal_discipline_cycle_coverage_invalid/,
    );
    assert.throws(
      () => evaluateJournalDisciplineScore([
        { ...valid, sourceDigest: "not-a-digest" },
      ]),
      /journal_discipline_cycle_invalid/,
    );
  });
});
