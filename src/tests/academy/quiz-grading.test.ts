import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { QuizQuestion } from "@/data/academy/term1Curriculum";
import { gradeQuizAnswer, gradeQuizSubmission } from "@/lib/academy-quiz-grading";

const questions: QuizQuestion[] = [
  {
    id: "single",
    type: "single",
    question: "Single",
    options: ["A", "B"],
    correctAnswer: "B",
    explanation: "",
    difficulty: "easy",
    conceptTag: "test",
  },
  {
    id: "multi",
    type: "multi",
    question: "Multi",
    options: ["A", "B", "C"],
    correctAnswer: ["A", "C"],
    explanation: "",
    difficulty: "easy",
    conceptTag: "test",
  },
  {
    id: "fill",
    type: "fillblank",
    question: "Fill",
    correctAnswer: "bitcoin|btc",
    explanation: "",
    difficulty: "easy",
    conceptTag: "test",
  },
];

describe("server quiz grading", () => {
  it("grades canonical answers without trusting a client score", () => {
    const result = gradeQuizSubmission(questions, {
      single: "B",
      multi: ["C", "A"],
      fill: "BTC",
    });
    assert.deepEqual(
      { correct: result.correct, total: result.total, percent: result.percent },
      { correct: 3, total: 3, percent: 100 },
    );
  });

  it("rejects partial multi-select and unknown answers", () => {
    assert.equal(gradeQuizAnswer(questions[1], ["A"]), false);
    const result = gradeQuizSubmission(questions, { single: "B", multi: ["A"], forged: "100" });
    assert.equal(result.percent, 33);
  });

  it("does not use a submitted score field", () => {
    const result = gradeQuizSubmission(questions, { score: 100, single: "A", multi: [], fill: "wrong" });
    assert.equal(result.percent, 0);
  });
});
