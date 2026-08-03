// Quiz-question integrity authority for the Academy (issue: smart quizzes).
//
// Every quiz question — whether hand-authored in the canonical curriculum or
// generated from a lesson + a day's crypto-news event by the AI mentor — is
// graded by gradeQuestion in academy-assessment.ts, which makes silent
// per-type assumptions: a "single" answer must be selectable among the options,
// a "multi" answer set must all be options, an "ordering" answer must be a
// permutation of the presented items, and so on. A question that violates those
// assumptions is unanswerable: the learner can never score it correctly no
// matter what they pick.
//
// This module is the fail-closed gate that makes "smart" (generated) questions
// safe and keeps the human-authored exams rigorous. It is pure and
// deterministic — no I/O, no model calls — so a news-to-quiz generator can
// validate its output before it ever reaches a learner, and CI can prove the
// entire canonical bank is answerable.

import type { QuizQuestion } from "@/data/academy/term1Curriculum";

export type QuizQuestionViolation = { code: string; detail: string };

const VALID_TYPES = new Set<QuizQuestion["type"]>([
  "single",
  "multi",
  "ordering",
  "matching",
  "fillblank",
  "scenario",
]);
const VALID_DIFFICULTY = new Set<QuizQuestion["difficulty"]>([
  "easy",
  "medium",
  "hard",
]);

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalized(values: string[]): string[] {
  return values.map((value) => value.trim());
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * Returns every integrity violation for a single question. An empty array means
 * the question is well-formed and answerable under gradeQuestion's contract.
 */
export function validateQuizQuestion(question: QuizQuestion): QuizQuestionViolation[] {
  const violations: QuizQuestionViolation[] = [];
  const add = (code: string, detail: string) => violations.push({ code, detail });

  if (!isNonBlank(question.id)) add("id_blank", "question id must be non-blank");
  if (!isNonBlank(question.question)) add("question_blank", "question prompt must be non-blank");
  if (!isNonBlank(question.explanation)) {
    add("explanation_blank", "explanation must be non-blank");
  }
  if (!isNonBlank(question.conceptTag)) add("concept_tag_blank", "conceptTag must be non-blank");
  if (!VALID_DIFFICULTY.has(question.difficulty)) {
    add("difficulty_invalid", `difficulty must be easy|medium|hard, got ${String(question.difficulty)}`);
  }
  if (!VALID_TYPES.has(question.type)) {
    add("type_invalid", `unknown question type ${String(question.type)}`);
    return violations;
  }

  const options = question.options ?? [];
  const checkChoiceOptions = () => {
    if (options.length < 2) add("options_insufficient", "must offer at least two options");
    options.forEach((option, index) => {
      if (!isNonBlank(option)) add("option_blank", `option ${index + 1} must be non-blank`);
    });
    if (hasDuplicates(normalized(options))) add("options_not_distinct", "options must be distinct");
  };

  switch (question.type) {
    case "single":
    case "scenario": {
      checkChoiceOptions();
      if (typeof question.correctAnswer !== "string" || !isNonBlank(question.correctAnswer)) {
        add("answer_blank", "a single-choice answer must be a non-blank string");
      } else if (!normalized(options).includes(question.correctAnswer.trim())) {
        add("answer_not_in_options", "the correct answer must be one of the options");
      }
      break;
    }
    case "multi": {
      checkChoiceOptions();
      if (!Array.isArray(question.correctAnswer)) {
        add("answer_not_array", "a multi-select answer must be an array");
        break;
      }
      const answers = question.correctAnswer;
      if (answers.length === 0) add("answer_empty", "a multi-select must mark at least one correct option");
      if (answers.some((answer) => !isNonBlank(answer))) {
        add("answer_blank", "every correct answer must be non-blank");
      }
      if (hasDuplicates(normalized(answers))) add("answers_not_distinct", "correct answers must be distinct");
      const optionSet = new Set(normalized(options));
      for (const answer of answers) {
        if (isNonBlank(answer) && !optionSet.has(answer.trim())) {
          add("answer_not_in_options", `correct answer "${answer}" is not one of the options`);
        }
      }
      break;
    }
    case "fillblank": {
      if (typeof question.correctAnswer !== "string" || !isNonBlank(question.correctAnswer)) {
        add("answer_blank", "a fill-in-blank answer must be a non-blank string");
        break;
      }
      const alternatives = question.correctAnswer.split("|").map((value) => value.trim());
      if (alternatives.some((value) => value.length === 0)) {
        add("answer_alternative_blank", "a '|'-separated answer alternative is blank");
      }
      break;
    }
    case "ordering": {
      const order = question.correctOrder ?? [];
      if (order.length < 2) add("order_insufficient", "an ordering must have at least two items");
      order.forEach((item, index) => {
        if (!isNonBlank(item)) add("order_item_blank", `order item ${index + 1} must be non-blank`);
      });
      if (hasDuplicates(normalized(order))) add("order_not_distinct", "ordering items must be distinct");
      if (options.length > 0) {
        const sortedOptions = [...normalized(options)].sort();
        const sortedOrder = [...normalized(order)].sort();
        const permutation =
          sortedOptions.length === sortedOrder.length &&
          sortedOptions.every((value, index) => value === sortedOrder[index]);
        if (!permutation) {
          add("order_not_permutation_of_options", "correctOrder must be a permutation of the options");
        }
      }
      break;
    }
    case "matching": {
      const pairs = question.pairs ?? [];
      if (pairs.length < 2) add("pairs_insufficient", "a matching must have at least two pairs");
      const terms: string[] = [];
      pairs.forEach((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2) {
          add("pair_malformed", `pair ${index + 1} must be [term, definition]`);
          return;
        }
        const [term, definition] = pair;
        if (!isNonBlank(term)) add("pair_term_blank", `pair ${index + 1} term must be non-blank`);
        if (!isNonBlank(definition)) add("pair_definition_blank", `pair ${index + 1} definition must be non-blank`);
        terms.push(String(term ?? "").trim());
      });
      if (hasDuplicates(terms)) add("pair_terms_not_distinct", "matching terms must be distinct");
      break;
    }
  }

  return violations;
}

export function isQuizQuestionValid(question: QuizQuestion): boolean {
  return validateQuizQuestion(question).length === 0;
}

/**
 * Throws on the first malformed question. The message names the id and the
 * violation codes so a generator's rejected output is diagnosable without
 * leaking the question's content into logs.
 */
export function assertQuizQuestionValid(question: QuizQuestion): void {
  const violations = validateQuizQuestion(question);
  if (violations.length > 0) {
    const codes = violations.map((violation) => violation.code).join(",");
    throw new Error(`invalid_quiz_question:${question.id || "<no-id>"}:${codes}`);
  }
}

export type QuizQuestionBankReport = {
  id: string;
  violations: QuizQuestionViolation[];
};

/** Validates a whole bank, returning only the questions that have violations. */
export function findInvalidQuizQuestions(
  questions: QuizQuestion[],
): QuizQuestionBankReport[] {
  return questions
    .map((question) => ({ id: question.id, violations: validateQuizQuestion(question) }))
    .filter((report) => report.violations.length > 0);
}
