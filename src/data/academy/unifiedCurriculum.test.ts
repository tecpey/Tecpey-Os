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
});
