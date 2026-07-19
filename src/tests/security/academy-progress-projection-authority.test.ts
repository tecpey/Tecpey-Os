import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAcademyProgressProjection,
  computeAcademyLevel,
} from "../../lib/academy-progress-projection";

describe("Academy progress projection authority v2", () => {
  it("ignores forged legacy section XP, completion and term summary evidence", () => {
    const state = buildAcademyProgressProjection({
      rewards: [
        {
          reward_key: "lesson:t1-m1-l1:complete",
          source_id: "t1-m1-l1",
          xp: 25,
          badge_code: null,
          awarded_at: "2026-07-19T10:00:00.000Z",
        },
      ],
      lessonAssessments: [],
      sections: [
        {
          term_number: 7,
          term_slug: "term-7",
          section_key: "client-forged",
          completed: true,
          answer: "forged",
          completed_at: "2026-07-19T11:00:00.000Z",
          answered_at: "2026-07-19T11:00:00.000Z",
          updated_at: "2026-07-19T11:00:00.000Z",
        },
      ],
      termSummaries: [
        {
          term_number: 7,
          xp: 999_999,
          updated_at: "2026-07-19T11:00:00.000Z",
        },
      ],
      terms: [],
    });

    assert.equal(state.xp, 25);
    assert.equal(state.level, 1);
    assert.deepEqual(state.completedLessons, {});
    assert.equal(state.termStatus[7], undefined);
    assert.equal(state.lastStudyDate, "2026-07-19");
  });

  it("creates completion only from a passed canonical lesson assessment", () => {
    const state = buildAcademyProgressProjection({
      rewards: [
        {
          reward_key: "lesson:t1-m1-l1:complete",
          source_id: "t1-m1-l1",
          xp: 25,
          badge_code: "first-lesson",
          awarded_at: "2026-07-18T10:00:00.000Z",
        },
      ],
      lessonAssessments: [
        {
          lesson_id: "t1-m1-l1",
          term_number: 1,
          best_score: 90,
          passed_at: "2026-07-18T10:00:00.000Z",
          updated_at: "2026-07-18T10:00:00.000Z",
        },
        {
          lesson_id: "t1-m1-l2",
          term_number: 1,
          best_score: 70,
          passed_at: null,
          updated_at: "2026-07-18T11:00:00.000Z",
        },
      ],
      terms: [],
    });

    assert.deepEqual(state.completedLessons["t1-m1-l1"], {
      lessonId: "t1-m1-l1",
      completedAt: Date.parse("2026-07-18T10:00:00.000Z"),
      score: 90,
      xpEarned: 25,
    });
    assert.equal(state.completedLessons["t1-m1-l2"], undefined);
    assert.equal(state.masteryScores["t1-m1-l1"], 90);
    assert.deepEqual(state.earnedBadges, ["first-lesson"]);
    assert.equal(state.termStatus[1], "in_progress");
  });

  it("unlocks later terms only from server-owned term assessment status", () => {
    const state = buildAcademyProgressProjection({
      rewards: [
        {
          reward_key: "term:1:passed",
          source_id: "term-1",
          xp: 500,
          badge_code: null,
          awarded_at: "2026-07-17T10:00:00.000Z",
        },
      ],
      lessonAssessments: [],
      terms: [
        {
          term_number: 1,
          status: "passed",
          score: 9,
          percent: 90,
          passed_at: "2026-07-17T10:00:00.000Z",
          updated_at: "2026-07-17T10:00:00.000Z",
        },
      ],
    });

    assert.equal(state.xp, 500);
    assert.equal(state.level, computeAcademyLevel(500));
    assert.equal(state.termStatus[1], "passed");
    assert.equal(state.termStatus[2], "unlocked");
    assert.equal(state.moduleScores["term-1"], 90);
  });
});
