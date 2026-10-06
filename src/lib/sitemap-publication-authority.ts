import type { MetadataRoute } from "next";
import { academyArticles } from "@/data/academy";
import { coinPages } from "@/data/coins";
import { learningSeoPages } from "@/data/organicSeo";
import { getNewsDetailSitemapEntriesFromAuthority } from "@/lib/news-detail-pages";
import { getRankedTraderTools } from "@/lib/trading-tools-growth";

export const STATIC_SITEMAP_PATHS = [
  "/", "/academy", "/academy/free", "/academy/curriculum", "/learn", "/price", "/markets",
  "/coins", "/glossary", "/faq", "/compare", "/security", "/why-tecpey", "/start-guide",
  "/trading-tools", "/crypto-news", "/llms.txt", "/llms-full.txt", "/academy/news-quiz",
  "/about", "/contact-us", "/fees", "/rules", "/privacy", "/risk-disclosure", "/transparency",
  "/methodology", "/editorial-policy", "/support", "/swap", "/academy/certificates",
  "/academy/hall-of-fame", "/academy/simulator", "/academy/specialized-program",
  "/academy/community", "/academy/graduation", "/academy/achievements",
] as const;

export const ENGLISH_SITEMAP_PATHS = [
  "/en", "/en/academy", "/en/academy/free", "/en/markets", "/en/coins", "/en/glossary",
  "/en/faq", "/en/compare", "/en/compare-exchanges", "/en/security", "/en/why-tecpey",
  "/en/start-guide", "/en/trading-tools", "/en/crypto-news", "/en/academy/news-quiz",
  "/en/about", "/en/contact-us", "/en/fees", "/en/rules", "/en/privacy", "/en/risk-disclosure",
  "/en/transparency", "/en/methodology", "/en/editorial-policy", "/en/support", "/en/swap",
  "/en/business", "/en/careers", "/en/listing", "/en/media", "/en/partners",
] as const;

export type SitemapPublicationState = "published" | "draft" | "needs_review" | "archived";

export type SitemapPublicationRecord = Readonly<{
  family: string;
  path: string;
  state: SitemapPublicationState;
  canonicalPath: string;
  visibleContent: boolean;
  lastModified?: Date;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
}>;

export function decideSitemapPublication(record: SitemapPublicationRecord): boolean {
  return (
    record.state === "published" &&
    record.visibleContent &&
    record.path.startsWith("/") &&
    record.canonicalPath === record.path &&
    !record.path.includes("#") &&
    !record.path.includes("?")
  );
}

export function getIndexableSitemapEntries(
  records: readonly SitemapPublicationRecord[],
): MetadataRoute.Sitemap {
  const indexable = records.filter(decideSitemapPublication);
  const seenPaths = new Set<string>();
  for (const record of indexable) {
    if (seenPaths.has(record.path)) {
      throw new Error(`Duplicate indexable sitemap path: ${record.path}`);
    }
    seenPaths.add(record.path);
  }
  return indexable.map((record) => ({
    url: `https://tecpey.ir${record.path}`,
    lastModified: record.lastModified,
    changeFrequency: record.changeFrequency,
    priority: record.priority,
  }));
}

function curated(
  family: string,
  path: string,
  visibleContent: boolean,
  options: Pick<SitemapPublicationRecord, "lastModified" | "changeFrequency" | "priority">,
): SitemapPublicationRecord {
  return { family, path, state: "published", canonicalPath: path, visibleContent, ...options };
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function getAllIndexableSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const records: SitemapPublicationRecord[] = [

    ...STATIC_SITEMAP_PATHS.map((path) => curated("static-route", path, true, {
      changeFrequency: "weekly", priority: path === "/" ? 1 : 0.75,
    })),
    ...ENGLISH_SITEMAP_PATHS.map((path) => curated("static-route", path, true, {
      changeFrequency: "weekly", priority: path === "/en" ? 0.86 : 0.68,
    })),
    ...learningSeoPages.map((page) => curated(
      "learning-seo",
      `/learn/${page.slug}`,
      hasText(page.slug) && hasText(page.title) && hasText(page.h1) &&
        hasText(page.description) && page.sections.length > 0 &&
        page.sections.every((section) => hasText(section.title) && hasText(section.body)),
      { changeFrequency: "monthly", priority: 0.86 },
    )),
    ...getRankedTraderTools().flatMap((tool) => {
      const visible = hasText(tool.slug) && hasText(tool.name) &&
        hasText(tool.summaryFa) && hasText(tool.categoryFa);
      return [
        curated("trader-tool", `/trading-tools/${tool.slug}`, visible, {
          changeFrequency: "monthly", priority: 0.78,
        }),
        curated("trader-tool", `/en/trading-tools/${tool.slug}`, visible, {
          changeFrequency: "monthly", priority: 0.66,
        }),
      ];
    }),
    ...coinPages.flatMap((coin) => {
      const published = !coin.automation || coin.automation.status === "published_content";
      const visible = published && hasText(coin.slug) && hasText(coin.symbol) &&
        hasText(coin.name) && hasText(coin.description) && hasText(coin.intro) &&
        coin.useCases.length > 0 && coin.risks.length > 0;
      return [
        curated("coin-catalog", `/price/${coin.slug}`, visible, {
          changeFrequency: "hourly", priority: 0.9,
        }),
        curated("coin-catalog", `/coins/${coin.slug}`, visible, {
          changeFrequency: "weekly", priority: 0.82,
        }),
        curated("coin-catalog", `/en/coins/${coin.slug}`, visible, {
          changeFrequency: "weekly", priority: 0.68,
        }),
        curated("coin-catalog", `/crypto/${coin.symbol}`, visible, {
          changeFrequency: "hourly", priority: 0.84,
        }),
      ];
    }),
    ...academyArticles.map((article) => curated(
      "academy-article",
      `/academy/${article.slug}`,
      hasText(article.slug) && hasText(article.title) && hasText(article.description) &&
        hasText(article.summary) && hasText(article.updatedAt) &&
        !Number.isNaN(new Date(article.updatedAt).getTime()) &&
        article.sections.length > 0 &&
        article.sections.every((section) => hasText(section.heading) && section.body.length > 0),
      { lastModified: new Date(article.updatedAt), changeFrequency: "monthly", priority: 0.78 },
    )),
  ];

  const news = await getNewsDetailSitemapEntriesFromAuthority();
  records.push(...news.map((entry) => curated(
    "news-detail",
    entry.path,
    hasText(entry.path),
    { lastModified: entry.lastModified, changeFrequency: "daily", priority: entry.priority },
  )));

  return getIndexableSitemapEntries(records);
}
