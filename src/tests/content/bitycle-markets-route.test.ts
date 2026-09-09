import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/markets/route";

type RateLimitGlobal = typeof globalThis & {
  tecpeyRateLimitBuckets?: Map<string, { count: number; resetAt: number }>;
};

const ORIGINAL_FETCH = globalThis.fetch;
const SAVED_ENV = {
  BITYCLE_API_KEY: process.env.BITYCLE_API_KEY,
  BITYCLE_MARKET_SOURCE: process.env.BITYCLE_MARKET_SOURCE,
  BITYCLE_IRAN_SOURCES: process.env.BITYCLE_IRAN_SOURCES,
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

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function frame(
  source: string,
  market: string,
  price: number,
  updatedAt: string,
) {
  return {
    source,
    market,
    frame: "24h",
    open: price,
    high: price,
    low: price,
    price,
    volume: 1,
    updated_at: updatedAt,
  };
}

describe("Bitycle Markets route authority", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.REDIS_REST_URL;
    delete process.env.REDIS_REST_TOKEN;
    process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT = "1";
    (globalThis as RateLimitGlobal).tecpeyRateLimitBuckets = new Map();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreEnv("BITYCLE_API_KEY");
    restoreEnv("BITYCLE_MARKET_SOURCE");
    restoreEnv("BITYCLE_IRAN_SOURCES");
    restoreEnv("UPSTASH_REDIS_REST_URL");
    restoreEnv("UPSTASH_REDIS_REST_TOKEN");
    restoreEnv("REDIS_REST_URL");
    restoreEnv("REDIS_REST_TOKEN");
    restoreEnv("TECPEY_ALLOW_MEMORY_RATE_LIMIT");
    (globalThis as RateLimitGlobal).tecpeyRateLimitBuckets = new Map();
  });

  it("returns only timestamp-aligned local sources and preserves upstream provenance", async () => {
    process.env.BITYCLE_API_KEY = "test-bitycle-key";
    process.env.BITYCLE_MARKET_SOURCE = "binance_spot";
    process.env.BITYCLE_IRAN_SOURCES = "nobitex_spot,ramzinex_spot";

    const now = Date.now();
    const globalAt = new Date(now - 5_000).toISOString();
    const localAt = new Date(now - 7_000).toISOString();
    const staleAt = new Date(now - 5 * 60_000).toISOString();
    const requestedSources: string[] = [];

    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      assert.equal(url.hostname, "api.bitycle.com");
      assert.equal(url.pathname, "/api/exchange/source_markets_frame");
      assert.equal(url.searchParams.get("frame"), "24h");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-bitycle-key");

      const source = String(url.searchParams.get("source"));
      requestedSources.push(source);
      if (source === "binance_spot") {
        return jsonResponse({ data: [frame(source, "BTCUSDT", 65_000, globalAt)] });
      }
      if (source === "nobitex_spot") {
        return jsonResponse({
          data: [
            frame(source, "BTCIRT", 6_600_000_000, localAt),
            frame(source, "USDTIRT", 100_000, localAt),
          ],
        });
      }
      if (source === "ramzinex_spot") {
        return jsonResponse({
          data: [
            frame(source, "BTCIRT", 6_700_000_000, staleAt),
            frame(source, "USDTIRT", 100_000, staleAt),
          ],
        });
      }
      return jsonResponse({ data: [] }, 404);
    };

    const response = await GET(new NextRequest("https://tecpey.test/api/markets?source=iran"));
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      ok: boolean;
      reference: { source: string; price: number; updatedAt: string };
      local: Array<{ source: string; impliedBtcUsdt: number; premiumPercent: number; maxSkewMs: number }>;
      summary: { sourcesAvailable: number; sourcesRequested: number; maxComparisonSkewMs: number };
      provenance: { upstreamUpdatedAt: string; timestampAuthority: string };
    };

    assert.equal(payload.ok, true);
    assert.deepEqual([...requestedSources].sort(), ["binance_spot", "nobitex_spot", "ramzinex_spot"]);
    assert.equal(payload.reference.source, "binance_spot");
    assert.equal(payload.reference.price, 65_000);
    assert.equal(payload.reference.updatedAt, globalAt);
    assert.equal(payload.local.length, 1);
    assert.equal(payload.local[0].source, "nobitex_spot");
    assert.equal(payload.local[0].impliedBtcUsdt, 66_000);
    assert.ok(payload.local[0].premiumPercent > 1.53 && payload.local[0].premiumPercent < 1.54);
    assert.equal(payload.local[0].maxSkewMs, 2_000);
    assert.equal(payload.summary.sourcesAvailable, 1);
    assert.equal(payload.summary.sourcesRequested, 2);
    assert.equal(payload.summary.maxComparisonSkewMs, 2_000);
    assert.equal(payload.provenance.upstreamUpdatedAt, globalAt < localAt ? globalAt : localAt);
    assert.equal(payload.provenance.timestampAuthority, "source_markets_frame.updated_at");
  });

  it("fails closed when the global reference response does not match the requested source", async () => {
    process.env.BITYCLE_API_KEY = "test-bitycle-key";
    process.env.BITYCLE_MARKET_SOURCE = "gate_spot";
    process.env.BITYCLE_IRAN_SOURCES = "nobitex_spot";

    const updatedAt = new Date(Date.now() - 5_000).toISOString();
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const source = String(url.searchParams.get("source"));
      if (source === "gate_spot") {
        return jsonResponse({ data: [frame("bybit_spot", "BTCUSDT", 65_000, updatedAt)] });
      }
      return jsonResponse({
        data: [
          frame(source, "BTCIRT", 6_600_000_000, updatedAt),
          frame(source, "USDTIRT", 100_000, updatedAt),
        ],
      });
    };

    const response = await GET(new NextRequest("https://tecpey.test/api/markets?source=iran"));
    assert.equal(response.status, 503);
    const payload = await response.json() as { ok: boolean; error: string };
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "global_market_reference_unavailable");
  });
});
