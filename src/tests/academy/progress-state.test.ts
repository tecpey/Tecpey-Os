import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  XP_TABLE,
  createDefaultAcademyProgressState,
  normalizeAcademyProgressState,
  xpForNextLevel,
} from "@/lib/academy-progress";

describe("Academy progress projection model", () => {
  it("starts from a deterministic read-only projection", () => {
    const state = createDefaultAcademyProgressState();
    assert.equal(state.xp, 0);
    assert.equal(state.level, 1);
    assert.deepEqual(state.termStatus, { 1: "unlocked" });
  });

  it("repairs malformed persisted projection data", () => {
    const normalized = normalizeAcademyProgressState({
      xp: 700,
      level: 99,
      earnedBadges: ["first-lesson", "first-lesson", 42],
      completedLessons: null,
      lastStudyDate: 123,
    });

    assert.equal(normalized.level, 3);
    assert.deepEqual(normalized.earnedBadges, ["first-lesson"]);
    assert.deepEqual(normalized.completedLessons, {});
    assert.equal(normalized.lastStudyDate, null);
  });

  it("keeps lesson reward totals explicit and non-overlapping", () => {
    assert.equal(XP_TABLE.LESSON_COMPLETE, 30);
    assert.equal(XP_TABLE.LESSON_PERFECT_BONUS, 50);
    assert.equal(XP_TABLE.LESSON_COMPLETE + XP_TABLE.LESSON_PERFECT_BONUS, 80);
    assert.deepEqual(xpForNextLevel(700), { current: 0, needed: 800, level: 3 });
  });
});
