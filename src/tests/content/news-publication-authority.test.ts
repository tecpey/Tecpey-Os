import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { approvedNewsPublicationSources } from "../../lib/ops/news-publication-authority";
import { NEWS_SOURCE_REGISTRY } from "../../lib/news-source-registry";
import { resolveNewsSourceAuthority } from "../../services/news/source-authority";

describe("news publication source authority", () => {
  it("exposes only sources that are currently auto-publish eligible", () => {
    const publicationSources = approvedNewsPublicationSources();

    for (const approved of publicationSources) {
      const authority = resolveNewsSourceAuthority(approved.domain);
      assert.equal(authority.registryKnown, true, `${approved.domain} must remain registry-known`);
      assert.equal(authority.publicationDisposition, "auto_publish_eligible", `${approved.domain} must fail closed when publication readiness changes`);
      assert.equal(authority.providerReadiness.persianEditorialAllowed, true, `${approved.domain} must retain Persian editorial rights`);
    }
  });

  it("never upgrades registered-but-nonpublishable sources merely because they are in the capture registry", () => {
    const approvedDomains = new Set(approvedNewsPublicationSources().map((source) => source.domain));

    for (const registered of NEWS_SOURCE_REGISTRY) {
      const domain = registered.canonicalDomains[0] ?? "";
      const authority = resolveNewsSourceAuthority(domain);
      if (authority.publicationDisposition === "auto_publish_eligible") {
        assert.equal(approvedDomains.has(domain), true, `${registered.id} should be present while auto-publish eligible`);
      } else {
        assert.equal(approvedDomains.has(domain), false, `${registered.id} must not be promoted from ${authority.publicationDisposition}`);
      }
    }
  });

  it("keeps known quarantine/readiness drift fixtures out of automated publication", () => {
    const domains = new Set(approvedNewsPublicationSources().map((source) => source.domain));
    assert.equal(domains.has("blockworks.com"), false);
    assert.equal(domains.has("thedefiant.io"), false);
    assert.equal(domains.has("chainalysis.com"), false);
  });

  it("does not create duplicate domain authorities", () => {
    const domains = approvedNewsPublicationSources().map((source) => source.domain);
    assert.equal(new Set(domains).size, domains.length);
  });
});
