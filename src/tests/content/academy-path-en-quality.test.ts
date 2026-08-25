import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { academyPathTermsEn } from "../../data/academyPathEn";

describe("English Academy path content quality", () => {
  it("uses term-specific questions without repeated fingerprints in terms 3–7", () => {
    const questions = academyPathTermsEn.slice(2).flatMap((term) => term.questions);
    const fingerprints = questions.map((question) => question.q.trim().toLowerCase());
    assert.equal(new Set(fingerprints).size, fingerprints.length);
  });

  it("balances authored correct-answer positions within each advanced term", () => {
    for (const term of academyPathTermsEn.slice(2)) {
      const counts = [0, 0, 0, 0];
      for (const question of term.questions) {
        const index = question.options.indexOf(question.answer);
        assert.ok(index >= 0, `term ${term.number}: answer must be an option`);
        counts[index] += 1;
      }
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `term ${term.number}: ${counts.join(",")}`);
    }
  });
});
