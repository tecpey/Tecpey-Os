export const GROWTH_ANALYTICS_CONTRACT_VERSION = "tecpey-growth-analytics-contract-v1";

export type GrowthAnalyticsChannel =
  | "google_search"
  | "google_discover"
  | "google_ai"
  | "bing_search"
  | "bing_ai"
  | "direct"
  | "referral"
  | "social"
  | "unknown";

export type GrowthContentKind = "news" | "coin" | "tool" | "academy" | "glossary" | "landing";

export type GrowthPagePerformance = {
  canonicalUrl: string;
  contentKind: GrowthContentKind;
  locale: "fa" | "en";
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  averagePosition: number | null;
  sessions: number;
  engagedSessions: number;
  conversions: number;
  channel: GrowthAnalyticsChannel;
};

export type GrowthQueryOpportunity = {
  query: string;
  locale: "fa" | "en";
  pageUrl: string;
  impressions: number;
  clicks: number;
  ctr: number;
  averagePosition: number;
  opportunityScore: number;
  intent: "learn" | "news" | "compare" | "tool" | "coin" | "risk" | "brand" | "other";
};

export type GrowthExecutiveKpis = {
  organicSessions: number;
  nonBrandOrganicSessions: number;
  indexedNewsPages: number;
  indexedCoinPages: number;
  indexedToolPages: number;
  top10Queries: number;
  top3Queries: number;
  googleAiVisibility: number | null;
  bingAiCitations: number | null;
  referralDomains: number;
  returningOrganicUsers: number;
};

/**
 * Contract only. GA4, Google Search Console and Bing Webmaster credentials are
 * intentionally not read here. Later connector jobs must ingest aggregate data
 * into this contract without exposing raw user identities or query-level PII.
 */
export function growthOpportunityScore(input: Pick<GrowthQueryOpportunity, "impressions" | "clicks" | "ctr" | "averagePosition">): number {
  const visibility = Math.min(1, Math.log10(Math.max(1, input.impressions)) / 5);
  const positionOpportunity = Math.max(0, Math.min(1, (20 - input.averagePosition) / 20));
  const ctrGap = Math.max(0, Math.min(1, 0.12 - input.ctr) / 0.12);
  const clickProof = Math.min(1, input.clicks / 50);
  return Math.round((visibility * 0.38 + positionOpportunity * 0.26 + ctrGap * 0.26 + clickProof * 0.1) * 100);
}
