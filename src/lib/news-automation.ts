import {
  isOrganicGrowthReadyContent,
  isPublishableContent,
  scoreCoinPriority,
  type CoinPriorityResult,
  type ContentItem,
  type ContentLocale,
  type EntityRelation,
  type SeoProfile,
} from "./content-growth";
import type { NewsImpactHistoryItem, NewsImpactTone } from "./news-impact-history";
import {
  buildOrganicGrowthProfile,
  type OrganicGrowthProfile,
} from "./organic-growth-automation";

export type NewsSourceTier = "official" | "trusted_media" | "tecpey_editorial" | "watchlist";

export type ApprovedNewsSource = {
  name: string;
  domain: string;
  tier: NewsSourceTier;
  trustScore: number;
};

export type RawNewsInput = {
  id?: string;
  locale: ContentLocale;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
};

export type NormalizedNewsArticle = {
  id: string;
  locale: ContentLocale;
  slug: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt: string;
  recordedAt: string;
  sourceTrust: number;
  tone: NewsImpactTone;
  detectedCoins: string[];
  detectedTools: string[];
  relatedLessonHref: string;
  impactScore: number;
  priority: number;
  idempotencyKey: string;
};

export type NewsAutomationRejectReason =
  | "missing_required_field"
  | "unapproved_source"
  | "low_source_trust"
  | "invalid_published_at"
  | "stale_news"
  | "prohibited_financial_advice"
  | "hype_or_profit_promise"
  | "no_supported_entity"
  | "missing_seo_schema";

export type NewsAutomationDecisionStatus = "publishable" | "needs_review" | "rejected";

export type NewsAutomationDecision = {
  status: NewsAutomationDecisionStatus;
  reasons: NewsAutomationRejectReason[];
  article: NormalizedNewsArticle;
  contentItem: ContentItem;
  seo: SeoProfile;
  organicGrowth: OrganicGrowthProfile;
  relations: EntityRelation[];
  coinImpacts: CoinPriorityResult[];
  historyItems: NewsImpactHistoryItem[];
};

type EntityDictionary = {
  coins: Record<string, string[]>;
  tools: Record<string, string[]>;
};

export const DEFAULT_APPROVED_NEWS_SOURCES: ApprovedNewsSource[] = [
  { name: "TecPey News Desk", domain: "tecpey.ir", tier: "tecpey_editorial", trustScore: 0.96 },
  { name: "TecPey Academy", domain: "tecpey.ir", tier: "tecpey_editorial", trustScore: 0.96 },
  { name: "CoinDesk", domain: "coindesk.com", tier: "trusted_media", trustScore: 0.86 },
  { name: "Cointelegraph", domain: "cointelegraph.com", tier: "trusted_media", trustScore: 0.78 },
  { name: "Decrypt", domain: "decrypt.co", tier: "trusted_media", trustScore: 0.76 },
  { name: "The Block", domain: "theblock.co", tier: "trusted_media", trustScore: 0.82 },
  { name: "Arzdigital", domain: "arzdigital.com", tier: "trusted_media", trustScore: 0.74 },
];

const ENTITY_DICTIONARY: EntityDictionary = {
  coins: {
    BTC: ["bitcoin", "btc", "بیت کوین", "بیت‌کوین"],
    ETH: ["ethereum", "eth", "ether", "اتریوم"],
    USDT: ["tether", "usdt", "تتر"],
    TON: ["toncoin", "ton", "telegram open network", "تون", "تون کوین", "تون‌کوین"],
    SOL: ["solana", "sol", "سولانا"],
    DOGE: ["dogecoin", "doge", "دوج کوین", "دوج‌کوین"],
  },
  tools: {
    tradingview: ["tradingview", "chart", "technical analysis", "نمودار", "تحلیل تکنیکال"],
    coinmarketcap: ["coinmarketcap", "market cap", "market data", "داده بازار", "ارزش بازار"],
    coingecko: ["coingecko", "market data", "داده بازار"],
    coinglass: ["coinglass", "open interest", "funding", "liquidation", "لیکویید", "فاندینگ"],
    cryptoquant: ["cryptoquant", "on-chain", "exchange flow", "آنچین", "جریان صرافی"],
    glassnode: ["glassnode", "on-chain", "آنچین"],
    messari: ["messari", "research", "گزارش پژوهشی"],
  },
};

const MARKET_IMPORTANCE: Record<string, number> = {
  BTC: 1,
  ETH: 0.94,
  USDT: 0.9,
  SOL: 0.78,
  TON: 0.72,
  DOGE: 0.55,
};

const COIN_SLUGS: Record<string, string> = {
  BTC: "bitcoin",
  DOGE: "dogecoin",
  ETH: "ethereum",
  SOL: "solana",
  TON: "toncoin",
  USDT: "tether",
};

const PROHIBITED_ADVICE_PATTERNS = [
  /\b(buy|sell|hold|long|short)\s+(now|today|immediately)\b/i,
  /\bguaranteed\s+(profit|return|gain)\b/i,
  /سیگنال\s+(خرید|فروش)/i,
  /(الان|فورا)\s+(بخر|بفروش)/i,
  /سود\s+تضمینی/i,
];

const HYPE_PATTERNS = [
  /\b(100x|moonshot|cannot lose|risk-free|sure profit)\b/i,
  /(صدبرابر|بدون ریسک|قطعی|فرصت طلایی تضمینی)/i,
];

const IMPACT_PATTERNS = [
  /\b(etf|sec|fed|blackrock|approval|lawsuit|hack|exploit|outflow|inflow|liquidation|funding|open interest|billion)\b/i,
  /(تایید|ETF|هک|فیشینگ|شکایت|لیکوئید|ورود سرمایه|خروج سرمایه|میلیارد|مقررات)/i,
];

function cleanText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `news-${stableHash(value).slice(0, 10)}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseUrlDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceFor(input: RawNewsInput, sources: ApprovedNewsSource[]): ApprovedNewsSource | undefined {
  const sourceDomain = parseUrlDomain(input.sourceUrl) || parseUrlDomain(input.url);
  return sources.find((source) => sourceDomain === source.domain || sourceDomain.endsWith(`.${source.domain}`));
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function detectEntities(text: string, dictionary: Record<string, string[]>): string[] {
  const normalized = text.toLowerCase();
  return Object.entries(dictionary)
    .filter(([, aliases]) => aliases.some((alias) => normalized.includes(alias.toLowerCase())))
    .map(([id]) => id)
    .sort();
}

function inferTone(text: string): NewsImpactTone {
  if (/\b(hack|exploit|phishing|fraud|ban|lawsuit|crash|outflow)\b|هک|فیشینگ|کلاهبرداری|ممنوعیت|شکایت|سقوط|خروج سرمایه/i.test(text)) {
    return "risk";
  }
  if (/\b(drop|fall|bear|liquidation|selloff)\b|ریزش|نزول|لیکوئید/i.test(text)) return "bearish";
  if (/\b(rally|inflow|approval|growth|surge|record)\b|رشد|افزایش|ورود سرمایه|تایید/i.test(text)) return "bullish";
  return "neutral";
}

function inferRelatedLessonHref(input: RawNewsInput, text: string): string {
  const prefix = input.locale === "en" ? "/en" : "";
  if (/security|hack|phishing|seed|امنیت|هک|فیشینگ/i.test(text)) return `${prefix}/academy/term-2`;
  if (/risk|liquidation|funding|ریسک|لیکوئید|فاندینگ/i.test(text)) return `${prefix}/academy/practice-lab`;
  return `${prefix}/academy/term-5`;
}

function hoursBetween(a: string, b: string): number {
  const first = new Date(a).getTime();
  const second = new Date(b).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(second)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (second - first) / 36e5);
}

function freshnessScore(article: NormalizedNewsArticle): number {
  const ageHours = hoursBetween(article.publishedAt, article.recordedAt);
  if (ageHours <= 1) return 1;
  if (ageHours <= 6) return 0.86;
  if (ageHours <= 24) return 0.68;
  if (ageHours <= 72) return 0.42;
  return 0.18;
}

function baseImpactScore(text: string, coinCount: number, toolCount: number): number {
  let score = 0.4;
  if (containsAny(text, IMPACT_PATTERNS)) score += 0.24;
  if (coinCount > 0) score += 0.16;
  if (toolCount > 0) score += 0.08;
  if (/\b(btc|bitcoin|eth|ethereum|etf|sec)\b|بیت.?کوین|اتریوم|ETF/i.test(text)) score += 0.12;
  return Math.min(1, score);
}

function priorityFrom(article: NormalizedNewsArticle): number {
  const priority = Math.round(
    article.impactScore * 42 +
      article.sourceTrust * 24 +
      freshnessScore(article) * 20 +
      Math.min(1, article.detectedCoins.length / 2) * 8 +
      Math.min(1, article.detectedTools.length / 2) * 6,
  );
  return Math.max(0, Math.min(100, priority));
}

function buildSeo(article: NormalizedNewsArticle): SeoProfile {
  const isEn = article.locale === "en";
  const canonical = `https://tecpey.ir${isEn ? "/en" : ""}/crypto-news/${article.slug}`;
  const description = article.summary.length > 160 ? `${article.summary.slice(0, 157)}...` : article.summary;
  return {
    title: isEn ? `${article.title} | TecPey Crypto News` : `${article.title} | اخبار رمزارز تک‌پی`,
    description,
    canonical,
    hreflang: {
      [article.locale]: canonical,
    },
    schemaTypes: ["NewsArticle", "FAQPage", "BreadcrumbList"],
    aeoAnswer: isEn
      ? `${article.title}: TecPey frames this as educational market context, not a trading signal.`
      : `${article.title}: تک‌پی این خبر را به‌عنوان زمینه آموزشی بازار نمایش می‌دهد، نه سیگنال معامله.`,
    llmSummary: `${article.title} ${description}`.trim(),
  };
}

function newsDetailPath(article: NormalizedNewsArticle): string {
  return `/${article.locale === "en" ? "en/" : ""}crypto-news/${article.slug}`;
}

function buildNewsOrganicGrowthProfile(article: NormalizedNewsArticle): OrganicGrowthProfile {
  const isEn = article.locale === "en";
  const coinLinks = article.detectedCoins.map((symbol) =>
    isEn
      ? `/en/coins/${COIN_SLUGS[symbol] ?? symbol.toLowerCase()}`
      : `/coins/${COIN_SLUGS[symbol] ?? symbol.toLowerCase()}`,
  );
  const toolLinks = article.detectedTools.map((slug) =>
    isEn ? `/en/trading-tools/${slug}` : `/trading-tools/${slug}`,
  );
  const entityTags = [
    "content:news",
    `locale:${article.locale}`,
    `tone:${article.tone}`,
    ...article.detectedCoins.map((symbol) => `coin:${symbol.toLowerCase()}`),
    ...article.detectedTools.map((slug) => `tool:${slug}`),
  ];
  const safetyDisclaimer = isEn
    ? "This automated news page is not financial advice, a trading signal or a profit promise."
    : "این صفحه خبر خودکار توصیه مالی، سیگنال معامله یا وعده سود نیست.";

  return buildOrganicGrowthProfile({
    entityType: "news",
    locale: article.locale,
    canonicalPath: newsDetailPath(article),
    title: isEn ? `${article.title} | TecPey Crypto News` : `${article.title} | اخبار رمزارز تک‌پی`,
    metaDescription: article.summary,
    schemaTypes: ["NewsArticle", "FAQPage", "BreadcrumbList"],
    keywords: [
      article.title,
      article.sourceName,
      "crypto news",
      "market context",
      ...article.detectedCoins,
      ...article.detectedTools,
    ],
    entityTags,
    internalLinks: [
      newsDetailPath(article),
      isEn ? "/en/crypto-news" : "/crypto-news",
      article.relatedLessonHref,
      ...coinLinks,
      ...toolLinks,
    ],
    answerSummary: isEn
      ? `${article.title}: TecPey records this as educational market context connected to supported coins, tools and Academy learning paths.`
      : `${article.title}: تک‌پی این خبر را به‌عنوان زمینه آموزشی بازار و مرتبط با کوین‌ها، ابزارها و مسیرهای آکادمی ثبت می‌کند.`,
    llmSummary: `${article.title}. ${article.summary} Source: ${article.sourceName}. ${safetyDisclaimer}`,
    safetyDisclaimer,
    freshnessTag: "fresh",
  });
}

function buildRelations(article: NormalizedNewsArticle): EntityRelation[] {
  const newsId = article.id;
  const coinRelations = article.detectedCoins.map((symbol) => ({
    fromType: "news" as const,
    fromId: newsId,
    toType: "coin" as const,
    toId: symbol,
    relationType: "news_impacts" as const,
    confidence: 0.86,
    editorialWeight: article.priority / 100,
  }));
  const toolRelations = article.detectedTools.map((slug) => ({
    fromType: "news" as const,
    fromId: newsId,
    toType: "tool" as const,
    toId: slug,
    relationType: "uses_tool" as const,
    confidence: 0.78,
    editorialWeight: article.priority / 100,
  }));
  const lessonRelation: EntityRelation = {
    fromType: "news",
    fromId: newsId,
    toType: "lesson",
    toId: article.relatedLessonHref,
    relationType: "related_lesson",
    confidence: 0.72,
    editorialWeight: 0.66,
  };
  return [...coinRelations, ...toolRelations, lessonRelation];
}

function reviewReasons(input: RawNewsInput, article: NormalizedNewsArticle, source?: ApprovedNewsSource): NewsAutomationRejectReason[] {
  const reasons: NewsAutomationRejectReason[] = [];
  const text = `${article.title} ${article.summary}`;
  const published = new Date(article.publishedAt).getTime();
  if (!input.title.trim() || !input.summary.trim() || !input.url.trim() || !input.sourceUrl.trim()) {
    reasons.push("missing_required_field");
  }
  if (!source) reasons.push("unapproved_source");
  if (article.sourceTrust < 0.7) reasons.push("low_source_trust");
  if (!Number.isFinite(published)) reasons.push("invalid_published_at");
  if (hoursBetween(article.publishedAt, article.recordedAt) > 168) reasons.push("stale_news");
  if (containsAny(text, PROHIBITED_ADVICE_PATTERNS)) reasons.push("prohibited_financial_advice");
  if (containsAny(text, HYPE_PATTERNS)) reasons.push("hype_or_profit_promise");
  if (article.detectedCoins.length === 0 && article.detectedTools.length === 0) reasons.push("no_supported_entity");
  return reasons;
}

export function normalizeNewsInput(
  input: RawNewsInput,
  sources: ApprovedNewsSource[] = DEFAULT_APPROVED_NEWS_SOURCES,
): NormalizedNewsArticle {
  const source = sourceFor(input, sources);
  const title = cleanText(input.title);
  const summary = cleanText(input.summary);
  const combined = `${title} ${summary}`;
  const detectedCoins = detectEntities(combined, ENTITY_DICTIONARY.coins);
  const detectedTools = detectEntities(combined, ENTITY_DICTIONARY.tools);
  const idempotencyKey = stableHash(`${input.locale}|${input.url}|${input.publishedAt}|${title}`);
  const slug = `${slugify(title).slice(0, 72)}-${idempotencyKey.slice(0, 6)}`;
  const impactScore = baseImpactScore(combined, detectedCoins.length, detectedTools.length);
  const article: NormalizedNewsArticle = {
    id: input.id?.trim() || `news-${input.locale}-${idempotencyKey}`,
    locale: input.locale,
    slug,
    title,
    summary,
    sourceName: input.sourceName.trim() || source?.name || "Unknown source",
    sourceUrl: input.sourceUrl,
    canonicalUrl: input.url,
    publishedAt: input.publishedAt,
    recordedAt: input.fetchedAt,
    sourceTrust: source?.trustScore ?? 0,
    tone: inferTone(combined),
    detectedCoins,
    detectedTools,
    relatedLessonHref: inferRelatedLessonHref(input, combined),
    impactScore,
    priority: 0,
    idempotencyKey,
  };
  return { ...article, priority: priorityFrom(article) };
}

export function buildNewsAutomationDecision(
  input: RawNewsInput,
  sources: ApprovedNewsSource[] = DEFAULT_APPROVED_NEWS_SOURCES,
): NewsAutomationDecision {
  const source = sourceFor(input, sources);
  const article = normalizeNewsInput(input, sources);
  const seo = buildSeo(article);
  const organicGrowth = buildNewsOrganicGrowthProfile(article);
  const contentItem: ContentItem = {
    id: article.id,
    type: "news",
    locale: article.locale,
    slug: article.slug,
    title: article.title,
    status: "ready",
    canonicalUrl: seo.canonical,
    updatedAt: article.recordedAt,
    publishedAt: article.publishedAt,
    seo,
    organicGrowth,
  };
  const reasons = reviewReasons(input, article, source);
  if (!isPublishableContent(contentItem)) reasons.push("missing_seo_schema");
  if (!isOrganicGrowthReadyContent(contentItem)) reasons.push("missing_seo_schema");
  const fatal = reasons.some((reason) =>
    ["missing_required_field", "invalid_published_at", "prohibited_financial_advice", "hype_or_profit_promise"].includes(reason),
  );
  const status: NewsAutomationDecisionStatus = fatal ? "rejected" : reasons.length ? "needs_review" : "publishable";
  const relations = buildRelations(article);
  const coinImpacts = article.detectedCoins
    .map((symbol) =>
      scoreCoinPriority({
        symbol,
        newsId: article.id,
        freshnessScore: freshnessScore(article),
        newsImpactScore: article.impactScore,
        symbolConfidence: 0.86,
        sourceTrust: article.sourceTrust,
        marketImportance: MARKET_IMPORTANCE[symbol] ?? 0.55,
        learningRelevance: article.relatedLessonHref.includes("academy") ? 0.82 : 0.6,
        editorialWeight: article.priority / 100,
      }),
    )
    .sort((a, b) => b.priorityScore - a.priorityScore || a.symbol.localeCompare(b.symbol));
  const historyItems = status === "publishable"
    ? [
        {
          id: `${article.id}-impact`,
          locale: article.locale,
          title: article.title,
          summary: article.summary,
          sourceName: article.sourceName,
          sourceUrl: article.sourceUrl,
          newsUrl: newsDetailPath(article),
          publishedAt: article.publishedAt,
          recordedAt: article.recordedAt,
          priority: article.priority,
          impactScore: Math.round(article.impactScore * 10),
          tone: article.tone,
          reasonFa: "این خبر به دلیل ارتباط با دارایی/ابزار و اثر آموزشی، در history تک‌پی ثبت شده است.",
          reasonEn: "This news is recorded because it has entity relevance and educational market impact.",
          relatedToolSlugs: article.detectedTools,
          relatedCoinSymbols: article.detectedCoins,
          relatedLessonHref: article.relatedLessonHref,
        },
      ]
    : [];

  return {
    status,
    reasons,
    article,
    contentItem,
    seo,
    organicGrowth,
    relations,
    coinImpacts,
    historyItems,
  };
}

export function buildNewsAutomationBatch(
  inputs: RawNewsInput[],
  sources: ApprovedNewsSource[] = DEFAULT_APPROVED_NEWS_SOURCES,
): NewsAutomationDecision[] {
  const seen = new Set<string>();
  return inputs
    .map((input) => buildNewsAutomationDecision(input, sources))
    .filter((decision) => {
      if (seen.has(decision.article.idempotencyKey)) return false;
      seen.add(decision.article.idempotencyKey);
      return true;
    })
    .sort((a, b) => b.article.priority - a.article.priority || a.article.id.localeCompare(b.article.id));
}
