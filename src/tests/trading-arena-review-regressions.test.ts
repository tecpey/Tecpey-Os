import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Trading Arena review regressions", () => {
  it("keeps optional Arena evidence from failing an otherwise valid Mentor request", () => {
    const route = readFileSync("src/app/api/ai-mentor/route.ts", "utf8");
    assert.match(
      route,
      /loadArenaMentorRiskContext\([\s\S]*?\)\s*\.catch\(\(\) => null\)/,
    );
  });

  it("never displays bars settled for a previous asset or resolution", () => {
    const chart = readFileSync(
      "src/components/academy/trading-arena/ArenaMarketChart.tsx",
      "utf8",
    );
    assert.match(chart, /const queryKey = `\$\{asset\}:\$\{resolution\}:\$\{refresh\}`/);
    assert.match(
      chart,
      /const displayState = settledQueryKey === queryKey \? state : "loading"/,
    );
    assert.doesNotMatch(chart, /\{state === "ready"/);
  });

  it("uses projected equity for drawdown telemetry and withholds unavailable execution prices", () => {
    const client = readFileSync(
      "src/components/academy/trading-arena/TradingArenaExecutionClient.tsx",
      "utf8",
    );
    assert.match(
      client,
      /computeArenaProjectedDrawdownTelemetry\(\s*snapshot\.state,\s*snapshot\.projectedEquity,?\s*\)/,
    );
    assert.match(
      client,
      /livePrice=\{snapshot\.marketStatus === "available" \? market\?\.prices\[selectedAsset\] \?\? null : null\}/,
    );
    const parser = readFileSync("src/lib/trading-arena-client.ts", "utf8");
    assert.match(
      parser,
      /source\.marketStatus === "available" && responseMarket/,
    );
    const route = readFileSync(
      "src/app/api/trading-arena/execution/route.ts",
      "utf8",
    );
    assert.match(
      route,
      /marketStatus: requestedMarket \? "available" as const : "unavailable" as const/,
    );
    assert.match(
      route,
      /error: "revision_conflict"[\s\S]*?marketStatus: "unavailable" as const/,
    );
  });
});
