import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api-validation";
import { withObservability } from "@/lib/observe";
import { buildNewsQuizBankFromFeed } from "@/lib/academy-news-quiz-source";
import { buildNewsAutomationBatch, type RawNewsInput } from "@/lib/news-automation";
import { materializeNewsAutomationDecisions } from "@/lib/news-materialization";

type NewsTone = "bullish" | "bearish" | "neutral";

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  category: string;
  tone: NewsTone;
  impact: number;
  isBreaking?: boolean;
  trendScore?: number;
  editorPick?: boolean;
  relatedLesson?: string;
};

const MAX_LIVE_NEWS_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 10 * 60 * 1000;

const sourcesEn = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml" },
];

const sourcesFa = [
  { name: "ارزدیجیتال", url: "https://arzdigital.com/feed/" },
];

function clean(value: string) {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return clean(match?.[1] ?? "");
}

function hasPersian(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function inferTone(text: string): NewsTone {
  const lower = text.toLowerCase();
  if (/(?:\b(?:surge|rally|gain|approval|inflow|bull|record|rise|up)\b|صعود|رشد|افزایش|تایید|ورود سرمایه)/i.test(lower)) return "bullish";
  if (/(?:\b(?:fall|drop|hack|lawsuit|outflow|bear|crash|fraud|ban|down)\b|ریزش|هک|کلاهبرداری|سقوط|ممنوعیت|خروج سرمایه)/i.test(lower)) return "bearish";
  return "neutral";
}

function inferImpact(text: string) {
  const lower = text.toLowerCase();
  let score = 5;
  if (/(?:\b(?:bitcoin|btc|ethereum|eth|etf|sec|fed|blackrock|binance|coinbase)\b|بیت.?کوین|اتریوم)/i.test(lower)) score += 2;
  if (/(?:\b(?:hack|lawsuit|approval|crash|collapse|record|billion)\b|هک|تایید|سقوط|میلیارد|شکایت)/i.test(lower)) score += 2;
  return Math.max(4, Math.min(10, score));
}

function isBreaking(text: string, publishedAt: string) {
  const hours = (Date.now() - new Date(publishedAt).getTime()) / 36e5;
  return hours <= 12 || /(breaking|urgent|فوری|تازه|تایید شد|هک)/i.test(text);
}

function isCurrentSourceTimestamp(value: string, now = Date.now()) {
  const publishedAt = Date.parse(value);
  if (!Number.isFinite(publishedAt)) return false;
  const ageMs = now - publishedAt;
  return ageMs >= -MAX_FUTURE_CLOCK_SKEW_MS && ageMs <= MAX_LIVE_NEWS_AGE_MS;
}

function categoryOf(text: string, locale: string) {
  const lower = text.toLowerCase();
  if (/(?:\b(?:bitcoin|btc)\b|بیت.?کوین)/i.test(lower)) return locale === "fa" ? "بیت‌کوین" : "Bitcoin";
  if (/(?:\b(?:ethereum|eth)\b|اتریوم)/i.test(lower)) return locale === "fa" ? "اتریوم" : "Ethereum";
  if (/(?:\b(?:etf|blackrock|fidelity|institution)\b|نهادی)/i.test(lower)) return locale === "fa" ? "ETF و نهادها" : "ETF & Institutions";
  if (/(?:\b(?:sec|regulation|law|court|ban)\b|قانون|دادگاه|مقررات)/i.test(lower)) return locale === "fa" ? "قوانین" : "Regulation";
  if (/(?:\b(?:hack|scam|phishing|security)\b|هک|فیشینگ|امنیت)/i.test(lower)) return locale === "fa" ? "امنیت" : "Security";
  return locale === "fa" ? "بازار" : "Market";
}

function relatedLesson(text: string, locale: string) {
  const lower = text.toLowerCase();
  if (/security|hack|phishing|seed|امنیت|هک|فیشینگ|عبارت بازیابی/i.test(lower)) return locale === "fa" ? "ترم ۲ · امنیت حساب" : "Term 2 · Account security";
  if (/etf|institution|blackrock|fed|sec|نهادی|قانون|مقررات/i.test(lower)) return locale === "fa" ? "ترم ۵ · فاندامنتال و خبر" : "Term 5 · Fundamentals and news";
  if (/risk|liquidation|crash|ریسک|لیکوئید|سقوط/i.test(lower)) return locale === "fa" ? "لابراتوار ریسک" : "Risk Lab";
  return locale === "fa" ? "آکادمی تک‌پی" : "TecPey Academy";
}

function faSummaryFor(title: string, sourceSummary: string) {
  const base = hasPersian(sourceSummary) ? sourceSummary : title;
  return `خلاصه تک‌پی: ${base.slice(0, 170)}${base.length > 170 ? "..." : ""} این خبر را کنار مدیریت ریسک، افق زمانی و پرهیز از تصمیم‌گیری هیجانی بررسی کنید.`;
}

function enSummaryFor(title: string, sourceSummary: string) {
  const base = sourceSummary || title;
  return `TecPey brief: ${base.slice(0, 180)}${base.length > 180 ? "..." : ""} Review the impact with risk management and avoid emotional decisions.`;
}

async function readSource(source: { name: string; url: string }, locale: string): Promise<NewsItem[]> {
  if (!/^https:\/\//i.test(source.url)) throw new Error("feed URL must be HTTPS");
  const response = await fetch(source.url, {
    next: { revalidate: 900 },
    headers: { "user-agent": "TecPeyNewsBot/1.0", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) throw new Error(`feed failed ${source.name}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) throw new Error("feed too large");
  const xml = await response.text();
  if (xml.length > 2_000_000) throw new Error("feed too large");
  const itemBlocks = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map((m) => m[0]).slice(0, 10);
  const entries = itemBlocks.length ? itemBlocks : Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map((m) => m[0]).slice(0, 10);
  return entries
    .map((block, index) => {
      const title = pick(block, "title");
      const rawSummary = pick(block, "description") || pick(block, "summary") || pick(block, "content");
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      const candidateLink = pick(block, "link") || clean(linkMatch?.[1] ?? "");
      const link = /^https:\/\//i.test(candidateLink) ? candidateLink : "";
      const publishedRaw = pick(block, "pubDate") || pick(block, "published") || pick(block, "updated");
      const parsedDate = new Date(publishedRaw);
      const publishedAt = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
      if (!title) return null;
      if (!isCurrentSourceTimestamp(publishedAt)) return null;
      if (locale === "fa" && !hasPersian(title)) return null;
      const combined = `${title} ${rawSummary}`;
      const impact = inferImpact(combined);
      return {
        id: `${source.name}-${index}-${title}`.replace(/\W+/g, "-").slice(0, 90),
        title,
        summary: locale === "fa" ? faSummaryFor(title, rawSummary) : enSummaryFor(title, rawSummary),
        source: source.name,
        url: link || source.url,
        publishedAt,
        category: categoryOf(combined, locale),
        tone: inferTone(combined),
        impact,
        isBreaking: isBreaking(combined, publishedAt),
        trendScore: impact * 10 + Math.max(0, 24 - Math.floor((Date.now() - new Date(publishedAt).getTime()) / 36e5)),
        editorPick: impact >= 8 || /bitcoin|btc|بیت.?کوین|etf|security|امنیت/i.test(combined),
        relatedLesson: relatedLesson(combined, locale),
      } satisfies NewsItem;
    })
    .filter(Boolean) as NewsItem[];
}

function marketIntelligence(locale: string, items: NewsItem[]) {
  const top = [...items].sort((a, b) => b.impact - a.impact)[0];
  if (locale === "fa") {
    return {
      headline: top ? `مهم‌ترین خبر فعلی: ${top.category}` : "بازار را با نظم، نه هیجان، دنبال کنید.",
      risk: top ? `اثر تخمینی این خبر ${top.impact}/10 است؛ قبل از تصمیم، سناریوی ریسک را بررسی کنید.` : "نوسان کوتاه‌مدت می‌تواند تصمیم‌های عجولانه ایجاد کند.",
      action: top ? `پیشنهاد آموزشی: ${top.relatedLesson ?? "آکادمی تک‌پی"}` : "اگر تازه‌کار هستید، ابتدا مدیریت ریسک را مرور کنید.",
      tone: top?.tone ?? "neutral",
    };
  }
  return {
    headline: top ? `Current key theme: ${top.category}` : "Follow the market with discipline, not emotion.",
    risk: top ? `Estimated impact is ${top.impact}/10. Review risk before any decision.` : "Short-term volatility can trigger rushed decisions.",
    action: top ? `Learning suggestion: ${top.relatedLesson ?? "TecPey Academy"}` : "If you are new, review risk management first.",
    tone: top?.tone ?? "neutral",
  };
}

function sourceUrlFor(item: NewsItem) {
  if (/^https?:\/\//i.test(item.url)) return item.url;
  return item.url.startsWith("/en")
    ? `https://tecpey.ir${item.url}`
    : `https://tecpey.ir${item.url || "/crypto-news"}`;
}

function toAutomationInput(item: NewsItem, locale: "fa" | "en", fetchedAt: string): RawNewsInput {
  return {
    id: item.id,
    locale,
    title: item.title,
    summary: item.summary,
    sourceName: item.source,
    sourceUrl: sourceUrlFor(item),
    url: sourceUrlFor(item),
    publishedAt: item.publishedAt || fetchedAt,
    fetchedAt,
  };
}

function automationFor(items: NewsItem[], locale: "fa" | "en", fetchedAt: string) {
  const decisions = buildNewsAutomationBatch(items.map((item) => toAutomationInput(item, locale, fetchedAt)));
  const materialized = materializeNewsAutomationDecisions(decisions, {
    locale,
    generatedAt: fetchedAt,
    historyLimit: 8,
    topCoinLimit: 5,
  });
  return {
    publishable: decisions.filter((decision) => decision.status === "publishable").length,
    needsReview: decisions.filter((decision) => decision.status === "needs_review").length,
    rejected: decisions.filter((decision) => decision.status === "rejected").length,
    topCoinImpacts: decisions
      .flatMap((decision) => decision.coinImpacts)
      .sort((a, b) => b.priorityScore - a.priorityScore || a.symbol.localeCompare(b.symbol))
      .slice(0, 5),
    historyItems: materialized.historyItems,
    materialized,
    decisions: decisions.map((decision) => ({
      id: decision.article.id,
      slug: decision.article.slug,
      status: decision.status,
      reasons: decision.reasons,
      priority: decision.article.priority,
      detectedCoins: decision.article.detectedCoins,
      detectedTools: decision.article.detectedTools,
      relatedLessonHref: decision.article.relatedLessonHref,
      idempotencyKey: decision.article.idempotencyKey,
    })),
  };
}

export async function GET(request: NextRequest) {
  return withObservability(request, { route: "/api/crypto-news" }, async () => {
    const locale = request.nextUrl.searchParams.get("locale") === "fa" ? "fa" : "en";
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 8);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 24) : 8;
    // Opt-in: turn traceable live items into validated learning exercises.
    // Editorial fallback cards remain available to the news surface, but they
    // never masquerade as current sourced reports inside the quiz.
    const includeQuiz = request.nextUrl.searchParams.get("quiz") === "1";
    const includeAutomation = request.nextUrl.searchParams.get("automation") === "1";
    const quizFor = (items: NewsItem[]) =>
      includeQuiz ? { newsQuiz: buildNewsQuizBankFromFeed(items, { locale }) } : {};
    const automationPayloadFor = (items: NewsItem[], fetchedAt: string) =>
      includeAutomation ? { automation: automationFor(items, locale, fetchedAt) } : {};
    const sourceList = locale === "fa" ? sourcesFa : sourcesEn;
    try {
      const updatedAt = new Date().toISOString();
      const settled = await Promise.allSettled(sourceList.map((source) => readSource(source, locale)));
      const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      const unique = Array.from(new Map(items.map((item) => [item.title.toLowerCase(), item])).values())
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, limit);
      const responseItems = unique;
      return apiOk({
        locale,
        updatedAt,
        mode: unique.length ? "live" : "fallback" as const,
        marketIntelligence: marketIntelligence(locale, responseItems),
        items: responseItems,
        ...quizFor(unique),
        ...automationPayloadFor(unique, updatedAt),
      });
    } catch {
      const updatedAt = new Date().toISOString();
      return apiOk({
        locale,
        updatedAt,
        mode: "fallback" as const,
        marketIntelligence: marketIntelligence(locale, []),
        items: [],
        ...quizFor([]),
        ...automationPayloadFor([], updatedAt),
      });
    }
  });
}
