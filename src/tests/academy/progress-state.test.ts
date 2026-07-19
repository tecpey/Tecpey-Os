import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAcademyProgressProjection,
  computeAcademyLevel,
  computeCurrentStreak,
} from "@/lib/academy-progress-projection";

const baseEvidence = {
  rewards: [],
  lessonAssessments: [],
  sections: [],
  termSummaries: [],
  terms: [],
};

describe("Academy server-issued progress projection", () => {
  it("deduplicates reward keys and derives level from authoritative XP", () => {
    const state = buildAcademyProgressProjection({
      ...baseEvidence,
      rewards: [
        { reward_key: "lesson:a:complete", source_id: "a", xp: 30, badge_code: null, awarded_at: "2026-07-19T01:00:00Z" },
        { reward_key: "lesson:a:complete", source_id: "a", xp: 30, badge_code: null, awarded_at: "2026-07-19T01:00:01Z" },
        { reward_key: "term:1:passed", source_id: "term-1", xp: 500, badge_code: null, awarded_at: "2026-07-19T02:00:00Z" },
      ],
    });
    assert.equal(state.xp, 530);
    assert.equal(state.level, computeAcademyLevel(530));
  });

  it("never double counts term-summary XP outside the immutable reward ledger", () => {
    const state = buildAcademyProgressProjection({
      ...baseEvidence,
      rewards: [
        { reward_key: "section:term-1/lesson-1:complete", source_id: "term-1/lesson-1", xp: 15, badge_code: null, awarded_at: "2026-07-19T01:00:00Z" },
      ],
      termSummaries: [
        { term_number: 1, xp: 15, updated_at: "2026-07-19T01:00:00Z" },
      ],
    });
    assert.equal(state.xp, 15);
  });

  it("projects only server-checkpoint section evidence and ignores quarantined legacy completion", () => {
    const state = buildAcademyProgressProjection({
      ...baseEvidence,
      rewards: [
        { reward_key: "section:term-1/lesson-1:complete", source_id: "term-1/lesson-1", xp: 15, badge_code: null, awarded_at: "2026-07-19T01:00:00Z" },
      ],
      sections: [
        {
          term_number: 1,
          term_slug: "term-1",
          section_key: "lesson-1",
          completed: true,
          answer: "opt_server",
          best_score: 100,
          authority_status: "server_checkpoint_v1",
          completed_at: "2026-07-19T01:00:00Z",
          answered_at: "2026-07-19T01:00:00Z",
          updated_at: "2026-07-19T01:00:00Z",
        },
        {
          term_number: 1,
          term_slug: "term-1",
          section_key: "lesson-2",
          completed: true,
          answer: "legacy-client-answer",
          best_score: 100,
          authority_status: "legacy_quarantined",
          completed_at: "2026-07-19T02:00:00Z",
          answered_at: "2026-07-19T02:00:00Z",
          updated_at: "2026-07-19T02:00:00Z",
        },
      ],
    });
    assert.equal(state.completedLessons["term-1/lesson-1"].score, 100);
    assert.equal(state.completedLessons["term-1/lesson-1"].xpEarned, 15);
    assert.equal(state.completedLessons["term-1/lesson-2"], undefined);
  });

  it("projects canonical lesson, badge and term evidence without client actions", () => {
    const state = buildAcademyProgressProjection({
      ...baseEvidence,
      rewards: [
        { reward_key: "lesson:t1-m1-l1:complete", source_id: "t1-m1-l1", xp: 30, badge_code: null, awarded_at: "2026-07-19T01:00:00Z" },
        { reward_key: "badge:first-lesson", source_id: "t1-m1-l1", xp: 0, badge_code: "first-lesson", awarded_at: "2026-07-19T01:00:00Z" },
      ],
      lessonAssessments: [
        { lesson_id: "t1-m1-l1", term_number: 1, best_score: 100, passed_at: "2026-07-19T01:00:00Z", updated_at: "2026-07-19T01:00:00Z" },
      ],
      terms: [
        { term_number: 1, status: "passed", score: 10, percent: 100, passed_at: "2026-07-19T02:00:00Z", updated_at: "2026-07-19T02:00:00Z" },
      ],
    });
    assert.equal(state.completedLessons["t1-m1-l1"].score, 100);
    assert.deepEqual(state.earnedBadges, ["first-lesson"]);
    assert.equal(state.termStatus[1], "passed");
    assert.equal(state.termStatus[2], "unlocked");
  });

  it("computes only a current consecutive streak", () => {
    const now = new Date("2026-07-19T12:00:00Z");
    assert.equal(computeCurrentStreak(["2026-07-19", "2026-07-18", "2026-07-17"], now), 3);
    assert.equal(computeCurrentStreak(["2026-07-16"], now), 0);
  });
});
