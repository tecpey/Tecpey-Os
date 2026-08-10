import rawTools from "../data/traderTools.json";
import {
  rankTools,
  type ContentLocale,
  type ToolRankingInput,
  type ToolRankingResult,
} from "./content-growth";
import { getNewsImpactScoreForTool } from "./news-impact-history";

export type TraderTool = (typeof rawTools)[number];

export type RankedTraderTool = TraderTool & {
  slug: string;
  growthRank: ToolRankingResult;
  categoryImportance: number;
};

const FEATURED_WEIGHTS: Record<string, number> = {
  tradingview: 1,
  coinmarketcap: 0.92,
  coingecko: 0.9,
  coinglass: 0.82,
  cryptoquant: 0.8,
  glassnode: 0.78,
  messari: 0.74,
};

const CATEGORY_IMPORTANCE: Record<string, number> = {
  "market-data": 1,
  technical: 0.95,
  onchain: 0.86,
  derivatives: 0.8,
  research: 0.78,
  security: 0.92,
  portfolio: 0.72,
  news: 0.82,
};

const BEGINNER_USEFULNESS: Record<string, number> = {
  "market-data": 0.96,
  technical: 0.84,
  security: 0.94,
  news: 0.82,
  portfolio: 0.78,
  research: 0.68,
  onchain: 0.58,
  derivatives: 0.44,
};

const PRO_USEFULNESS: Record<string, number> = {
  derivatives: 0.96,
  onchain: 0.94,
  technical: 0.92,
  research: 0.9,
  "market-data": 0.86,
  security: 0.82,
  news: 0.82,
  portfolio: 0.76,
};

function toolSlug(tool: TraderTool): string {
  return tool.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function officialLinkCompleteness(tool: TraderTool): number {
  let score = 0;
  if (tool.site?.startsWith("https://")) score += 0.5;
  if (tool.domain && tool.site.includes(tool.domain)) score += 0.25;
  if (tool.logoUrl?.startsWith("https://")) score += 0.15;
  if (tool.ios || tool.android) score += 0.1;
  return Math.min(1, score);
}

function toolPopularitySignal(tool: TraderTool): number {
  const name = tool.name.toLowerCase();
  if (["tradingview", "coinmarketcap", "coingecko"].includes(name)) return 1;
  if (["coinglass", "glassnode", "cryptoquant", "messari"].includes(name)) return 0.78;
  return 0.58;
}

function buildToolRankingInput(tool: TraderTool): ToolRankingInput {
  const slug = toolSlug(tool);
  const categoryKey = tool.categoryKey;

  return {
    slug,
    name: tool.name,
    featuredWeight: FEATURED_WEIGHTS[slug] ?? 0.32,
    newsImpactScore: getNewsImpactScoreForTool(slug),
    safetyScore: officialLinkCompleteness(tool),
    beginnerUsefulness: BEGINNER_USEFULNESS[categoryKey] ?? 0.62,
    proUsefulness: PRO_USEFULNESS[categoryKey] ?? 0.66,
    categoryImportance: CATEGORY_IMPORTANCE[categoryKey] ?? 0.62,
    popularitySignal: toolPopularitySignal(tool),
    officialLinkCompleteness: officialLinkCompleteness(tool),
    editorialWeight: FEATURED_WEIGHTS[slug] ? 0.72 : 0.42,
  };
}

const rankedTools = rankTools(rawTools.map(buildToolRankingInput), rawTools.length);

const rankBySlug = new Map(rankedTools.map((rank) => [rank.slug, rank]));

export function getRankedTraderTools(): RankedTraderTool[] {
  return rawTools
    .map((tool) => {
      const slug = toolSlug(tool);
      const growthRank = rankBySlug.get(slug) ?? rankTools([buildToolRankingInput(tool)], 1)[0];
      return {
        ...tool,
        slug,
        growthRank,
        categoryImportance: CATEGORY_IMPORTANCE[tool.categoryKey] ?? 0.62,
      };
    })
    .sort(
      (a, b) =>
        b.growthRank.rankScore - a.growthRank.rankScore ||
        a.name.localeCompare(b.name),
    );
}

export function getFeaturedTraderTools(limit = 5): RankedTraderTool[] {
  return getRankedTraderTools().slice(0, Math.max(0, limit));
}

export function getTraderToolSlugs(): string[] {
  return getRankedTraderTools().map((tool) => tool.slug);
}

export function getTraderToolBySlug(slug: string): RankedTraderTool | undefined {
  return getRankedTraderTools().find((tool) => tool.slug === slug);
}

export function buildTradingToolsSchemas(locale: ContentLocale) {
  const isEn = locale === "en";
  const baseUrl = isEn ? "https://tecpey.ir/en/trading-tools" : "https://tecpey.ir/trading-tools";
  const tools = getFeaturedTraderTools(5);
  const language = isEn ? "en-US" : "fa-IR";
  const homeUrl = isEn ? "https://tecpey.ir/en" : "https://tecpey.ir";

  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${baseUrl}#collection`,
    name: isEn ? "TecPey Trader Toolbox" : "جعبه ابزار معامله‌گر تک‌پی",
    url: baseUrl,
    inLanguage: language,
    isPartOf: { "@id": "https://tecpey.ir/#website" },
    publisher: { "@id": "https://tecpey.ir/#organization" },
    description: isEn
      ? "A curated crypto tool directory for market data, technical analysis, on-chain research, security checks and risk-aware learning."
      : "دایرکتوری گزینش‌شده ابزارهای رمزارز برای داده بازار، تحلیل تکنیکال، تحقیق آنچین، امنیت و یادگیری ریسک‌محور.",
    about: [
      "Crypto market data",
      "Technical analysis",
      "On-chain analytics",
      "Crypto security",
      "Risk-aware trading education",
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${baseUrl}#featured-tools`,
    name: isEn ? "Featured crypto tools" : "ابزارهای منتخب رمزارز",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: tools.length,
    itemListElement: tools.map((tool, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: tool.name,
      url: tool.site,
      description: isEn ? tool.summaryEn : tool.summaryFa,
    })),
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${baseUrl}#faq`,
    mainEntity: [
      {
        "@type": "Question",
        name: isEn ? "Does TecPey endorse these tools?" : "آیا تک‌پی این ابزارها را تأیید مالی می‌کند؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: isEn
            ? "No. The toolbox is educational and helps users compare official sources, risks and use cases. It is not financial advice or an endorsement."
            : "خیر. جعبه ابزار تک‌پی آموزشی است و به کاربر کمک می‌کند منابع رسمی، کاربردها و ریسک‌ها را مقایسه کند؛ این بخش توصیه مالی یا تأیید سرمایه‌گذاری نیست.",
        },
      },
      {
        "@type": "Question",
        name: isEn ? "How are featured tools ordered?" : "ابزارهای منتخب چطور مرتب می‌شوند؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: isEn
            ? "Featured tools are ordered by a governed scoring model that prioritizes safety, usefulness, category importance and official-link completeness ahead of popularity."
            : "ابزارهای منتخب با مدل امتیازدهی کنترل‌شده مرتب می‌شوند که امنیت، کاربرد آموزشی، اهمیت دسته و کامل بودن لینک رسمی را جلوتر از محبوبیت خام قرار می‌دهد.",
        },
      },
    ],
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: isEn ? "Home" : "خانه",
        item: homeUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: isEn ? "Trader Toolbox" : "جعبه ابزار معامله‌گر",
        item: baseUrl,
      },
    ],
  };

  return [collectionPage, itemList, faq, breadcrumb];
}

export function buildTraderToolDetailSchemas(tool: RankedTraderTool, locale: ContentLocale) {
  const isEn = locale === "en";
  const basePath = isEn ? `/en/trading-tools/${tool.slug}` : `/trading-tools/${tool.slug}`;
  const url = `https://tecpey.ir${basePath}`;
  const language = isEn ? "en-US" : "fa-IR";
  const title = isEn
    ? `${tool.name} guide for crypto research and safer decisions`
    : `راهنمای استفاده از ${tool.name} برای تحلیل و تصمیم امن‌تر`;
  const description = isEn ? tool.summaryEn : tool.summaryFa;

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: title,
    description,
    url,
    mainEntityOfPage: url,
    inLanguage: language,
    articleSection: isEn ? "Crypto tools" : "ابزارهای رمزارز",
    author: { "@id": "https://tecpey.ir/#organization" },
    publisher: { "@id": "https://tecpey.ir/#organization" },
    about: [tool.name, isEn ? tool.categoryEn : tool.categoryFa, "Crypto education"],
    mentions: {
      "@type": "SoftwareApplication",
      name: tool.name,
      url: tool.site,
      applicationCategory: isEn ? tool.categoryEn : tool.categoryFa,
      operatingSystem: [tool.site ? "Web" : null, tool.ios ? "iOS" : null, tool.android ? "Android" : null].filter(Boolean),
    },
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: [
      {
        "@type": "Question",
        name: isEn ? `Is ${tool.name} a trading signal?` : `آیا ${tool.name} سیگنال معامله است؟`,
        acceptedAnswer: {
          "@type": "Answer",
          text: isEn
            ? `No. TecPey introduces ${tool.name} as an educational research tool. It should be combined with price, volume, risk management and user context.`
            : `خیر. تک‌پی ${tool.name} را به عنوان ابزار آموزشی و تحقیق معرفی می‌کند. خروجی آن باید کنار قیمت، حجم، مدیریت ریسک و شرایط کاربر بررسی شود.`,
        },
      },
      {
        "@type": "Question",
        name: isEn ? `Where is the official ${tool.name} link?` : `لینک رسمی ${tool.name} کجاست؟`,
        acceptedAnswer: {
          "@type": "Answer",
          text: isEn
            ? `The official link listed by TecPey is ${tool.site}. Users should verify domains and permissions before using external tools.`
            : `لینک رسمی ثبت‌شده در تک‌پی ${tool.site} است. کاربر باید قبل از استفاده از ابزارهای خارجی، دامنه، مجوزها و دسترسی‌ها را بررسی کند.`,
        },
      },
    ],
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: isEn ? "Home" : "خانه",
        item: isEn ? "https://tecpey.ir/en" : "https://tecpey.ir",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: isEn ? "Trader Toolbox" : "جعبه ابزار معامله‌گر",
        item: isEn ? "https://tecpey.ir/en/trading-tools" : "https://tecpey.ir/trading-tools",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: tool.name,
        item: url,
      },
    ],
  };

  return [article, faq, breadcrumb];
}
