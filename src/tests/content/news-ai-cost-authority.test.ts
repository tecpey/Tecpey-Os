import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  estimateConfiguredCostUsdMicros,
  newsAiCostConfigFromEnv,
} from "../../lib/ops/news-ai-cost-authority";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NEWS_AI_DAILY_BUDGET_USD_MICROS: "1000000",
    NEWS_AI_MAX_CALL_COST_USD_MICROS: "100000",
    NEWS_AI_INPUT_COST_USD_MICROS_PER_MILLION_TOKENS: "400000",
    NEWS_AI_OUTPUT_COST_USD_MICROS_PER_MILLION_TOKENS: "1600000",
    NEWS_AI_COST_MAX_INPUT_TOKENS: "20000",
    NEWS_AI_COST_MAX_OUTPUT_TOKENS: "3200",
    NEWS_AI_RESERVATION_TTL_SECONDS: "300",
    ...overrides,
  };
}

describe("news AI cost authority", () => {
  it("calculates deterministic configured token cost in USD micros", () => {
    assert.equal(
      estimateConfiguredCostUsdMicros(1_000, 500, 400_000, 1_600_000),
      1_200,
    );
  });

  it("requires an explicit daily budget and per-call ceiling", () => {
    const missingBudget = env();
    delete missingBudget.NEWS_AI_DAILY_BUDGET_USD_MICROS;
    assert.throws(
      () => newsAiCostConfigFromEnv(missingBudget),
      /news_ai_daily_budget_usd_micros_required/,
    );

    const missingCallCeiling = env();
    delete missingCallCeiling.NEWS_AI_MAX_CALL_COST_USD_MICROS;
    assert.throws(
      () => newsAiCostConfigFromEnv(missingCallCeiling),
      /news_ai_max_call_cost_usd_micros_required/,
    );
  });

  it("rejects a call ceiling below the configured worst-case token cost", () => {
    assert.throws(
      () => newsAiCostConfigFromEnv(env({ NEWS_AI_MAX_CALL_COST_USD_MICROS: "10000" })),
      /news_ai_max_call_cost_below_configured_token_ceiling/,
    );
  });

  it("returns immutable bounded cost authority configuration", () => {
    const config = newsAiCostConfigFromEnv(env());
    assert.equal(config.dailyBudgetUsdMicros, 1_000_000);
    assert.equal(config.maxCallCostUsdMicros, 100_000);
    assert.equal(config.costMaxInputTokens, 20_000);
    assert.equal(config.costMaxOutputTokens, 3_200);
    assert.equal(config.reservationTtlSeconds, 300);
    assert.equal(Object.isFrozen(config), true);
  });
});
