export const MENTOR_INTELLIGENCE_POLICY_VERSION =
  "tecpey-mentor-intelligence-v1" as const;

export const MENTOR_INTELLIGENCE_ROLE = {
  productRole: "personal_financial_education_mentor",
  decisionOwner: "learner",
  mayEducate: true,
  mayPersonalizeLearning: true,
  mayExplainMarketContext: true,
  mayCreatePracticeScenarios: true,
  mayCreateChallenges: true,
  mayRecommendLearningActions: true,
  mayRecommendBuySell: false,
  mayPromiseReturns: false,
  mayExecuteOrders: false,
  mayMoveFunds: false,
} as const;

export const MENTOR_PERSONALIZATION_INPUTS = [
  "academy_progress",
  "mastery_evidence",
  "quiz_history",
  "learning_velocity",
  "strengths",
  "weaknesses",
  "streak",
  "reflection_history",
  "journal_learning_signals",
  "trading_arena_learning_state",
  "league_learning_state",
  "followed_topics",
  "followed_coins",
  "followed_tools",
  "verified_news_context",
  "verified_market_context",
] as const;

export const MENTOR_ALLOWED_OUTPUTS = [
  "concept_explanation",
  "learning_path_adjustment",
  "lesson_recommendation",
  "quiz_recommendation",
  "practice_scenario",
  "challenge",
  "reflection_prompt",
  "journal_prompt",
  "risk_coaching",
  "market_context_explanation",
  "news_explanation",
  "learning_opportunity",
  "progress_feedback",
  "smart_notification_candidate",
] as const;

export const MENTOR_PROHIBITED_OUTPUTS = [
  "personalized_buy_signal",
  "personalized_sell_signal",
  "guaranteed_return",
  "guaranteed_prediction",
  "leverage_recommendation",
  "autonomous_order_execution",
  "autonomous_fund_movement",
  "secret_or_credential_request",
] as const;

export const MENTOR_SMART_NOTIFICATION_CATEGORIES = [
  "educational",
  "news_context",
  "risk_warning",
  "practice_reminder",
  "learning_opportunity",
  "progress_feedback",
] as const;

export const MENTOR_SMART_NOTIFICATION_REQUIREMENTS = {
  notificationClass: "mentor_ai",
  candidateOnly: true,
  deterministicPolicyRequired: true,
  reasonForDeliveryRequired: true,
  frequencyCapRequired: true,
  quietHoursRequired: true,
  userPreferenceRequiredForOptionalMessages: true,
  optOutRequiredForOptionalMessages: true,
  authoritativeAudienceRequired: true,
  mayBypassNotificationPolicy: false,
} as const;

export const MENTOR_MARKET_INTELLIGENCE_POLICY = {
  verifiedEvidenceRequired: true,
  sourceProvenanceRequired: true,
  uncertaintyRequired: true,
  scenarioBased: true,
  predictionMayBeRecordedForEvaluation: true,
  predictionMayBecomeTradingSignal: false,
  personalizedExecutionInstruction: false,
} as const;

export type MentorForecastEvaluation = Readonly<{
  forecastId: string;
  createdAt: string;
  evaluationHorizon: string;
  hypothesis: string;
  confidence: number;
  evidenceRefs: readonly string[];
  outcome: "pending" | "supported" | "mixed" | "not_supported";
  evaluatedAt: string | null;
}>;

export function isValidMentorForecastEvaluation(
  value: MentorForecastEvaluation,
): boolean {
  if (!value.forecastId.trim()) return false;
  if (!value.createdAt.trim()) return false;
  if (!value.evaluationHorizon.trim()) return false;
  if (!value.hypothesis.trim()) return false;
  if (
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    return false;
  }
  if (value.evidenceRefs.length === 0) return false;
  if (value.outcome === "pending" && value.evaluatedAt !== null) return false;
  if (value.outcome !== "pending" && !value.evaluatedAt?.trim()) return false;
  return true;
}

export function assertMentorIntelligenceSafetyBoundary(): void {
  if (
    MENTOR_INTELLIGENCE_ROLE.mayRecommendBuySell ||
    MENTOR_INTELLIGENCE_ROLE.mayPromiseReturns ||
    MENTOR_INTELLIGENCE_ROLE.mayExecuteOrders ||
    MENTOR_INTELLIGENCE_ROLE.mayMoveFunds
  ) {
    throw new Error("Mentor financial safety boundary violated");
  }

  if (
    !MENTOR_SMART_NOTIFICATION_REQUIREMENTS.candidateOnly ||
    !MENTOR_SMART_NOTIFICATION_REQUIREMENTS.deterministicPolicyRequired ||
    MENTOR_SMART_NOTIFICATION_REQUIREMENTS.mayBypassNotificationPolicy
  ) {
    throw new Error("Mentor notification authority boundary violated");
  }

  if (
    !MENTOR_MARKET_INTELLIGENCE_POLICY.verifiedEvidenceRequired ||
    !MENTOR_MARKET_INTELLIGENCE_POLICY.sourceProvenanceRequired ||
    MENTOR_MARKET_INTELLIGENCE_POLICY.predictionMayBecomeTradingSignal ||
    MENTOR_MARKET_INTELLIGENCE_POLICY.personalizedExecutionInstruction
  ) {
    throw new Error("Mentor market-intelligence boundary violated");
  }
}
