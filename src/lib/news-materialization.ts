import type { ContentLocale } from "./content-growth";
import type { NewsAutomationDecision, NewsAutomationDecisionStatus } from "./news-automation";
import {
  buildNewsIntelligenceDossier,
  rankDailyCoinDiscoveries,
  type DailyCoinDiscovery,
  type ExistingNewsGraphItem,
  type NewsEntityReference,
  type NewsIntelligenceCandidate,
  type NewsIntelligenceDossier,
  type NewsIntelligenceGateReason,
  type NewsIntelligenceGraphEdge,
  type NewsSourceCard,
  type TecPeyCLevelAIReview,
} from "./news-intelligence-graph";
import {
  getNewsImpactDetailPath,
  getNewsImpactSlug,
  type NewsImpactHistoryItem,
} from "./news-impact-history";

export type NewsMaterializationStorageMode = "ephemeral_contract";

const COIN_OFFICIAL_URLS: Record<string, string> = {
  BTC: "https://bitcoin.org/",
  DOGE: "https://dogecoin.com/",
  ETH: "https://ethereum.org/",
  SOL: "https://solana.com/",
  TON: "https://ton.org/",
  USDT: "https://tether.to/",
};

export type MaterializedNewsSitemapEntry = {
  path: string;
  lastModified: string;
  priority: number;
};

export type MaterializedNewsTopCoin = {
  symbol: string;
  locale: ContentLocale;
  newsId: string;
  slug: string;
  newsDetailPath: string;
  title: string;
  priority: number;
  impactScore: number;
  publishedAt: string;
  recordedAt: string;
  discovery?: DailyCoinDiscovery;
};

export type MaterializedNewsDecisionIntelligence = {
  dossierId: string;
  fingerprint: string;
  status: NewsIntelligenceDossier["status"];
  reasons: NewsIntelligenceGateReason[];
  duplicate: NewsIntelligenceDossier["duplicate"];
  sourceCard: NewsSourceCard;
  entities: NewsEntityReference[];
  tags: string[];
  timeBuckets: NewsIntelligenceDossier["timeBuckets"];
  graphEdges: NewsIntelligenceGraphEdge[];
  reviews: TecPeyCLevelAIReview[];
  coinDiscoveries: DailyCoinDiscovery[];
};

export type MaterializedNewsDecisionSummary = {
  id: string;
  slug: string;
  status: NewsAutomationDecisionStatus;
  idempotencyKey: string;
  intelligence: MaterializedNewsDecisionIntelligence;
};

export type MaterializedNewsSnapshot = {
  storageMode: NewsMaterializationStorageMode;
  locale?: ContentLocale;
  generatedAt: string;
  publishable: number;
  needsReview: number;
  rejected: number;
  historyItems: NewsImpactHistoryItem[];
  canonicalSlugs: string[];
  sitemapEntries: MaterializedNewsSitemapEntry[];
  topCoins: MaterializedNewsTopCoin[];
  decisions: MaterializedNewsDecisionSummary[];
};

export type MaterializeNewsAutomationOptions = {
  locale?: ContentLocale;
  generatedAt?: string;
  historyLimit?: number;
  topCoinLimit?: number;
};

type DecisionDossierPair = {
  decision: NewsAutomationDecision;
  dossier: NewsIntelligenceDossier;
};

function sortByPriorityAndTime(a: NewsImpactHistoryItem, b: NewsImpactHistoryItem) {
  return (
    b.priority - a.priority ||
    new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime() ||
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
    getNewsImpactSlug(a).localeCompare(getNewsImpactSlug(b))
  );
}

function sitemapPriority(item: NewsImpactHistoryItem): number {
  if (item.priority >= 90) return 0.8;
  if (item.priority >= 75) return 0.74;
  return 0.66;
}

function countByStatus(decisions: NewsAutomationDecision[], status: NewsAutomationDecisionStatus): number {
  return decisions.filter((decision) => decision.status === status).length;
}

function dedupeHistoryItems(items: NewsImpactHistoryItem[]): NewsImpactHistoryItem[] {
  const byPath = new Map<string, NewsImpactHistoryItem>();

  for (const item of items) {
    const path = getNewsImpactDetailPath(item);
    const previous = byPath.get(path);
    if (!previous || sortByPriorityAndTime(item, previous) < 0) {
      byPath.set(path, item);
    }
  }

  return Array.from(byPath.values()).sort(sortByPriorityAndTime);
}

function buildTopCoins(
  items: NewsImpactHistoryItem[],
  limit: number,
  discoveries: DailyCoinDiscovery[] = [],
): MaterializedNewsTopCoin[] {
  const selected = new Map<string, MaterializedNewsTopCoin>();
  const discoveryBySymbol = new Map(discoveries.map((discovery) => [discovery.symbol, discovery]));

  for (const item of items) {
    if (item.priority < 75) continue;

    for (const symbol of item.relatedCoinSymbols) {
      const normalized = symbol.trim().toUpperCase();
      if (!normalized || selected.has(normalized)) continue;

      const topCoin: MaterializedNewsTopCoin = {
        symbol: normalized,
        locale: item.locale,
        newsId: item.id,
        slug: getNewsImpactSlug(item),
        newsDetailPath: getNewsImpactDetailPath(item),
        title: item.title,
        priority: item.priority,
        impactScore: item.impactScore,
        publishedAt: item.publishedAt,
        recordedAt: item.recordedAt,
      };
      const discovery = discoveryBySymbol.get(normalized);
      if (discovery) topCoin.discovery = discovery;

      selected.set(normalized, topCoin);

      if (selected.size >= limit) return Array.from(selected.values());
    }
  }

  return Array.from(selected.values());
}

function compactText(value: string, maximum: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  return normalized.slice(0, Math.max(0, maximum - 3)).trim() + "...";
}

function hasPersianText(value: string): boolean {
  return /[آ-ی]/.test(value);
}

function originalLanguageFor(decision: NewsAutomationDecision): NewsIntelligenceCandidate["originalLanguage"] {
  const combined = decision.article.title + " " + decision.article.summary;
  if (decision.article.locale === "fa" || hasPersianText(combined)) return "fa";
  return "en";
}

function decisionEntityLabel(decision: NewsAutomationDecision): string {
  const pieces: string[] = [];
  if (decision.article.detectedCoins.length > 0) {
    pieces.push("کوین‌های " + decision.article.detectedCoins.join("، "));
  }
  if (decision.article.detectedTools.length > 0) {
    pieces.push("ابزارهای " + decision.article.detectedTools.join("، "));
  }
  return pieces.length > 0 ? pieces.join(" و ") : "بازار رمزارز";
}

function buildPersianEditorialSummary(decision: NewsAutomationDecision): string {
  const entityLabel = decisionEntityLabel(decision);
  const originalSummary = compactText(decision.article.summary, 260);
  return [
    "خلاصه فارسی تک‌پی: این خبر از " + decision.article.sourceName + " درباره " + entityLabel + " منتشر شده است.",
    "برداشت عملیاتی از متن منبع: " + originalSummary + ".",
    "این کارت برای دسته‌بندی خبر، پیوند به صفحه کوین/ابزار و زمینه آموزشی آکادمی استفاده می‌شود و توصیه معاملاتی یا وعده بازده محسوب نمی‌شود.",
  ].join(" ");
}

function buildEntityReferences(decision: NewsAutomationDecision): NewsEntityReference[] {
  const coins = decision.article.detectedCoins.map((symbol) => ({
    type: "coin" as const,
    id: symbol,
    label: symbol,
    confidence: 0.86,
    officialUrl: COIN_OFFICIAL_URLS[symbol],
  }));
  const tools = decision.article.detectedTools.map((slug) => ({
    type: "tool" as const,
    id: slug,
    label: slug,
    confidence: 0.78,
  }));
  return [...coins, ...tools];
}

function buildTags(decision: NewsAutomationDecision): string[] {
  const text = decision.article.title + " " + decision.article.summary;
  const tags = new Set<string>(["crypto-news", "tone-" + decision.article.tone]);

  for (const symbol of decision.article.detectedCoins) tags.add("coin-" + symbol.toLowerCase());
  for (const slug of decision.article.detectedTools) tags.add("tool-" + slug);
  if (/\b(etf|approval|sec|fed|inflow|outflow|liquidity)\b|تایید|ورود سرمایه|خروج سرمایه/i.test(text)) {
    tags.add("market-structure");
  }
  if (/security|hack|phishing|exploit|امنیت|هک|فیشینگ/i.test(text)) tags.add("security-risk");
  if (/risk|liquidation|funding|open interest|ریسک|لیکوئید|فاندینگ/i.test(text)) {
    tags.add("risk-management");
  }
  if (decision.article.relatedLessonHref.includes("academy")) tags.add("academy-linked");

  return Array.from(tags).sort();
}

function buildCandidate(decision: NewsAutomationDecision): NewsIntelligenceCandidate {
  return {
    locale: decision.article.locale,
    originalLanguage: originalLanguageFor(decision),
    title: decision.article.title,
    originalSummary: decision.article.summary,
    persianSummary: buildPersianEditorialSummary(decision),
    sourceName: decision.article.sourceName,
    sourceUrl: decision.article.sourceUrl,
    canonicalUrl: decision.article.canonicalUrl,
    publishedAt: decision.article.publishedAt,
    fetchedAt: decision.article.recordedAt,
    entities: buildEntityReferences(decision),
    tags: buildTags(decision),
    relatedLessonHref: decision.article.relatedLessonHref,
  };
}

function existingGraphItem(decision: NewsAutomationDecision, dossier: NewsIntelligenceDossier): ExistingNewsGraphItem {
  return {
    id: dossier.id,
    title: decision.article.title,
    canonicalUrl: decision.article.canonicalUrl,
    publishedAt: decision.article.publishedAt,
    fingerprint: dossier.fingerprint,
    relatedEntityIds: dossier.entities.map((entity) => entity.type + ":" + entity.id.trim().toUpperCase()).sort(),
    tags: dossier.tags,
  };
}

function buildDecisionDossiers(decisions: NewsAutomationDecision[]): DecisionDossierPair[] {
  const existingItems: ExistingNewsGraphItem[] = [];
  return decisions.map((decision) => {
    const dossier = buildNewsIntelligenceDossier(buildCandidate(decision), { existingItems });
    existingItems.push(existingGraphItem(decision, dossier));
    return { decision, dossier };
  });
}

function materializeDossier(dossier: NewsIntelligenceDossier): MaterializedNewsDecisionIntelligence {
  return {
    dossierId: dossier.id,
    fingerprint: dossier.fingerprint,
    status: dossier.status,
    reasons: dossier.reasons,
    duplicate: dossier.duplicate,
    sourceCard: dossier.sourceCard,
    entities: dossier.entities,
    tags: dossier.tags,
    timeBuckets: dossier.timeBuckets,
    graphEdges: dossier.graphEdges,
    reviews: dossier.reviews,
    coinDiscoveries: dossier.coinDiscoveries,
  };
}
export function materializeNewsAutomationDecisions(
  decisions: NewsAutomationDecision[],
  options: MaterializeNewsAutomationOptions = {},
): MaterializedNewsSnapshot {
  const locale = options.locale;
  const historyLimit = Math.max(1, options.historyLimit ?? 24);
  const topCoinLimit = Math.max(1, options.topCoinLimit ?? 5);
  const dossierPairs = buildDecisionDossiers(decisions);
  const historyItems = dedupeHistoryItems(
    decisions
      .flatMap((decision) => decision.historyItems)
      .filter((item) => !locale || item.locale === locale),
  ).slice(0, historyLimit);
  const dailyCoinDiscoveries = rankDailyCoinDiscoveries(
    dossierPairs.map((pair) => pair.dossier),
    topCoinLimit,
  );

  return {
    storageMode: "ephemeral_contract",
    locale,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    publishable: countByStatus(decisions, "publishable"),
    needsReview: countByStatus(decisions, "needs_review"),
    rejected: countByStatus(decisions, "rejected"),
    historyItems,
    canonicalSlugs: historyItems.map(getNewsImpactSlug),
    sitemapEntries: historyItems.map((item) => ({
      path: getNewsImpactDetailPath(item),
      lastModified: item.recordedAt,
      priority: sitemapPriority(item),
    })),
    topCoins: buildTopCoins(historyItems, topCoinLimit, dailyCoinDiscoveries),
    decisions: dossierPairs.map(({ decision, dossier }) => ({
      id: decision.article.id,
      slug: decision.article.slug,
      status: decision.status,
      idempotencyKey: decision.article.idempotencyKey,
      intelligence: materializeDossier(dossier),
    })),
  };
}
