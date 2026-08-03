import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { academyPathTerms } from "../../data/academyPath";
import { academyPathTermsEn } from "../../data/academyPathEn";

// Academy fa/en synchronisation + quiz integrity guard.
//
// The Persian (academyPathTerms) and English (academyPathTermsEn) learning paths
// are meant to be the same curriculum in two languages. Without a guard they
// drift silently: a term, a lesson or a quiz question added to one language and
// forgotten in the other ships a lopsided academy. This test pins structural
// parity between the two paths so a change to one language fails closed until the
// other is updated to match.
//
// It also enforces a language-independent quiz-integrity invariant that raises
// the rigor of the exams themselves: every question must present a real choice
// (at least two distinct options) and its declared answer must be exactly one of
// those options. A quiz whose answer is missing from its options — a copy/paste
// or translation slip — can never be answered correctly by a learner; this guard
// makes that unshippable in either language.

type QuizQuestion = { q: string; options: string[]; answer: string };
type PathTerm = {
  number: number;
  slug: string;
  lessons: string[][];
  questions: QuizQuestion[];
};

const fa = academyPathTerms as unknown as PathTerm[];
const en = academyPathTermsEn as unknown as PathTerm[];

function assertQuizIntegrity(terms: PathTerm[], lang: string): void {
  for (const term of terms) {
    for (const [index, question] of term.questions.entries()) {
      const where = `${lang} term ${term.number} question ${index + 1}`;

      assert.ok(
        Array.isArray(question.options) && question.options.length >= 2,
        `${where}: a quiz question must offer at least two options`,
      );
      for (const [optionIndex, option] of question.options.entries()) {
        assert.ok(
          typeof option === "string" && option.trim().length > 0,
          `${where} option ${optionIndex + 1}: a quiz option must have non-blank content`,
        );
      }
      assert.equal(
        new Set(question.options).size,
        question.options.length,
        `${where}: quiz options must be distinct`,
      );
      assert.ok(
        question.options.includes(question.answer),
        `${where}: the declared answer must be one of the options`,
      );
      assert.ok(
        typeof question.q === "string" && question.q.trim().length > 0,
        `${where}: a quiz question must have a prompt`,
      );
    }
  }
}

describe("Academy learning path fa/en parity", () => {
  it("ships the same number of terms in both languages", () => {
    assert.ok(fa.length > 0, "the Persian path must have terms");
    assert.equal(
      en.length,
      fa.length,
      "the English path must have the same number of terms as the Persian path",
    );
  });

  it("keeps term identity, lesson counts and quiz counts aligned across languages", () => {
    for (let i = 0; i < fa.length; i++) {
      const faTerm = fa[i];
      const enTerm = en[i];
      const where = `term index ${i}`;

      assert.equal(enTerm.number, faTerm.number, `${where}: term number must match`);
      assert.equal(enTerm.slug, faTerm.slug, `${where}: term slug must match`);

      assert.equal(
        enTerm.lessons.length,
        faTerm.lessons.length,
        `term ${faTerm.number}: lesson count must match across languages`,
      );
      for (let l = 0; l < faTerm.lessons.length; l++) {
        assert.equal(
          enTerm.lessons[l].length,
          faTerm.lessons[l].length,
          `term ${faTerm.number} lesson ${l + 1}: section count must match across languages`,
        );
      }

      assert.equal(
        enTerm.questions.length,
        faTerm.questions.length,
        `term ${faTerm.number}: quiz question count must match across languages`,
      );
      for (let q = 0; q < faTerm.questions.length; q++) {
        assert.equal(
          enTerm.questions[q].options.length,
          faTerm.questions[q].options.length,
          `term ${faTerm.number} question ${q + 1}: option count must match across languages`,
        );
      }
    }
  });

  it("keeps every quiz answerable in the Persian path", () => {
    assertQuizIntegrity(fa, "fa");
  });

  it("keeps every quiz answerable in the English path", () => {
    assertQuizIntegrity(en, "en");
  });
});
