// Quiz-question integrity authority for the Academy (issue: smart quizzes).
//
// Every quiz question — whether hand-authored in the canonical curriculum or
// generated from a lesson + a day's crypto-news event by the AI mentor — is
// graded on the client by QuizEngineV2.gradeAnswer and on the server by
// gradeQuestion (academy-assessment.ts). Both make silent per-type assumptions:
// a "single" answer must be selectable among the options, a "multi" answer set
// must all be options, an "ordering" answer must be a permutation of the
// presented items, and so on. A question that violates them is unanswerable:
// the learner can never score it correctly no matter what they pick.
//
// The client grader (QuizEngineV2) compares the raw selected option to the
// correct answer with strict equality — it does not trim or lowercase — so this
// authority enforces EXACT membership rather than a lenient trimmed match; a
// question the server would grade but the client cannot is still broken.
//
// Because generated output is untyped JSON, this validator must never throw on a
// malformed shape (e.g. `options: "A|B"`): it type-guards every collection and
// element before iterating and returns the malformation as a violation, so the
// gate can safely reject bad output. It is pure and deterministic — no I/O, no
// model calls.

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

function trimmed(values: string[]): string[] {
  return values.map((value) => value.trim());
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * Returns every integrity violation for a single question. An empty array means
 * the question is well-formed and answerable under both graders' contracts.
 * Never throws — a structurally malformed field is itself reported as a
 * violation so untyped generated output can be safely rejected.
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

  // options may be absent (fillblank/matching). When present it must be a
  // well-formed string array; a malformed shape is a violation, never a throw.
  let options: string[] | null = null;
  if (question.options !== undefined) {
    if (!Array.isArray(question.options) || question.options.some((o) => typeof o !== "string")) {
      add("options_not_string_array", "options, when present, must be an array of strings");
    } else {
      options = question.options;
    }
  }
  const checkChoiceOptions = () => {
    if (!options) {
      add("options_missing", "a choice question must present a string[] of options");
      return;
    }
    if (options.length < 2) add("options_insufficient", "must offer at least two options");
    options.forEach((option, index) => {
      if (!isNonBlank(option)) add("option_blank", `option ${index + 1} must be non-blank`);
    });
    if (hasDuplicates(trimmed(options))) add("options_not_distinct", "options must be distinct");
  };
  // Membership matches the client grader's raw strict equality.
  const optionIncludesExact = (value: string): boolean => !!options && options.includes(value);

  switch (question.type) {
    case "single":
    case "scenario": {
      checkChoiceOptions();
      if (typeof question.correctAnswer !== "string" || !isNonBlank(question.correctAnswer)) {
        add("answer_blank", "a single-choice answer must be a non-blank string");
      } else if (!optionIncludesExact(question.correctAnswer)) {
        add("answer_not_in_options", "the correct answer must exactly equal one of the options");
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
      if (answers.some((answer) => typeof answer !== "string")) {
        add("answer_not_string_array", "every multi-select answer must be a string");
        break;
      }
      if (answers.length === 0) add("answer_empty", "a multi-select must mark at least one correct option");
      if (answers.some((answer) => !isNonBlank(answer))) {
        add("answer_blank", "every correct answer must be non-blank");
      }
      if (hasDuplicates(trimmed(answers))) add("answers_not_distinct", "correct answers must be distinct");
      for (const answer of answers) {
        if (isNonBlank(answer) && !optionIncludesExact(answer)) {
          add("answer_not_in_options", `correct answer "${answer}" must exactly equal one of the options`);
        }
      }
      break;
    }
    case "fillblank": {
      if (typeof question.correctAnswer !== "string" || !isNonBlank(question.correctAnswer)) {
        add("answer_blank", "a fill-in-blank answer must be a non-blank string");
        break;
      }
      // The client grader compares against the raw, untrimmed '|' alternatives,
      // so a padded alternative (" usd ") can never match a learner's trimmed
      // input. Reject blank or whitespace-padded alternatives.
      const alternatives = question.correctAnswer.split("|");
      alternatives.forEach((alternative, index) => {
        if (alternative.trim().length === 0) {
          add("answer_alternative_blank", `fill-in-blank alternative ${index + 1} is blank`);
        } else if (alternative !== alternative.trim()) {
          add(
            "answer_alternative_padded",
            `fill-in-blank alternative ${index + 1} has leading/trailing whitespace the client grader rejects`,
          );
        }
      });
      break;
    }
    case "ordering": {
      if (question.correctOrder !== undefined && !Array.isArray(question.correctOrder)) {
        add("correct_order_not_array", "correctOrder must be an array when present");
        break;
      }
      const order = question.correctOrder ?? [];
      if (order.some((item) => typeof item !== "string")) {
        add("correct_order_not_string_array", "correctOrder must be an array of strings");
        break;
      }
      if (order.length < 2) add("order_insufficient", "an ordering must have at least two items");
      order.forEach((item, index) => {
        if (!isNonBlank(item)) add("order_item_blank", `order item ${index + 1} must be non-blank`);
      });
      if (hasDuplicates(trimmed(order))) add("order_not_distinct", "ordering items must be distinct");
      if (options) {
        // The client grader matches ordering positions by raw equality, so the
        // presented options and the correct order must be the same multiset.
        const sortedOptions = [...options].sort();
        const sortedOrder = [...order].sort();
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
      if (question.pairs !== undefined && !Array.isArray(question.pairs)) {
        add("pairs_not_array", "pairs must be an array when present");
        break;
      }
      const pairs = question.pairs ?? [];
      if (pairs.length < 2) add("pairs_insufficient", "a matching must have at least two pairs");
      const terms: string[] = [];
      pairs.forEach((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2 || pair.some((entry) => typeof entry !== "string")) {
          add("pair_malformed", `pair ${index + 1} must be [term, definition] strings`);
          return;
        }
        const [term, definition] = pair;
        if (!isNonBlank(term)) add("pair_term_blank", `pair ${index + 1} term must be non-blank`);
        if (!isNonBlank(definition)) add("pair_definition_blank", `pair ${index + 1} definition must be non-blank`);
        terms.push(term.trim());
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

/**
 * Validates a whole bank, returning only the questions that have violations.
 * Beyond per-question integrity it enforces one bank-level invariant: ids must
 * be unique. Submissions and canonical grading key answers by question id, so
 * two questions sharing an id collide — one response overwrites or is reused for
 * the other and they cannot both be graded. Every question in a colliding id
 * group is reported with a `duplicate_id` violation.
 */
export function findInvalidQuizQuestions(
  questions: QuizQuestion[],
): QuizQuestionBankReport[] {
  const idCounts = new Map<string, number>();
  for (const question of questions) {
    if (isNonBlank(question.id)) {
      idCounts.set(question.id, (idCounts.get(question.id) ?? 0) + 1);
    }
  }

  return questions
    .map((question) => {
      const violations = validateQuizQuestion(question);
      if (isNonBlank(question.id) && (idCounts.get(question.id) ?? 0) > 1) {
        violations.push({ code: "duplicate_id", detail: `question id "${question.id}" is not unique in the bank` });
      }
      return { id: question.id, violations };
    })
    .filter((report) => report.violations.length > 0);
}
