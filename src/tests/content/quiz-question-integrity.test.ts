import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { QuizQuestion } from "../../data/academy/term1Curriculum";
import { TERM1 } from "../../data/academy/term1Curriculum";
import {
  assertQuizQuestionValid,
  findInvalidQuizQuestions,
  isQuizQuestionValid,
  validateQuizQuestion,
} from "../../lib/academy-quiz-authority";

// Quiz-question integrity authority.
//
// gradeQuestion (academy-assessment.ts) grades every quiz question with silent
// per-type assumptions. A generated question — from the AI mentor over a day's
// crypto-news event, or any future pipeline — that violates them is unanswerable:
// the learner can never score it. This suite proves the fail-closed gate that a
// generator must pass, and proves the entire hand-authored canonical bank is
// already answerable.

function base(overrides: Partial<QuizQuestion>): QuizQuestion {
  return {
    id: "q-1",
    type: "single",
    question: "Which statement is accurate?",
    options: ["Correct choice", "Wrong A", "Wrong B", "Wrong C"],
    correctAnswer: "Correct choice",
    explanation: "Because it is the accurate one.",
    difficulty: "easy",
    conceptTag: "fundamentals",
    ...overrides,
  };
}

function codes(question: QuizQuestion): string[] {
  return validateQuizQuestion(question).map((violation) => violation.code);
}

describe("Quiz question integrity authority", () => {
  it("accepts a well-formed example of every question type", () => {
    const valid: QuizQuestion[] = [
      base({ type: "single" }),
      base({ type: "scenario" }),
      base({
        type: "multi",
        correctAnswer: ["Correct choice", "Wrong A"],
      }),
      base({
        type: "fillblank",
        question: "A stablecoin tracks the value of {{blank}}.",
        options: undefined,
        correctAnswer: "the dollar|USD",
      }),
      base({
        type: "ordering",
        options: ["First", "Second", "Third"],
        correctOrder: ["First", "Second", "Third"],
        correctAnswer: ["First", "Second", "Third"],
      }),
      base({
        type: "matching",
        options: undefined,
        pairs: [
          ["BTC", "a scarce settlement asset"],
          ["USDT", "a dollar-linked stablecoin"],
        ],
        correctAnswer: [],
      }),
    ];
    for (const question of valid) {
      assert.deepEqual(codes(question), [], `${question.type} example must be valid`);
      assert.equal(isQuizQuestionValid(question), true);
      assert.doesNotThrow(() => assertQuizQuestionValid(question));
    }
  });

  it("rejects a single-choice answer that is not among the options", () => {
    assert.ok(codes(base({ correctAnswer: "Not an option" })).includes("answer_not_in_options"));
  });

  it("rejects blank, duplicate, or too-few options", () => {
    assert.ok(codes(base({ options: ["Correct choice", "  "] , correctAnswer: "Correct choice" })).includes("option_blank"));
    assert.ok(
      codes(base({ options: ["Same", "Same"], correctAnswer: "Same" })).includes("options_not_distinct"),
    );
    assert.ok(
      codes(base({ options: ["Only one"], correctAnswer: "Only one" })).includes("options_insufficient"),
    );
  });

  it("enforces multi-select answer integrity", () => {
    assert.ok(
      codes(base({ type: "multi", correctAnswer: "not-an-array" as unknown as string[] })).includes(
        "answer_not_array",
      ),
    );
    assert.ok(codes(base({ type: "multi", correctAnswer: [] })).includes("answer_empty"));
    assert.ok(
      codes(base({ type: "multi", correctAnswer: ["Correct choice", "Ghost"] })).includes(
        "answer_not_in_options",
      ),
    );
    assert.ok(
      codes(base({ type: "multi", correctAnswer: ["Correct choice", "Correct choice"] })).includes(
        "answers_not_distinct",
      ),
    );
  });

  it("enforces fill-in-blank answer integrity", () => {
    assert.ok(
      codes(base({ type: "fillblank", options: undefined, correctAnswer: "  " })).includes("answer_blank"),
    );
    assert.ok(
      codes(base({ type: "fillblank", options: undefined, correctAnswer: "valid|" })).includes(
        "answer_alternative_blank",
      ),
    );
  });

  it("requires an ordering to be a distinct permutation of its options", () => {
    assert.ok(
      codes(
        base({
          type: "ordering",
          options: ["First", "Second", "Third"],
          correctOrder: ["First", "Second", "Ghost"],
          correctAnswer: [],
        }),
      ).includes("order_not_permutation_of_options"),
    );
    assert.ok(
      codes(
        base({
          type: "ordering",
          options: ["First", "Second"],
          correctOrder: ["First", "First"],
          correctAnswer: [],
        }),
      ).includes("order_not_distinct"),
    );
  });

  it("enforces matching pair integrity", () => {
    assert.ok(
      codes(
        base({
          type: "matching",
          options: undefined,
          pairs: [["BTC", "  "], ["ETH", "smart contracts"]],
          correctAnswer: [],
        }),
      ).includes("pair_definition_blank"),
    );
    assert.ok(
      codes(
        base({
          type: "matching",
          options: undefined,
          pairs: [["BTC", "asset"], ["BTC", "duplicate term"]],
          correctAnswer: [],
        }),
      ).includes("pair_terms_not_distinct"),
    );
  });

  it("rejects blank metadata and unknown type/difficulty", () => {
    assert.ok(codes(base({ id: " " })).includes("id_blank"));
    assert.ok(codes(base({ question: "" })).includes("question_blank"));
    assert.ok(codes(base({ explanation: "  " })).includes("explanation_blank"));
    assert.ok(codes(base({ conceptTag: "" })).includes("concept_tag_blank"));
    assert.ok(
      codes(base({ difficulty: "trivial" as unknown as QuizQuestion["difficulty"] })).includes(
        "difficulty_invalid",
      ),
    );
    assert.ok(
      codes(base({ type: "essay" as unknown as QuizQuestion["type"] })).includes("type_invalid"),
    );
  });

  it("assertQuizQuestionValid throws a diagnosable error naming the id and codes", () => {
    assert.throws(
      () => assertQuizQuestionValid(base({ id: "bad-q", correctAnswer: "Not an option" })),
      /invalid_quiz_question:bad-q:answer_not_in_options/,
    );
  });

  it("proves every question in the canonical Term 1 bank is answerable", () => {
    const bank: QuizQuestion[] = [];
    for (const mod of TERM1.modules) {
      for (const lesson of mod.lessons) bank.push(...(lesson.knowledgeChecks ?? []));
      bank.push(...(mod.moduleQuiz ?? []));
    }
    bank.push(...(TERM1.termExam ?? []));

    assert.ok(bank.length > 0, "the canonical bank must contain questions");
    const invalid = findInvalidQuizQuestions(bank);
    assert.deepEqual(
      invalid,
      [],
      `canonical quiz questions must all be answerable; offenders: ${invalid
        .map((report) => `${report.id}(${report.violations.map((v) => v.code).join(",")})`)
        .join("; ")}`,
    );
  });
});
