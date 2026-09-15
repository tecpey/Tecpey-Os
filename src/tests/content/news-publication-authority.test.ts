import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approvedNewsPublicationSources,
  buildNewsPublicationBatchFingerprint,
  type NewsPublicationCandidate,
} from "../../lib/ops/news-publication-authority";
import { NEWS_SOURCE_REGISTRY } from "../../lib/news-source-registry";
import { resolveNewsSourceAuthority } from "../../services/news/source-authority";

const CANDIDATE_A: NewsPublicationCandidate = {
  archiveId: "archive-a",
  sourceName: "CoinDesk",
  articleUrl: "https://coindesk.com/markets/a",
  sourceTitle: "Bitcoin market structure update",
  sourceLead: "A material market structure update for Bitcoin.",
  translatedTitle: "به‌روزرسانی ساختار بازار بیت‌کوین",
  translatedLead: "یک به‌روزرسانی مهم درباره ساختار بازار بیت‌کوین.",
  contentHash: "a".repeat(64),
  publishedAt: "2026-09-15T08:00:00.000Z",
  translationGeneratedAt: "2026-09-15T09:00:00.000Z",
};

const CANDIDATE_B: NewsPublicationCandidate = {
  ...CANDIDATE_A,
  archiveId: "archive-b",
  articleUrl: "https://coindesk.com/markets/b",
  sourceTitle: "Ethereum liquidity update",
  translatedTitle: "به‌روزرسانی نقدشوندگی اتریوم",
  contentHash: "b".repeat(64),
  publishedAt: "2026-09-15T08:30:00.000Z",
  translationGeneratedAt: "2026-09-15T09:00:00.000Z",
};

describe("news publication source authority", () => {
  it("exposes only sources that are currently auto-publish eligible", () => {
    const publicationSources = approvedNewsPublicationSources();

    for (const approved of publicationSources) {
      const authority = resolveNewsSourceAuthority(approved.domain);
      assert.equal(authority.registryKnown, true, `${approved.domain} must remain registry-known`);
      assert.equal(authority.publicationDisposition, "auto_publish_eligible", `${approved.domain} must fail closed when publication readiness changes`);
      assert.equal(authority.providerReadiness.publicSummaryAllowed, true, `${approved.domain} must retain public summary rights`);
      assert.equal(authority.providerReadiness.persianEditorialAllowed, true, `${approved.domain} must retain Persian editorial rights`);
    }
  });

  it("fingerprints publication batches deterministically and independently of input order", () => {
    const first = buildNewsPublicationBatchFingerprint([CANDIDATE_A, CANDIDATE_B]);
    const reordered = buildNewsPublicationBatchFingerprint([CANDIDATE_B, CANDIDATE_A]);
    const repeated = buildNewsPublicationBatchFingerprint([CANDIDATE_A, CANDIDATE_B]);
    const changedMembership = buildNewsPublicationBatchFingerprint([CANDIDATE_A]);
    const changedContent = buildNewsPublicationBatchFingerprint([
      CANDIDATE_A,
      { ...CANDIDATE_B, translatedLead: `${CANDIDATE_B.translatedLead} تغییر` },
    ]);

    assert.match(first, /^[a-f0-9]{24}$/);
    assert.equal(reordered, first);
    assert.equal(repeated, first);
    assert.notEqual(changedMembership, first);
    assert.notEqual(changedContent, first);
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
