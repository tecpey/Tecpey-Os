import type { ContentLocale } from "./content-growth";
import type { NewsAutomationDecision, NewsAutomationDecisionStatus } from "./news-automation";
import {
  getNewsImpactDetailPath,
  getNewsImpactSlug,
  type NewsImpactHistoryItem,
} from "./news-impact-history";

export type NewsMaterializationStorageMode = "ephemeral_contract";

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
};

export type MaterializedNewsDecisionSummary = {
  id: string;
  slug: string;
  status: NewsAutomationDecisionStatus;
  idempotencyKey: string;
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

function buildTopCoins(items: NewsImpactHistoryItem[], limit: number): MaterializedNewsTopCoin[] {
  const selected = new Map<string, MaterializedNewsTopCoin>();

  for (const item of items) {
    if (item.priority < 75) continue;

    for (const symbol of item.relatedCoinSymbols) {
      const normalized = symbol.trim().toUpperCase();
      if (!normalized || selected.has(normalized)) continue;

      selected.set(normalized, {
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
      });

      if (selected.size >= limit) return Array.from(selected.values());
    }
  }

  return Array.from(selected.values());
}

export function materializeNewsAutomationDecisions(
  decisions: NewsAutomationDecision[],
  options: MaterializeNewsAutomationOptions = {},
): MaterializedNewsSnapshot {
  const locale = options.locale;
  const historyLimit = Math.max(1, options.historyLimit ?? 24);
  const topCoinLimit = Math.max(1, options.topCoinLimit ?? 5);
  const historyItems = dedupeHistoryItems(
    decisions
      .flatMap((decision) => decision.historyItems)
      .filter((item) => !locale || item.locale === locale),
  ).slice(0, historyLimit);

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
    topCoins: buildTopCoins(historyItems, topCoinLimit),
    decisions: decisions.map((decision) => ({
      id: decision.article.id,
      slug: decision.article.slug,
      status: decision.status,
      idempotencyKey: decision.article.idempotencyKey,
    })),
  };
}
