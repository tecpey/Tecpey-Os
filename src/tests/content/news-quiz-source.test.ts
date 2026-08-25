import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNewsQuizBankFromFeed, toNewsQuizInput } from "../../lib/academy-news-quiz-source";
import { findInvalidQuizQuestions } from "../../lib/academy-quiz-authority";

const valid = {
  id: "news-1",
  title: "A verified market structure update",
  source: "TecPey Research",
  url: "/crypto-news/news-1",
  publishedAt: "2026-08-25T08:00:00.000Z",
  impact: 8,
};

describe("Crypto-news feed adapter", () => {
  it("maps provenance fields and accepts either url alias", () => {
    assert.deepEqual(toNewsQuizInput(valid), {
      id: valid.id,
      title: valid.title,
      category: undefined,
      tone: undefined,
      impact: 8,
      source: valid.source,
      sourceUrl: valid.url,
      publishedAt: valid.publishedAt,
    });
  });

  it("builds only complete, valid exercises and drops malformed feed items", () => {
    const bank = buildNewsQuizBankFromFeed([
      valid,
      { ...valid, id: "missing-source", source: undefined },
      { ...valid, id: "bad-date", publishedAt: "yesterday-ish" },
      null as never,
    ], { locale: "en" });
    assert.equal(bank.length, 1);
    assert.deepEqual(findInvalidQuizQuestions(bank), []);
  });

  it("returns an empty bank for a non-array input", () => {
    assert.deepEqual(buildNewsQuizBankFromFeed(null, { locale: "en" }), []);
    assert.deepEqual(buildNewsQuizBankFromFeed(undefined, { locale: "fa" }), []);
    assert.deepEqual(buildNewsQuizBankFromFeed({} as never, { locale: "en" }), []);
  });
});
