import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENTERPRISE_NEWS_PROVIDER_CATALOG,
  assessEnterpriseNewsProviderCatalog,
  assessNewsProviderReadiness,
  providerReadinessSummaryForDomain,
  type NewsProviderReadinessEvidence,
} from "../../lib/news-provider-readiness";
import {
  buildNewsIntelligenceDossier,
  type NewsIntelligenceCandidate,
  type NewsIntelligenceSource,
} from "../../lib/news-intelligence-graph";

function providerFixture(overrides: Partial<NewsProviderReadinessEvidence> = {}): NewsProviderReadinessEvidence {
  return {
    id: "provider-fixture",
    name: "Provider Fixture",
    domain: "provider-fixture.example",
    category: "trusted_media",
    criticality: "critical",
    useCases: ["news_ingest", "thumbnail_media", "academy_grounding"],
    trustScore: 0.86,
    contractMode: "licensed_feed",
    slaTier: "business_sla",
    redistribution: "licensed_excerpt",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "licensed",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 90,
    supportedRegions: ["global", "mena"],
    fallbackProviderIds: ["coindesk-data-api"],
    owner: "tecpey-data-council",
    ...overrides,
  };
}

function candidate(): NewsIntelligenceCandidate {
  return {
    locale: "fa",
    originalLanguage: "en",
    title: "Ethereum staking inflows rise after protocol update",
    originalSummary:
      "Ethereum staking inflows rose after a protocol update while analysts emphasized liquidity, security and risk context.",
    persianSummary:
      "افزایش ورود سرمایه به استیکینگ اتریوم پس از به‌روزرسانی شبکه باید در کنار نقدشوندگی، امنیت قراردادها، ریسک بازار و زمینه آموزشی بررسی شود. این متن فقط برای اطلاع‌رسانی و آموزش است و توصیه خرید یا فروش محسوب نمی‌شود.",
    sourceName: "Provider Fixture",
    sourceUrl: "https://provider-fixture.example/news/ethereum-staking-update",
    canonicalUrl: "https://provider-fixture.example/news/ethereum-staking-update",
    publishedAt: "2026-08-12T08:20:00.000Z",
    fetchedAt: "2026-08-12T08:24:00.000Z",
    thumbnail: {
      url: "https://provider-fixture.example/images/eth.jpg",
      alt: "Ethereum staking dashboard",
      rights: "licensed",
    },
    entities: [
      {
        type: "coin",
        id: "ETH",
        label: "Ethereum",
        confidence: 0.88,
        officialUrl: "https://ethereum.org/",
      },
    ],
    tags: ["ethereum", "staking", "network-update"],
    socialLayer: {
      source: "x",
      observedAt: "2026-08-12T08:25:00.000Z",
      verifiedAccount: true,
      engagementScore: 0.61,
      sentiment: "neutral",
    },
    relatedLessonHref: "/academy/term-5",
  };
}

describe("news provider readiness authority", () => {
  it("keeps the enterprise catalog broad enough for source continuity and Persian editorial grounding", () => {
    const decisions = assessEnterpriseNewsProviderCatalog();

    assert.ok(decisions.some((decision) => decision.domain === "coindesk.com" && decision.status === "ready"));
    assert.ok(decisions.some((decision) => decision.domain === "kaiko.com" && decision.status === "ready"));
    assert.ok(decisions.some((decision) => decision.domain === "x.com" && decision.status === "blocked"));

    const readyCritical = decisions.filter(
      (decision) => decision.criticality === "critical" && decision.autoIngestionAllowed,
    );
    assert.ok(readyCritical.length >= 5);
    assert.ok(readyCritical.every((decision) => decision.fallbackProviderIds.length > 0));
  });

  it("blocks providers that cannot legally support public Persian summaries", () => {
    const decision = assessNewsProviderReadiness(
      providerFixture({
        redistribution: "blocked",
        publicSummaryAllowed: false,
        persianEditorialAllowed: false,
      }),
    );

    assert.equal(decision.status, "blocked");
    assert.equal(decision.autoIngestionAllowed, false);
    assert.ok(decision.issues.includes("redistribution_blocked"));
    assert.ok(decision.issues.includes("public_summary_not_allowed"));
    assert.ok(decision.issues.includes("persian_editorial_not_allowed"));
  });

  it("degrades critical providers without continuity fallback and disables auto ingestion", () => {
    const decision = assessNewsProviderReadiness(providerFixture({ fallbackProviderIds: [] }));

    assert.equal(decision.status, "degraded");
    assert.equal(decision.autoIngestionAllowed, false);
    assert.ok(decision.issues.includes("fallback_missing"));
  });

  it("maps unknown domains to blocked provider decisions", () => {
    const decision = providerReadinessSummaryForDomain("https://unknown.example/news/story");

    assert.equal(decision.status, "blocked");
    assert.equal(decision.autoIngestionAllowed, false);
    assert.deepEqual(decision.issues, ["source_not_in_catalog"]);
  });

  it("prevents news intelligence auto-publication when a source provider is not enterprise-ready", () => {
    const providerReadiness = assessNewsProviderReadiness(providerFixture({ fallbackProviderIds: [] }));
    const source: NewsIntelligenceSource = {
      name: "Provider Fixture",
      domain: "provider-fixture.example",
      tier: "trusted_media",
      trustScore: 0.86,
      allowedForPublicSummary: true,
      allowedForPersianEditorial: true,
      thumbnailPolicy: "licensed",
      requiresAttribution: true,
      providerReadiness,
    };

    const dossier = buildNewsIntelligenceDossier(candidate(), {
      sources: [source],
    });

    assert.equal(dossier.status, "rejected");
    assert.ok(dossier.reasons.includes("provider_not_enterprise_ready"));
    assert.equal(dossier.source.providerReadiness.status, "degraded");
  });

  it("keeps all graph-approved providers backed by catalog evidence", () => {
    const catalogDomains = new Set(ENTERPRISE_NEWS_PROVIDER_CATALOG.map((provider) => provider.domain));

    for (const domain of ["coindesk.com", "benzinga.com", "theblock.co", "decrypt.co", "cointelegraph.com"]) {
      assert.ok(catalogDomains.has(domain));
      assert.equal(providerReadinessSummaryForDomain(domain).status, "ready");
    }
  });
});
