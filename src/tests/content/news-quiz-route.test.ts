import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/crypto-news/route";
import { findInvalidQuizQuestions } from "../../lib/academy-quiz-authority";

// The crypto-news route gained an opt-in `quiz=1` mode that turns the day's news
// items into validated, risk-first quiz questions. These tests drive the real
// route handler with the network disabled, so it uses its deterministic
// fallback items — no live RSS, no flakiness.

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function callRoute(url: string): Promise<Record<string, unknown>> {
  // Force every RSS fetch to fail so the route falls back to its static items.
  globalThis.fetch = (async () => {
    throw new Error("network disabled in test");
  }) as typeof fetch;
  const response = await GET(new NextRequest(url));
  return (await response.json()) as Record<string, unknown>;
}

describe("crypto-news route quiz mode", () => {
  it("omits the quiz bank unless it is opted in", async () => {
    const body = await callRoute("http://localhost/api/crypto-news?locale=en");
    assert.equal(body.ok, true);
    assert.equal(body.newsQuiz, undefined);
    assert.ok(Array.isArray(body.items) && body.items.length > 0, "news items are always returned");
  });

  it("returns a validated quiz bank when quiz=1", async () => {
    const body = await callRoute("http://localhost/api/crypto-news?locale=en&quiz=1");
    const quiz = body.newsQuiz as Parameters<typeof findInvalidQuizQuestions>[0];
    assert.ok(Array.isArray(quiz) && quiz.length > 0, "a quiz bank is present");
    assert.deepEqual(
      findInvalidQuizQuestions(quiz),
      [],
      "every generated question must be answerable",
    );
    assert.equal(new Set(quiz.map((q) => q.id)).size, quiz.length, "quiz ids are unique");
  });

  it("builds a Persian quiz for locale=fa", async () => {
    const body = await callRoute("http://localhost/api/crypto-news?locale=fa&quiz=1");
    const quiz = body.newsQuiz as Array<{ question: string }>;
    assert.ok(Array.isArray(quiz) && quiz.length > 0);
    assert.match(quiz[0].question, /[؀-ۿ]/, "the Persian quiz prompt must contain Persian text");
  });
});
