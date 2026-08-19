
import type { MetadataRoute } from "next";
import { coinPages } from "@/data/coins";
import { academyArticles } from "@/data/academy";
import { learningSeoPages } from "@/data/organicSeo";
import { getNewsDetailSitemapEntriesFromAuthority } from "@/lib/news-detail-pages";
import { getTraderToolSlugs } from "@/lib/trading-tools-growth";

const base = "https://tecpey.ir";

// Priority tiers for key pages — rest default to 0.75.
const PAGE_PRIORITIES: Record<string, number> = {
  "": 1.0,
  "/academy": 0.9,
  "/academy/free": 0.88,
  "/markets": 0.9,
  "/security": 0.85,
  "/learn": 0.8,
  "/about": 0.8,
  "/faq": 0.8,
  "/glossary": 0.8,
  "/llms.txt": 0.72,
  "/llms-full.txt": 0.7,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPaths = [
    "", "/academy", "/academy/free", "/learn", "/price", "/markets", "/coins", "/glossary", "/faq", "/compare", "/security", "/why-tecpey", "/start-guide", "/trading-tools", "/crypto-news", "/llms.txt", "/llms-full.txt", "/academy/news-quiz", "/about", "/contact-us", "/fees", "/rules", "/privacy", "/risk-disclosure", "/transparency", "/methodology", "/editorial-policy", "/support", "/swap", "/academy/certificates", "/academy/hall-of-fame", "/academy/simulator", "/academy/specialized-program", "/academy/community", "/academy/graduation", "/academy/achievements"
  ];
  const englishPaths = [
    "/en", "/en/academy", "/en/academy/free", "/en/markets", "/en/coins", "/en/glossary", "/en/faq", "/en/compare", "/en/compare-exchanges", "/en/security", "/en/why-tecpey", "/en/start-guide", "/en/trading-tools", "/en/crypto-news", "/en/academy/news-quiz", "/en/about", "/en/contact-us", "/en/fees", "/en/rules", "/en/privacy", "/en/risk-disclosure", "/en/transparency", "/en/methodology", "/en/editorial-policy", "/en/support", "/en/swap", "/en/business", "/en/careers", "/en/listing", "/en/media", "/en/partners"
  ];
  const traderToolSlugs = getTraderToolSlugs();
  const newsDetailEntries = await getNewsDetailSitemapEntriesFromAuthority();
  return [
    ...staticPaths.map((path) => ({ url: `${base}${path || "/"}`, lastModified: now, changeFrequency: "weekly" as const, priority: PAGE_PRIORITIES[path] ?? 0.75 })),
    ...englishPaths.map((path) => ({ url: `${base}${path}`, lastModified: now, changeFrequency: "weekly" as const, priority: path === "/en" ? 0.86 : 0.68 })),
    ...learningSeoPages.map((page) => ({ url: `${base}/learn/${page.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.86 })),
    ...traderToolSlugs.map((slug) => ({ url: `${base}/trading-tools/${slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.78 })),
    ...traderToolSlugs.map((slug) => ({ url: `${base}/en/trading-tools/${slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.66 })),
    ...newsDetailEntries.map((entry) => ({ url: `${base}${entry.path}`, lastModified: entry.lastModified, changeFrequency: "daily" as const, priority: entry.priority })),
    ...coinPages.slice(0, 16).map((coin) => ({ url: `${base}/price/${coin.slug}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.9 })),
    ...coinPages.map((coin) => ({ url: `${base}/coins/${coin.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.82 })),
    ...coinPages.map((coin) => ({ url: `${base}/en/coins/${coin.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.68 })),
    ...coinPages.map((coin) => ({ url: `${base}/crypto/${coin.symbol}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.84 })),
    ...academyArticles.map((article) => ({ url: `${base}/academy/${article.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.78 })),
  ];
}
