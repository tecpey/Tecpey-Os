import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/crypto-news/route";
import { findInvalidQuizQuestions } from "../../lib/academy-quiz-authority";

// The public news route is a DB-only read surface. RSS ingestion, translation
// and AI research belong to scheduled workers and must never be activated by a
// visitor opening News/Home/Quiz. Positive quiz-generation behavior is covered
// by the pure news-quiz source/generator tests; this suite protects the runtime
// boundary and fail-closed behavior when persisted news is unavailable.

const realFetch = globalThis.fetch;
const TEST_NOW = Date.parse("2030-03-15T12:00:00.000Z");
let contentProviderFetches = 0;

beforeEach(() => {
  contentProviderFetches = 0;
  mock.timers.enable({ apis: ["Date"], now: TEST_NOW });
  globalThis.fetch = (async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === `${process.env.UPSTASH_REDIS_REST_URL}/pipeline`) {
      return new Response(JSON.stringify([{ result: "OK" }, { result: 1 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    contentProviderFetches += 1;
    throw new Error("public news GET must not perform external fetches");
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

async function callRoute(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await GET(new NextRequest(url));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("crypto-news DB-only route", () => {
  it("never triggers RSS or AI provider network calls on a public read", async () => {
    const { body } = await callRoute("http://localhost/api/crypto-news?locale=en");
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.items));
    assert.ok(Array.isArray(body.archiveItems));
    assert.equal(contentProviderFetches, 0);
  });

  it("omits quiz material unless quiz=1 is explicitly requested", async () => {
    const { body } = await callRoute("http://localhost/api/crypto-news?locale=en");
    assert.equal(body.newsQuiz, undefined);
    assert.equal(contentProviderFetches, 0);
  });

  it("builds only authority-valid quiz questions from persisted items", async () => {
    const { body } = await callRoute("http://localhost/api/crypto-news?locale=en&quiz=1");
    const quiz = body.newsQuiz as Parameters<typeof findInvalidQuizQuestions>[0];
    assert.ok(Array.isArray(quiz));
    assert.deepEqual(findInvalidQuizQuestions(quiz), []);
    assert.equal(new Set(quiz.map((question) => question.id)).size, quiz.length);
    assert.equal(contentProviderFetches, 0);
  });

  it("keeps automation preview pure and bounded to already persisted news", async () => {
    const { body } = await callRoute("http://localhost/api/crypto-news?locale=fa&quiz=1&automation=1");
    const automation = body.automation as { publishable: number; needsReview: number; rejected: number };
    assert.ok(automation && Number.isInteger(automation.publishable));
    assert.ok(Number.isInteger(automation.needsReview));
    assert.ok(Number.isInteger(automation.rejected));
    assert.equal(contentProviderFetches, 0);
  });


  it("keeps failed Persian translations out of the public archive feed", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync("src/lib/news-growth-authority.ts", "utf8"));
    assert.match(source, /WHERE \(\$2 <> 'fa' OR translation\.status = 'completed'\)/);
  });

  it("rejects invalid and future archive dates before reading content", async () => {
    const invalid = await callRoute("http://localhost/api/crypto-news?locale=en&date=2030-02-31");
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "news_archive_day_invalid");

    const future = await callRoute("http://localhost/api/crypto-news?locale=en&date=2030-03-16");
    assert.equal(future.status, 400);
    assert.equal(future.body.error, "news_archive_future_day_forbidden");
    assert.equal(contentProviderFetches, 0);
  });
});
