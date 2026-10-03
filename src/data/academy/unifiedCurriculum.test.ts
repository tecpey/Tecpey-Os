import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getUnifiedAcademyTerms } from "./unifiedCurriculum";

describe("unified Academy curriculum", () => {
  for (const locale of ["fa", "en"] as const) {
    it(`exposes all seven core terms through the V2 lesson contract for ${locale}`, () => {
      const terms = getUnifiedAcademyTerms(locale);
      assert.equal(terms.length, 7);
      assert.deepEqual(terms.map((term) => term.number), [1, 2, 3, 4, 5, 6, 7]);
      for (const term of terms) {
        const lessons = term.modules.flatMap((module) => module.lessons);
        assert.ok(lessons.length >= 6, `${locale} term ${term.number}: expected at least six lessons`);
        for (const lesson of lessons) {
          assert.ok(lesson.sections.length >= 3, `${lesson.id}: sections are required`);
          assert.ok(lesson.knowledgeChecks.length >= 2, `${lesson.id}: retrieval checks are required`);
          assert.equal(new Set(lesson.knowledgeChecks.map((check) => check.id)).size, lesson.knowledgeChecks.length, `${lesson.id}: retrieval checks must be distinct`);
          for (const check of lesson.knowledgeChecks) {
            assert.ok(check.conceptTag.includes(`lesson-${lesson.lessonIndex}`), `${lesson.id}: retrieval check must be lesson-specific`);
            assert.ok(check.options?.includes(check.correctAnswer as string), `${lesson.id}: retrieval answer must remain selectable`);
            assert.ok(check.explanation.trim().length > 40, `${lesson.id}: corrective feedback must explain the decision`);
          }
          assert.ok(lesson.flashcards.length >= 2, `${lesson.id}: spaced-review cards are required`);
          assert.ok(lesson.practiceExercise.prompt.trim(), `${lesson.id}: practice is required`);
          assert.ok(lesson.reflection.trim(), `${lesson.id}: reflection is required`);
          assert.ok(lesson.responsibleTradingInsert.trim(), `${lesson.id}: responsible-trading guard is required`);
        }
      }
    });
  }

  it("keeps FA and EN term and lesson topology aligned", () => {
    const fa = getUnifiedAcademyTerms("fa");
    const en = getUnifiedAcademyTerms("en");
    assert.deepEqual(
      en.map((term) => [term.number, term.modules.flatMap((module) => module.lessons).length]),
      fa.map((term) => [term.number, term.modules.flatMap((module) => module.lessons).length]),
    );
  });
  it("gives every term assessment explanatory feedback instead of answer-only copy", () => {
    for (const locale of ["fa", "en"] as const) {
      for (const term of getUnifiedAcademyTerms(locale)) {
        for (const question of term.termExam) {
          assert.ok(question.explanation.trim().length > 80, `${locale} term ${term.number}: assessment feedback must explain reasoning`);
          assert.ok(!question.explanation.includes("Connect it back to this lesson"), `${locale} term ${term.number}: generic feedback is forbidden`);
          assert.ok(!question.explanation.includes("پاسخ را به مفهوم همین درس برگردانید"), `${locale} term ${term.number}: generic feedback is forbidden`);
        }
      }
    }
  });

});
