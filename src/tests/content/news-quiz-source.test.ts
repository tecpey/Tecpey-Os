import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNewsQuizBankFromFeed,
  toNewsQuizInput,
  type CryptoNewsFeedItem,
} from "../../lib/academy-news-quiz-source";
import {
  findInvalidQuizQuestions,
  isQuizQuestionValid,
} from "../../lib/academy-quiz-authority";
import { PROHIBITED_CLAIM_PATTERN } from "../../lib/academy-news-quiz-generator";

// The adapter maps the untrusted /api/crypto-news feed into validated quiz
// questions. It must be defensive (never throw on malformed feed JSON) and
// preserve the generator's guarantees: every question is answerable and free of
// profit-promise language, no matter what the feed sends.

const feed: CryptoNewsFeedItem[] = [
  {
    id: "news-1",
    title: "Bitcoin ETF flows remain a key signal for institutional demand",
    category: "ETF & Institutions",
    tone: "neutral",
    impact: 8,
  },
  {
    id: "news-2",
    title: "Security education stays the first rule before any trade",
    category: "Security",
    tone: "neutral",
    impact: 9,
  },
];

describe("Crypto-news feed → quiz adapter", () => {
  it("builds a valid, unique-id bank from a realistic feed", () => {
    const bank = buildNewsQuizBankFromFeed(feed, { locale: "en" });
    assert.equal(bank.length, 2);
    assert.deepEqual(findInvalidQuizQuestions(bank), []);
    assert.equal(new Set(bank.map((q) => q.id)).size, bank.length);
  });

  it("coerces malformed feed items without throwing", () => {
    const malformed: CryptoNewsFeedItem[] = [
      { id: "ok", title: "A normal headline", impact: 5 },
      { id: 123 as unknown as string, title: 456 as unknown as string, impact: "high" as unknown as number },
      { title: "No id but a title" },
      { id: "  ", title: "   " },
      null as unknown as CryptoNewsFeedItem,
      {},
    ];
    let bank: ReturnType<typeof buildNewsQuizBankFromFeed> = [];
    assert.doesNotThrow(() => {
      bank = buildNewsQuizBankFromFeed(malformed, { locale: "en" });
    });
    // Every question that survives coercion must be answerable.
    assert.deepEqual(findInvalidQuizQuestions(bank), []);
    for (const q of bank) assert.equal(isQuizQuestionValid(q), true);
  });

  it("returns an empty bank for non-array input", () => {
    assert.deepEqual(buildNewsQuizBankFromFeed(null, { locale: "en" }), []);
    assert.deepEqual(buildNewsQuizBankFromFeed(undefined, { locale: "fa" }), []);
    assert.deepEqual(
      buildNewsQuizBankFromFeed({} as unknown as CryptoNewsFeedItem[], { locale: "en" }),
      [],
    );
    assert.deepEqual(buildNewsQuizBankFromFeed([], { locale: "en" }), []);
  });

  it("never lets a hype feed headline reach the learner", () => {
    const hypeFeed: CryptoNewsFeedItem[] = [
      { id: "h1", title: "Guaranteed profit: Bitcoin to the moon this week", impact: 7 },
      { id: "h2", title: "این کوین قطعاً رشد می‌کند و سود تضمینی دارد", impact: 7 },
    ];
    for (const locale of ["en", "fa"] as const) {
      const bank = buildNewsQuizBankFromFeed(hypeFeed, { locale });
      assert.equal(bank.length, 2);
      for (const q of bank) {
        assert.equal(isQuizQuestionValid(q), true);
        const text = [q.question, ...(q.options ?? []), String(q.correctAnswer), q.explanation].join("  ");
        assert.doesNotMatch(text, PROHIBITED_CLAIM_PATTERN);
      }
    }
  });

  it("maps feed fields onto the generator input shape", () => {
    const input = toNewsQuizInput({ id: "x", title: "Headline", category: "Market", tone: "bullish", impact: 6 });
    assert.deepEqual(input, { id: "x", title: "Headline", category: "Market", tone: "bullish", impact: 6 });
    // A non-finite impact becomes undefined (the generator then defaults difficulty).
    assert.equal(toNewsQuizInput({ id: "y", title: "H", impact: Number.NaN }).impact, undefined);
  });
});
