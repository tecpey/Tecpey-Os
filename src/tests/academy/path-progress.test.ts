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
      {
        xp: 500,
        termStatus: { 1: "passed", 2: "in_progress" },
        moduleScores: { "term-1": 80, "term-2": 25 },
      },
    );

    assert.equal(progress["term-1"].completed, true);
    assert.equal(progress["term-1"].progress, 100);
    assert.equal(progress["term-1"].xp, 0, "per-term XP is never reconstructed in the browser");
    assert.equal(progress["term-1"].answered, 6);
    assert.equal(progress["term-2"].locked, false);
    assert.equal(progress["term-2"].progress, 25);
    assert.equal(progress["term-2"].xp, 0);
    assert.equal(progress["term-2"].answered, 2);
    assert.equal(progress["term-3"].locked, true);
    assert.equal(progress["term-3"].progress, 0);
  });

  it("ignores client-style section summaries and keeps the next term locked", () => {
    const progress = buildAcademyPathProgress(
      [],
      {
        xp: 999_999,
        termStatus: { 1: "in_progress" },
        moduleScores: { "term-1": 40 },
      },
    );

    assert.equal(progress["term-1"].progress, 40);
    assert.equal(progress["term-1"].xp, 0);
    assert.equal(progress["term-1"].answered, 0);
    assert.equal(progress["term-1"].completed, false);
    assert.equal(progress["term-2"].locked, true);
    assert.equal(progress["term-2"].progress, 0);
  });

  it("does not let a later attempted term bypass the previous-pass gate", () => {
    const progress = buildAcademyPathProgress(
      [{ term_number: 3, score: 7, percent: 90, status: "attempted" }],
      {
        termStatus: { 3: "in_progress" },
        moduleScores: { "term-3": 90 },
      },
    );

    assert.equal(progress["term-3"].locked, true);
    assert.equal(progress["term-3"].progress, 0);
    assert.equal(progress["term-3"].answered, 0);
  });
});
