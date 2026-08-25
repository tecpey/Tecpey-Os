import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateNewsQuizBank,
  generateNewsQuizQuestion,
  PROHIBITED_CLAIM_PATTERN,
  type NewsQuizInput,
} from "../../lib/academy-news-quiz-generator";
import { findInvalidQuizQuestions, isQuizQuestionValid } from "../../lib/academy-quiz-authority";

function item(id: string, title = `Verified market report ${id}`): NewsQuizInput {
  return {
    id,
    title,
    impact: 7,
    source: "TecPey Research",
    sourceUrl: `/crypto-news/${id}`,
    publishedAt: "2026-08-25T08:00:00.000Z",
  };
}

describe("Source-grounded news quiz generation", () => {
  it("publishes a traceable, answerable exercise with option-specific rationales", () => {
    const question = generateNewsQuizQuestion(item("n1"), { locale: "en" });
    assert.equal(isQuizQuestionValid(question), true);
    assert.equal(question.provenanceStatus, "complete");
    assert.equal(question.source.name, "TecPey Research");
    assert.ok(question.options?.every((option) => question.optionRationales[option]));
    assert.ok(question.learningObjective);
    assert.ok(question.mentorTakeaway);
    assert.ok(question.checklist.length >= 3);
  });

  it("fails closed when source, URL or publication time is absent", () => {
    for (const incomplete of [
      { ...item("x1"), source: "" },
      { ...item("x2"), sourceUrl: "" },
      { ...item("x3"), publishedAt: "not-a-date" },
      { ...item("x4"), title: "" },
    ]) {
      assert.throws(() => generateNewsQuizQuestion(incomplete, { locale: "en" }), /provenance/);
    }
    assert.deepEqual(generateNewsQuizBank([{ id: "bad", title: "No source" }], { locale: "fa" }), []);
  });

  it("rotates four learning objectives and all four correct-answer positions", () => {
    const bank = generateNewsQuizBank([item("a"), item("b"), item("c"), item("d")], { locale: "en" });
    assert.equal(bank.length, 4);
    assert.equal(new Set(bank.map((question) => question.learningObjective)).size, 4);
    assert.deepEqual(
      bank.map((question) => question.options?.indexOf(String(question.correctAnswer))),
      [0, 1, 2, 3],
    );
    assert.equal(new Set(bank.map((question) => question.correctAnswer)).size, 4);
    assert.deepEqual(findInvalidQuizQuestions(bank), []);
  });

  it("localizes the exercise while preserving the same source contract", () => {
    const fa = generateNewsQuizQuestion(item("fa"), { locale: "fa" });
    const en = generateNewsQuizQuestion(item("fa"), { locale: "en" });
    assert.match(fa.question, /[؀-ۿ]/);
    assert.notEqual(fa.id, en.id);
    assert.deepEqual(fa.source, en.source);
  });

  it("neutralizes hype and prohibited prediction language", () => {
    const hype = item("hype", "Guaranteed profit: Bitcoin will 10x and reach $1 million");
    for (const locale of ["fa", "en"] as const) {
      const question = generateNewsQuizQuestion(hype, { locale });
      const text = [question.question, ...(question.options ?? []), question.explanation].join(" ");
      assert.doesNotMatch(text, PROHIBITED_CLAIM_PATTERN);
      assert.equal(question.question.includes(hype.title), false);
    }
  });

  it("collapses duplicate source ids", () => {
    const bank = generateNewsQuizBank([item("dup"), item("dup"), item("unique")], { locale: "fa" });
    assert.equal(bank.length, 2);
    assert.equal(new Set(bank.map((question) => question.id)).size, 2);
  });
});
