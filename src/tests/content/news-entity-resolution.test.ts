import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNewsEntities } from "../../services/news/entity-resolution";

function keys(text: string): string[] {
  return resolveNewsEntities(text).map((entity) => `${entity.type}:${entity.id}`);
}

describe("governed news entity resolution", () => {
  it("resolves project, network and regulator identities used by staging news", () => {
    const resolved = keys(
      "Bitwise launches tokenized portfolios on Base while Chainlink proof of reserve expands; " +
      "Moonwell reviews risk, Curve works with Resupply, Lighter grows perp activity and OFAC publishes an enforcement action.",
    );

    for (const expected of [
      "project:bitwise",
      "network:base",
      "project:chainlink",
      "project:moonwell",
      "project:curve",
      "project:resupply",
      "exchange:lighter",
      "regulator:ofac",
    ]) {
      assert.ok(resolved.includes(expected), `expected ${expected}`);
    }
  });

  it("resolves first-party enforcement identities without fabricating topic entities", () => {
    const resolved = keys(
      "The FBI and U.S. Department of Justice described a case while the U.S. SEC discussed regulation and payments.",
    );

    assert.ok(resolved.includes("regulator:fbi"));
    assert.ok(resolved.includes("regulator:us-doj"));
    assert.ok(resolved.includes("regulator:sec-us"));
    assert.equal(resolved.some((key) => key.includes("payments")), false);
    assert.equal(resolved.some((key) => key.includes("regulation")), false);
  });

  it("does not convert generic market narratives into fake concrete entities", () => {
    assert.deepEqual(
      resolveNewsEntities("DeFi payments regulation liquidity derivatives and market context remain active."),
      [],
    );
  });

  it("preserves existing coin/tool entities while enriching concrete identities", () => {
    const resolved = resolveNewsEntities(
      "Ethereum activity expands on Base through Coinbase.",
      [{ type: "coin", id: "ETH", label: "ETH", confidence: 0.86 }],
    );

    assert.ok(resolved.some((entity) => entity.type === "coin" && entity.id === "ETH"));
    assert.ok(resolved.some((entity) => entity.type === "network" && entity.id === "ethereum"));
    assert.ok(resolved.some((entity) => entity.type === "network" && entity.id === "base"));
    assert.ok(resolved.some((entity) => entity.type === "exchange" && entity.id === "coinbase"));
  });
});