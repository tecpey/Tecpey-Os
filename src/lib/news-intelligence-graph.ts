import type { ContentLocale } from "./content-growth";

export const TECPEY_NEWS_INTELLIGENCE_GRAPH_POLICY_VERSION = "tecpey-news-intelligence-graph-v1";

export type NewsIntelligenceSourceTier =
  | "institutional_data"
  | "official_primary"
  | "trusted_media"
  | "social_signal"
  | "watchlist";

export type ThumbnailRightsPolicy =
  | "licensed"
  | "official_attribution"
  | "tecpey_generated"
  | "blocked";

export type NewsIntelligenceSource = {
  name: string;
  domain: string;
  tier: NewsIntelligenceSourceTier;
  trustScore: number;
  allowedForPublicSummary: boolean;
  allowedForPersianEditorial: boolean;
  thumbnailPolicy: ThumbnailRightsPolicy;
  requiresAttribution: boolean;
};

export type NewsSocialLayer = {
  source: "x" | "telegram" | "reddit" | "youtube" | "official_forum" | "other";
  url?: string;
  observedAt: string;
  verifiedAccount: boolean;
  engagementScore: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
};

export type NewsEntityReference = {
  type: "coin" | "tool" | "project" | "network" | "exchange" | "regulator";
  id: string;
  label: string;
  confidence: number;
  officialUrl?: string;
};

export type ExistingNewsGraphItem = {
  id: string;
  title: string;
  canonicalUrl: string;
  publishedAt: string;
  fingerprint: string;
  relatedEntityIds: string[];
  tags: string[];
};

export type NewsIntelligenceCandidate = {
  locale: ContentLocale;
  originalLanguage: "en" | "fa" | "ar" | "tr" | "other";
  title: string;
  originalSummary: string;
  persianSummary: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt: string;
  fetchedAt: string;
  thumbnail?: {
    url: string;
    alt: string;
    rights: ThumbnailRightsPolicy;
  };
  entities: NewsEntityReference[];
  tags: string[];
  socialLayer?: NewsSocialLayer;
  relatedLessonHref?: string;
};

export type NewsIntelligenceGateReason =
  | "source_not_authorized"
  | "source_too_weak"
  | "canonical_url_not_https"
  | "source_url_not_https"
  | "invalid_publication_time"
  | "persian_summary_missing"
  | "persian_summary_too_short"
  | "persian_summary_too_long"
  | "thumbnail_rights_blocked"
  | "missing_thumbnail_attribution"
  | "duplicate_news"
  | "near_duplicate_news"
  | "missing_entities"
  | "missing_tags"
  | "financial_advice_or_signal"
  | "hype_or_profit_promise"
  | "social_layer_unverified"
  | "missing_academy_context";

export type NewsDuplicateDecision = {
  status: "unique" | "duplicate" | "near_duplicate";
  matchedId?: string;
  reason?: "canonical_url" | "fingerprint" | "title_entity_time";
  similarity: number;
};

export type TecPeyCLevelAIRole =
  | "chief_data_officer_ai"
  | "chief_market_intelligence_ai"
  | "chief_risk_compliance_ai"
  | "chief_editor_ai"
  | "chief_academy_ai"
  | "chief_product_ai";

export type TecPeyCLevelAIReview = {
  role: TecPeyCLevelAIRole;
  signedOff: boolean;
  score: number;
  notes: string[];
};

export type NewsIntelligenceGraphEdge = {
  fromId: string;
  toId: string;
  type:
    | "mentions_coin"
    | "mentions_tool"
    | "mentions_project"
    | "mentions_network"
    | "mentions_exchange"
    | "mentions_regulator"
    | "tagged_as"
    | "same_story_chain"
    | "related_lesson"
    | "sourced_from"
    | "time_bucket";
  confidence: number;
};

export type CoinDiscoveryStatus =
  | "trending"
  | "educational_listed"
  | "watchlist"
  | "manual_review_required";

export type DailyCoinDiscovery = {
  symbol: string;
  label: string;
  status: CoinDiscoveryStatus;
  sourceCount: number;
  newsCount: number;
  audienceScore: number;
  riskReviewRequired: boolean;
  exchangeEnabled: false;
  officialUrls: string[];
};

export type NewsSourceCard = {
  title: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  thumbnailUrl?: string;
  thumbnailAlt?: string;
  thumbnailRights: ThumbnailRightsPolicy;
  attributionRequired: boolean;
  persianSummary: string;
  originalLanguage: NewsIntelligenceCandidate["originalLanguage"];
  socialLayerSummary: string;
};

export type NewsIntelligenceDossier = {
  schemaVersion: 1;
  policyVersion: typeof TECPEY_NEWS_INTELLIGENCE_GRAPH_POLICY_VERSION;
  id: string;
  fingerprint: string;
  locale: ContentLocale;
  status: "publishable" | "human_review" | "rejected";
  reasons: NewsIntelligenceGateReason[];
  duplicate: NewsDuplicateDecision;
  source: NewsIntelligenceSource;
  sourceCard: NewsSourceCard;
  entities: NewsEntityReference[];
  tags: string[];
  timeBuckets: {
    day: string;
    month: string;
  };
  graphEdges: NewsIntelligenceGraphEdge[];
  reviews: TecPeyCLevelAIReview[];
  coinDiscoveries: DailyCoinDiscovery[];
};

export const ENTERPRISE_NEWS_INTELLIGENCE_SOURCES: NewsIntelligenceSource[] = [
  {
    name: "CoinDesk Data API",
    domain: "coindesk.com",
    tier: "institutional_data",
    trustScore: 0.92,
    allowedForPublicSummary: true,
    allowedForPersianEditorial: true,
    thumbnailPolicy: "official_attribution",
    requiresAttribution: true,
  },
  {
    name: "Benzinga Crypto News API",
    domain: "benzinga.com",
    tier: "trusted_media",
    trustScore: 0.86,
    allowedForPublicSummary: true,
    allowedForPersianEditorial: true,
    thumbnailPolicy: "licensed",
    requiresAttribution: true,
  },
  {
    name: "The Block",
    domain: "theblock.co",
    tier: "trusted_media",
    trustScore: 0.84,
    allowedForPublicSummary: true,
    allowedForPersianEditorial: true,
    thumbnailPolicy: "official_attribution",
    requiresAttribution: true,
  },
  {
    name: "Decrypt",
    domain: "decrypt.co",
    tier: "trusted_media",
    trustScore: 0.78,
    allowedForPublicSummary: true,
    allowedForPersianEditorial: true,
    thumbnailPolicy: "official_attribution",
    requiresAttribution: true,
  },
  {
    name: "Cointelegraph",
    domain: "cointelegraph.com",
    tier: "trusted_media",
    trustScore: 0.76,
    allowedForPublicSummary: true,
    allowedForPersianEditorial: true,
    thumbnailPolicy: "official_attribution",
    requiresAttribution: true,
  },
  {
    name: "Official Project Source",
    domain: "official-project.example",
    tier: "official_primary",
    trustScore: 0.94,
    allowedForPublicSummary: true,
    allowedForPersianEditorial: true,
    thumbnailPolicy: "official_attribution",
    requiresAttribution: true,
  },
];

const FINANCIAL_ADVICE_PATTERNS = [
  /\b(buy|sell|long|short)\s+(now|today|immediately)\b/i,
  /\bguaranteed\s+(profit|return|gain)\b/i,
  /سیگنال\s+(خرید|فروش)/i,
  /(الان|فورا)\s+(بخر|بفروش)/i,
  /سود\s+تضمینی/i,
];

const HYPE_PATTERNS = [
  /\b(100x|moonshot|cannot lose|risk-free|sure profit)\b/i,
  /(صدبرابر|بدون ریسک|قطعی|فرصت طلایی تضمینی)/i,
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function roundScore(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function urlDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isHttps(value: string): boolean {
  return normalizeUrl(value).startsWith("https://");
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9آ-ی]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length >= 3));
}

function titleSimilarity(a: string, b: string): number {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return roundScore(shared / (left.size + right.size - shared));
}

function hasPersianText(value: string): boolean {
  return /[آ-ی]/.test(value);
}

function sourceFor(candidate: NewsIntelligenceCandidate, sources: NewsIntelligenceSource[]): NewsIntelligenceSource | undefined {
  const sourceDomain = urlDomain(candidate.sourceUrl) || urlDomain(candidate.canonicalUrl);
  return sources.find((source) => sourceDomain === source.domain || sourceDomain.endsWith(`.${source.domain}`));
}

function sourceFallback(candidate: NewsIntelligenceCandidate): NewsIntelligenceSource {
  return {
    name: candidate.sourceName || "Unknown Source",
    domain: urlDomain(candidate.sourceUrl) || "unknown",
    tier: "watchlist",
    trustScore: 0,
    allowedForPublicSummary: false,
    allowedForPersianEditorial: false,
    thumbnailPolicy: "blocked",
    requiresAttribution: true,
  };
}

function containsPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function dateBucket(value: string): { day: string; month: string } {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { day: "invalid", month: "invalid" };
  const iso = date.toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

function entityIds(entities: NewsEntityReference[]): string[] {
  return entities.map((entity) => `${entity.type}:${entity.id.trim().toUpperCase()}`).sort();
}

export function buildNewsIntelligenceFingerprint(candidate: NewsIntelligenceCandidate): string {
  const canonical = normalizeUrl(candidate.canonicalUrl);
  const publishedDay = dateBucket(candidate.publishedAt).day;
  const entityKey = entityIds(candidate.entities).join("|");
  return stableHash(`${canonical}|${normalizeText(candidate.title)}|${publishedDay}|${entityKey}`);
}

export function assessNewsDuplicate(
  candidate: NewsIntelligenceCandidate,
  existingItems: ExistingNewsGraphItem[] = [],
): NewsDuplicateDecision {
  const canonical = normalizeUrl(candidate.canonicalUrl);
  const fingerprint = buildNewsIntelligenceFingerprint(candidate);
  const candidateEntities = new Set(entityIds(candidate.entities));
  const candidateTime = new Date(candidate.publishedAt).getTime();

  for (const item of existingItems) {
    if (canonical && normalizeUrl(item.canonicalUrl) === canonical) {
      return { status: "duplicate", matchedId: item.id, reason: "canonical_url", similarity: 1 };
    }
    if (item.fingerprint === fingerprint) {
      return { status: "duplicate", matchedId: item.id, reason: "fingerprint", similarity: 1 };
    }

    const existingTime = new Date(item.publishedAt).getTime();
    const withinStoryWindow =
      Number.isFinite(candidateTime) &&
      Number.isFinite(existingTime) &&
      Math.abs(candidateTime - existingTime) <= 72 * 60 * 60 * 1000;
    const sharesEntity = item.relatedEntityIds.some((id) => candidateEntities.has(id));
    const similarity = titleSimilarity(candidate.title, item.title);

    if (withinStoryWindow && sharesEntity && similarity >= 0.72) {
      return { status: "near_duplicate", matchedId: item.id, reason: "title_entity_time", similarity };
    }
  }

  return { status: "unique", similarity: 0 };
}

function socialSummary(layer: NewsSocialLayer | undefined): string {
  if (!layer) return "No verified social layer attached.";
  const trust = layer.verifiedAccount ? "verified" : "unverified";
  return `${layer.source}:${trust}:${layer.sentiment}:engagement-${roundScore(clamp01(layer.engagementScore))}`;
}

function buildGraphEdges(candidate: NewsIntelligenceCandidate, id: string, duplicate: NewsDuplicateDecision): NewsIntelligenceGraphEdge[] {
  const edges: NewsIntelligenceGraphEdge[] = [
    { fromId: id, toId: `source:${urlDomain(candidate.sourceUrl)}`, type: "sourced_from", confidence: 1 },
    { fromId: id, toId: `day:${dateBucket(candidate.publishedAt).day}`, type: "time_bucket", confidence: 1 },
  ];

  for (const entity of candidate.entities) {
    const typeByEntity: Record<NewsEntityReference["type"], NewsIntelligenceGraphEdge["type"]> = {
      coin: "mentions_coin",
      tool: "mentions_tool",
      project: "mentions_project",
      network: "mentions_network",
      exchange: "mentions_exchange",
      regulator: "mentions_regulator",
    };
    edges.push({
      fromId: id,
      toId: `${entity.type}:${entity.id.trim().toUpperCase()}`,
      type: typeByEntity[entity.type],
      confidence: clamp01(entity.confidence),
    });
  }

  for (const tag of candidate.tags) {
    edges.push({ fromId: id, toId: `tag:${normalizeText(tag)}`, type: "tagged_as", confidence: 1 });
  }

  if (candidate.relatedLessonHref) {
    edges.push({ fromId: id, toId: candidate.relatedLessonHref, type: "related_lesson", confidence: 0.9 });
  }

  if (duplicate.status === "near_duplicate" && duplicate.matchedId) {
    edges.push({ fromId: id, toId: duplicate.matchedId, type: "same_story_chain", confidence: duplicate.similarity });
  }

  return edges;
}

function reviewDossier(
  role: TecPeyCLevelAIRole,
  signedOff: boolean,
  score: number,
  notes: string[],
): TecPeyCLevelAIReview {
  return { role, signedOff, score: roundScore(clamp01(score)), notes };
}

function buildReviews(
  candidate: NewsIntelligenceCandidate,
  source: NewsIntelligenceSource,
  duplicate: NewsDuplicateDecision,
  reasons: NewsIntelligenceGateReason[],
): TecPeyCLevelAIReview[] {
  const hasRiskBlock = reasons.includes("financial_advice_or_signal") || reasons.includes("hype_or_profit_promise");
  const hasSourceBlock = reasons.includes("source_not_authorized") || reasons.includes("source_too_weak");
  const hasEditorialBlock =
    reasons.includes("persian_summary_missing") ||
    reasons.includes("persian_summary_too_short") ||
    reasons.includes("persian_summary_too_long");

  return [
    reviewDossier("chief_data_officer_ai", !hasSourceBlock && duplicate.status === "unique", source.trustScore, [
      `source:${source.domain}`,
      `duplicate:${duplicate.status}`,
    ]),
    reviewDossier(
      "chief_market_intelligence_ai",
      candidate.entities.length > 0 && candidate.tags.length >= 2,
      Math.min(1, candidate.entities.length * 0.18 + candidate.tags.length * 0.08 + source.trustScore * 0.5),
      [`entities:${candidate.entities.length}`, `tags:${candidate.tags.length}`],
    ),
    reviewDossier("chief_risk_compliance_ai", !hasRiskBlock, hasRiskBlock ? 0.15 : 0.96, [
      hasRiskBlock ? "blocked-risk-language" : "no-trading-signal",
      "exchange-enabled:false",
    ]),
    reviewDossier("chief_editor_ai", !hasEditorialBlock, hasEditorialBlock ? 0.35 : 0.9, [
      `fa-summary-length:${candidate.persianSummary.trim().length}`,
      `original-language:${candidate.originalLanguage}`,
    ]),
    reviewDossier("chief_academy_ai", Boolean(candidate.relatedLessonHref), candidate.relatedLessonHref ? 0.88 : 0.42, [
      candidate.relatedLessonHref ? `lesson:${candidate.relatedLessonHref}` : "missing-lesson-context",
    ]),
    reviewDossier(
      "chief_product_ai",
      candidate.thumbnail?.rights !== "blocked" && candidate.tags.length > 0,
      candidate.thumbnail ? 0.84 : 0.68,
      [candidate.thumbnail ? `thumbnail:${candidate.thumbnail.rights}` : "thumbnail:tecpey-generated-required"],
    ),
  ];
}

function coinStatusFor(entity: NewsEntityReference, candidate: NewsIntelligenceCandidate, source: NewsIntelligenceSource): CoinDiscoveryStatus {
  const confidence = clamp01(entity.confidence);
  const social = candidate.socialLayer ? clamp01(candidate.socialLayer.engagementScore) : 0;
  const isRiskStory = candidate.tags.some((tag) => /hack|exploit|risk|scam|security|هک|ریسک|امنیت/i.test(tag));
  if (isRiskStory || confidence < 0.55) return "manual_review_required";
  if (source.trustScore >= 0.85 && confidence >= 0.78 && social >= 0.55) return "trending";
  if (source.trustScore >= 0.72 && confidence >= 0.64) return "educational_listed";
  return "watchlist";
}

function buildCoinDiscoveries(candidate: NewsIntelligenceCandidate, source: NewsIntelligenceSource): DailyCoinDiscovery[] {
  const coins = candidate.entities.filter((entity) => entity.type === "coin");
  return coins.map((coin) => {
    const status = coinStatusFor(coin, candidate, source);
    const audienceScore = roundScore(
      clamp01(coin.confidence) * 0.42 +
        source.trustScore * 0.34 +
        (candidate.socialLayer ? clamp01(candidate.socialLayer.engagementScore) : 0.2) * 0.24,
    );
    return {
      symbol: coin.id.trim().toUpperCase(),
      label: coin.label,
      status,
      sourceCount: 1,
      newsCount: 1,
      audienceScore,
      riskReviewRequired: status === "manual_review_required",
      exchangeEnabled: false,
      officialUrls: coin.officialUrl ? [coin.officialUrl] : [],
    };
  });
}

function collectGateReasons(
  candidate: NewsIntelligenceCandidate,
  source: NewsIntelligenceSource | undefined,
  duplicate: NewsDuplicateDecision,
): NewsIntelligenceGateReason[] {
  const reasons: NewsIntelligenceGateReason[] = [];
  const fullText = `${candidate.title} ${candidate.originalSummary} ${candidate.persianSummary}`;
  const publishedAt = new Date(candidate.publishedAt).getTime();

  if (!source || !source.allowedForPublicSummary || !source.allowedForPersianEditorial) reasons.push("source_not_authorized");
  else if (source.trustScore < 0.7) reasons.push("source_too_weak");
  if (!isHttps(candidate.canonicalUrl)) reasons.push("canonical_url_not_https");
  if (!isHttps(candidate.sourceUrl)) reasons.push("source_url_not_https");
  if (!Number.isFinite(publishedAt)) reasons.push("invalid_publication_time");

  const faSummary = candidate.persianSummary.trim();
  if (!faSummary || !hasPersianText(faSummary)) reasons.push("persian_summary_missing");
  else if (faSummary.length < 80) reasons.push("persian_summary_too_short");
  else if (faSummary.length > 900) reasons.push("persian_summary_too_long");

  if (candidate.thumbnail?.rights === "blocked") reasons.push("thumbnail_rights_blocked");
  if (candidate.thumbnail && candidate.thumbnail.rights === "official_attribution" && !source?.requiresAttribution) {
    reasons.push("missing_thumbnail_attribution");
  }
  if (duplicate.status === "duplicate") reasons.push("duplicate_news");
  if (duplicate.status === "near_duplicate") reasons.push("near_duplicate_news");
  if (candidate.entities.length === 0) reasons.push("missing_entities");
  if (candidate.tags.length < 2) reasons.push("missing_tags");
  if (containsPattern(fullText, FINANCIAL_ADVICE_PATTERNS)) reasons.push("financial_advice_or_signal");
  if (containsPattern(fullText, HYPE_PATTERNS)) reasons.push("hype_or_profit_promise");
  if (candidate.socialLayer && !candidate.socialLayer.verifiedAccount && candidate.socialLayer.engagementScore >= 0.65) {
    reasons.push("social_layer_unverified");
  }
  if (!candidate.relatedLessonHref) reasons.push("missing_academy_context");

  return Array.from(new Set(reasons));
}

function finalStatus(reasons: NewsIntelligenceGateReason[], reviews: TecPeyCLevelAIReview[]): NewsIntelligenceDossier["status"] {
  const hardBlocks: NewsIntelligenceGateReason[] = [
    "source_not_authorized",
    "source_too_weak",
    "canonical_url_not_https",
    "source_url_not_https",
    "invalid_publication_time",
    "persian_summary_missing",
    "thumbnail_rights_blocked",
    "duplicate_news",
    "financial_advice_or_signal",
    "hype_or_profit_promise",
  ];
  if (reasons.some((reason) => hardBlocks.includes(reason))) return "rejected";
  if (reasons.length > 0) return "human_review";
  if (reviews.every((review) => review.signedOff)) return "publishable";
  return "human_review";
}

export function buildNewsIntelligenceDossier(
  candidate: NewsIntelligenceCandidate,
  options: {
    existingItems?: ExistingNewsGraphItem[];
    sources?: NewsIntelligenceSource[];
  } = {},
): NewsIntelligenceDossier {
  const sources = options.sources ?? ENTERPRISE_NEWS_INTELLIGENCE_SOURCES;
  const source = sourceFor(candidate, sources);
  const sourceAuthority = source ?? sourceFallback(candidate);
  const duplicate = assessNewsDuplicate(candidate, options.existingItems ?? []);
  const reasons = collectGateReasons(candidate, source, duplicate);
  const fingerprint = buildNewsIntelligenceFingerprint(candidate);
  const id = `news-intel-${fingerprint}`;
  const reviews = buildReviews(candidate, sourceAuthority, duplicate, reasons);

  return {
    schemaVersion: 1,
    policyVersion: TECPEY_NEWS_INTELLIGENCE_GRAPH_POLICY_VERSION,
    id,
    fingerprint,
    locale: candidate.locale,
    status: finalStatus(reasons, reviews),
    reasons,
    duplicate,
    source: sourceAuthority,
    sourceCard: {
      title: candidate.title.trim(),
      sourceName: candidate.sourceName.trim() || sourceAuthority.name,
      sourceUrl: normalizeUrl(candidate.sourceUrl) || candidate.sourceUrl,
      canonicalUrl: normalizeUrl(candidate.canonicalUrl) || candidate.canonicalUrl,
      thumbnailUrl: candidate.thumbnail?.url,
      thumbnailAlt: candidate.thumbnail?.alt,
      thumbnailRights: candidate.thumbnail?.rights ?? "tecpey_generated",
      attributionRequired: sourceAuthority.requiresAttribution || candidate.thumbnail?.rights === "official_attribution",
      persianSummary: candidate.persianSummary.trim(),
      originalLanguage: candidate.originalLanguage,
      socialLayerSummary: socialSummary(candidate.socialLayer),
    },
    entities: candidate.entities,
    tags: Array.from(new Set(candidate.tags.map((tag) => normalizeText(tag)).filter(Boolean))).sort(),
    timeBuckets: dateBucket(candidate.publishedAt),
    graphEdges: buildGraphEdges(candidate, id, duplicate),
    reviews,
    coinDiscoveries: buildCoinDiscoveries(candidate, sourceAuthority),
  };
}

function mergeCoinDiscoveryStatus(left: CoinDiscoveryStatus, right: CoinDiscoveryStatus): CoinDiscoveryStatus {
  const priority: Record<CoinDiscoveryStatus, number> = {
    trending: 4,
    educational_listed: 3,
    manual_review_required: 2,
    watchlist: 1,
  };
  return priority[right] > priority[left] ? right : left;
}

export function rankDailyCoinDiscoveries(dossiers: NewsIntelligenceDossier[], limit = 5): DailyCoinDiscovery[] {
  const bySymbol = new Map<string, DailyCoinDiscovery>();

  for (const dossier of dossiers) {
    if (dossier.status === "rejected") continue;
    for (const discovery of dossier.coinDiscoveries) {
      const existing = bySymbol.get(discovery.symbol);
      if (!existing) {
        bySymbol.set(discovery.symbol, { ...discovery });
        continue;
      }
      bySymbol.set(discovery.symbol, {
        ...existing,
        status: mergeCoinDiscoveryStatus(existing.status, discovery.status),
        sourceCount: existing.sourceCount + discovery.sourceCount,
        newsCount: existing.newsCount + discovery.newsCount,
        audienceScore: roundScore(Math.max(existing.audienceScore, discovery.audienceScore)),
        riskReviewRequired: existing.riskReviewRequired || discovery.riskReviewRequired,
        officialUrls: Array.from(new Set([...existing.officialUrls, ...discovery.officialUrls])).sort(),
      });
    }
  }

  return Array.from(bySymbol.values())
    .sort((a, b) => b.audienceScore - a.audienceScore || b.newsCount - a.newsCount || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(0, limit));
}
