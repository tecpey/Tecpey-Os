import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TERM1 } from "@/data/academy/term1Curriculum";
import {
  buildAcademyProgressProjection,
  gradeLessonAssessment,
  hashLessonAssessmentRequest,
  stableJson,
} from "@/lib/academy-progress-authority";
import { createDefaultAcademyProgressState } from "@/lib/academy-progress";
import { ACADEMY_REWARD_AUTHORITY_SQL } from "@/lib/db-migrate-user-state";

function correctAnswersForFirstLesson(): Record<string, unknown> {
  const lesson = TERM1.modules[0].lessons[0];
  return Object.fromEntries(lesson.knowledgeChecks.map((question) => [
    question.id,
    question.correctAnswer,
  ]));
}

describe("Academy server-issued progress authority", () => {
  it("grades the canonical lesson on the server and ignores forged score fields", () => {
    const lesson = TERM1.modules[0].lessons[0];
    const wrongAnswers = Object.fromEntries(
      lesson.knowledgeChecks.map((question) => [question.id, "forged-wrong-answer"]),
    );
    const result = gradeLessonAssessment({
      locale: "fa",
      lessonId: lesson.id,
      answers: { ...wrongAnswers, score: 100, passed: true },
    });

    if (!result) throw new Error("expected canonical lesson");
    assert.equal(result.score, 0);
    assert.equal(result.passed, false);
    assert.equal(Object.hasOwn(result.answers, "score"), false);
  });

  it("accepts only canonical answers and produces a stable request hash", () => {
    const lesson = TERM1.modules[0].lessons[0];
    const answers = correctAnswersForFirstLesson();
    const result = gradeLessonAssessment({ locale: "fa", lessonId: lesson.id, answers });
    if (!result) throw new Error("expected canonical lesson");
    assert.equal(result.score, 100);
    assert.equal(result.passed, true);

    const first = hashLessonAssessmentRequest({ locale: "fa", lessonId: lesson.id, answers: result.answers });
    const reversed = Object.fromEntries(Object.entries(result.answers).reverse());
    const second = hashLessonAssessmentRequest({ locale: "fa", lessonId: lesson.id, answers: reversed });
    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{64}$/);
  });

  it("changes the idempotency request hash when canonical answers change", () => {
    const lesson = TERM1.modules[0].lessons[0];
    const correct = gradeLessonAssessment({
      locale: "fa",
      lessonId: lesson.id,
      answers: correctAnswersForFirstLesson(),
    });
    const wrong = gradeLessonAssessment({
      locale: "fa",
      lessonId: lesson.id,
      answers: {},
    });
    if (!correct || !wrong) throw new Error("expected canonical lesson evaluations");
    assert.notEqual(
      hashLessonAssessmentRequest({ locale: "fa", lessonId: lesson.id, answers: correct.answers }),
      hashLessonAssessmentRequest({ locale: "fa", lessonId: lesson.id, answers: wrong.answers }),
    );
  });

  it("builds a deterministic projection from a frozen legacy baseline and reward ledger", () => {
    const baseline = createDefaultAcademyProgressState();
    baseline.xp = 100;
    baseline.streak = 2;
    baseline.lastStudyDate = "2026-07-18";
    baseline.earnedBadges = ["legacy-badge"];

    const projection = buildAcademyProgressProjection({
      baseline,
      rewardEvents: [
        { id: 1, rewardType: "lesson_complete", amount: 30, payload: {}, createdAt: "2026-07-19T08:00:00.000Z" },
        { id: 2, rewardType: "lesson_perfect_bonus", amount: 50, payload: {}, createdAt: "2026-07-19T08:00:01.000Z" },
        { id: 3, rewardType: "badge", amount: 0, payload: { badgeCode: "first-lesson" }, createdAt: "2026-07-19T08:00:02.000Z" },
      ],
      lessonAttempts: [
        { lessonId: "t1-m1-l1", termNumber: 1, score: 100, createdAt: "2026-07-19T08:00:00.000Z" },
      ],
      termProgress: [{ termNumber: 1, status: "passed" }],
    });

    assert.equal(projection.state.xp, 180);
    assert.equal(projection.state.streak, 3);
    assert.equal(projection.state.lastStudyDate, "2026-07-19");
    assert.equal(projection.state.completedLessons["t1-m1-l1"].score, 100);
    assert.equal(projection.state.completedLessons["t1-m1-l1"].xpEarned, 80);
    assert.equal(projection.state.termStatus[1], "passed");
    assert.equal(projection.state.termStatus[2], "unlocked");
    assert.deepEqual(projection.state.earnedBadges, ["first-lesson", "legacy-badge"]);
  });

  it("declares database-level replay and reward deduplication constraints", () => {
    assert.match(ACADEMY_REWARD_AUTHORITY_SQL, /UNIQUE \(student_id, locale, reward_type, source_type, source_key\)/);
    assert.match(ACADEMY_REWARD_AUTHORITY_SQL, /UNIQUE \(student_id, locale, lesson_id, idempotency_key\)/);
    assert.match(ACADEMY_REWARD_AUTHORITY_SQL, /request_hash CHAR\(64\)/);
    assert.doesNotThrow(() => JSON.parse(stableJson({ b: 2, a: 1 })));
  });
});
