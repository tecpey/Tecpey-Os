import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGovernedNewsAutomationBatch,
  buildGovernedNewsSnapshot,
} from "../../lib/news-governed-pipeline";
import type { RawNewsInput } from "../../lib/news-automation";

const fetchedAt = "2026-09-12T06:30:00.000Z";

function input(overrides: Partial<RawNewsInput>): RawNewsInput {
  return {
    locale: "fa",
    title: "Bitcoin market update",
    summary: "Bitcoin market structure remains active while participants review liquidity and risk context.",
    sourceName: "CoinDesk",
    sourceUrl: "https://www.coindesk.com/markets/2026/09/12/bitcoin-market-update/",
    url: "https://www.coindesk.com/markets/2026/09/12/bitcoin-market-update/",
    publishedAt: "2026-09-12T06:20:00.000Z",
    fetchedAt,
    ...overrides,
  };
}

describe("governed news pipeline convergence", () => {
  it("keeps registry-known but readiness-incomplete The Defiant review-bound instead of unauthorized", () => {
    const snapshot = buildGovernedNewsSnapshot([
      input({
        title: "Curve assigns risk management to Resupply developers on Base",
        summary: "Curve DAO assigned risk work to Resupply developers while the Base ecosystem reviews protocol risk.",
        sourceName: "The Defiant",
        sourceUrl: "https://thedefiant.io/news/defi/curve-dao-yrisk-risk-provider-crvusd-llamalend",
        url: "https://thedefiant.io/news/defi/curve-dao-yrisk-risk-provider-crvusd-llamalend",
      }),
    ], { locale: "fa", generatedAt: fetchedAt });

    assert.equal(snapshot.publishable, 0);
    assert.equal(snapshot.needsReview, 1);
    assert.equal(snapshot.rejected, 0);
    const decision = snapshot.decisions[0];
    assert.ok(decision);
    assert.equal(decision.status, "needs_review");
    assert.equal(decision.intelligence.status, "human_review");
    assert.equal(decision.intelligence.reasons.includes("source_not_authorized"), false);
    assert.ok(decision.intelligence.reasons.includes("provider_not_enterprise_ready"));
    assert.ok(decision.intelligence.entities.some((entity) => entity.type === "project" && entity.id === "curve"));
    assert.ok(decision.intelligence.entities.some((entity) => entity.type === "project" && entity.id === "resupply"));
    assert.ok(decision.intelligence.entities.some((entity) => entity.type === "network" && entity.id === "base"));
    assert.equal(decision.intelligence.reasons.includes("missing_entities"), false);
  });

  it("resolves compliance entities for Chainalysis while preserving human review", () => {
    const snapshot = buildGovernedNewsSnapshot([
      input({
        title: "OFAC targets crypto-linked payments in new enforcement action",
        summary: "Chainalysis describes an OFAC action involving digital-asset payments and U.S. enforcement context.",
        sourceName: "Chainalysis",
        sourceUrl: "https://www.chainalysis.com/blog/ofac-iran-oil-payments-august-2026/",
        url: "https://www.chainalysis.com/blog/ofac-iran-oil-payments-august-2026/",
      }),
    ], { locale: "fa", generatedAt: fetchedAt });

    const decision = snapshot.decisions[0];
    assert.ok(decision);
    assert.equal(decision.status, "needs_review");
    assert.equal(decision.intelligence.status, "human_review");
    assert.ok(decision.intelligence.entities.some((entity) => entity.type === "regulator" && entity.id === "ofac"));
    assert.equal(decision.intelligence.reasons.includes("source_not_authorized"), false);
  });

  it("preserves auto-publication eligibility for a ready source with supported entity evidence", () => {
    const decisions = buildGovernedNewsAutomationBatch([
      input({
        title: "Bitcoin liquidity improves after institutional inflows",
        summary: "Bitcoin liquidity improved after institutional inflows while market participants monitored risk and depth.",
      }),
    ]);

    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]?.sourceAuthority.publicationDisposition, "auto_publish_eligible");
    assert.equal(decisions[0]?.status, "publishable");

    const snapshot = buildGovernedNewsSnapshot([
      input({
        title: "Bitcoin liquidity improves after institutional inflows",
        summary: "Bitcoin liquidity improved after institutional inflows while market participants monitored risk and depth.",
      }),
    ], { locale: "fa", generatedAt: fetchedAt });

    assert.equal(snapshot.publishable, 1);
    assert.equal(snapshot.rejected, 0);
    assert.equal(snapshot.decisions[0]?.intelligence.reasons.includes("source_not_authorized"), false);
  });

  it("keeps unknown sources fail-closed", () => {
    const snapshot = buildGovernedNewsSnapshot([
      input({
        sourceName: "Unknown Feed",
        sourceUrl: "https://unknown-source.example/news/bitcoin",
        url: "https://unknown-source.example/news/bitcoin",
      }),
    ], { locale: "fa", generatedAt: fetchedAt });

    assert.equal(snapshot.publishable, 0);
    assert.equal(snapshot.needsReview, 0);
    assert.equal(snapshot.rejected, 1);
    assert.equal(snapshot.decisions[0]?.status, "rejected");
    assert.equal(snapshot.decisions[0]?.intelligence.status, "rejected");
  });

  it("does not treat topic-only readiness as publication authority", () => {
    const snapshot = buildGovernedNewsSnapshot([
      input({
        title: "Payments infrastructure expands across a new corridor",
        summary: "A payments infrastructure update discusses settlement and merchant payments without naming a governed project.",
        sourceName: "The Defiant",
        sourceUrl: "https://thedefiant.io/news/payments/example",
        url: "https://thedefiant.io/news/payments/example",
      }),
    ], { locale: "fa", generatedAt: fetchedAt });

    const decision = snapshot.decisions[0];
    assert.ok(decision);
    assert.equal(decision.organicGrowth.readiness.ready, true);
    assert.equal(decision.intelligence.status, "human_review");
    assert.ok(decision.intelligence.reasons.includes("missing_entities"));
  });
});
