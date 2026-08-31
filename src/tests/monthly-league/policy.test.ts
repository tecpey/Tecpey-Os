import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACADEMY_MONTHLY_LEAGUE_AUTOMATIC_ENTITLEMENTS_ENABLED,
  ACADEMY_MONTHLY_LEAGUE_MIN_PUBLIC_COHORT,
  ACADEMY_MONTHLY_LEAGUE_WEIGHTS,
  academyMonthlyLeagueIneligibilityReasons,
  academyMonthlyLeagueRewardProposal,
  calculateAcademyMonthlyLeagueScore,
  denseRankAcademyMonthlyLeague,
} from "../../lib/academy-monthly-league-policy";

describe("Academy monthly league recognition policy", () => {
  it("uses an exact 10,000-basis-point educational weighting", () => {
    assert.equal(Object.values(ACADEMY_MONTHLY_LEAGUE_WEIGHTS)
      .reduce((sum, value) => sum + value, 0), 10_000);
    assert.equal(ACADEMY_MONTHLY_LEAGUE_MIN_PUBLIC_COHORT, 25);
  });

  it("calculates a deterministic educational score without wealth, volume or speed inputs", () => {
    assert.deepEqual(calculateAcademyMonthlyLeagueScore({
      assessmentAccuracyBps: 9_000,
      masteryImprovementBps: 8_000,
      learningConsistencyBps: 7_000,
      journalQualityBps: 8_000,
      ruleComplianceBps: 10_000,
      repairCompletionBps: 6_000,
      arenaTradeQualityBps: 8_500,
    }), { scoreBps: 8_300, band: "gold" });
  });

  it("requires consent, core graduation and bounded multi-domain evidence", () => {
    assert.deepEqual(academyMonthlyLeagueIneligibilityReasons({
      scoringConsent: false,
      publicRankingConsent: false,
      integrityHold: true,
      appealHold: true,
      completedCoreTerms: 6,
      eligibleAssessmentCount: 3,
      activeLearningDays: 7,
      finalizedArenaSessions: 5,
      mentorReviewedReflections: 1,
    }), [
      "scoring_consent_required",
      "public_ranking_consent_required",
      "integrity_review_pending",
      "appeal_review_pending",
      "core_terms_incomplete",
      "assessment_evidence_insufficient",
      "learning_days_insufficient",
      "arena_evidence_insufficient",
      "mentor_reviewed_reflections_insufficient",
    ]);
  });

  it("uses dense rank so equal scores share the same place", () => {
    assert.deepEqual(denseRankAcademyMonthlyLeague([
      { id: "c", scoreBps: 7_000 },
      { id: "a", scoreBps: 9_000 },
      { id: "b", scoreBps: 9_000 },
      { id: "d", scoreBps: 6_000 },
    ]), [
      { id: "a", scoreBps: 9_000, rank: 1 },
      { id: "b", scoreBps: 9_000, rank: 1 },
      { id: "c", scoreBps: 7_000, rank: 2 },
      { id: "d", scoreBps: 6_000, rank: 3 },
    ]);
  });

  it("keeps every league rank recognition-only", () => {
    assert.equal(ACADEMY_MONTHLY_LEAGUE_AUTOMATIC_ENTITLEMENTS_ENABLED, false);
    for (const rank of [1, 3, 10, 11]) {
      assert.deepEqual(academyMonthlyLeagueRewardProposal(rank), {
        rank,
        arenaProDays: 0,
        cashPoolShareBps: 0,
        cashDisposition: "not_permitted_in_learning_league",
      });
    }
    assert.throws(() => academyMonthlyLeagueRewardProposal(1, 0), /tie_count_invalid/);
  });
});
