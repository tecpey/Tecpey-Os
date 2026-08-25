import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toSafeNewsQuizBank, toSafeNewsQuizQuestion } from "../../lib/academy-news-quiz-view";
import { generateNewsQuizBank } from "../../lib/academy-news-quiz-generator";

const complete = {
  id: "q1",
  question: "Which check comes first?",
  options: ["A", "B", "C", "D"],
  correctAnswer: "B",
  explanation: "Evidence comes before interpretation.",
  difficulty: "hard",
  source: { name: "TecPey Research", url: "/crypto-news/q1", publishedAt: "2026-08-25T08:00:00Z" },
  learningObjective: "Verify provenance",
  optionRationales: { A: "A reason", B: "B reason", C: "C reason", D: "D reason" },
  mentorTakeaway: "Trace the source before deciding.",
  checklist: ["Source", "Time", "Correction"],
  lessonHref: "/en/academy/term/1/news-literacy",
  provenanceStatus: "complete",
};

describe("News-quiz view coercion", () => {
  it("accepts a complete source-grounded exercise", () => {
    const safe = toSafeNewsQuizQuestion(complete);
    assert.ok(safe);
    assert.equal(safe?.source.name, "TecPey Research");
    assert.equal(safe?.optionRationales.B, "B reason");
  });

  it("rejects missing provenance, rationale or an unscoreable answer", () => {
    assert.equal(toSafeNewsQuizQuestion({ ...complete, provenanceStatus: undefined }), null);
    assert.equal(toSafeNewsQuizQuestion({ ...complete, source: undefined }), null);
    assert.equal(toSafeNewsQuizQuestion({ ...complete, optionRationales: { A: "Only one" } }), null);
    assert.equal(toSafeNewsQuizQuestion({ ...complete, correctAnswer: "Z" }), null);
  });

  it("drops duplicate ids and malformed entries", () => {
    const bank = toSafeNewsQuizBank([complete, { ...complete, question: "Duplicate" }, { ...complete, id: "bad", source: {} }]);
    assert.equal(bank.length, 1);
    assert.deepEqual(toSafeNewsQuizBank(null), []);
  });

  it("passes through every complete exercise from the real generator", () => {
    const generated = generateNewsQuizBank(
      ["g1", "g2", "g3"].map((id) => ({
        id,
        title: `Verified report ${id}`,
        source: "TecPey Research",
        sourceUrl: `/crypto-news/${id}`,
        publishedAt: "2026-08-25T08:00:00Z",
      })),
      { locale: "en" },
    );
    const safe = toSafeNewsQuizBank(generated);
    assert.equal(safe.length, generated.length);
    assert.ok(safe.every((question) => question.options.includes(question.correctAnswer)));
  });
});
