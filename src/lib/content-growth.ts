export type ContentLocale = "fa" | "en";

export type ContentPublicationStatus =
  | "draft"
  | "needs_review"
  | "ready"
  | "published"
  | "archived";

export type ContentEntityType =
  | "coin"
  | "news"
  | "tool"
  | "lesson"
  | "quiz"
  | "glossary"
  | "page";

export type SeoProfile = {
  title: string;
  description: string;
  canonical: string;
  hreflang: Partial<Record<ContentLocale, string>>;
  schemaTypes: string[];
  aeoAnswer?: string;
  llmSummary?: string;
};

export type ContentItem = {
  id: string;
  type: ContentEntityType;
  locale: ContentLocale;
  slug: string;
  title: string;
  status: ContentPublicationStatus;
  canonicalUrl: string;
  updatedAt: string;
  publishedAt?: string;
  seo?: SeoProfile;
};

export type EntityRelationType =
  | "mentions"
  | "explains"
  | "news_impacts"
  | "uses_tool"
  | "related_lesson"
  | "related_coin"
  | "risk_context";

export type EntityRelation = {
  fromType: ContentEntityType;
  fromId: string;
  toType: ContentEntityType;
  toId: string;
  relationType: EntityRelationType;
  confidence: number;
  editorialWeight?: number;
};

export type CoinPriorityInput = {
  symbol: string;
  newsId: string;
  freshnessScore: number;
  newsImpactScore: number;
  symbolConfidence: number;
  sourceTrust: number;
  marketImportance: number;
  learningRelevance: number;
  editorialWeight?: number;
};

export type CoinPriorityResult = CoinPriorityInput & {
  priorityScore: number;
};

export type ToolRankingInput = {
  slug: string;
  name: string;
  featuredWeight: number;
  newsImpactScore?: number;
  safetyScore: number;
  beginnerUsefulness: number;
  proUsefulness: number;
  categoryImportance: number;
  popularitySignal: number;
  officialLinkCompleteness: number;
  editorialWeight?: number;
};

export type ToolRankingResult = ToolRankingInput & {
  rankScore: number;
};

function clamp01(value: number | undefined): number {
  const numeric = value ?? Number.NaN;
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function roundScore(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeWeight(value: number | undefined): number {
  return clamp01(value);
}

export function scoreCoinPriority(input: CoinPriorityInput): CoinPriorityResult {
  const priorityScore = roundScore(
    clamp01(input.freshnessScore) * 0.25 +
      clamp01(input.newsImpactScore) * 0.25 +
      clamp01(input.symbolConfidence) * 0.15 +
      clamp01(input.sourceTrust) * 0.1 +
      clamp01(input.marketImportance) * 0.1 +
      clamp01(input.learningRelevance) * 0.1 +
      normalizeWeight(input.editorialWeight) * 0.05,
  );

  return { ...input, priorityScore };
}

export function rankCoinPriorities(inputs: CoinPriorityInput[], limit = 5): CoinPriorityResult[] {
  return inputs
    .map(scoreCoinPriority)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.symbol.localeCompare(b.symbol) || a.newsId.localeCompare(b.newsId))
    .slice(0, Math.max(0, limit));
}

export function scoreToolRanking(input: ToolRankingInput): ToolRankingResult {
  const rankScore = roundScore(
    clamp01(input.featuredWeight) * 0.16 +
      clamp01(input.newsImpactScore) * 0.1 +
      clamp01(input.safetyScore) * 0.2 +
      clamp01(input.beginnerUsefulness) * 0.15 +
      clamp01(input.proUsefulness) * 0.15 +
      clamp01(input.categoryImportance) * 0.1 +
      clamp01(input.popularitySignal) * 0.06 +
      clamp01(input.officialLinkCompleteness) * 0.05 +
      normalizeWeight(input.editorialWeight) * 0.05,
  );

  return { ...input, rankScore };
}

export function rankTools(inputs: ToolRankingInput[], limit = 5): ToolRankingResult[] {
  return inputs
    .map(scoreToolRanking)
    .sort((a, b) => b.rankScore - a.rankScore || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(0, limit));
}

export function isPublishableContent(item: ContentItem): boolean {
  if (item.status !== "ready" && item.status !== "published") return false;
  if (!item.title.trim() || !item.slug.trim() || !item.canonicalUrl.trim()) return false;
  if (!item.seo) return false;
  if (!item.seo.title.trim() || !item.seo.description.trim() || !item.seo.canonical.trim()) return false;
  return item.seo.schemaTypes.length > 0;
}

export function isAnswerEngineReadyContent(item: ContentItem): boolean {
  if (!isPublishableContent(item)) return false;
  const aeoAnswer = item.seo?.aeoAnswer?.trim() ?? "";
  const llmSummary = item.seo?.llmSummary?.trim() ?? "";
  return aeoAnswer.length >= 24 && llmSummary.length >= 48;
}
