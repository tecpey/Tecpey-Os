export const TECPEY_NEWS_PROVIDER_READINESS_POLICY_VERSION = "tecpey-news-provider-readiness-v1";

export type NewsProviderCategory =
  | "institutional_data"
  | "official_primary"
  | "trusted_media"
  | "social_signal";

export type NewsProviderUseCase =
  | "news_ingest"
  | "market_data"
  | "official_primary"
  | "social_signal"
  | "thumbnail_media"
  | "academy_grounding";

export type NewsProviderCriticality = "critical" | "important" | "supporting";

export type NewsProviderContractMode =
  | "contracted_api"
  | "licensed_feed"
  | "official_public_source"
  | "manual_review_only"
  | "blocked";

export type NewsProviderRedistributionPolicy =
  | "licensed_excerpt"
  | "summary_with_attribution"
  | "metadata_only"
  | "blocked";

export type NewsProviderSlaTier =
  | "enterprise_sla"
  | "business_sla"
  | "public_best_effort"
  | "manual_best_effort"
  | "none";

export type NewsProviderThumbnailPolicy =
  | "licensed"
  | "official_attribution"
  | "tecpey_generated"
  | "blocked";

export type NewsProviderReadinessIssue =
  | "source_not_in_catalog"
  | "missing_identity"
  | "missing_use_case"
  | "weak_trust_score"
  | "provider_blocked"
  | "critical_provider_manual_only"
  | "redistribution_blocked"
  | "public_summary_not_allowed"
  | "persian_editorial_not_allowed"
  | "thumbnail_rights_blocked"
  | "financial_use_not_allowed"
  | "privacy_review_missing"
  | "terms_review_missing"
  | "owner_missing"
  | "region_not_supported"
  | "fallback_missing"
  | "rate_limit_too_low"
  | "retention_window_too_short"
  | "service_level_best_effort";

export type NewsProviderReadinessStatus = "ready" | "degraded" | "blocked";

export type NewsProviderReadinessEvidence = {
  id: string;
  name: string;
  domain: string;
  category: NewsProviderCategory;
  criticality: NewsProviderCriticality;
  useCases: NewsProviderUseCase[];
  trustScore: number;
  contractMode: NewsProviderContractMode;
  slaTier: NewsProviderSlaTier;
  redistribution: NewsProviderRedistributionPolicy;
  publicSummaryAllowed: boolean;
  persianEditorialAllowed: boolean;
  thumbnailPolicy: NewsProviderThumbnailPolicy;
  attributionRequired: boolean;
  financialUseAllowed: boolean;
  privacyReviewed: boolean;
  termsReviewedAt: string;
  retentionDays: number;
  rateLimitPerMinute: number;
  supportedRegions: string[];
  fallbackProviderIds: string[];
  owner: string;
};

export type NewsProviderReadinessOptions = {
  requiredRegions?: string[];
  minimumTrustScore?: number;
  minimumRetentionDays?: number;
  minimumRateLimitPerMinute?: number;
};

export type NewsProviderReadinessDecision = {
  policyVersion: typeof TECPEY_NEWS_PROVIDER_READINESS_POLICY_VERSION;
  providerId: string;
  name: string;
  domain: string;
  status: NewsProviderReadinessStatus;
  score: number;
  criticality: NewsProviderCriticality;
  autoIngestionAllowed: boolean;
  publicSummaryAllowed: boolean;
  persianEditorialAllowed: boolean;
  thumbnailPolicy: NewsProviderThumbnailPolicy;
  attributionRequired: boolean;
  fallbackProviderIds: string[];
  issues: NewsProviderReadinessIssue[];
  reviewedAt: string;
};

const CONTRACT_SCORE: Record<NewsProviderContractMode, number> = {
  contracted_api: 1,
  licensed_feed: 0.92,
  official_public_source: 0.82,
  manual_review_only: 0.42,
  blocked: 0,
};

const SLA_SCORE: Record<NewsProviderSlaTier, number> = {
  enterprise_sla: 1,
  business_sla: 0.86,
  public_best_effort: 0.56,
  manual_best_effort: 0.38,
  none: 0,
};

const REDISTRIBUTION_SCORE: Record<NewsProviderRedistributionPolicy, number> = {
  licensed_excerpt: 1,
  summary_with_attribution: 0.84,
  metadata_only: 0.52,
  blocked: 0,
};

const HARD_PROVIDER_ISSUES = new Set<NewsProviderReadinessIssue>([
  "source_not_in_catalog",
  "missing_identity",
  "missing_use_case",
  "weak_trust_score",
  "provider_blocked",
  "critical_provider_manual_only",
  "redistribution_blocked",
  "public_summary_not_allowed",
  "persian_editorial_not_allowed",
  "thumbnail_rights_blocked",
  "financial_use_not_allowed",
  "privacy_review_missing",
  "terms_review_missing",
  "owner_missing",
  "region_not_supported",
]);

export const ENTERPRISE_NEWS_PROVIDER_CATALOG: NewsProviderReadinessEvidence[] = [
  {
    id: "coindesk-data-api",
    name: "CoinDesk Data API",
    domain: "coindesk.com",
    category: "institutional_data",
    criticality: "critical",
    useCases: ["news_ingest", "market_data", "thumbnail_media", "academy_grounding"],
    trustScore: 0.92,
    contractMode: "licensed_feed",
    slaTier: "business_sla",
    redistribution: "licensed_excerpt",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "official_attribution",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 120,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["benzinga-crypto-news-api", "the-block"],
    owner: "tecpey-data-council",
  },
  {
    id: "benzinga-crypto-news-api",
    name: "Benzinga Crypto News API",
    domain: "benzinga.com",
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
    rateLimitPerMinute: 120,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["coindesk-data-api", "the-block"],
    owner: "tecpey-data-council",
  },
  {
    id: "the-block",
    name: "The Block",
    domain: "theblock.co",
    category: "trusted_media",
    criticality: "critical",
    useCases: ["news_ingest", "thumbnail_media", "academy_grounding"],
    trustScore: 0.84,
    contractMode: "licensed_feed",
    slaTier: "business_sla",
    redistribution: "summary_with_attribution",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "official_attribution",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 90,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["coindesk-data-api", "benzinga-crypto-news-api"],
    owner: "tecpey-data-council",
  },
  {
    id: "decrypt",
    name: "Decrypt",
    domain: "decrypt.co",
    category: "trusted_media",
    criticality: "important",
    useCases: ["news_ingest", "thumbnail_media", "academy_grounding"],
    trustScore: 0.78,
    contractMode: "licensed_feed",
    slaTier: "business_sla",
    redistribution: "summary_with_attribution",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "official_attribution",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 180,
    rateLimitPerMinute: 60,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["the-block", "cointelegraph"],
    owner: "tecpey-data-council",
  },
  {
    id: "cointelegraph",
    name: "Cointelegraph",
    domain: "cointelegraph.com",
    category: "trusted_media",
    criticality: "important",
    useCases: ["news_ingest", "thumbnail_media", "academy_grounding"],
    trustScore: 0.76,
    contractMode: "licensed_feed",
    slaTier: "business_sla",
    redistribution: "summary_with_attribution",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "official_attribution",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 180,
    rateLimitPerMinute: 60,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["decrypt", "the-block"],
    owner: "tecpey-data-council",
  },
  {
    id: "official-project-source",
    name: "Official Project Source",
    domain: "official-project.example",
    category: "official_primary",
    criticality: "important",
    useCases: ["official_primary", "news_ingest", "thumbnail_media"],
    trustScore: 0.94,
    contractMode: "official_public_source",
    slaTier: "public_best_effort",
    redistribution: "summary_with_attribution",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "official_attribution",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 30,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: [],
    owner: "tecpey-data-council",
  },
  {
    id: "kaiko-market-data",
    name: "Kaiko Market Data",
    domain: "kaiko.com",
    category: "institutional_data",
    criticality: "critical",
    useCases: ["market_data", "academy_grounding"],
    trustScore: 0.91,
    contractMode: "contracted_api",
    slaTier: "enterprise_sla",
    redistribution: "metadata_only",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "tecpey_generated",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 180,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["coin-metrics", "messari-research"],
    owner: "tecpey-data-council",
  },
  {
    id: "coin-metrics",
    name: "Coin Metrics",
    domain: "coinmetrics.io",
    category: "institutional_data",
    criticality: "critical",
    useCases: ["market_data", "academy_grounding"],
    trustScore: 0.9,
    contractMode: "contracted_api",
    slaTier: "enterprise_sla",
    redistribution: "metadata_only",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "tecpey_generated",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 180,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["kaiko-market-data", "messari-research"],
    owner: "tecpey-data-council",
  },
  {
    id: "messari-research",
    name: "Messari Research",
    domain: "messari.io",
    category: "institutional_data",
    criticality: "important",
    useCases: ["market_data", "news_ingest", "academy_grounding"],
    trustScore: 0.88,
    contractMode: "contracted_api",
    slaTier: "enterprise_sla",
    redistribution: "licensed_excerpt",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "licensed",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 120,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["kaiko-market-data", "coin-metrics"],
    owner: "tecpey-data-council",
  },
  {
    id: "defillama",
    name: "DefiLlama",
    domain: "defillama.com",
    category: "institutional_data",
    criticality: "important",
    useCases: ["market_data", "academy_grounding"],
    trustScore: 0.84,
    contractMode: "official_public_source",
    slaTier: "public_best_effort",
    redistribution: "metadata_only",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "tecpey_generated",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 60,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["coin-metrics", "coingecko-market-data"],
    owner: "tecpey-data-council",
  },
  {
    id: "coingecko-market-data",
    name: "CoinGecko Market Data",
    domain: "coingecko.com",
    category: "institutional_data",
    criticality: "important",
    useCases: ["market_data", "academy_grounding"],
    trustScore: 0.82,
    contractMode: "contracted_api",
    slaTier: "enterprise_sla",
    redistribution: "metadata_only",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "tecpey_generated",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 120,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["coinmarketcap-market-data", "defillama"],
    owner: "tecpey-data-council",
  },
  {
    id: "coinmarketcap-market-data",
    name: "CoinMarketCap Market Data",
    domain: "coinmarketcap.com",
    category: "institutional_data",
    criticality: "important",
    useCases: ["market_data", "academy_grounding"],
    trustScore: 0.82,
    contractMode: "contracted_api",
    slaTier: "enterprise_sla",
    redistribution: "metadata_only",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "tecpey_generated",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 120,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["coingecko-market-data", "defillama"],
    owner: "tecpey-data-council",
  },
  {
    id: "coinglass-derivatives-data",
    name: "Coinglass Derivatives Data",
    domain: "coinglass.com",
    category: "institutional_data",
    criticality: "important",
    useCases: ["market_data", "academy_grounding"],
    trustScore: 0.84,
    contractMode: "contracted_api",
    slaTier: "enterprise_sla",
    redistribution: "metadata_only",
    publicSummaryAllowed: true,
    persianEditorialAllowed: true,
    thumbnailPolicy: "tecpey_generated",
    attributionRequired: true,
    financialUseAllowed: true,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 365,
    rateLimitPerMinute: 90,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: ["kaiko-market-data", "coin-metrics"],
    owner: "tecpey-data-council",
  },
  {
    id: "verified-social-layer",
    name: "Verified Social Layer",
    domain: "x.com",
    category: "social_signal",
    criticality: "supporting",
    useCases: ["social_signal"],
    trustScore: 0.64,
    contractMode: "manual_review_only",
    slaTier: "manual_best_effort",
    redistribution: "metadata_only",
    publicSummaryAllowed: false,
    persianEditorialAllowed: false,
    thumbnailPolicy: "blocked",
    attributionRequired: true,
    financialUseAllowed: false,
    privacyReviewed: true,
    termsReviewedAt: "2026-08-12",
    retentionDays: 30,
    rateLimitPerMinute: 30,
    supportedRegions: ["global", "mena", "eu", "us"],
    fallbackProviderIds: [],
    owner: "tecpey-risk-council",
  },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(clamp01(value) * 1000) / 1000;
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const url = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
  }
}

function hasRelevantFinancialUse(provider: NewsProviderReadinessEvidence): boolean {
  return provider.useCases.some((useCase) => useCase === "news_ingest" || useCase === "market_data");
}

function requiresContinuityFallback(provider: NewsProviderReadinessEvidence): boolean {
  if (provider.criticality !== "critical") return false;
  return provider.useCases.some((useCase) => useCase === "news_ingest" || useCase === "market_data");
}

function isValidReviewDate(value: string): boolean {
  if (!value.trim()) return false;
  return Number.isFinite(Date.parse(value));
}

function missingRequiredRegion(provider: NewsProviderReadinessEvidence, requiredRegions: string[]): boolean {
  const supported = new Set(provider.supportedRegions.map((region) => region.toLowerCase()));
  if (supported.has("global")) return false;
  return requiredRegions.some((region) => !supported.has(region.toLowerCase()));
}

function collectIssues(
  provider: NewsProviderReadinessEvidence,
  options: Required<NewsProviderReadinessOptions>,
): NewsProviderReadinessIssue[] {
  const issues: NewsProviderReadinessIssue[] = [];

  if (!provider.id.trim() || !provider.name.trim() || !normalizeDomain(provider.domain)) issues.push("missing_identity");
  if (provider.useCases.length === 0) issues.push("missing_use_case");
  if (provider.trustScore < options.minimumTrustScore) issues.push("weak_trust_score");
  if (provider.contractMode === "blocked") issues.push("provider_blocked");
  if (provider.contractMode === "manual_review_only" && provider.criticality === "critical") {
    issues.push("critical_provider_manual_only");
  }
  if (provider.redistribution === "blocked") issues.push("redistribution_blocked");
  if (!provider.publicSummaryAllowed && provider.useCases.includes("news_ingest")) issues.push("public_summary_not_allowed");
  if (!provider.persianEditorialAllowed && provider.useCases.includes("news_ingest")) {
    issues.push("persian_editorial_not_allowed");
  }
  if (provider.thumbnailPolicy === "blocked" && provider.useCases.includes("thumbnail_media")) {
    issues.push("thumbnail_rights_blocked");
  }
  if (!provider.financialUseAllowed && hasRelevantFinancialUse(provider)) issues.push("financial_use_not_allowed");
  if (!provider.privacyReviewed) issues.push("privacy_review_missing");
  if (!isValidReviewDate(provider.termsReviewedAt)) issues.push("terms_review_missing");
  if (!provider.owner.trim()) issues.push("owner_missing");
  if (missingRequiredRegion(provider, options.requiredRegions)) issues.push("region_not_supported");
  if (requiresContinuityFallback(provider) && provider.fallbackProviderIds.length === 0) issues.push("fallback_missing");
  if (provider.rateLimitPerMinute < options.minimumRateLimitPerMinute) issues.push("rate_limit_too_low");
  if (provider.retentionDays < options.minimumRetentionDays) issues.push("retention_window_too_short");
  if (
    provider.slaTier === "public_best_effort" &&
    provider.criticality === "critical" &&
    provider.contractMode !== "official_public_source"
  ) {
    issues.push("service_level_best_effort");
  }

  return Array.from(new Set(issues));
}

function readinessScore(provider: NewsProviderReadinessEvidence, issues: NewsProviderReadinessIssue[]): number {
  const rightsScore =
    (provider.publicSummaryAllowed ? 0.34 : 0) +
    (provider.persianEditorialAllowed ? 0.34 : 0) +
    (provider.thumbnailPolicy !== "blocked" ? 0.16 : 0) +
    (provider.financialUseAllowed ? 0.16 : 0);

  const operationsScore =
    (provider.privacyReviewed ? 0.28 : 0) +
    (isValidReviewDate(provider.termsReviewedAt) ? 0.24 : 0) +
    (provider.retentionDays >= 90 ? 0.2 : 0) +
    (provider.rateLimitPerMinute >= 30 ? 0.16 : 0) +
    (provider.fallbackProviderIds.length > 0 || !requiresContinuityFallback(provider) ? 0.12 : 0);

  const raw =
    provider.trustScore * 0.34 +
    CONTRACT_SCORE[provider.contractMode] * 0.2 +
    SLA_SCORE[provider.slaTier] * 0.12 +
    REDISTRIBUTION_SCORE[provider.redistribution] * 0.14 +
    rightsScore * 0.12 +
    operationsScore * 0.08;

  const penalty = issues.reduce((sum, issue) => sum + (HARD_PROVIDER_ISSUES.has(issue) ? 0.14 : 0.04), 0);
  return roundScore(raw - penalty);
}

export function assessNewsProviderReadiness(
  provider: NewsProviderReadinessEvidence,
  options: NewsProviderReadinessOptions = {},
): NewsProviderReadinessDecision {
  const normalizedOptions: Required<NewsProviderReadinessOptions> = {
    requiredRegions: options.requiredRegions ?? ["mena"],
    minimumTrustScore: options.minimumTrustScore ?? 0.7,
    minimumRetentionDays: options.minimumRetentionDays ?? 90,
    minimumRateLimitPerMinute: options.minimumRateLimitPerMinute ?? 30,
  };
  const issues = collectIssues(provider, normalizedOptions);
  const hasHardIssue = issues.some((issue) => HARD_PROVIDER_ISSUES.has(issue));
  const status: NewsProviderReadinessStatus = hasHardIssue ? "blocked" : issues.length > 0 ? "degraded" : "ready";

  return {
    policyVersion: TECPEY_NEWS_PROVIDER_READINESS_POLICY_VERSION,
    providerId: provider.id,
    name: provider.name,
    domain: normalizeDomain(provider.domain),
    status,
    score: readinessScore(provider, issues),
    criticality: provider.criticality,
    autoIngestionAllowed: status === "ready",
    publicSummaryAllowed:
      provider.publicSummaryAllowed && provider.redistribution !== "blocked" && provider.contractMode !== "blocked",
    persianEditorialAllowed:
      provider.persianEditorialAllowed && provider.redistribution !== "blocked" && provider.contractMode !== "blocked",
    thumbnailPolicy: provider.thumbnailPolicy,
    attributionRequired: provider.attributionRequired,
    fallbackProviderIds: [...provider.fallbackProviderIds].sort(),
    issues,
    reviewedAt: provider.termsReviewedAt,
  };
}

function unknownProviderDecision(domain: string): NewsProviderReadinessDecision {
  return {
    policyVersion: TECPEY_NEWS_PROVIDER_READINESS_POLICY_VERSION,
    providerId: "unknown-provider",
    name: "Unknown Provider",
    domain: normalizeDomain(domain) || "unknown",
    status: "blocked",
    score: 0,
    criticality: "supporting",
    autoIngestionAllowed: false,
    publicSummaryAllowed: false,
    persianEditorialAllowed: false,
    thumbnailPolicy: "blocked",
    attributionRequired: true,
    fallbackProviderIds: [],
    issues: ["source_not_in_catalog"],
    reviewedAt: "",
  };
}

export function providerReadinessSummaryForDomain(
  domainOrUrl: string,
  catalog: NewsProviderReadinessEvidence[] = ENTERPRISE_NEWS_PROVIDER_CATALOG,
  options: NewsProviderReadinessOptions = {},
): NewsProviderReadinessDecision {
  const domain = normalizeDomain(domainOrUrl);
  const provider = catalog.find((entry) => domain === normalizeDomain(entry.domain) || domain.endsWith(`.${normalizeDomain(entry.domain)}`));
  return provider ? assessNewsProviderReadiness(provider, options) : unknownProviderDecision(domain);
}

export function assessEnterpriseNewsProviderCatalog(
  catalog: NewsProviderReadinessEvidence[] = ENTERPRISE_NEWS_PROVIDER_CATALOG,
  options: NewsProviderReadinessOptions = {},
): NewsProviderReadinessDecision[] {
  return catalog
    .map((provider) => assessNewsProviderReadiness(provider, options))
    .sort((left, right) => left.domain.localeCompare(right.domain));
}
