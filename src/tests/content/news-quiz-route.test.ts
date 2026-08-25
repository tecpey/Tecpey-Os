import { afterEach, beforeEach, describe, it, mock } from "node:test";
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
const TEST_NOW = Date.parse("2030-03-15T12:00:00.000Z");
const LIVE_PUBLISHED_AT = new Date(TEST_NOW - 60 * 60 * 1000).toUTCString();

beforeEach(() => {
  mock.timers.enable({ apis: ["Date"], now: TEST_NOW });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

const liveFeedEn = `<?xml version="1.0" encoding="UTF-8"?>
  <rss><channel><item>
    <title>Spot ETF flows reshape Bitcoin liquidity</title>
    <description>Daily creations and redemptions changed available market liquidity.</description>
    <link>https://example.com/research/bitcoin-etf-flows</link>
    <pubDate>${LIVE_PUBLISHED_AT}</pubDate>
  </item></channel></rss>`;

const liveFeedFa = `<?xml version="1.0" encoding="UTF-8"?>
  <rss><channel><item>
    <title>جریان صندوق‌های بیت‌کوین بر نقدشوندگی بازار اثر گذاشت</title>
    <description>داده‌های روزانه صندوق‌ها برای ارزیابی اثر بازار منتشر شد.</description>
    <link>https://example.com/fa/research/bitcoin-etf-flows</link>
    <pubDate>${LIVE_PUBLISHED_AT}</pubDate>
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
      "http://localhost/api/crypto-news?locale=en&quiz=1&automation=1",
      "offline",
    );
    assert.equal(body.mode, "fallback");
    assert.deepEqual(body.newsQuiz, []);
    const items = body.items as Array<{ publishedAt: string; isBreaking?: boolean }>;
    assert.ok(Array.isArray(items) && items.length > 0, "fallback learning cards remain available");
    assert.ok(items.every((item) => item.publishedAt === ""), "fallback cards must not invent a current publish time");
    assert.ok(items.every((item) => item.isBreaking !== true), "fallback cards must never claim to be breaking news");
    const automation = body.automation as { publishable: number; needsReview: number; rejected: number };
    assert.deepEqual(
      [automation.publishable, automation.needsReview, automation.rejected],
      [0, 0, 0],
      "fallback learning cards must not enter the live-news automation pipeline",
    );
  });

  it("fails closed when a source omits a trustworthy publication timestamp", async () => {
    const undatedFeed = `<?xml version="1.0" encoding="UTF-8"?>
      <rss><channel><item>
        <title>Undated Bitcoin market claim</title>
        <description>This report intentionally has no publication timestamp.</description>
        <link>https://example.com/research/undated-bitcoin-claim</link>
      </item></channel></rss>`;
    globalThis.fetch = (async () => new Response(undatedFeed, {
      status: 200,
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
    })) as typeof fetch;

    const response = await GET(new NextRequest("http://localhost/api/crypto-news?locale=en&quiz=1"));
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.mode, "fallback");
    assert.deepEqual(body.newsQuiz, []);
  });
});
