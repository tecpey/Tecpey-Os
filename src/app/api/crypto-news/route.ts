import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api-validation";

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

const nowIso = () => new Date().toISOString();

const fallbackEn: NewsItem[] = [
  {
    id: "fallback-en-btc-etf",
    title: "Bitcoin ETF flows remain a key signal for institutional demand",
    summary: "TecPey brief: ETF flows can affect liquidity and sentiment, but you should review risk, time horizon and position size before acting.",
    source: "TecPey Market Desk",
    url: "/en/academy/term-5",
    publishedAt: nowIso(),
    category: "ETF & Institutions",
    tone: "neutral",
    impact: 8,
    isBreaking: true,
    trendScore: 92,
    editorPick: true,
    relatedLesson: "Term 5 · Market intelligence",
  },
  {
    id: "fallback-en-security",
    title: "Crypto security remains the first rule before any trade",
    summary: "TecPey brief: Phishing, fake apps and unsafe seed phrase storage are still among the most common beginner risks.",
    source: "TecPey Academy",
    url: "/en/academy/term-2",
    publishedAt: nowIso(),
    category: "Security",
    tone: "neutral",
    impact: 9,
    trendScore: 88,
    editorPick: true,
    relatedLesson: "Term 2 · Wallet and account security",
  },
  {
    id: "fallback-en-risk",
    title: "Volatile markets reward discipline more than prediction",
    summary: "TecPey brief: Risk sizing, stop planning and emotional control matter more than chasing every short-term move.",
    source: "TecPey Risk Lab",
    url: "/en/academy/practice-lab",
    publishedAt: nowIso(),
    category: "Risk Management",
    tone: "neutral",
    impact: 8,
    trendScore: 83,
    relatedLesson: "Practice Lab · Risk planning",
  },
];

const fallbackFa: NewsItem[] = [
  {
    id: "fallback-fa-etf",
    title: "جریان سرمایه ETFهای بیت‌کوین همچنان یکی از سیگنال‌های مهم بازار است",
    summary: "خلاصه تک‌پی: ورود یا خروج سرمایه نهادی می‌تواند روی نقدشوندگی و احساسات بازار اثر بگذارد؛ تصمیم شما باید کنار مدیریت ریسک و افق زمانی بررسی شود.",
    source: "اتاق خبر تک‌پی",
    url: "/academy/term-5",
    publishedAt: nowIso(),
    category: "ETF و نهادها",
    tone: "neutral",
    impact: 8,
    isBreaking: true,
    trendScore: 92,
    editorPick: true,
    relatedLesson: "ترم ۵ · هوش بازار",
  },
  {
    id: "fallback-fa-security",
    title: "امنیت حساب قبل از هر معامله، قانون اول بازار رمزارز است",
    summary: "خلاصه تک‌پی: فیشینگ، اپلیکیشن جعلی و نگهداری ناامن عبارت بازیابی هنوز از مهم‌ترین ریسک‌های کاربران تازه‌وارد هستند.",
    source: "آکادمی تک‌پی",
    url: "/academy/term-2",
    publishedAt: nowIso(),
    category: "امنیت",
    tone: "neutral",
    impact: 9,
    trendScore: 88,
    editorPick: true,
    relatedLesson: "ترم ۲ · امنیت کیف پول و حساب",
  },
  {
    id: "fallback-fa-risk",
    title: "در بازار پرنوسان، نظم مهم‌تر از پیش‌بینی است",
    summary: "خلاصه تک‌پی: مدیریت حجم معامله، حد ضرر و کنترل هیجان برای حفظ سرمایه مهم‌تر از دنبال کردن هر حرکت کوتاه‌مدت بازار است.",
    source: "لابراتوار ریسک تک‌پی",
    url: "/academy/practice-lab",
    publishedAt: nowIso(),
    category: "مدیریت ریسک",
    tone: "neutral",
    impact: 8,
    trendScore: 83,
    relatedLesson: "تمرین عملی · برنامه‌ریزی ریسک",
  },
];

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
  if (/(surge|rally|gain|approval|inflow|bull|record|rise|up|صعود|رشد|افزایش|تایید|ورود سرمایه)/i.test(lower)) return "bullish";
  if (/(fall|drop|hack|lawsuit|outflow|bear|crash|fraud|ban|down|ریزش|هک|کلاهبرداری|سقوط|ممنوعیت|خروج سرمایه)/i.test(lower)) return "bearish";
  return "neutral";
}

function inferImpact(text: string) {
  const lower = text.toLowerCase();
  let score = 5;
  if (/(bitcoin|btc|بیت.?کوین|ethereum|eth|اتریوم|etf|sec|fed|blackrock|binance|coinbase)/i.test(lower)) score += 2;
  if (/(hack|lawsuit|approval|crash|collapse|record|billion|هک|تایید|سقوط|میلیارد|شکایت)/i.test(lower)) score += 2;
  return Math.max(4, Math.min(10, score));
}

function isBreaking(text: string, publishedAt: string) {
  const hours = (Date.now() - new Date(publishedAt).getTime()) / 36e5;
  return hours <= 12 || /(breaking|urgent|فوری|تازه|تایید شد|هک)/i.test(text);
}

function categoryOf(text: string, locale: string) {
  const lower = text.toLowerCase();
  if (/bitcoin|btc|بیت.?کوین/i.test(lower)) return locale === "fa" ? "بیت‌کوین" : "Bitcoin";
  if (/ethereum|eth|اتریوم/i.test(lower)) return locale === "fa" ? "اتریوم" : "Ethereum";
  if (/etf|blackrock|fidelity|institution|نهادی/i.test(lower)) return locale === "fa" ? "ETF و نهادها" : "ETF & Institutions";
  if (/sec|regulation|law|court|ban|قانون|دادگاه|مقررات/i.test(lower)) return locale === "fa" ? "قوانین" : "Regulation";
  if (/hack|scam|phishing|security|هک|فیشینگ|امنیت/i.test(lower)) return locale === "fa" ? "امنیت" : "Security";
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
  const response = await fetch(source.url, { next: { revalidate: 900 }, headers: { "user-agent": "TecPeyNewsBot/1.0" } });
  if (!response.ok) throw new Error(`feed failed ${source.name}`);
  const xml = await response.text();
  const itemBlocks = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map((m) => m[0]).slice(0, 10);
  const entries = itemBlocks.length ? itemBlocks : Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map((m) => m[0]).slice(0, 10);
  return entries
    .map((block, index) => {
      const title = pick(block, "title");
      const rawSummary = pick(block, "description") || pick(block, "summary") || pick(block, "content");
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      const link = pick(block, "link") || clean(linkMatch?.[1] ?? "");
      const publishedRaw = pick(block, "pubDate") || pick(block, "published") || pick(block, "updated") || new Date().toISOString();
      const parsedDate = new Date(publishedRaw);
      const publishedAt = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
      if (!title) return null;
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

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") === "fa" ? "fa" : "en";
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 8);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 24) : 8;
  const fallback = locale === "fa" ? fallbackFa : fallbackEn;
  const sourceList = locale === "fa" ? sourcesFa : sourcesEn;
  try {
    const settled = await Promise.allSettled(sourceList.map((source) => readSource(source, locale)));
    const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const unique = Array.from(new Map(items.map((item) => [item.title.toLowerCase(), item])).values())
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit);
    const responseItems = unique.length ? unique : fallback;
    return apiOk({ locale, updatedAt: new Date().toISOString(), mode: unique.length ? "live" : "fallback" as const, marketIntelligence: marketIntelligence(locale, responseItems), items: responseItems });
  } catch {
    return apiOk({ locale, updatedAt: new Date().toISOString(), mode: "fallback" as const, marketIntelligence: marketIntelligence(locale, fallback), items: fallback });
  }
}
