export const ACADEMY_CORE_TERM_COUNT = 7 as const;
export const ACADEMY_INFINITE_GROWTH_TERM_NUMBER = 8 as const;
export const ACADEMY_INFINITE_GROWTH_POLICY_VERSION =
  "academy-infinite-growth-v1" as const;

export const ACADEMY_INFINITE_GROWTH_CYCLE = [
  "assess",
  "plan",
  "practice",
  "reflect",
  "verify",
  "adapt",
] as const;

export type AcademyInfiniteGrowthCycleStage =
  (typeof ACADEMY_INFINITE_GROWTH_CYCLE)[number];

export type AcademyInfiniteGrowthAccess =
  | { state: "locked"; reason: "core_terms_incomplete"; nextRequiredTerm: number }
  | { state: "review"; reason: "integrity_review_pending"; nextRequiredTerm: null }
  | { state: "eligible"; reason: null; nextRequiredTerm: null };

export type AcademyScoreChannel =
  | "learning_xp"
  | "mastery_evidence"
  | "league_score"
  | "credential"
  | "special_opportunity";

export const ACADEMY_SCORE_CHANNEL_POLICY = {
  learning_xp: {
    purpose: "engagement_and_progress",
    competitive: false,
    publicByDefault: false,
    mayGrantFinancialValue: false,
  },
  mastery_evidence: {
    purpose: "verified_competence",
    competitive: false,
    publicByDefault: false,
    mayGrantFinancialValue: false,
  },
  league_score: {
    purpose: "opt_in_seasonal_comparison",
    competitive: true,
    publicByDefault: false,
    mayGrantFinancialValue: false,
  },
  credential: {
    purpose: "portable_verified_achievement",
    competitive: false,
    publicByDefault: false,
    mayGrantFinancialValue: false,
  },
  special_opportunity: {
    purpose: "separately_governed_formal_program",
    competitive: false,
    publicByDefault: false,
    mayGrantFinancialValue: false,
  },
} as const satisfies Record<AcademyScoreChannel, {
  purpose: string;
  competitive: boolean;
  publicByDefault: boolean;
  mayGrantFinancialValue: boolean;
}>;

export function resolveAcademyInfiniteGrowthAccess(input: {
  completedCoreTerms: number;
  integrityHold: boolean;
}): AcademyInfiniteGrowthAccess {
  const completed = Number.isSafeInteger(input.completedCoreTerms)
    ? Math.max(0, Math.min(ACADEMY_CORE_TERM_COUNT, input.completedCoreTerms))
    : 0;
  if (completed < ACADEMY_CORE_TERM_COUNT) {
    return {
      state: "locked",
      reason: "core_terms_incomplete",
      nextRequiredTerm: completed + 1,
    };
  }
  if (input.integrityHold) {
    return {
      state: "review",
      reason: "integrity_review_pending",
      nextRequiredTerm: null,
    };
  }
  return { state: "eligible", reason: null, nextRequiredTerm: null };
}

export function isAcademyInfiniteGrowthCycleComplete(
  stages: readonly AcademyInfiniteGrowthCycleStage[],
): boolean {
  return ACADEMY_INFINITE_GROWTH_CYCLE.every(
    (stage, index) => stages[index] === stage,
  );
}

export function mayScoreChannelCreateAutomaticEntitlement(
  _channel: AcademyScoreChannel,
): false {
  return false;
}
