import assert from "node:assert/strict";
import test from "node:test";
import {
  MENTOR_RIVE_CONTRACT_VERSION,
  MENTOR_RIVE_SEMANTIC_STATES,
  mentorRiveStateForMotionPreference,
  toMentorRiveViewModelV2,
} from "../../lib/mentor-rive-v2-contract";

test("Rive v2 exposes at least twenty governed semantic states", () => {
  assert.ok(MENTOR_RIVE_SEMANTIC_STATES.length >= 20);
  assert.equal(new Set(MENTOR_RIVE_SEMANTIC_STATES).size, MENTOR_RIVE_SEMANTIC_STATES.length);
  for (const required of [
    "risk_caution",
    "privacy_notice",
    "data_unavailable",
    "research_active",
    "arena_coach",
    "quiz_feedback",
  ]) {
    assert.ok(MENTOR_RIVE_SEMANTIC_STATES.includes(required as never));
  }
});

test("host projection is bounded, deterministic and presentation-only", () => {
  const projected = toMentorRiveViewModelV2({
    state: "arena_coach",
    locale: "fa",
    reducedMotion: false,
    userName: `  ${"م".repeat(80)}  `,
    streakDays: 999999,
    roomLevel: -14,
  });

  assert.equal(projected.contractVersion, MENTOR_RIVE_CONTRACT_VERSION);
  assert.equal(Array.from(projected.userName).length, 64);
  assert.equal(projected.streakDays, 3650);
  assert.equal(projected.roomLevel, 0);
  assert.equal(projected.mood, "neutral");
  assert.equal(projected.riskLevel, "unknown");
  assert.deepEqual(Object.keys(projected).sort(), [
    "contractVersion",
    "locale",
    "mood",
    "reducedMotion",
    "riskLevel",
    "roomLevel",
    "state",
    "streakDays",
    "userName",
  ]);
});

test("invalid numeric host evidence fails closed to minimum safe values", () => {
  const projected = toMentorRiveViewModelV2({
    state: "data_unavailable",
    locale: "en",
    reducedMotion: true,
    streakDays: Number.NaN,
    roomLevel: Number.POSITIVE_INFINITY,
  });
  assert.equal(projected.streakDays, 0);
  assert.equal(projected.roomLevel, 0);
  assert.equal(projected.userName, "");
});

test("reduced motion preserves semantic meaning instead of choosing a different business state", () => {
  for (const state of MENTOR_RIVE_SEMANTIC_STATES) {
    assert.equal(mentorRiveStateForMotionPreference(state, true), state);
    assert.equal(mentorRiveStateForMotionPreference(state, false), state);
  }
});
