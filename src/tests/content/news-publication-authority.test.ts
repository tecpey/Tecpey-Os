import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { approvedNewsPublicationSources } from "../../lib/ops/news-publication-authority";
import { NEWS_SOURCE_REGISTRY } from "../../lib/news-source-registry";

describe("news publication source authority", () => {
  it("covers every registered source domain with publishable trust", () => {
    const publicationSources = approvedNewsPublicationSources();

    for (const registered of NEWS_SOURCE_REGISTRY) {
      const approved = publicationSources.find((source) =>
        registered.canonicalDomains.some((domain) => source.domain === domain),
      );
      assert.ok(approved, `${registered.id} missing from publication authority`);
      assert.ok(approved.trustScore >= 0.7, `${registered.id} trust below publication floor`);
    }
  });

  it("does not create duplicate domain authorities", () => {
    const domains = approvedNewsPublicationSources().map((source) => source.domain);
    assert.equal(new Set(domains).size, domains.length);
  });
});
