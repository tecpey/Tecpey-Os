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

  it("rejects a single-choice answer that is not exactly among the options", () => {
    assert.ok(codes(base({ correctAnswer: "Not an option" })).includes("answer_not_in_options"));
    // Exact membership matches the client grader (QuizEngineV2), which compares
    // the raw selected option to correctAnswer without trimming: a padded option
    // that only trims-equal to the answer is graded wrong, so it must be rejected.
    assert.ok(
      codes(base({ options: [" Correct choice ", "Wrong A"], correctAnswer: "Correct choice" })).includes(
        "answer_not_in_options",
      ),
    );
  });

  it("never throws on a structurally malformed collection; reports it as a violation", () => {
    // The gate validates untyped model-generated JSON, so a wrong-shaped field
    // must become a violation, not an exception.
    const malformed: QuizQuestion[] = [
      base({ options: "A|B" as unknown as string[] }),
      base({ type: "ordering", correctOrder: {} as unknown as string[], correctAnswer: [] }),
      base({ type: "matching", options: undefined, pairs: ".." as unknown as [string, string][], correctAnswer: [] }),
      base({ type: "multi", correctAnswer: [1, 2] as unknown as string[] }),
    ];
    const expected = [
      "options_not_string_array",
      "correct_order_not_array",
      "pairs_not_array",
      "answer_not_string_array",
    ];
    malformed.forEach((question, index) => {
      let result: string[] = [];
      assert.doesNotThrow(() => {
        result = codes(question);
      }, `malformed question ${index + 1} must not throw`);
      assert.equal(isQuizQuestionValid(question), false);
      assert.ok(
        result.includes(expected[index]),
        `expected ${expected[index]} for malformed question ${index + 1}, got ${result.join(",")}`,
      );
    });
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
    // The client grader does not trim '|' alternatives, so a padded alternative
    // can never match a learner's trimmed input.
    assert.ok(
      codes(base({ type: "fillblank", options: undefined, correctAnswer: "usd| dollar " })).includes(
        "answer_alternative_padded",
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

  it("flags duplicate ids across a bank as an integrity violation", () => {
    // Two individually valid questions that share an id collide: submissions and
    // canonical grading key answers by id, so one response is reused for both.
    const bank: QuizQuestion[] = [
      base({ id: "dup", correctAnswer: "Correct choice" }),
      base({ id: "dup", question: "A different prompt", correctAnswer: "Wrong A" }),
      base({ id: "unique" }),
    ];
    const invalid = findInvalidQuizQuestions(bank);
    const dupReports = invalid.filter((report) => report.id === "dup");
    assert.equal(dupReports.length, 2, "both colliding questions must be reported");
    for (const report of dupReports) {
      assert.ok(report.violations.some((violation) => violation.code === "duplicate_id"));
    }
    assert.equal(
      invalid.some((report) => report.id === "unique"),
      false,
      "a unique, well-formed question must not be reported",
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
