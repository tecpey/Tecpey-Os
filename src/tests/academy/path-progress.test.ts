import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAcademyPathProgress } from "@/hooks/useAcademyPathProgress";

describe("Academy path progress aggregation", () => {
  it("unlocks terms only from officially passed previous terms", () => {
    const progress = buildAcademyPathProgress(
      [
        { term_number: 1, score: 6, percent: 80, status: "passed" },
        { term_number: 2, score: 2, percent: 25, status: "attempted" },
      ],
      [
        { locale: "fa", termNumber: 1, termSlug: "term-1", totalSections: 6, completedSections: 6, answeredSections: 0, percent: 100, xp: 60, updatedAt: null },
        { locale: "fa", termNumber: 2, termSlug: "term-2", totalSections: 6, completedSections: 3, answeredSections: 0, percent: 50, xp: 30, updatedAt: null },
      ],
    );

    assert.equal(progress["term-1"].completed, true);
    assert.equal(progress["term-1"].progress, 100);
    assert.equal(progress["term-1"].xp, 140);
    assert.equal(progress["term-2"].locked, false);
    assert.equal(progress["term-2"].progress, 50);
    assert.equal(progress["term-2"].xp, 55);
    assert.equal(progress["term-3"].locked, true);
    assert.equal(progress["term-3"].progress, 0);
    assert.equal(progress["term-3"].xp, 0);
  });

  it("shows lesson progress before the official quiz without unlocking the next term", () => {
    const progress = buildAcademyPathProgress(
      [],
      [
        { locale: "en", termNumber: 1, termSlug: "term-1", totalSections: 5, completedSections: 2, answeredSections: 0, percent: 40, xp: 20, updatedAt: null },
      ],
    );

    assert.equal(progress["term-1"].progress, 40);
    assert.equal(progress["term-1"].xp, 20);
    assert.equal(progress["term-1"].completed, false);
    assert.equal(progress["term-2"].locked, true);
  });
});
