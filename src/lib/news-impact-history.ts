import type { ContentLocale } from "./content-growth";

export type NewsImpactTone = "bullish" | "bearish" | "neutral" | "risk";

export type NewsImpactHistoryItem = {
  id: string;
  locale: ContentLocale;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  newsUrl: string;
  publishedAt: string;
  recordedAt: string;
  priority: number;
  impactScore: number;
  tone: NewsImpactTone;
  reasonFa: string;
  reasonEn: string;
  relatedToolSlugs: string[];
  relatedCoinSymbols: string[];
  relatedLessonHref: string;
};

const HIGH_PRIORITY_THRESHOLD = 75;

const impactHistory: NewsImpactHistoryItem[] = [
  {
    id: "fa-btc-etf-flows-tradingview-cmc",
    locale: "fa",
    title: "جریان سرمایه ETFهای بیت‌کوین دوباره به شاخص مهم تقاضای نهادی تبدیل شد",
    summary:
      "ورود و خروج سرمایه ETFهای بیت‌کوین روی نقدشوندگی، احساسات بازار و رفتار دارایی‌های بزرگ اثر می‌گذارد؛ بنابراین کاربر باید خبر را کنار قیمت، حجم و سناریوی ریسک ببیند.",
    sourceName: "اتاق خبر تک‌پی",
    sourceUrl: "https://tecpey.ir/crypto-news",
    newsUrl: "/crypto-news",
    publishedAt: "2026-08-09T06:15:00.000Z",
    recordedAt: "2026-08-09T06:22:00.000Z",
    priority: 94,
    impactScore: 9,
    tone: "neutral",
    reasonFa: "این خبر باعث می‌شود ابزارهای نمودار و داده بازار برای بررسی BTC در اولویت دیده شوند.",
    reasonEn: "This news raises charting and market-data tools for BTC review.",
    relatedToolSlugs: ["tradingview", "coinmarketcap", "coingecko"],
    relatedCoinSymbols: ["BTC", "ETH"],
    relatedLessonHref: "/academy/term-5",
  },
  {
    id: "fa-security-phishing-risk-tools",
    locale: "fa",
    title: "گزارش‌های فیشینگ و اپلیکیشن‌های جعلی، امنیت حساب را دوباره به صدر چک‌لیست معامله آورد",
    summary:
      "قبل از استفاده از هر ابزار یا انتقال دارایی، کاربر باید دامنه رسمی، دسترسی‌ها، 2FA و ریسک اتصال کیف پول را بررسی کند.",
    sourceName: "آکادمی تک‌پی",
    sourceUrl: "https://tecpey.ir/academy/term-2",
    newsUrl: "/academy/term-2",
    publishedAt: "2026-08-09T04:40:00.000Z",
    recordedAt: "2026-08-09T04:47:00.000Z",
    priority: 89,
    impactScore: 9,
    tone: "risk",
    reasonFa: "این خبر وزن ایمنی لینک رسمی و ابزارهای امنیتی را در رتبه‌بندی تک‌پی بالا می‌برد.",
    reasonEn: "This news increases the weight of official-link safety and security checks.",
    relatedToolSlugs: ["tradingview", "coinmarketcap", "coingecko", "coinglass", "cryptoquant", "glassnode"],
    relatedCoinSymbols: ["BTC", "ETH", "USDT", "TON", "SOL"],
    relatedLessonHref: "/academy/term-2",
  },
  {
    id: "fa-derivatives-liquidation-coinglass",
    locale: "fa",
    title: "افزایش لیکوئیدیشن‌های اهرمی، بررسی Open Interest و Funding را مهم‌تر کرد",
    summary:
      "وقتی فشار اهرمی بالا می‌رود، ابزارهایی مثل CoinGlass برای فهمیدن ریسک فیوچرز، لیکوئیدیشن و رفتار معامله‌گران اهرمی اهمیت بیشتری پیدا می‌کنند.",
    sourceName: "لابراتوار ریسک تک‌پی",
    sourceUrl: "https://tecpey.ir/academy/practice-lab",
    newsUrl: "/academy/practice-lab",
    publishedAt: "2026-08-08T18:10:00.000Z",
    recordedAt: "2026-08-08T18:18:00.000Z",
    priority: 87,
    impactScore: 8,
    tone: "bearish",
    reasonFa: "این خبر CoinGlass را برای بررسی فشار اهرمی و سنجش ریسک کوتاه‌مدت برجسته می‌کند.",
    reasonEn: "This news highlights CoinGlass for leverage pressure and short-term risk checks.",
    relatedToolSlugs: ["coinglass", "tradingview"],
    relatedCoinSymbols: ["BTC", "ETH", "SOL", "DOGE"],
    relatedLessonHref: "/academy/practice-lab",
  },
  {
    id: "fa-onchain-exchange-flows-cryptoquant",
    locale: "fa",
    title: "افزایش جریان ورودی به صرافی‌ها، شاخص‌های آنچین را برای بیت‌کوین و اتریوم حساس‌تر کرد",
    summary:
      "جریان ورودی یا خروجی صرافی‌ها می‌تواند سرنخ فشار فروش، انباشت یا تغییر رفتار هولدرها باشد؛ اما باید کنار قیمت و نقدشوندگی تفسیر شود.",
    sourceName: "اتاق تحلیل آنچین تک‌پی",
    sourceUrl: "https://tecpey.ir/crypto-news",
    newsUrl: "/crypto-news",
    publishedAt: "2026-08-08T12:30:00.000Z",
    recordedAt: "2026-08-08T12:39:00.000Z",
    priority: 84,
    impactScore: 8,
    tone: "neutral",
    reasonFa: "این خبر ابزارهای آنچین مثل CryptoQuant و Glassnode را برای تحلیل رفتار بازار برجسته می‌کند.",
    reasonEn: "This news highlights on-chain tools such as CryptoQuant and Glassnode.",
    relatedToolSlugs: ["cryptoquant", "glassnode"],
    relatedCoinSymbols: ["BTC", "ETH"],
    relatedLessonHref: "/academy/term-5",
  },
  {
    id: "fa-ton-miniapp-activity",
    locale: "fa",
    title: "رشد فعالیت مینی‌اپ‌های TON، توجه کاربران را به اکوسیستم تلگرام بیشتر کرد",
    summary:
      "خبرهای اکوسیستم TON می‌توانند روی جستجوی کاربر، نقدشوندگی و ریسک پروژه‌های جانبی اثر بگذارند و باید در صفحه تون‌کوین قابل پیگیری باشند.",
    sourceName: "اتاق خبر تک‌پی",
    sourceUrl: "https://tecpey.ir/crypto-news",
    newsUrl: "/crypto-news",
    publishedAt: "2026-08-07T15:05:00.000Z",
    recordedAt: "2026-08-07T15:14:00.000Z",
    priority: 78,
    impactScore: 7,
    tone: "bullish",
    reasonFa: "این خبر TON را برای بررسی اکوسیستم، مینی‌اپ‌ها و ریسک پروژه‌های جانبی برجسته می‌کند.",
    reasonEn: "This news highlights TON ecosystem activity and mini-app risk.",
    relatedToolSlugs: ["coinmarketcap", "coingecko", "messari"],
    relatedCoinSymbols: ["TON"],
    relatedLessonHref: "/academy/term-5",
  },
  {
    id: "en-btc-etf-flows-tradingview-cmc",
    locale: "en",
    title: "Bitcoin ETF flows remain a high-priority institutional-demand signal",
    summary:
      "ETF inflows and outflows can affect liquidity, sentiment and large-cap crypto behavior, so users should compare the news with price, volume and their risk plan.",
    sourceName: "TecPey News Desk",
    sourceUrl: "https://tecpey.ir/en/crypto-news",
    newsUrl: "/en/crypto-news",
    publishedAt: "2026-08-09T06:15:00.000Z",
    recordedAt: "2026-08-09T06:22:00.000Z",
    priority: 94,
    impactScore: 9,
    tone: "neutral",
    reasonFa: "این خبر باعث می‌شود ابزارهای نمودار و داده بازار برای بررسی BTC در اولویت دیده شوند.",
    reasonEn: "This news raises charting and market-data tools for BTC review.",
    relatedToolSlugs: ["tradingview", "coinmarketcap", "coingecko"],
    relatedCoinSymbols: ["BTC", "ETH"],
    relatedLessonHref: "/en/academy/term-5",
  },
  {
    id: "en-security-phishing-risk-tools",
    locale: "en",
    title: "Phishing and fake-app reports push account security back to the top checklist",
    summary:
      "Before using external tools or moving funds, users should verify the official domain, permissions, 2FA status and wallet-connection risk.",
    sourceName: "TecPey Academy",
    sourceUrl: "https://tecpey.ir/en/academy/term-2",
    newsUrl: "/en/academy/term-2",
    publishedAt: "2026-08-09T04:40:00.000Z",
    recordedAt: "2026-08-09T04:47:00.000Z",
    priority: 89,
    impactScore: 9,
    tone: "risk",
    reasonFa: "این خبر وزن ایمنی لینک رسمی و ابزارهای امنیتی را در رتبه‌بندی تک‌پی بالا می‌برد.",
    reasonEn: "This news increases the weight of official-link safety and security checks.",
    relatedToolSlugs: ["tradingview", "coinmarketcap", "coingecko", "coinglass", "cryptoquant", "glassnode"],
    relatedCoinSymbols: ["BTC", "ETH", "USDT", "TON", "SOL"],
    relatedLessonHref: "/en/academy/term-2",
  },
  {
    id: "en-derivatives-liquidation-coinglass",
    locale: "en",
    title: "Rising leveraged liquidations make Open Interest and Funding checks more important",
    summary:
      "When leverage pressure rises, tools such as CoinGlass help users understand futures risk, liquidation clusters and leveraged-trader behavior.",
    sourceName: "TecPey Risk Lab",
    sourceUrl: "https://tecpey.ir/en/academy/practice-lab",
    newsUrl: "/en/academy/practice-lab",
    publishedAt: "2026-08-08T18:10:00.000Z",
    recordedAt: "2026-08-08T18:18:00.000Z",
    priority: 87,
    impactScore: 8,
    tone: "bearish",
    reasonFa: "این خبر CoinGlass را برای بررسی فشار اهرمی و سنجش ریسک کوتاه‌مدت برجسته می‌کند.",
    reasonEn: "This news highlights CoinGlass for leverage pressure and short-term risk checks.",
    relatedToolSlugs: ["coinglass", "tradingview"],
    relatedCoinSymbols: ["BTC", "ETH", "SOL", "DOGE"],
    relatedLessonHref: "/en/academy/practice-lab",
  },
  {
    id: "en-onchain-exchange-flows-cryptoquant",
    locale: "en",
    title: "Exchange-flow changes make on-chain metrics more sensitive for Bitcoin and Ethereum",
    summary:
      "Exchange inflows and outflows can hint at selling pressure, accumulation or holder-behavior shifts, but they must be interpreted with price and liquidity.",
    sourceName: "TecPey On-chain Desk",
    sourceUrl: "https://tecpey.ir/en/crypto-news",
    newsUrl: "/en/crypto-news",
    publishedAt: "2026-08-08T12:30:00.000Z",
    recordedAt: "2026-08-08T12:39:00.000Z",
    priority: 84,
    impactScore: 8,
    tone: "neutral",
    reasonFa: "این خبر ابزارهای آنچین مثل CryptoQuant و Glassnode را برای تحلیل رفتار بازار برجسته می‌کند.",
    reasonEn: "This news highlights on-chain tools such as CryptoQuant and Glassnode.",
    relatedToolSlugs: ["cryptoquant", "glassnode"],
    relatedCoinSymbols: ["BTC", "ETH"],
    relatedLessonHref: "/en/academy/term-5",
  },
  {
    id: "en-ton-miniapp-activity",
    locale: "en",
    title: "Growing TON mini-app activity increases attention on the Telegram-linked ecosystem",
    summary:
      "TON ecosystem news can affect user interest, liquidity and side-project risk, so the Toncoin page should preserve the important-news trail.",
    sourceName: "TecPey News Desk",
    sourceUrl: "https://tecpey.ir/en/crypto-news",
    newsUrl: "/en/crypto-news",
    publishedAt: "2026-08-07T15:05:00.000Z",
    recordedAt: "2026-08-07T15:14:00.000Z",
    priority: 78,
    impactScore: 7,
    tone: "bullish",
    reasonFa: "این خبر TON را برای بررسی اکوسیستم، مینی‌اپ‌ها و ریسک پروژه‌های جانبی برجسته می‌کند.",
    reasonEn: "This news highlights TON ecosystem activity and mini-app risk.",
    relatedToolSlugs: ["coinmarketcap", "coingecko", "messari"],
    relatedCoinSymbols: ["TON"],
    relatedLessonHref: "/en/academy/term-5",
  },
];

export function sortNewsImpactHistoryItems(a: NewsImpactHistoryItem, b: NewsImpactHistoryItem) {
  return (
    b.priority - a.priority ||
    new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime() ||
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
    a.id.localeCompare(b.id)
  );
}

function highPriority(items: NewsImpactHistoryItem[], limit: number) {
  return items
    .filter((item) => item.priority >= HIGH_PRIORITY_THRESHOLD)
    .sort(sortNewsImpactHistoryItems)
    .slice(0, Math.max(0, limit));
}

export function getNewsImpactSlug(item: NewsImpactHistoryItem): string {
  const detailMatch = item.newsUrl.match(/^\/(?:en\/)?crypto-news\/([^/]+)$/i);
  if (detailMatch?.[1]) return detailMatch[1];
  return item.id.replace(/^(fa|en)-/, "");
}

export function getNewsImpactDetailPath(item: NewsImpactHistoryItem): string {
  if (/^\/(en\/)?crypto-news\/[^/]+$/i.test(item.newsUrl)) return item.newsUrl;
  const localePrefix = item.locale === "en" ? "/en" : "";
  return `${localePrefix}/crypto-news/${getNewsImpactSlug(item)}`;
}

export function getNewsImpactHistoryItems(locale?: ContentLocale): NewsImpactHistoryItem[] {
  return impactHistory
    .filter((item) => !locale || item.locale === locale)
    .sort(sortNewsImpactHistoryItems);
}

export function getNewsImpactSlugs(locale?: ContentLocale): string[] {
  return Array.from(new Set(getNewsImpactHistoryItems(locale).map(getNewsImpactSlug))).sort();
}

export function getNewsImpactBySlug(slug: string, locale: ContentLocale): NewsImpactHistoryItem | undefined {
  return getNewsImpactHistoryItems(locale).find((item) => getNewsImpactSlug(item) === slug);
}

export function getHighPriorityNewsForTool(
  toolSlug: string,
  locale: ContentLocale,
  limit = 4,
): NewsImpactHistoryItem[] {
  return highPriority(
    impactHistory.filter((item) => item.locale === locale && item.relatedToolSlugs.includes(toolSlug)),
    limit,
  );
}

export function getHighPriorityNewsForCoin(
  symbol: string,
  locale: ContentLocale,
  limit = 4,
): NewsImpactHistoryItem[] {
  const normalized = symbol.trim().toUpperCase();
  return highPriority(
    impactHistory.filter((item) => item.locale === locale && item.relatedCoinSymbols.includes(normalized)),
    limit,
  );
}

export function getNewsImpactScoreForTool(toolSlug: string): number {
  const top = highPriority(
    impactHistory.filter((item) => item.locale === "fa" && item.relatedToolSlugs.includes(toolSlug)),
    1,
  )[0];
  return top ? Math.min(1, top.priority / 100) : 0;
}

export function formatNewsImpactDateTime(value: string, locale: ContentLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "fa" ? "زمان نامشخص" : "Unknown time";
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function buildNewsImpactItemListSchema({
  items,
  locale,
  pageUrl,
  name,
}: {
  items: NewsImpactHistoryItem[];
  locale: ContentLocale;
  pageUrl: string;
  name: string;
}) {
  const isEn = locale === "en";
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${pageUrl}#news-impact-history`,
    name,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: items.length,
    inLanguage: isEn ? "en-US" : "fa-IR",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "NewsArticle",
        "@id": `${pageUrl}#${item.id}`,
        headline: item.title,
        description: item.summary,
        url: `https://tecpey.ir${getNewsImpactDetailPath(item)}`,
        datePublished: item.publishedAt,
        dateModified: item.recordedAt,
        isPartOf: pageUrl,
        publisher: { "@id": "https://tecpey.ir/#organization" },
        provider: {
          "@type": "Organization",
          name: item.sourceName,
          url: item.sourceUrl,
        },
        about: [
          ...item.relatedCoinSymbols,
          ...item.relatedToolSlugs.map((slug) => slug.replace(/-/g, " ")),
        ],
      },
    })),
  };
}
