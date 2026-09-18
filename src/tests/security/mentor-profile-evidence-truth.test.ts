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

  assert.equal(academyOnly.confidenceScore, 82);
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
