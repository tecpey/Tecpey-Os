import assert from "node:assert/strict";
import test from "node:test";
import {
  computeMentorProfileUpdate,
  mentorSignalAuthorityAvailable,
  type AcademySignals,
  type ConversationSignals,
  type TradingSignals,
} from "@/lib/mentor-signals";

function academy(overrides: Partial<AcademySignals> = {}): AcademySignals {
  return {
    authorityAvailable: true,
    completedTerms: 0,
    avgPassedPercent: 0,
    failedTermNumbers: [],
    weakTopics: [],
    challengeAccuracy: 0,
    totalChallengeAttempts: 0,
    lessonAssessmentCount: 0,
    avgLessonAssessmentScore: 0,
    passedLessonAssessments: 0,
    flashcardReviewed: 0,
    flashcardAvgGrade: 0,
    reflectionCount: 0,
    ...overrides,
  };
}

function trading(overrides: Partial<TradingSignals> = {}): TradingSignals {
  return {
    authorityAvailable: true,
    tradeCount: 0,
    avgRisk: 0,
    avgDiscipline: 0,
    riskFlagRate: 0,
    emotionFlags: [],
    journalQuality: 0,
    repeatedMistakes: [],
    ...overrides,
  };
}

function conversation(
  overrides: Partial<ConversationSignals> = {},
): ConversationSignals {
  return {
    authorityAvailable: true,
    primaryGoal: "",
    psychologyFlags: [],
    careerIntent: false,
    repeatedThemes: [],
    messageCount: 0,
    avgUserMessageLength: 0,
    ...overrides,
  };
}

test("Mentor profile computation does not fabricate confidence or a user goal from no evidence", () => {
  const update = computeMentorProfileUpdate(
    academy(),
    trading(),
    conversation(),
  );

  assert.equal(update.confidenceScore, 0);
  assert.equal(update.primaryGoal, "");
  assert.equal(update.riskProfile, "medium");
});

test("Mentor signal authority distinguishes database unavailability from an empty evidence set", () => {
  assert.equal(
    mentorSignalAuthorityAvailable(
      academy(),
      trading(),
      conversation(),
    ),
    true,
  );
  assert.equal(
    mentorSignalAuthorityAvailable(
      academy({ authorityAvailable: false }),
      trading(),
      conversation(),
    ),
    false,
  );
});

test("Mentor confidence is normalized over available evidence instead of padded by an absent trading domain", () => {
  const academyOnly = computeMentorProfileUpdate(
    academy({
      completedTerms: 1,
      avgPassedPercent: 80,
      totalChallengeAttempts: 3,
      challengeAccuracy: 75,
    }),
    trading(),
    conversation(),
  );

  assert.equal(academyOnly.confidenceScore, 81);
});

test("observed Arena evidence still drives risk classification", () => {
  const highRisk = computeMentorProfileUpdate(
    academy(),
    trading({
      tradeCount: 5,
      avgRisk: 6,
      avgDiscipline: 45,
      riskFlagRate: 0.4,
    }),
    conversation(),
  );

  assert.equal(highRisk.riskProfile, "high");
});


test("authoritative lesson assessments contribute to Academy confidence evidence", () => {
  const update = computeMentorProfileUpdate(
    academy({
      lessonAssessmentCount: 4,
      avgLessonAssessmentScore: 80,
      passedLessonAssessments: 3,
    }),
    trading(),
    conversation(),
  );

  assert.equal(update.confidenceScore, 80);
  assert.equal(update.weakAreas.includes("lesson_assessment_review"), false);
});

test("lesson assessment weakness requires repeated evidence and never a single noisy sample", () => {
  const oneLowSample = computeMentorProfileUpdate(
    academy({
      lessonAssessmentCount: 1,
      avgLessonAssessmentScore: 40,
    }),
    trading(),
    conversation(),
  );
  const repeatedLowSamples = computeMentorProfileUpdate(
    academy({
      lessonAssessmentCount: 3,
      avgLessonAssessmentScore: 40,
    }),
    trading(),
    conversation(),
  );

  assert.equal(oneLowSample.weakAreas.includes("lesson_assessment_review"), false);
  assert.equal(repeatedLowSamples.weakAreas.includes("lesson_assessment_review"), true);
});

test("Academy evidence fusion renormalizes only over observed authoritative modalities", () => {
  const fused = computeMentorProfileUpdate(
    academy({
      completedTerms: 1,
      avgPassedPercent: 90,
      lessonAssessmentCount: 5,
      avgLessonAssessmentScore: 80,
      passedLessonAssessments: 5,
    }),
    trading(),
    conversation(),
  );

  // (90*0.5 + 80*0.35) / 0.85 = 85.88, plus 2 completion points.
  assert.equal(fused.confidenceScore, 88);
  assert.equal(fused.strongAreas.includes("lesson_assessment_mastery"), false);
});


test("client-managed flashcard state cannot inflate Mentor confidence or mastery", () => {
  const update = computeMentorProfileUpdate(
    academy({
      flashcardReviewed: 2_000,
      flashcardAvgGrade: 100,
    }),
    trading(),
    conversation(),
  );

  assert.equal(update.confidenceScore, 0);
  assert.equal(update.strongAreas.includes("flashcard_recall"), false);
});

test("client-managed reflection activity cannot manufacture a strong area", () => {
  const update = computeMentorProfileUpdate(
    academy({ reflectionCount: 2_000 }),
    trading(),
    conversation(),
  );

  assert.equal(update.confidenceScore, 0);
  assert.equal(update.strongAreas.includes("reflection_consistency"), false);
});
