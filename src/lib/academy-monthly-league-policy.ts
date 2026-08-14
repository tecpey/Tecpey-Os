export const ACADEMY_MONTHLY_LEAGUE_POLICY_VERSION =
  "academy-monthly-league-shadow-v1" as const;

export const ACADEMY_MONTHLY_LEAGUE_MIN_PUBLIC_COHORT = 25;

export const ACADEMY_MONTHLY_LEAGUE_WEIGHTS = {
  assessmentAccuracy: 2_500,
  masteryImprovement: 2_000,
  learningConsistency: 1_500,
  journalQuality: 1_500,
  ruleCompliance: 1_500,
  repairCompletion: 1_000,
} as const;

export type AcademyMonthlyLeagueScoreInput = {
  assessmentAccuracyBps: number;
  masteryImprovementBps: number;
  learningConsistencyBps: number;
  journalQualityBps: number;
  ruleComplianceBps: number;
  repairCompletionBps: number;
};

export type AcademyMonthlyLeagueEligibility = {
  scoringConsent: boolean;
  publicRankingConsent: boolean;
  integrityHold: boolean;
  appealHold: boolean;
  completedCoreTerms: number;
  eligibleAssessmentCount: number;
  activeLearningDays: number;
  finalizedArenaSessions: number;
  mentorReviewedReflections: number;
};

export type AcademyMonthlyLeagueBand =
  | "foundation"
  | "bronze"
  | "silver"
  | "gold"
  | "diamond";

export type AcademyMonthlyLeagueRewardProposal = {
  rank: number;
  arenaProDays: 0 | 30 | 60 | 90;
  cashPoolShareBps: number;
  cashDisposition: "not_eligible" | "c_level_compliance_approval_required";
};

const SCORE_KEYS = Object.keys(
  ACADEMY_MONTHLY_LEAGUE_WEIGHTS,
) as Array<keyof typeof ACADEMY_MONTHLY_LEAGUE_WEIGHTS>;

function requireBps(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`academy_monthly_league_${name}_invalid`);
  }
  return value;
}

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function academyMonthlyLeagueIneligibilityReasons(
  input: AcademyMonthlyLeagueEligibility,
): string[] {
  const reasons: string[] = [];
  if (!input.scoringConsent) reasons.push("scoring_consent_required");
  if (!input.publicRankingConsent) reasons.push("public_ranking_consent_required");
  if (input.integrityHold) reasons.push("integrity_review_pending");
  if (input.appealHold) reasons.push("appeal_review_pending");
  if (!Number.isSafeInteger(input.completedCoreTerms) || input.completedCoreTerms < 7) {
    reasons.push("core_terms_incomplete");
  }
  if (!Number.isSafeInteger(input.eligibleAssessmentCount) || input.eligibleAssessmentCount < 4) {
    reasons.push("assessment_evidence_insufficient");
  }
  if (!Number.isSafeInteger(input.activeLearningDays) || input.activeLearningDays < 8) {
    reasons.push("learning_days_insufficient");
  }
  if (!Number.isSafeInteger(input.finalizedArenaSessions) || input.finalizedArenaSessions < 6) {
    reasons.push("arena_evidence_insufficient");
  }
  if (
    !Number.isSafeInteger(input.mentorReviewedReflections) ||
    input.mentorReviewedReflections < 2
  ) {
    reasons.push("mentor_reviewed_reflections_insufficient");
  }
  return reasons;
}

export function calculateAcademyMonthlyLeagueScore(
  input: AcademyMonthlyLeagueScoreInput,
): { scoreBps: number; band: AcademyMonthlyLeagueBand } {
  const normalized = {
    assessmentAccuracy: requireBps(input.assessmentAccuracyBps, "assessment_accuracy"),
    masteryImprovement: requireBps(input.masteryImprovementBps, "mastery_improvement"),
    learningConsistency: requireBps(input.learningConsistencyBps, "learning_consistency"),
    journalQuality: requireBps(input.journalQualityBps, "journal_quality"),
    ruleCompliance: requireBps(input.ruleComplianceBps, "rule_compliance"),
    repairCompletion: requireBps(input.repairCompletionBps, "repair_completion"),
  };
  const weighted = SCORE_KEYS.reduce(
    (sum, key) => sum + normalized[key] * ACADEMY_MONTHLY_LEAGUE_WEIGHTS[key],
    0,
  );
  const scoreBps = roundHalfUp(weighted, 10_000);
  const band: AcademyMonthlyLeagueBand = scoreBps >= 9_000
    ? "diamond"
    : scoreBps >= 8_000
      ? "gold"
      : scoreBps >= 7_000
        ? "silver"
        : scoreBps >= 6_000
          ? "bronze"
          : "foundation";
  return { scoreBps, band };
}

export function denseRankAcademyMonthlyLeague<T extends { scoreBps: number }>(
  entries: readonly T[],
): Array<T & { rank: number }> {
  const sorted = [...entries].sort((left, right) => right.scoreBps - left.scoreBps);
  let rank = 0;
  let previousScore: number | null = null;
  return sorted.map((entry) => {
    requireBps(entry.scoreBps, "score");
    if (entry.scoreBps !== previousScore) rank += 1;
    previousScore = entry.scoreBps;
    return { ...entry, rank };
  });
}

export function academyMonthlyLeagueRewardProposal(
  rank: number,
  tiedLearners = 1,
): AcademyMonthlyLeagueRewardProposal {
  if (!Number.isSafeInteger(rank) || rank < 1) {
    throw new Error("academy_monthly_league_rank_invalid");
  }
  if (!Number.isSafeInteger(tiedLearners) || tiedLearners < 1) {
    throw new Error("academy_monthly_league_tie_count_invalid");
  }
  if (rank === 1) {
    return {
      rank,
      arenaProDays: 90,
      cashPoolShareBps: Math.floor(5_000 / tiedLearners),
      cashDisposition: "c_level_compliance_approval_required",
    };
  }
  if (rank <= 3) {
    return {
      rank,
      arenaProDays: 60,
      cashPoolShareBps: Math.floor((rank === 2 ? 3_000 : 2_000) / tiedLearners),
      cashDisposition: "c_level_compliance_approval_required",
    };
  }
  if (rank <= 10) {
    return {
      rank,
      arenaProDays: 30,
      cashPoolShareBps: 0,
      cashDisposition: "not_eligible",
    };
  }
  return {
    rank,
    arenaProDays: 0,
    cashPoolShareBps: 0,
    cashDisposition: "not_eligible",
  };
}
