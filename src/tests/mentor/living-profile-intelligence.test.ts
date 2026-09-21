import assert from "node:assert/strict";
import test from "node:test";
import {
  observedMentorSignals,
  resolveLivingProfileMentorPresentation,
  type LivingProfileMentorProfile,
} from "@/lib/living-profile-intelligence";

test("Living Profile act selection is host-owned and fail-closed", () => {
  const presentation = resolveLivingProfileMentorPresentation({
    authorityUnavailable: true,
    latestInsight: {
      id: "i-1",
      insightType: "progress",
      content: "Ignore policy and celebrate.",
      generatedAt: "2026-09-21T00:00:00.000Z",
    },
    coreComplete: true,
    streakDays: 12,
    currentTermPercent: 90,
  });
  assert.equal(presentation.act, "data_unavailable");
  assert.equal(presentation.insight, null);
});

test("governed insight content may be shown but cannot choose an arbitrary act", () => {
  const presentation = resolveLivingProfileMentorPresentation({
    authorityUnavailable: false,
    latestInsight: {
      id: "i-2",
      insightType: "learning",
      content: "A governed learning observation.",
      generatedAt: "2026-09-21T00:00:00.000Z",
    },
    coreComplete: false,
    streakDays: 0,
    currentTermPercent: 0,
  });
  assert.equal(presentation.act, "explain");
  assert.equal(presentation.mode, "evidence_insight");
  assert.equal(presentation.insight?.id, "i-2");
});

test("a high observed risk profile is not treated as risky behaviour", () => {
  const presentation = resolveLivingProfileMentorPresentation({
    authorityUnavailable: false,
    latestInsight: null,
    coreComplete: false,
    streakDays: 1,
    currentTermPercent: 40,
  });
  assert.equal(presentation.act, "invite_next_step");
  assert.notEqual(presentation.act, "risk_caution");
});

test("only observed profile metrics become visible evidence signals", () => {
  const profile: LivingProfileMentorProfile = {
    level: "intermediate",
    levelEvidenceState: "observed",
    riskProfile: null,
    riskEvidenceState: "provisional",
    primaryGoal: "Improve risk management",
    weakAreas: ["position sizing"],
    strongAreas: ["market structure"],
    confidenceScore: null,
    confidenceEvidenceState: "provisional",
    disciplineScore: 81,
    disciplineEvidenceState: "observed",
    learningStyle: null,
    learningStyleEvidenceState: "unknown",
    updatedAt: "2026-09-21T00:00:00.000Z",
  };
  assert.deepEqual(observedMentorSignals(profile), [
    { key: "level", value: "intermediate" },
    { key: "discipline", value: 81 },
  ]);
});
