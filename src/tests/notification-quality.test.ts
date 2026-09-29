import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNotificationQuality } from "../lib/notifications/quality";

test("high-quality authoritative optional notification remains eligible", () => {
  assert.deepEqual(
    evaluateNotificationQuality({
      relevance: 0.9,
      freshness: 0.95,
      fatigue: 0.1,
      authoritative: true,
    }),
    { decision: "eligible", reason: "quality_eligible", score: 0.745 },
  );
});

test("missing authority fails closed regardless of engagement quality", () => {
  const result = evaluateNotificationQuality({
    relevance: 1,
    freshness: 1,
    fatigue: 0,
    authoritative: false,
  });
  assert.equal(result.decision, "suppress");
  assert.equal(result.reason, "authority_missing");
});

test("stale information is suppressed before relevance can rescue it", () => {
  const result = evaluateNotificationQuality({
    relevance: 1,
    freshness: 0.19,
    fatigue: 0,
    authoritative: true,
  });
  assert.equal(result.decision, "suppress");
  assert.equal(result.reason, "stale");
});

test("fatigue budget converts otherwise strong optional interruption to digest", () => {
  const result = evaluateNotificationQuality({
    relevance: 1,
    freshness: 1,
    fatigue: 0.8,
    authoritative: true,
  });
  assert.equal(result.decision, "digest");
  assert.equal(result.reason, "fatigue_budget");
});

test("low relevance is digestible rather than interruptive", () => {
  const result = evaluateNotificationQuality({
    relevance: 0.2,
    freshness: 1,
    fatigue: 0,
    authoritative: true,
  });
  assert.equal(result.decision, "digest");
  assert.equal(result.reason, "low_relevance");
});

test("malformed or adversarial quality facts fail closed", () => {
  for (const facts of [
    { relevance: -0.1, freshness: 1, fatigue: 0, authoritative: true },
    { relevance: 1.1, freshness: 1, fatigue: 0, authoritative: true },
    { relevance: 1, freshness: Number.NaN, fatigue: 0, authoritative: true },
    { relevance: 1, freshness: 1, fatigue: Number.POSITIVE_INFINITY, authoritative: true },
  ]) {
    const result = evaluateNotificationQuality(facts);
    assert.deepEqual(result, {
      decision: "suppress",
      reason: "invalid_quality_facts",
      score: 0,
    });
  }
});

test("deterministic evaluation returns identical evidence for identical facts", () => {
  const facts = {
    relevance: 0.73,
    freshness: 0.81,
    fatigue: 0.22,
    authoritative: true,
  } as const;
  assert.deepEqual(evaluateNotificationQuality(facts), evaluateNotificationQuality(facts));
});
