import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gradeCanonicalLesson,
  hashLearningCommand,
  resolveCanonicalLesson,
  type QuizAnswerMap,
} from "@/lib/academy-assessment";

describe("Academy canonical lesson assessment", () => {
  it("rejects unknown lesson identities", () => {
    assert.equal(gradeCanonicalLesson("not-a-real-lesson", {}), null);
  });

  it("grades official answers on the server rather than accepting a claimed score", () => {
    const canonical = resolveCanonicalLesson("t1-m1-l1");
    assert.ok(canonical);
    const answers: QuizAnswerMap = Object.fromEntries(
      canonical.lesson.knowledgeChecks.map((question) => [question.id, question.correctAnswer]),
    );
    const result = gradeCanonicalLesson(canonical.lesson.id, answers);
    assert.ok(result);
    assert.equal(result.score, 100);
    assert.equal(result.passed, true);
    assert.equal(result.perfect, true);
  });

  it("fails fabricated or incomplete answers even when a caller could claim 100", () => {
    const result = gradeCanonicalLesson("t1-m1-l1", {
      "t1-m1-l1-kc1": "fabricated",
      "t1-m1-l1-kc2": "fabricated",
    });
    assert.ok(result);
    assert.equal(result.score, 0);
    assert.equal(result.passed, false);
  });

  it("produces a stable command hash independent of object key order", () => {
    const left = hashLearningCommand({ lessonId: "t1-m1-l1", answers: { b: "2", a: "1" } });
    const right = hashLearningCommand({ answers: { a: "1", b: "2" }, lessonId: "t1-m1-l1" });
    assert.equal(left, right);
  });
});
