import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/markets/route";

type RateLimitGlobal = typeof globalThis & {
  tecpeyRateLimitBuckets?: Map<string, { count: number; resetAt: number }>;
};

const ORIGINAL_FETCH = globalThis.fetch;
const SAVED_ENV = {
  BITYCLE_API_KEY: process.env.BITYCLE_API_KEY,
  COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  REDIS_REST_URL: process.env.REDIS_REST_URL,
  REDIS_REST_TOKEN: process.env.REDIS_REST_TOKEN,
  TECPEY_ALLOW_MEMORY_RATE_LIMIT: process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT,
};

function restoreEnv(name: keyof typeof SAVED_ENV) {
  const value = SAVED_ENV[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("public market search fallback", () => {
  beforeEach(() => {
    delete process.env.BITYCLE_API_KEY;
    process.env.COINGECKO_API_KEY = "cg-test-key";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.REDIS_REST_URL;
    delete process.env.REDIS_REST_TOKEN;
    process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT = "1";
    (globalThis as RateLimitGlobal).tecpeyRateLimitBuckets = new Map();
  });

  afterEach(() => {
    mock.timers.reset();
    globalThis.fetch = ORIGINAL_FETCH;
    for (const name of Object.keys(SAVED_ENV) as Array<keyof typeof SAVED_ENV>) {
      restoreEnv(name);
    }
    (globalThis as RateLimitGlobal).tecpeyRateLimitBuckets = new Map();
  });

  it("limits the public price response cache to remaining upstream validity", async () => {
    const now = Date.parse("2030-03-15T12:00:00.000Z");
    mock.timers.enable({ apis: ["Date"], now });
    for (const [age, expected] of [[299_000, "public, max-age=0, s-maxage=1, must-revalidate"], [299_500, "no-store"]] as const) {
      globalThis.fetch = async () => jsonResponse([{
        id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 64_000,
        last_updated: new Date(now - age).toISOString(),
      }]);
      const response = await GET(new NextRequest("https://tecpey.test/api/markets?source=public"));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), expected);
      const payload = await response.json();
      assert.equal(payload.data.length, 1);
      assert.equal(payload.provenance.upstreamUpdatedAt, new Date(now - age).toISOString());
    }
  });

  it("rejects stale price results for a matched search while preserving real empty searches", async () => {
    const now = Date.parse("2030-03-15T12:00:00.000Z");
    mock.timers.enable({ apis: ["Date"], now });
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return url.pathname === "/api/v3/search"
        ? jsonResponse({ coins: [{ id: "expired-price" }] })
        : jsonResponse([{ id: "expired-price", symbol: "old", name: "Old", current_price: 1, last_updated: new Date(now - 300_001).toISOString() }]);
    };
    const response = await GET(new NextRequest("https://tecpey.test/api/markets?source=public&search=expiry-proof"));
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.error, "market_data_unavailable");
    assert.equal(payload.data, undefined);
  });

  it("uses CoinGecko search IDs before market lookup and paginates search results", async () => {
    const calls: URL[] = [];
    const lastUpdated = new Date().toISOString();

    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      calls.push(url);
      assert.equal(url.hostname, "api.coingecko.com");
      assert.equal(new Headers(init?.headers).get("x-cg-demo-api-key"), "cg-test-key");

      if (url.pathname === "/api/v3/search") {
        assert.equal(url.searchParams.get("query"), "rare");
        return jsonResponse({
          coins: [
            { id: "rare-one", name: "Rare One", symbol: "R1" },
            { id: "rare-two", name: "Rare Two", symbol: "R2" },
            { id: "rare-three", name: "Rare Three", symbol: "R3" },
          ],
        });
      }

      assert.equal(url.pathname, "/api/v3/coins/markets");
      assert.equal(url.searchParams.get("ids"), "rare-three");
      assert.equal(url.searchParams.get("page"), "1");
      assert.equal(url.searchParams.get("per_page"), "1");
      return jsonResponse([{
        id: "rare-three",
        symbol: "r3",
        name: "Rare Three",
        image: "https://example.test/r3.png",
        current_price: 3.5,
        market_cap: 3500,
        market_cap_rank: 333,
        total_volume: 120,
        price_change_percentage_24h: 1.25,
        last_updated: lastUpdated,
      }]);
    };

    const response = await GET(new NextRequest(
      "https://tecpey.test/api/markets?source=public&search=rare&page=2&limit=2",
    ));
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      ok: boolean;
      data: Array<{ id: string; symbol: string }>;
      meta: { current_page: number; last_page: number; total: number };
      provenance: { provider: string; fallback: boolean };
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0].id, "coingecko:rare-three");
    assert.equal(payload.data[0].symbol, "R3");
    assert.deepEqual(payload.meta, { current_page: 2, last_page: 2, total: 3 });
    assert.equal(payload.provenance.provider, "CoinGecko");
    assert.equal(payload.provenance.fallback, false);
    assert.equal(calls.length, 2);
  });

  it("returns a successful empty search result without fabricating market rows", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      assert.equal(url.pathname, "/api/v3/search");
      return jsonResponse({ coins: [] });
    };

    const response = await GET(new NextRequest(
      "https://tecpey.test/api/markets?source=public&search=not-a-real-coin&page=1&limit=30",
    ));
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      ok: boolean;
      data: unknown[];
      meta: { current_page: number; last_page: number; total: number };
    };
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.data, []);
    assert.deepEqual(payload.meta, { current_page: 1, last_page: 1, total: 0 });
  });
});
