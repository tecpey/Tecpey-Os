import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findGovernedNewsSource,
  newsSourceAuthorityDrift,
  resolveNewsSourceAuthority,
} from "../../services/news/source-authority";

describe("news source authority convergence", () => {
  it("resolves capture-registry sources as known identities instead of unknown providers", () => {
    for (const domain of ["thedefiant.io", "chainalysis.com", "sec.gov", "coindesk.com"]) {
      const source = findGovernedNewsSource(domain);
      assert.ok(source, `${domain} must be governed by NEWS_SOURCE_REGISTRY`);
      const decision = resolveNewsSourceAuthority(domain);
      assert.equal(decision.registryKnown, true);
      assert.notEqual(decision.reasons[0], "source_not_in_registry");
    }
  });

  it("keeps unknown sources fail-closed", () => {
    const decision = resolveNewsSourceAuthority("https://unknown-source.example/story");
    assert.equal(decision.registryKnown, false);
    assert.equal(decision.publicationDisposition, "blocked");
    assert.deepEqual(decision.reasons, ["source_not_in_registry"]);
  });

  it("does not mistake readiness catalog drift for an unauthorized capture source", () => {
    const defiant = resolveNewsSourceAuthority("https://thedefiant.io/news/example");
    const chainalysis = resolveNewsSourceAuthority("https://www.chainalysis.com/blog/example");

    assert.equal(defiant.registryKnown, true);
    assert.equal(chainalysis.registryKnown, true);
    assert.equal(defiant.publicationDisposition, "human_review");
    assert.equal(chainalysis.publicationDisposition, "human_review");
    assert.ok(defiant.reasons.includes("provider_readiness_missing_or_blocked"));
    assert.ok(chainalysis.reasons.includes("provider_readiness_missing_or_blocked"));
  });

  it("surfaces registry/readiness drift deterministically for operational gating", () => {
    const drift = newsSourceAuthorityDrift();
    const byDomain = new Map(drift.map((entry) => [entry.domain, entry]));

    assert.equal(byDomain.get("thedefiant.io")?.providerStatus, "blocked");
    assert.equal(byDomain.get("chainalysis.com")?.providerStatus, "blocked");
    assert.equal(byDomain.get("coindesk.com")?.providerStatus, "ready");
  });
});