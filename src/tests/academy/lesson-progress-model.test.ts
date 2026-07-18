import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendAttempt,
  calculateTermLearningSummary,
  normalizeLessonAnswer,
  resolveOfficialLesson,
  sectionKeyForIndex,
} from "@/lib/academy-lesson-progress";

describe("Academy lesson progress model", () => {
  it("resolves lesson identity only from the official curriculum", () => {
    const first = resolveOfficialLesson("fa", "term-1", "lesson-1");
    assert.ok(first);
    assert.equal(first.termNumber, 1);
    assert.equal(first.termSlug, "term-1");
    assert.equal(first.sectionKey, sectionKeyForIndex(0));
    assert.ok(first.sectionHeading.length > 0);
    assert.ok(first.totalSections >= 1);

    assert.equal(resolveOfficialLesson("fa", "term-1", "lesson-999"), null);
    assert.equal(resolveOfficialLesson("fa", "term-9", "lesson-1"), null);
    assert.equal(resolveOfficialLesson("fa", "term-1", "custom-heading"), null);
  });

  it("normalizes answers and keeps only the latest twenty attempts", () => {
    assert.equal(normalizeLessonAnswer("  پاسخ\u0000  نمونه  "), "پاسخ نمونه");
    assert.equal(normalizeLessonAnswer("   "), null);

    let attempts: string[] = [];
    for (let index = 1; index <= 25; index += 1) {
      attempts = appendAttempt(attempts, `answer-${index}`);
    }
    assert.equal(attempts.length, 20);
    assert.equal(attempts[0], "answer-6");
    assert.equal(attempts[19], "answer-25");
  });

  it("calculates progress from completed official lessons and XP from activity", () => {
    const summary = calculateTermLearningSummary({
      locale: "fa",
      termNumber: 2,
      termSlug: "term-2",
      totalSections: 6,
      completedSections: 3,
      answeredSections: 2,
    });

    assert.equal(summary.percent, 50);
    assert.equal(summary.xp, 40);
    assert.equal(summary.completedSections, 3);
    assert.equal(summary.answeredSections, 2);
  });

  it("clamps malformed aggregate counts to the official total", () => {
    const summary = calculateTermLearningSummary({
      locale: "en",
      termNumber: 99,
      termSlug: "term-7",
      totalSections: 4,
      completedSections: 12,
      answeredSections: -3,
    });

    assert.equal(summary.termNumber, 7);
    assert.equal(summary.completedSections, 4);
    assert.equal(summary.answeredSections, 0);
    assert.equal(summary.percent, 100);
    assert.equal(summary.xp, 40);
  });
});
