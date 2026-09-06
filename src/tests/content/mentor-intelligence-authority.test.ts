import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MENTOR_ALLOWED_OUTPUTS,
  MENTOR_INTELLIGENCE_ROLE,
  MENTOR_MARKET_INTELLIGENCE_POLICY,
  MENTOR_PERSONALIZATION_INPUTS,
  MENTOR_PROHIBITED_OUTPUTS,
  MENTOR_SMART_NOTIFICATION_CATEGORIES,
  MENTOR_SMART_NOTIFICATION_REQUIREMENTS,
  assertMentorIntelligenceSafetyBoundary,
  isValidMentorForecastEvaluation,
} from "@/lib/mentor-intelligence-authority";
import {
  FIRST_RELEASE_POSITIONING,
  SAFE_EXCHANGE_BOUNDARY,
} from "@/services/product-authority/product-experience-authority";
import {
  ACADEMY_INFINITE_GROWTH_CYCLE,
  ACADEMY_INFINITE_GROWTH_TERM_NUMBER,
} from "@/lib/academy-infinite-growth-policy";

const notificationAuthority = readFileSync(
  "docs/architecture/TECPEY_INTELLIGENT_NOTIFICATION_PLATFORM.md",
  "utf8",
);

test("mentor is the first-release learning differentiator, not the decision owner", () => {
  assert.equal(FIRST_RELEASE_POSITIONING.primaryDifferentiator, "mentor");
  assert.equal(MENTOR_INTELLIGENCE_ROLE.productRole, "personal_financial_education_mentor");
  assert.equal(MENTOR_INTELLIGENCE_ROLE.decisionOwner, "learner");
  assert.equal(MENTOR_INTELLIGENCE_ROLE.mayPersonalizeLearning, true);
  assert.equal(MENTOR_INTELLIGENCE_ROLE.mayRecommendLearningActions, true);
});

test("mentor personalization uses learning and verified intelligence context", () => {
  for (const input of [
    "academy_progress",
    "mastery_evidence",
    "quiz_history",
    "strengths",
    "weaknesses",
    "reflection_history",
    "trading_arena_learning_state",
    "followed_topics",
    "verified_news_context",
    "verified_market_context",
  ] as const) {
    assert.ok(
      MENTOR_PERSONALIZATION_INPUTS.includes(input),
      `missing personalization input: ${input}`,
    );
  }
});

test("mentor may coach and create practice but cannot become a trading agent", () => {
  assertMentorIntelligenceSafetyBoundary();

  for (const allowed of [
    "learning_path_adjustment",
    "practice_scenario",
    "challenge",
    "reflection_prompt",
    "risk_coaching",
    "market_context_explanation",
    "smart_notification_candidate",
  ] as const) {
    assert.ok(MENTOR_ALLOWED_OUTPUTS.includes(allowed));
  }

  for (const prohibited of [
    "personalized_buy_signal",
    "personalized_sell_signal",
    "guaranteed_return",
    "leverage_recommendation",
    "autonomous_order_execution",
    "autonomous_fund_movement",
    "secret_or_credential_request",
  ] as const) {
    assert.ok(MENTOR_PROHIBITED_OUTPUTS.includes(prohibited));
  }

  assert.equal(SAFE_EXCHANGE_BOUNDARY.mentorMayExecuteOrders, false);
  assert.equal(SAFE_EXCHANGE_BOUNDARY.mentorMayMoveFunds, false);
});

test("smart mentor notifications remain candidates for deterministic notification policy", () => {
  assert.equal(MENTOR_SMART_NOTIFICATION_REQUIREMENTS.notificationClass, "mentor_ai");
  assert.equal(MENTOR_SMART_NOTIFICATION_REQUIREMENTS.candidateOnly, true);
  assert.equal(
    MENTOR_SMART_NOTIFICATION_REQUIREMENTS.deterministicPolicyRequired,
    true,
  );
  assert.equal(MENTOR_SMART_NOTIFICATION_REQUIREMENTS.reasonForDeliveryRequired, true);
  assert.equal(MENTOR_SMART_NOTIFICATION_REQUIREMENTS.frequencyCapRequired, true);
  assert.equal(MENTOR_SMART_NOTIFICATION_REQUIREMENTS.quietHoursRequired, true);
  assert.equal(MENTOR_SMART_NOTIFICATION_REQUIREMENTS.mayBypassNotificationPolicy, false);

  assert.match(notificationAuthority, /6\. `mentor_ai`/);
  assert.match(notificationAuthority, /Deterministic Notification Policy Engine/);
  assert.match(notificationAuthority, /quiet hours/i);
  assert.match(notificationAuthority, /frequency cap/i);

  for (const category of [
    "educational",
    "news_context",
    "risk_warning",
    "practice_reminder",
    "learning_opportunity",
    "progress_feedback",
  ] as const) {
    assert.ok(MENTOR_SMART_NOTIFICATION_CATEGORIES.includes(category));
  }
});

test("mentor intelligence connects to Term 8 continuous-growth pedagogy", () => {
  assert.equal(ACADEMY_INFINITE_GROWTH_TERM_NUMBER, 8);
  assert.deepEqual(ACADEMY_INFINITE_GROWTH_CYCLE, [
    "assess",
    "plan",
    "practice",
    "reflect",
    "verify",
    "adapt",
  ]);

  assert.ok(MENTOR_ALLOWED_OUTPUTS.includes("practice_scenario"));
  assert.ok(MENTOR_ALLOWED_OUTPUTS.includes("challenge"));
  assert.ok(MENTOR_ALLOWED_OUTPUTS.includes("reflection_prompt"));
  assert.ok(MENTOR_ALLOWED_OUTPUTS.includes("progress_feedback"));
});

test("market intelligence is evidence-backed, uncertain and never a signal", () => {
  assert.equal(MENTOR_MARKET_INTELLIGENCE_POLICY.verifiedEvidenceRequired, true);
  assert.equal(MENTOR_MARKET_INTELLIGENCE_POLICY.sourceProvenanceRequired, true);
  assert.equal(MENTOR_MARKET_INTELLIGENCE_POLICY.uncertaintyRequired, true);
  assert.equal(MENTOR_MARKET_INTELLIGENCE_POLICY.scenarioBased, true);
  assert.equal(
    MENTOR_MARKET_INTELLIGENCE_POLICY.predictionMayBecomeTradingSignal,
    false,
  );
  assert.equal(
    MENTOR_MARKET_INTELLIGENCE_POLICY.personalizedExecutionInstruction,
    false,
  );
});

test("forecast evaluation requires evidence and bounded confidence", () => {
  assert.equal(
    isValidMentorForecastEvaluation({
      forecastId: "forecast-1",
      createdAt: "2026-09-05T12:00:00Z",
      evaluationHorizon: "24h",
      hypothesis: "Volatility may remain elevated after the verified event.",
      confidence: 0.65,
      evidenceRefs: ["news:example-1"],
      outcome: "pending",
      evaluatedAt: null,
    }),
    true,
  );

  assert.equal(
    isValidMentorForecastEvaluation({
      forecastId: "forecast-2",
      createdAt: "2026-09-05T12:00:00Z",
      evaluationHorizon: "24h",
      hypothesis: "Unsupported certainty",
      confidence: 1.2,
      evidenceRefs: ["news:example-2"],
      outcome: "pending",
      evaluatedAt: null,
    }),
    false,
  );

  assert.equal(
    isValidMentorForecastEvaluation({
      forecastId: "forecast-3",
      createdAt: "2026-09-05T12:00:00Z",
      evaluationHorizon: "24h",
      hypothesis: "No evidence",
      confidence: 0.5,
      evidenceRefs: [],
      outcome: "pending",
      evaluatedAt: null,
    }),
    false,
  );
});
