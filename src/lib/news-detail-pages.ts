import { coinPages } from "@/data/coins";
import type { CoinPage } from "@/data/coins";
import type { ContentLocale } from "./content-growth";
import {
  formatNewsImpactDateTime,
  getNewsImpactBySlug,
  getNewsImpactDetailPath,
  buildNewsImpactItemListSchema,
  getNewsImpactHistoryItems,
  getNewsImpactSlug,
  getNewsImpactSlugs,
  type NewsImpactHistoryItem,
} from "./news-impact-history";
import { getNewsImpactHistoryItemsFromAuthority } from "./news-impact-history-authority";
import { getTraderToolBySlug, type RankedTraderTool } from "./trading-tools-growth";

const SITE_URL = "https://tecpey.ir";

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 3)).trim()}...`;
}

function localePrefix(locale: ContentLocale): string {
  return locale === "en" ? "/en" : "";
}

export type NewsDetailPageModel = {
  item: NewsImpactHistoryItem;
  slug: string;
  url: string;
  counterpartUrl: string;
  relatedCoins: CoinPage[];
  relatedTools: RankedTraderTool[];
};

export type NewsHubPageModel = {
  locale: ContentLocale;
  url: string;
  counterpartUrl: string;
  items: NewsImpactHistoryItem[];
};

export function getNewsDetailStaticParams(locale: ContentLocale): { slug: string }[] {
  return getNewsImpactSlugs(locale).map((slug) => ({ slug }));
}

export function getNewsHubPageModel(locale: ContentLocale): NewsHubPageModel {
  const prefix = localePrefix(locale);
  const counterpartLocale: ContentLocale = locale === "en" ? "fa" : "en";
  const counterpartPrefix = localePrefix(counterpartLocale);

  return {
    locale,
    url: `${SITE_URL}${prefix}/crypto-news`,
    counterpartUrl: `${SITE_URL}${counterpartPrefix}/crypto-news`,
    items: getNewsImpactHistoryItems(locale),
  };
}

export function getNewsDetailPageModel(slug: string, locale: ContentLocale): NewsDetailPageModel | undefined {
  const item = getNewsImpactBySlug(slug, locale);
  return buildNewsDetailPageModelFromItem(item, slug, locale, getNewsImpactBySlug(slug, locale === "en" ? "fa" : "en"));
}

function buildNewsDetailPageModelFromItem(
  item: NewsImpactHistoryItem | undefined,
  slug: string,
  locale: ContentLocale,
  counterpart?: NewsImpactHistoryItem,
): NewsDetailPageModel | undefined {
  if (!item) return undefined;
  const relatedCoins = item.relatedCoinSymbols
    .map((symbol) => coinPages.find((coin) => coin.symbol === symbol))
    .filter((coin): coin is CoinPage => Boolean(coin));
  const relatedTools = item.relatedToolSlugs
    .map((toolSlug) => getTraderToolBySlug(toolSlug))
    .filter((tool): tool is RankedTraderTool => Boolean(tool));
  const counterpartLocale: ContentLocale = locale === "en" ? "fa" : "en";

  return {
    item,
    slug,
    url: `${SITE_URL}${getNewsImpactDetailPath(item)}`,
    counterpartUrl: counterpart
      ? `${SITE_URL}${getNewsImpactDetailPath(counterpart)}`
      : `${SITE_URL}${localePrefix(counterpartLocale)}/crypto-news/${slug}`,
    relatedCoins,
    relatedTools,
  };
}

export async function getNewsHubPageModelFromAuthority(locale: ContentLocale): Promise<NewsHubPageModel> {
  const prefix = localePrefix(locale);
  const counterpartLocale: ContentLocale = locale === "en" ? "fa" : "en";
  const counterpartPrefix = localePrefix(counterpartLocale);

  return {
    locale,
    url: `${SITE_URL}${prefix}/crypto-news`,
    counterpartUrl: `${SITE_URL}${counterpartPrefix}/crypto-news`,
    items: await getNewsImpactHistoryItemsFromAuthority(locale),
  };
}

export async function getNewsDetailPageModelFromAuthority(
  slug: string,
  locale: ContentLocale,
): Promise<NewsDetailPageModel | undefined> {
  const [items, counterpartItems] = await Promise.all([
    getNewsImpactHistoryItemsFromAuthority(locale),
    getNewsImpactHistoryItemsFromAuthority(locale === "en" ? "fa" : "en"),
  ]);
  const item = items.find((entry) => getNewsImpactSlug(entry) === slug);
  const counterpart = counterpartItems.find((entry) => getNewsImpactSlug(entry) === slug);
  return buildNewsDetailPageModelFromItem(item, slug, locale, counterpart);
}

export function getNewsDetailSitemapEntries() {
  return getNewsImpactHistoryItems().map((item) => ({
    path: getNewsImpactDetailPath(item),
    lastModified: new Date(item.recordedAt),
    priority: item.priority >= 90 ? 0.8 : 0.72,
  }));
}

export async function getNewsDetailSitemapEntriesFromAuthority() {
  const items = await getNewsImpactHistoryItemsFromAuthority();
  return items.map((item) => ({
    path: getNewsImpactDetailPath(item),
    lastModified: new Date(item.recordedAt),
    priority: item.priority >= 90 ? 0.8 : 0.72,
  }));
}

export function getNewsHubMetadata(model: NewsHubPageModel) {
  const isEn = model.locale === "en";
  const title = isEn ? "Crypto News | TecPey evidence-led market context" : "اخبار رمزارز | مرکز خبر اثرگذار تک‌پی";
  const description = isEn
    ? "Canonical TecPey crypto news hub with source timing, impact history, related coins, tools and learning paths."
    : "مرکز canonical خبرهای رمزارز تک‌پی با زمان انتشار، اثر، کوین‌ها، ابزارهای مرتبط و مسیر آموزشی.";

  return {
    title,
    description,
    alternates: {
      canonical: model.url,
      languages: {
        "fa-IR": isEn ? model.counterpartUrl : model.url,
        "en-US": isEn ? model.url : model.counterpartUrl,
        "x-default": isEn ? model.counterpartUrl : model.url,
      },
    },
    openGraph: {
      type: "website",
      siteName: "TecPey",
      url: model.url,
      title,
      description,
      locale: isEn ? "en_US" : "fa_IR",
      alternateLocale: [isEn ? "fa_IR" : "en_US"],
      images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/images/tecpey-logo.png"],
    },
  };
}

export function buildNewsHubSchemas(model: NewsHubPageModel): Record<string, unknown>[] {
  const isEn = model.locale === "en";
  const homeUrl = `${SITE_URL}${localePrefix(model.locale) || "/"}`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${model.url}#collection`,
      name: isEn ? "TecPey Crypto News" : "اخبار رمزارز تک‌پی",
      description: isEn
        ? "Evidence-led crypto news with impact history and educational context."
        : "خبرهای رمزارز با تاریخچه اثرگذاری و زمینه آموزشی قابل audit.",
      url: model.url,
      inLanguage: isEn ? "en-US" : "fa-IR",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    buildNewsImpactItemListSchema({
      items: model.items,
      locale: model.locale,
      pageUrl: model.url,
      name: isEn ? "TecPey canonical crypto news impact history" : "تاریخچه canonical خبرهای اثرگذار تک‌پی",
    }),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: isEn ? "How does TecPey choose crypto news for this page?" : "تک‌پی خبرهای این صفحه را چطور انتخاب می‌کند؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: isEn
              ? "TecPey prioritizes trusted sources, supported coin or tool entities, source timing, impact evidence and safety checks."
              : "تک‌پی خبرها را بر اساس منبع معتبر، ارتباط با کوین یا ابزار پشتیبانی‌شده، زمان منبع، شواهد اثرگذاری و گارد ایمنی اولویت‌بندی می‌کند.",
          },
        },
        {
          "@type": "Question",
          name: isEn ? "Is this news hub financial advice?" : "آیا این مرکز خبر توصیه مالی است؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: isEn
              ? "No. The hub is educational market context and should not be read as a buy, sell or profit signal."
              : "خیر. این مرکز فقط زمینه آموزشی بازار است و نباید به‌عنوان سیگنال خرید، فروش یا وعده سود تفسیر شود.",
          },
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: isEn ? "Home" : "خانه", item: homeUrl },
        { "@type": "ListItem", position: 2, name: isEn ? "Crypto News" : "اخبار رمزارز", item: model.url },
      ],
    },
  ];
}

export function getNewsDetailMetadata(model: NewsDetailPageModel, locale: ContentLocale) {
  const isEn = locale === "en";
  return {
    title: isEn ? `${model.item.title} | TecPey Crypto News` : `${model.item.title} | اخبار رمزارز تک‌پی`,
    description: truncate(model.item.summary, 158),
    alternates: {
      canonical: model.url,
      languages: {
        "fa-IR": isEn ? model.counterpartUrl : model.url,
        "en-US": isEn ? model.url : model.counterpartUrl,
        "x-default": isEn ? model.counterpartUrl : model.url,
      },
    },
    openGraph: {
      title: model.item.title,
      description: truncate(model.item.summary, 180),
      url: model.url,
      siteName: "TecPey",
      locale: isEn ? "en_US" : "fa_IR",
      alternateLocale: [isEn ? "fa_IR" : "en_US"],
      type: "article",
      publishedTime: model.item.publishedAt,
      modifiedTime: model.item.recordedAt,
      images: [{ url: "/images/tecpey-logo.png", width: 512, height: 512, alt: "TecPey" }],
    },
  };
}

export function buildNewsDetailSchemas(model: NewsDetailPageModel, locale: ContentLocale): Record<string, unknown>[] {
  const isEn = locale === "en";
  const homeUrl = `${SITE_URL}${localePrefix(locale) || "/"}`;
  const newsHubUrl = `${SITE_URL}${localePrefix(locale)}/crypto-news`;
  const about = [
    ...model.item.relatedCoinSymbols.map((symbol) => ({ "@type": "Thing", name: symbol })),
    ...model.relatedTools.map((tool) => ({ "@type": "Thing", name: tool.name, url: `${SITE_URL}${localePrefix(locale)}/trading-tools/${tool.slug}` })),
  ];

  return [
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "@id": `${model.url}#newsarticle`,
      mainEntityOfPage: model.url,
      headline: model.item.title,
      description: model.item.summary,
      inLanguage: isEn ? "en-US" : "fa-IR",
      datePublished: model.item.publishedAt,
      dateModified: model.item.recordedAt,
      isAccessibleForFree: true,
      articleSection: isEn ? "Crypto market education" : "آموزش و خبر بازار رمزارز",
      about,
      author: { "@type": "Organization", name: "TecPey", url: SITE_URL },
      publisher: {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "TecPey",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/images/tecpey-logo.png` },
      },
      provider: {
        "@type": "Organization",
        name: model.item.sourceName,
        url: model.item.sourceUrl,
      },
      educationalUse: isEn ? "Market context and risk education" : "زمینه بازار و آموزش ریسک",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: isEn ? "Home" : "خانه", item: homeUrl },
        { "@type": "ListItem", position: 2, name: isEn ? "Crypto News" : "اخبار رمزارز", item: newsHubUrl },
        { "@type": "ListItem", position: 3, name: model.item.title, item: model.url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: isEn ? "Is this TecPey news page a trading signal?" : "آیا این صفحه خبر تک‌پی سیگنال معامله است؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: isEn
              ? "No. TecPey presents the news as educational market context with source, timing and risk framing."
              : "خیر. تک‌پی این خبر را به‌عنوان زمینه آموزشی بازار همراه با منبع، زمان و چارچوب ریسک نمایش می‌دهد.",
          },
        },
        {
          "@type": "Question",
          name: isEn ? "Why is this news linked to coins or tools?" : "چرا این خبر به کوین یا ابزار وصل شده است؟",
          acceptedAnswer: {
            "@type": "Answer",
            text: isEn
              ? "The news is linked when TecPey detects a supported coin or tool and records enough impact evidence for audit."
              : "وقتی تک‌پی ارتباط خبر با کوین یا ابزار پشتیبانی‌شده و اثر قابل ثبت را تشخیص دهد، این ارتباط برای audit ذخیره و نمایش داده می‌شود.",
          },
        },
      ],
    },
  ];
}

export function getNewsDetailDisplayMeta(item: NewsImpactHistoryItem, locale: ContentLocale) {
  const isEn = locale === "en";
  return {
    publishedLabel: formatNewsImpactDateTime(item.publishedAt, locale),
    recordedLabel: formatNewsImpactDateTime(item.recordedAt, locale),
    toneLabel:
      item.tone === "bullish"
        ? isEn ? "Bullish context" : "زمینه مثبت"
        : item.tone === "bearish"
          ? isEn ? "Bearish context" : "زمینه منفی"
          : item.tone === "risk"
            ? isEn ? "Risk context" : "زمینه ریسک"
            : isEn ? "Neutral context" : "زمینه خنثی",
    slug: getNewsImpactSlug(item),
  };
}
