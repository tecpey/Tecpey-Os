import type { ContentEntityType, ContentLocale } from "./content-growth";

export const ORGANIC_GROWTH_POLICY_VERSION = "tecpey-organic-growth-policy-v2";

export type GrowthSourceAttribution = {
  name: string;
  url: string;
  role: "primary" | "official" | "corroborating" | "tecpey";
};

export type OrganicGrowthReadiness = {
  seoScore: number;
  aeoScore: number;
  geoScore: number;
  overallScore: number;
  ready: boolean;
  blockers: string[];
};

export type OrganicGrowthProfile = {
  policyVersion: typeof ORGANIC_GROWTH_POLICY_VERSION;
  entityType: ContentEntityType;
  locale: ContentLocale;
  canonicalPath: string;
  canonicalUrl: string;
  title: string;
  metaDescription: string;
  openGraphTitle: string;
  openGraphDescription: string;
  twitterCard: "summary_large_image";
  schemaTypes: string[];
  keywords: string[];
  entityTags: string[];
  internalLinks: string[];
  answerSummary: string;
  llmSummary: string;
  citationSummary: string;
  searchIntents: string[];
  questionIntents: string[];
  keyFacts: string[];
  sourceAttributions: GrowthSourceAttribution[];
  contentValue: string;
  safetyDisclaimer: string;
  freshnessTag: "evergreen" | "fresh" | "scheduled_refresh";
  readiness: OrganicGrowthReadiness;
};

export type OrganicGrowthProfileInput = {
  entityType: ContentEntityType;
  locale: ContentLocale;
  canonicalPath: string;
  title: string;
  metaDescription: string;
  schemaTypes: string[];
  keywords: string[];
  entityTags: string[];
  internalLinks: string[];
  answerSummary: string;
  llmSummary: string;
  citationSummary?: string;
  searchIntents?: string[];
  questionIntents?: string[];
  keyFacts?: string[];
  sourceAttributions?: GrowthSourceAttribution[];
  contentValue?: string;
  safetyDisclaimer: string;
  freshnessTag?: OrganicGrowthProfile["freshnessTag"];
};

const SITE_URL = "https://tecpey.ir";
const TAG_RE = /^[a-z0-9][a-z0-9:_-]{1,80}$/;
const ENTITY_TYPES = new Set<ContentEntityType>([
  "coin",
  "news",
  "tool",
  "lesson",
  "quiz",
  "glossary",
  "page",
]);

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maximum: number): string {
  const normalized = compact(value);
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(0, maximum - 3)).trim()}...`;
}

function uniqueStrings(values: string[], maximum: number): string[] {
  return Array.from(new Set(values.map(compact).filter(Boolean))).slice(0, maximum);
}

function absoluteUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
}

function safeSourceAttributions(values: GrowthSourceAttribution[]): GrowthSourceAttribution[] {
  const selected = new Map<string, GrowthSourceAttribution>();
  for (const source of values) {
    const name = compact(source.name).slice(0, 160);
    const url = compact(source.url);
    if (!name || !/^https:\/\//i.test(url)) continue;
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      parsed.username = "";
      parsed.password = "";
      if (!selected.has(parsed.toString())) {
        selected.set(parsed.toString(), { name, url: parsed.toString(), role: source.role });
      }
    } catch {
      continue;
    }
  }
  return Array.from(selected.values()).slice(0, 8);
}

function scoreReadiness(input: Omit<OrganicGrowthProfile, "readiness" | "policyVersion">): OrganicGrowthReadiness {
  const blockers: string[] = [];

  let seoScore = 0;
  seoScore += input.title.length >= 18 ? 12 : 5;
  seoScore += input.metaDescription.length >= 80 ? 12 : 5;
  seoScore += input.canonicalUrl.startsWith(SITE_URL) ? 10 : 0;
  seoScore += input.schemaTypes.length >= 3 ? 14 : input.schemaTypes.length >= 2 ? 9 : 0;
  seoScore += input.keywords.length >= 6 ? 10 : input.keywords.length >= 3 ? 6 : 0;
  seoScore += input.entityTags.length >= 4 ? 10 : input.entityTags.length >= 2 ? 6 : 0;
  seoScore += input.internalLinks.length >= 4 ? 10 : input.internalLinks.length >= 2 ? 6 : 0;
  seoScore += input.searchIntents.length >= 3 ? 8 : input.searchIntents.length > 0 ? 4 : 0;
  seoScore += input.freshnessTag !== "evergreen" ? 7 : 5;
  seoScore += input.sourceAttributions.length > 0 ? 7 : 2;

  let aeoScore = 0;
  aeoScore += input.answerSummary.length >= 70 ? 28 : input.answerSummary.length >= 40 ? 18 : 0;
  aeoScore += input.questionIntents.length >= 3 ? 20 : input.questionIntents.length > 0 ? 10 : 0;
  aeoScore += input.keyFacts.length >= 3 ? 18 : input.keyFacts.length > 0 ? 10 : 0;
  aeoScore += input.entityTags.length >= 4 ? 10 : 5;
  aeoScore += input.internalLinks.length >= 4 ? 8 : 4;
  aeoScore += input.contentValue.length >= 80 ? 8 : 4;
  aeoScore += /(توصیه مالی|سیگنال|financial advice|trading signal)/i.test(input.safetyDisclaimer) ? 8 : 0;

  let geoScore = 0;
  geoScore += input.llmSummary.length >= 140 ? 20 : input.llmSummary.length >= 80 ? 12 : 0;
  geoScore += input.citationSummary.length >= 80 ? 16 : input.citationSummary.length >= 40 ? 9 : 0;
  geoScore += input.sourceAttributions.length >= 2 ? 18 : input.sourceAttributions.length === 1 ? 12 : 0;
  geoScore += input.keyFacts.length >= 3 ? 16 : input.keyFacts.length > 0 ? 8 : 0;
  geoScore += input.entityTags.length >= 4 ? 12 : 6;
  geoScore += input.searchIntents.length >= 3 ? 8 : 4;
  geoScore += input.contentValue.length >= 80 ? 10 : 5;

  seoScore = Math.min(100, seoScore);
  aeoScore = Math.min(100, aeoScore);
  geoScore = Math.min(100, geoScore);
  const overallScore = Math.round(seoScore * 0.38 + aeoScore * 0.3 + geoScore * 0.32);

  if (seoScore < 70) blockers.push("seo_readiness_below_70");
  if (aeoScore < 70) blockers.push("aeo_readiness_below_70");
  if (geoScore < 70) blockers.push("geo_readiness_below_70");
  if (input.schemaTypes.length < 2) blockers.push("structured_data_incomplete");
  if (input.internalLinks.length < 2) blockers.push("internal_link_graph_incomplete");
  if (input.sourceAttributions.length < 1) blockers.push("source_attribution_missing");
  if (input.questionIntents.length < 1) blockers.push("answer_intent_missing");
  if (input.keyFacts.length < 1) blockers.push("extractable_facts_missing");

  return {
    seoScore,
    aeoScore,
    geoScore,
    overallScore,
    ready: blockers.length === 0 && overallScore >= 74,
    blockers,
  };
}

export function buildOrganicGrowthProfile(input: OrganicGrowthProfileInput): OrganicGrowthProfile {
  const canonicalPath = input.canonicalPath.startsWith("/")
    ? input.canonicalPath
    : `/${input.canonicalPath}`;
  const base: Omit<OrganicGrowthProfile, "readiness" | "policyVersion"> = {
    entityType: input.entityType,
    locale: input.locale,
    canonicalPath,
    canonicalUrl: absoluteUrl(canonicalPath),
    title: truncate(input.title, 92),
    metaDescription: truncate(input.metaDescription, 168),
    openGraphTitle: truncate(input.title, 92),
    openGraphDescription: truncate(input.metaDescription, 180),
    twitterCard: "summary_large_image",
    schemaTypes: uniqueStrings(input.schemaTypes, 10),
    keywords: uniqueStrings(input.keywords, 24),
    entityTags: uniqueStrings(input.entityTags.map((tag) => tag.toLowerCase()), 40),
    internalLinks: uniqueStrings(input.internalLinks, 28),
    answerSummary: truncate(input.answerSummary, 520),
    llmSummary: truncate(input.llmSummary, 960),
    citationSummary: truncate(input.citationSummary ?? input.llmSummary, 720),
    searchIntents: uniqueStrings(input.searchIntents ?? input.keywords, 24),
    questionIntents: uniqueStrings(input.questionIntents ?? [], 16),
    keyFacts: uniqueStrings(input.keyFacts ?? [], 20),
    sourceAttributions: safeSourceAttributions(input.sourceAttributions ?? []),
    contentValue: truncate(input.contentValue ?? input.answerSummary, 600),
    safetyDisclaimer: truncate(input.safetyDisclaimer, 360),
    freshnessTag: input.freshnessTag ?? "evergreen",
  };
  return {
    policyVersion: ORGANIC_GROWTH_POLICY_VERSION,
    ...base,
    readiness: scoreReadiness(base),
  };
}

export function validateOrganicGrowthProfile(profile: unknown): profile is OrganicGrowthProfile {
  if (!profile || typeof profile !== "object") return false;
  const value = profile as OrganicGrowthProfile;
  if (value.policyVersion !== ORGANIC_GROWTH_POLICY_VERSION) return false;
  if (!ENTITY_TYPES.has(value.entityType)) return false;
  if (value.locale !== "fa" && value.locale !== "en") return false;
  if (typeof value.canonicalPath !== "string" || !value.canonicalPath.startsWith("/")) return false;
  if (value.locale === "en" && value.canonicalPath !== "/en" && !value.canonicalPath.startsWith("/en/")) return false;
  if (value.locale === "fa" && (value.canonicalPath === "/en" || value.canonicalPath.startsWith("/en/"))) return false;
  if (value.canonicalUrl !== absoluteUrl(value.canonicalPath)) return false;
  if (typeof value.title !== "string" || value.title.length < 8 || value.title.length > 92) return false;
  if (typeof value.metaDescription !== "string" || value.metaDescription.length < 48 || value.metaDescription.length > 168) return false;
  if (typeof value.openGraphTitle !== "string" || !value.openGraphTitle) return false;
  if (typeof value.openGraphDescription !== "string" || !value.openGraphDescription) return false;
  if (value.twitterCard !== "summary_large_image") return false;
  if (!Array.isArray(value.schemaTypes) || value.schemaTypes.length < 2) return false;
  if (!Array.isArray(value.keywords) || value.keywords.length < 3) return false;
  if (!Array.isArray(value.entityTags) || value.entityTags.length < 2) return false;
  if (!value.entityTags.every((tag) => typeof tag === "string" && TAG_RE.test(tag))) return false;
  if (!Array.isArray(value.internalLinks) || value.internalLinks.length < 2) return false;
  if (!value.internalLinks.every((link) => typeof link === "string" && link.startsWith("/"))) return false;
  if (typeof value.answerSummary !== "string" || value.answerSummary.length < 40) return false;
  if (typeof value.llmSummary !== "string" || value.llmSummary.length < 80) return false;
  if (typeof value.citationSummary !== "string" || value.citationSummary.length < 40) return false;
  if (!Array.isArray(value.searchIntents) || value.searchIntents.length < 1) return false;
  if (!Array.isArray(value.questionIntents) || value.questionIntents.length < 1) return false;
  if (!Array.isArray(value.keyFacts) || value.keyFacts.length < 1) return false;
  if (!Array.isArray(value.sourceAttributions) || value.sourceAttributions.length < 1) return false;
  if (!value.sourceAttributions.every((source) =>
    source && typeof source.name === "string" && /^https:\/\//i.test(source.url) &&
    ["primary", "official", "corroborating", "tecpey"].includes(source.role))) return false;
  if (typeof value.contentValue !== "string" || value.contentValue.length < 40) return false;
  if (typeof value.safetyDisclaimer !== "string" || !/(توصیه مالی|سیگنال|financial advice|trading signal)/i.test(value.safetyDisclaimer)) return false;
  if (!["evergreen", "fresh", "scheduled_refresh"].includes(value.freshnessTag)) return false;
  if (!value.readiness || typeof value.readiness !== "object") return false;
  if (![value.readiness.seoScore, value.readiness.aeoScore, value.readiness.geoScore, value.readiness.overallScore].every(
    (score) => Number.isFinite(score) && score >= 0 && score <= 100,
  )) return false;
  if (!Array.isArray(value.readiness.blockers)) return false;
  return value.readiness.ready === true && value.readiness.blockers.length === 0;
}
