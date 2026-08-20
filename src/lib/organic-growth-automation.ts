import type { ContentEntityType, ContentLocale } from "./content-growth";

export const ORGANIC_GROWTH_POLICY_VERSION = "tecpey-organic-growth-policy-v1";

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
  safetyDisclaimer: string;
  freshnessTag: "evergreen" | "fresh" | "scheduled_refresh";
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

export function buildOrganicGrowthProfile(input: OrganicGrowthProfileInput): OrganicGrowthProfile {
  const canonicalPath = input.canonicalPath.startsWith("/")
    ? input.canonicalPath
    : `/${input.canonicalPath}`;
  return {
    policyVersion: ORGANIC_GROWTH_POLICY_VERSION,
    entityType: input.entityType,
    locale: input.locale,
    canonicalPath,
    canonicalUrl: absoluteUrl(canonicalPath),
    title: truncate(input.title, 92),
    metaDescription: truncate(input.metaDescription, 168),
    openGraphTitle: truncate(input.title, 92),
    openGraphDescription: truncate(input.metaDescription, 180),
    twitterCard: "summary_large_image",
    schemaTypes: uniqueStrings(input.schemaTypes, 8),
    keywords: uniqueStrings(input.keywords, 14),
    entityTags: uniqueStrings(input.entityTags.map((tag) => tag.toLowerCase()), 24),
    internalLinks: uniqueStrings(input.internalLinks, 18),
    answerSummary: truncate(input.answerSummary, 420),
    llmSummary: truncate(input.llmSummary, 720),
    safetyDisclaimer: truncate(input.safetyDisclaimer, 300),
    freshnessTag: input.freshnessTag ?? "evergreen",
  };
}

export function validateOrganicGrowthProfile(profile: unknown): profile is OrganicGrowthProfile {
  if (!profile || typeof profile !== "object") return false;
  const value = profile as OrganicGrowthProfile;
  if (value.policyVersion !== ORGANIC_GROWTH_POLICY_VERSION) return false;
  if (!ENTITY_TYPES.has(value.entityType)) return false;
  if (value.locale !== "fa" && value.locale !== "en") return false;
  if (typeof value.canonicalPath !== "string" || !value.canonicalPath.startsWith("/")) return false;
  if (value.locale === "en" && value.canonicalPath !== "/en" && !value.canonicalPath.startsWith("/en/")) {
    return false;
  }
  if (value.locale === "fa" && (value.canonicalPath === "/en" || value.canonicalPath.startsWith("/en/"))) return false;
  if (value.canonicalUrl !== absoluteUrl(value.canonicalPath)) return false;
  if (typeof value.title !== "string" || value.title.length < 8 || value.title.length > 92) return false;
  if (
    typeof value.metaDescription !== "string" ||
    value.metaDescription.length < 48 ||
    value.metaDescription.length > 168
  ) {
    return false;
  }
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
  if (
    typeof value.safetyDisclaimer !== "string" ||
    !/(توصیه مالی|سیگنال|financial advice|trading signal)/i.test(value.safetyDisclaimer)
  ) {
    return false;
  }
  return ["evergreen", "fresh", "scheduled_refresh"].includes(value.freshnessTag);
}
