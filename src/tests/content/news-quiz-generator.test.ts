import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateNewsQuizBank,
  generateNewsQuizQuestion,
  PROHIBITED_CLAIM_PATTERN,
  type NewsQuizInput,
} from "../../lib/academy-news-quiz-generator";
import {
  findInvalidQuizQuestions,
  isQuizQuestionValid,
  validateQuizQuestion,
} from "../../lib/academy-quiz-authority";

// The news-driven generator is the smart-quiz path that turns a day's crypto
// news into exam questions. It must be fail-closed: every question it emits is
// answerable (passes the integrity authority), risk-first, and free of profit
// promises — no matter how malformed the upstream news item is.

const sample: NewsQuizInput = {
  id: "news-1",
  title: "Bitcoin ETF flows remain a key signal for institutional demand",
  category: "ETF & Institutions",
  tone: "neutral",
  impact: 8,
};

// Single source of truth: the same rule the generator enforces.
const PROFIT_PROMISE = PROHIBITED_CLAIM_PATTERN;

function questionText(input: NewsQuizInput, locale: "fa" | "en"): string {
  const q = generateNewsQuizQuestion(input, { locale });
  return [q.question, ...(q.options ?? []), String(q.correctAnswer), q.explanation].join("  ");
}

describe("News-driven quiz generation", () => {
  it("produces an answerable single-choice question in English", () => {
    const q = generateNewsQuizQuestion(sample, { locale: "en" });
    assert.deepEqual(validateQuizQuestion(q), []);
    assert.equal(q.type, "single");
    assert.ok((q.options ?? []).includes(String(q.correctAnswer)), "answer must be an option");
    assert.ok(q.question.includes(sample.title), "the prompt should reference the headline");
    assert.equal(q.difficulty, "hard", "impact 8 maps to hard");
  });

  it("produces a distinct, valid, localized question in Persian", () => {
    const en = generateNewsQuizQuestion(sample, { locale: "en" });
    const fa = generateNewsQuizQuestion(sample, { locale: "fa" });
    assert.equal(isQuizQuestionValid(fa), true);
    assert.notEqual(fa.id, en.id, "each locale gets its own id so a bilingual bank keeps both");
    assert.match(fa.question, /[؀-ۿ]/, "the Persian prompt must contain Persian text");
  });

  it("keeps the risk-first answer correct, never a hype choice", () => {
    for (const locale of ["en", "fa"] as const) {
      const q = generateNewsQuizQuestion(sample, { locale });
      assert.match(
        String(q.correctAnswer),
        locale === "en" ? /risk/i : /ریسک/,
        "the correct answer must be the risk-first option",
      );
    }
  });

  it("never emits profit-promise or price-prediction language", () => {
    const inputs: NewsQuizInput[] = [
      sample,
      { id: "n2", title: "Volatile week for altcoins", tone: "bearish", impact: 3 },
      { id: "n3", title: "Stablecoin regulation advances", tone: "bullish", impact: 6 },
    ];
    for (const input of inputs) {
      for (const locale of ["en", "fa"] as const) {
        assert.doesNotMatch(
          questionText(input, locale),
          PROFIT_PROMISE,
          `${locale} question for ${input.id} must not promise profit or predict price`,
        );
      }
    }
  });

  it("strips a hype headline instead of reproducing it in the prompt", () => {
    // The live feed is untrusted copy; a headline that itself promises profit or
    // predicts price must not reach the learner verbatim.
    const hype: NewsQuizInput[] = [
      { id: "h1", title: "Guaranteed profit: Bitcoin to the moon this week", impact: 7 },
      { id: "h2", title: "این کوین قطعاً رشد می‌کند و سود تضمینی دارد", impact: 7 },
      // Price predictions and multipliers must be caught in either word order.
      { id: "h3", title: "Analysts say Bitcoin will 10x and reach $1 million", impact: 7 },
      { id: "h4", title: "New price target: ETH to $10k, experts predict a rally", impact: 6 },
      { id: "h5", title: "هدف قیمت جدید: پیش‌بینی رشد ده برابری بیت‌کوین", impact: 6 },
    ];
    for (const input of hype) {
      for (const locale of ["en", "fa"] as const) {
        const q = generateNewsQuizQuestion(input, { locale });
        assert.equal(isQuizQuestionValid(q), true);
        assert.doesNotMatch(q.question, PROHIBITED_CLAIM_PATTERN, "the hype headline must not appear in the prompt");
        assert.doesNotMatch(questionText(input, locale), PROHIBITED_CLAIM_PATTERN);
      }
    }
  });

  it("fails closed to a valid question on malformed news items", () => {
    const malformed: NewsQuizInput[] = [
      { id: "", title: "", tone: "neutral" },
      { id: "n4", title: "   ", impact: Number.NaN },
      { id: "n5", title: "x", tone: "chaotic" as unknown as string, impact: 999 },
      { id: "n6", title: "A".repeat(400) },
    ];
    for (const input of malformed) {
      const q = generateNewsQuizQuestion(input, { locale: "en" });
      assert.equal(
        isQuizQuestionValid(q),
        true,
        `a malformed item (${input.id || "blank-id"}) must still yield a valid question`,
      );
      assert.ok((q.options ?? []).includes(String(q.correctAnswer)));
    }
  });

  it("builds a bank with unique ids where every question is valid", () => {
    const items: NewsQuizInput[] = [
      sample,
      { id: "news-2", title: "Security education stays the first rule", tone: "neutral", impact: 9 },
      { id: "news-1", title: "Duplicate source id should collapse", tone: "neutral", impact: 5 },
    ];
    const bank = generateNewsQuizBank(items, { locale: "en" });

    assert.deepEqual(findInvalidQuizQuestions(bank), [], "every generated question must be valid");
    assert.equal(bank.length, 2, "the duplicate source id must collapse to one question");
    assert.equal(new Set(bank.map((q) => q.id)).size, bank.length, "ids must be unique");
  });
});
