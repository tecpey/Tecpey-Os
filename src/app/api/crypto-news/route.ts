import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { buildNewsQuizBankFromFeed } from "@/lib/academy-news-quiz-source";
import { buildNewsAutomationBatch, type RawNewsInput } from "@/lib/news-automation";
import { materializeNewsAutomationDecisions } from "@/lib/news-materialization";
import {
  getNewsArchiveDayForPresentation,
  type NewsArchivePresentationItem,
} from "@/services/news/archive-presentation-authority";
import {
  getNewsArchiveDaysFromAuthority,
  isValidArchiveDay,
  tehranCalendarDay,
} from "@/lib/news-growth-authority";
import { newsTaxonomyTagLabel } from "@/lib/news-taxonomy";
import { isRecentNewsPublication, NEWS_FEED_PUBLICATION_POLICY, selectPublishedNewsForFeed } from "@/lib/news-published-at";

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  sourceUrl: string;
  publishedAt: string;
  category: string;
  isBreaking?: boolean;
  relatedLesson?: string;
  thumbnailUrl?: string | null;
  thumbnailAlt?: string | null;
  translationPending?: boolean;
};

function boundedInteger(raw: string | null, fallback: number, maximum: number): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function relatedLesson(item: NewsArchivePresentationItem, locale: "fa" | "en"): string {
  const topics = new Set(item.taxonomy.topicTags);
  if (topics.has("security") || topics.has("wallets")) return locale === "fa" ? "ترم ۲ · امنیت حساب" : "Term 2 · Account security";
  if (topics.has("derivatives") || topics.has("liquidity")) return locale === "fa" ? "لابراتوار ریسک" : "Risk Lab";
  if (topics.has("macro") || topics.has("regulation") || topics.has("etf") || topics.has("institutional")) {
    return locale === "fa" ? "ترم ۵ · فاندامنتال و خبر" : "Term 5 · Fundamentals and news";
  }
  return locale === "fa" ? "آکادمی تک‌پی" : "TecPey Academy";
}

function toNewsItem(item: NewsArchivePresentationItem, locale: "fa" | "en", now: number): NewsItem {
  const categoryTag = item.taxonomy.topicTags[0]
    ? `topic:${item.taxonomy.topicTags[0]}`
    : item.taxonomy.coinSymbols[0]
      ? `coin:${item.taxonomy.coinSymbols[0].toLowerCase()}`
      : null;
  const sourceUrl = item.articleUrl;
  return {
    id: item.archiveId,
    title: item.displayTitle,
    summary: item.displayLead,
    source: item.sourceName,
    url: item.newsUrl ?? sourceUrl,
    sourceUrl,
    publishedAt: item.publishedAt,
    category: categoryTag ? newsTaxonomyTagLabel(categoryTag, locale) : (locale === "fa" ? "بازار" : "Market"),
    isBreaking: isRecentNewsPublication(item.publishedAt, now),
    relatedLesson: relatedLesson(item, locale),
    thumbnailUrl: item.thumbnailUrl,
    thumbnailAlt: item.thumbnailAlt,
    translationPending: item.translationPending,
  };
}

function marketIntelligence(locale: "fa" | "en", items: NewsItem[]) {
  const latest = [...items].sort((left, right) => {
    const leftTime = Date.parse(left.publishedAt);
    const rightTime = Date.parse(right.publishedAt);
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  })[0];

  if (locale === "fa") {
    return {
      headline: latest ? `آخرین زمینه خبری منتشرشده: ${latest.category}` : "بازار را با نظم، نه هیجان، دنبال کنید.",
      risk: latest ? "منبع، زمان انتشار و سناریوی ریسک را قبل از هر تصمیم بررسی کنید؛ این بخش امتیاز یا سیگنال معاملاتی تولید نمی‌کند." : "خبر تازه باید با منبع و داده بازار بررسی شود.",
      action: latest ? `مسیر پیشنهادی مطالعه: ${latest.relatedLesson}` : "در نبود خبر ترجمه‌شده، محتوای قدیمی را به‌عنوان خبر امروز نمایش نمی‌دهیم.",
    };
  }
  return {
    headline: latest ? `Latest governed news context: ${latest.category}` : "Follow the market with discipline, not emotion.",
    risk: latest ? "Review the source, publication time and risk context before acting; this surface does not generate impact scores or trading signals." : "Fresh news should be checked against source evidence and market data.",
    action: latest ? `Suggested learning path: ${latest.relatedLesson}` : "Older content is never presented as today's live news.",
  };
}

function toAutomationInput(item: NewsItem, locale: "fa" | "en", fetchedAt: string): RawNewsInput {
  return {
    id: item.id,
    locale,
    title: item.title,
    summary: item.summary,
    sourceName: item.source,
    sourceUrl: item.sourceUrl,
    url: item.sourceUrl,
    publishedAt: item.publishedAt,
    fetchedAt,
  };
}

function automationPreview(items: NewsItem[], locale: "fa" | "en", fetchedAt: string) {
  const decisions = buildNewsAutomationBatch(items.slice(0, 100).map((item) => toAutomationInput(item, locale, fetchedAt)));
  const materialized = decisions.length
    ? materializeNewsAutomationDecisions(decisions, { locale, generatedAt: fetchedAt, historyLimit: 100, topCoinLimit: 12 })
    : null;
  return {
    publishable: decisions.filter((decision) => decision.status === "publishable").length,
    needsReview: decisions.filter((decision) => decision.status === "needs_review").length,
    rejected: decisions.filter((decision) => decision.status === "rejected").length,
    topCoinImpacts: decisions.flatMap((decision) => decision.coinImpacts)
      .sort((left, right) => right.priorityScore - left.priorityScore || left.symbol.localeCompare(right.symbol))
      .slice(0, 12),
    historyItems: materialized?.historyItems ?? [],
    materialized,
  };
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/api/crypto-news" }, async () => {
    const limited = await rateLimit(request, { namespace: "crypto-news-read", limit: 180, windowMs: 60_000 });
    if (!limited.ok) return apiError("rate_limited", 429);

    const locale: "fa" | "en" = request.nextUrl.searchParams.get("locale") === "fa" ? "fa" : "en";
    const today = tehranCalendarDay(new Date());
    const requestedDay = request.nextUrl.searchParams.get("date")?.trim() || today;
    if (!isValidArchiveDay(requestedDay)) return apiError("news_archive_day_invalid", 400);
    if (requestedDay > today) return apiError("news_archive_future_day_forbidden", 400);

    const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 24, 100);
    const includeQuiz = request.nextUrl.searchParams.get("quiz") === "1";
    const includeAutomation = request.nextUrl.searchParams.get("automation") === "1";
    const [archiveItems, historicalDays] = await Promise.all([
      getNewsArchiveDayForPresentation(requestedDay, locale),
      getNewsArchiveDaysFromAuthority(180),
    ]);
    const now = Date.now();

    // Archive visibility is intentionally broader than downstream authority.
    // Pending Persian rows remain visible in archiveItems, but they cannot feed
    // landing news, Academy quizzes or automation previews until a governed
    // Persian translation exists.
    const downstreamArchiveItems = locale === "fa"
      ? archiveItems.filter((item) => !item.translationPending)
      : archiveItems;
    const publishedArchiveItems = selectPublishedNewsForFeed(downstreamArchiveItems, now);
    const allItems = publishedArchiveItems.map((item) => toNewsItem(item, locale, now));
    const items = allItems.slice(0, limit);
    const updatedAt = new Date().toISOString();
    const availableDays = Array.from(new Set([today, requestedDay, ...historicalDays]))
      .filter((day) => isValidArchiveDay(day) && day <= today)
      .sort((left, right) => right.localeCompare(left));

    const response = apiOk({
      locale,
      day: requestedDay,
      today,
      availableDays,
      updatedAt,
      publicationPolicy: NEWS_FEED_PUBLICATION_POLICY,
      publicationWithheldCount: downstreamArchiveItems.length - publishedArchiveItems.length,
      mode: items.length ? "live" : "fallback" as const,
      archiveItemCount: archiveItems.length,
      localizedItemCount: downstreamArchiveItems.length,
      pendingTranslationCount: archiveItems.filter((item) => item.translationPending).length,
      marketIntelligence: marketIntelligence(locale, items),
      archiveItems,
      items,
      ...(includeQuiz ? { newsQuiz: buildNewsQuizBankFromFeed(items.slice(0, 40), { locale }) } : {}),
      ...(includeAutomation ? { automation: automationPreview(allItems, locale, updatedAt) } : {}),
    });
    response.headers.set(
      "Cache-Control",
      requestedDay === today
        ? "public, s-maxage=60, stale-while-revalidate=120"
        : "public, s-maxage=900, stale-while-revalidate=3600",
    );
    return response;
  });
}
