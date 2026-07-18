import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  XP_TABLE,
  applyAcademyProgressAction,
  createDefaultAcademyProgressState,
  normalizeAcademyProgressState,
} from "@/lib/academy-progress";

describe("Academy authoritative progress reducer", () => {
  it("starts from a deterministic default state", () => {
    const state = createDefaultAcademyProgressState();
    assert.equal(state.xp, 0);
    assert.equal(state.level, 1);
    assert.deepEqual(state.termStatus, { 1: "unlocked" });
  });

  it("records a lesson once and only rewards score improvement", () => {
    const initial = createDefaultAcademyProgressState();
    const first = applyAcademyProgressAction(initial, {
      type: "lesson_complete",
      lessonId: "term-1/lesson-1",
      score: 80,
      termNumber: 1,
      completedAt: Date.UTC(2026, 6, 18),
    });
    const duplicate = applyAcademyProgressAction(first, {
      type: "lesson_complete",
      lessonId: "term-1/lesson-1",
      score: 80,
      termNumber: 1,
      completedAt: Date.UTC(2026, 6, 18),
    });
    const improved = applyAcademyProgressAction(duplicate, {
      type: "lesson_complete",
      lessonId: "term-1/lesson-1",
      score: 100,
      termNumber: 1,
      completedAt: Date.UTC(2026, 6, 19),
    });

    assert.equal(first.xp, XP_TABLE.LESSON_COMPLETE);
    assert.equal(duplicate.xp, first.xp);
    assert.equal(improved.xp, first.xp + XP_TABLE.LESSON_PERFECT);
    assert.equal(improved.completedLessons["term-1/lesson-1"].score, 100);
  });

  it("does not award the term completion reward twice", () => {
    const first = applyAcademyProgressAction(createDefaultAcademyProgressState(), {
      type: "pass_term",
      termNumber: 1,
    });
    const duplicate = applyAcademyProgressAction(first, {
      type: "pass_term",
      termNumber: 1,
    });

    assert.equal(first.xp, 500);
    assert.equal(duplicate.xp, 500);
    assert.equal(duplicate.termStatus[1], "passed");
    assert.equal(duplicate.termStatus[2], "unlocked");
  });

  it("deduplicates badges and repairs malformed persisted data", () => {
    const normalized = normalizeAcademyProgressState({
      xp: 700,
      level: 99,
      earnedBadges: ["first-lesson", "first-lesson", 42],
      completedLessons: null,
    });
    const awarded = applyAcademyProgressAction(normalized, {
      type: "award_badge",
      badgeCode: "first-lesson",
    });

    assert.equal(normalized.level, 3);
    assert.deepEqual(normalized.earnedBadges, ["first-lesson"]);
    assert.deepEqual(normalized.completedLessons, {});
    assert.deepEqual(awarded.earnedBadges, ["first-lesson"]);
  });
});
