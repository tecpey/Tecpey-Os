import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/crypto-news/route";
import { findInvalidQuizQuestions } from "../../lib/academy-quiz-authority";

// The crypto-news route gained an opt-in `quiz=1` mode that turns traceable live
// reports into validated, risk-first quiz questions. These tests drive the real
// route handler with deterministic RSS fixtures: the positive path proves a
// sourced report can become a question, while the offline path proves editorial
// fallback cards never masquerade as current news inside the quiz.

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const liveFeedEn = `<?xml version="1.0" encoding="UTF-8"?>
  <rss><channel><item>
    <title>Spot ETF flows reshape Bitcoin liquidity</title>
    <description>Daily creations and redemptions changed available market liquidity.</description>
    <link>https://example.com/research/bitcoin-etf-flows</link>
    <pubDate>Tue, 25 Aug 2026 08:00:00 GMT</pubDate>
  </item></channel></rss>`;

const liveFeedFa = `<?xml version="1.0" encoding="UTF-8"?>
  <rss><channel><item>
    <title>جریان صندوق‌های بیت‌کوین بر نقدشوندگی بازار اثر گذاشت</title>
    <description>داده‌های روزانه صندوق‌ها برای ارزیابی اثر بازار منتشر شد.</description>
    <link>https://example.com/fa/research/bitcoin-etf-flows</link>
    <pubDate>Tue, 25 Aug 2026 08:00:00 GMT</pubDate>
  </item></channel></rss>`;

async function callRoute(
  url: string,
  mode: "live" | "offline" = "live",
): Promise<Record<string, unknown>> {
  globalThis.fetch = (async (input) => {
    if (mode === "offline") throw new Error("network disabled in test");
    const requestUrl = input instanceof Request ? input.url : String(input);
    const body = requestUrl.includes("arzdigital.com") ? liveFeedFa : liveFeedEn;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
    });
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

  it("does not turn editorial fallback cards into current-news questions", async () => {
    const body = await callRoute(
      "http://localhost/api/crypto-news?locale=en&quiz=1",
      "offline",
    );
    assert.equal(body.mode, "fallback");
    assert.deepEqual(body.newsQuiz, []);
    assert.ok(Array.isArray(body.items) && body.items.length > 0, "fallback news cards remain available");
  });
});
