import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { rateLimit } from "@/lib/rate-limit";
import { buildNewsQuizBankFromFeed } from "@/lib/academy-news-quiz-source";
import { buildNewsAutomationBatch, type RawNewsInput } from "@/lib/news-automation";
import { materializeNewsAutomationDecisions } from "@/lib/news-materialization";
import {
  getNewsArchiveDayFromAuthority,
  getNewsArchiveDaysFromAuthority,
  isValidArchiveDay,
  tehranCalendarDay,
  type NewsArchiveItem,
} from "@/lib/news-growth-authority";
import { newsTaxonomyTagLabel } from "@/lib/news-taxonomy";

type NewsTone = "bullish" | "bearish" | "neutral";

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  sourceUrl: string;
  publishedAt: string;
  category: string;
  tone: NewsTone;
  impact: number;
  isBreaking?: boolean;
  trendScore?: number;
  editorPick?: boolean;
  relatedLesson?: string;
};

function boundedInteger(raw: string | null, fallback: number, maximum: number): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function inferTone(value: string): NewsTone {
  const lower = value.toLowerCase();
  if (/(?:\b(?:surge|rally|gain|approval|inflow|bull|record|rise|up)\b|صعود|رشد|افزایش|تایید|ورود سرمایه)/i.test(lower)) return "bullish";
  if (/(?:\b(?:fall|drop|hack|lawsuit|outflow|bear|crash|fraud|ban|down)\b|ریزش|هک|کلاهبرداری|سقوط|ممنوعیت|خروج سرمایه)/i.test(lower)) return "bearish";
  return "neutral";
}

function impactFor(item: NewsArchiveItem): number {
  const coinWeight = Math.min(3, item.taxonomy.coinSymbols.length);
  const topicWeight = Math.min(2, item.taxonomy.topicTags.length);
  const toolWeight = Math.min(1, item.taxonomy.toolSlugs.length);
  return Math.max(4, Math.min(10, 4 + coinWeight + topicWeight + toolWeight));
}

function relatedLesson(item: NewsArchiveItem, locale: "fa" | "en"): string {
  const topics = new Set(item.taxonomy.topicTags);
  if (topics.has("security") || topics.has("wallets")) return locale === "fa" ? "ترم ۲ · امنیت حساب" : "Term 2 · Account security";
  if (topics.has("derivatives") || topics.has("liquidity")) return locale === "fa" ? "لابراتوار ریسک" : "Risk Lab";
  if (topics.has("macro") || topics.has("regulation") || topics.has("etf") || topics.has("institutional")) {
    return locale === "fa" ? "ترم ۵ · فاندامنتال و خبر" : "Term 5 · Fundamentals and news";
  }
  return locale === "fa" ? "آکادمی تک‌پی" : "TecPey Academy";
}

function toNewsItem(item: NewsArchiveItem, locale: "fa" | "en", now: number): NewsItem {
  const text = `${item.displayTitle} ${item.displayLead} ${item.displayBody}`;
  const impact = impactFor(item);
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
    tone: inferTone(text),
    impact,
    isBreaking: Math.max(0, now - Date.parse(item.publishedAt)) <= 12 * 60 * 60 * 1_000,
    trendScore: impact * 10 + Math.min(20, item.taxonomy.entityTags.length),
    editorPick: impact >= 8,
    relatedLesson: relatedLesson(item, locale),
  };
}

function marketIntelligence(locale: "fa" | "en", items: NewsItem[]) {
  const top = [...items].sort((left, right) => right.impact - left.impact || Date.parse(right.publishedAt) - Date.parse(left.publishedAt))[0];
  if (locale === "fa") {
    return {
      headline: top ? `مهم‌ترین زمینه خبری امروز: ${top.category}` : "بازار را با نظم، نه هیجان، دنبال کنید.",
      risk: top ? `اثر آموزشی این خبر ${top.impact}/10 است؛ منبع و سناریوی ریسک را قبل از هر تصمیم بررسی کنید.` : "خبر تازه باید با منبع و داده بازار بررسی شود.",
      action: top ? `مسیر پیشنهادی مطالعه: ${top.relatedLesson}` : "در نبود خبر تازه، محتوای قدیمی را به‌عنوان خبر امروز نمایش نمی‌دهیم.",
      tone: top?.tone ?? "neutral",
    };
  }
  return {
    headline: top ? `Today’s highest-impact news context: ${top.category}` : "Follow the market with discipline, not emotion.",
    risk: top ? `Educational impact is ${top.impact}/10. Verify the source and risk context before acting.` : "Fresh news should be checked against source evidence and market data.",
    action: top ? `Suggested learning path: ${top.relatedLesson}` : "Older content is never presented as today's live news.",
    tone: top?.tone ?? "neutral",
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
      getNewsArchiveDayFromAuthority(requestedDay, locale),
      getNewsArchiveDaysFromAuthority(180),
    ]);
    const now = Date.now();
    const allItems = archiveItems.map((item) => toNewsItem(item, locale, now));
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
      mode: allItems.length ? "live" : "fallback" as const,
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
