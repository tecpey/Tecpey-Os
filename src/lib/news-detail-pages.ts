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
import {
  getNewsImpactHistoryArchiveItemsFromAuthority,
  getNewsImpactHistoryItemBySlugFromAuthority,
  getNewsImpactHistoryItemBySourceUrlFromAuthority,
  getNewsImpactHistoryItemsFromAuthority,
} from "./news-impact-history-authority";
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

export type NewsEditorialBoundaryCard = {
  title: string;
  body: string;
};

export type NewsDirectAnswerCard = {
  question: string;
  answer: string;
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
  const item = await getNewsImpactHistoryItemBySlugFromAuthority(slug, locale);
  if (!item) return undefined;
  const counterpart = await getNewsImpactHistoryItemBySourceUrlFromAuthority(
    item.sourceUrl,
    locale === "en" ? "fa" : "en",
  );
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
  const items = await getNewsImpactHistoryArchiveItemsFromAuthority();
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
      citation: [model.item.sourceUrl],
      keywords: Array.from(new Set([
        ...model.item.relatedCoinSymbols,
        ...model.item.relatedToolSlugs,
        isEn ? "crypto news" : "اخبار رمزارز",
        isEn ? "market context" : "زمینه بازار",
      ])).join(", "),
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

export function getNewsDirectAnswerCards(
  model: NewsDetailPageModel,
  locale: ContentLocale,
): NewsDirectAnswerCard[] {
  const isEn = locale === "en";
  const entities = [
    ...model.item.relatedCoinSymbols,
    ...model.relatedTools.map((tool) => tool.name),
  ];
  const entityAnswer = entities.length > 0
    ? entities.join(", ")
    : isEn ? "The broader crypto market" : "بازار رمزارز";
  return isEn
    ? [
        { question: "What happened?", answer: model.item.summary },
        { question: "Why does it matter?", answer: model.item.reasonEn },
        { question: "Which entities are connected?", answer: entityAnswer },
        { question: "What should I verify next?", answer: `Open the original ${model.item.sourceName} source and review the linked TecPey learning path before drawing conclusions. This is not a trading signal.` },
      ]
    : [
        { question: "چه اتفاقی افتاده است؟", answer: model.item.summary },
        { question: "چرا این خبر مهم است؟", answer: model.item.reasonFa },
        { question: "چه موجودیت‌هایی به این خبر مرتبط‌اند؟", answer: entityAnswer },
        { question: "برای بررسی بعدی چه چیزی را ببینم؟", answer: `منبع اصلی ${model.item.sourceName} و مسیر آموزشی مرتبط تک‌پی را بررسی کنید؛ این محتوا سیگنال معامله نیست.` },
      ];
}

export function getNewsEditorialBoundaryCards(
  model: NewsDetailPageModel,
  locale: ContentLocale,
): NewsEditorialBoundaryCard[] {
  const isEn = locale === "en";
  const relatedEntities = [
    ...model.item.relatedCoinSymbols,
    ...model.relatedTools.map((tool) => tool.name),
  ];
  const entityLabel = relatedEntities.length > 0 ? relatedEntities.join(", ") : isEn ? "the crypto market" : "بازار رمزارز";

  return isEn
    ? [
        {
          title: "Source fact",
          body: `${model.item.sourceName} published this item at the recorded source time. TecPey links to the original URL and does not rewrite it as a trading instruction.`,
        },
        {
          title: "TecPey interpretation",
          body: `TecPey connects the item to ${entityLabel} only when the internal impact history records supported entities, source timing and a review reason.`,
        },
        {
          title: "AI-assisted summary boundary",
          body: "AI may help summarize and translate the item, but the page must keep source attribution, uncertainty and the no-signal rule visible.",
        },
        {
          title: "Correction and freshness",
          body: `The recorded-at timestamp shows when TecPey last materialized this page. Material changes require a new canonical history item or an editorial correction.`,
        },
      ]
    : [
        {
          title: "واقعیت منبع",
          body: `${model.item.sourceName} این خبر را در زمان ثبت‌شده منتشر کرده است. تک‌پی به URL اصلی لینک می‌دهد و آن را به دستور معامله تبدیل نمی‌کند.`,
        },
        {
          title: "برداشت تک‌پی",
          body: `تک‌پی این خبر را فقط زمانی به ${entityLabel} وصل می‌کند که history داخلی، entityهای پشتیبانی‌شده، زمان منبع و دلیل بررسی را ثبت کرده باشد.`,
        },
        {
          title: "مرز خلاصه AI",
          body: "هوش مصنوعی ممکن است در خلاصه‌سازی و ترجمه کمک کند، اما صفحه باید attribution منبع، عدم قطعیت و قانون بدون سیگنال را واضح نگه دارد.",
        },
        {
          title: "اصلاح و تازگی",
          body: "زمان ثبت در تک‌پی نشان می‌دهد این صفحه چه زمانی materialize شده است. تغییرات مهم باید با آیتم canonical جدید یا اصلاح سردبیری ثبت شوند.",
        },
      ];
}
