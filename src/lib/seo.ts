// SEO & GEO helper library — server-only, no client-side imports.
// Provides typed builders for Next.js Metadata, JSON-LD schemas, and hreflang.
//
// Supports fa-IR (active), en-US (active), tr-TR (future), ar-SA (future).
// All functions are pure — no async, no DB, no side effects.

import type { Metadata } from "next";

// ── Constants ──────────────────────────────────────────────────────────────────

export const SITE_URL = "https://tecpey.ir";
export const SITE_NAME = "TecPey";
export const OG_IMAGE = `${SITE_URL}/images/tecpey-logo.png`;
export const OG_IMAGE_DIMS = { width: 512, height: 512, alt: SITE_NAME } as const;

// ── Locale types ───────────────────────────────────────────────────────────────

/** BCP 47 locale tags supported by TecPey. fa-IR and en-US are active; others are future. */
export type SupportedLocale = "fa-IR" | "en-US" | "tr-TR" | "ar-SA";

/** OG locale format (underscored). */
export type OgLocale = "fa_IR" | "en_US" | "tr_TR" | "ar_SA";

// ── URL helpers ────────────────────────────────────────────────────────────────

/** Build an absolute canonical URL from a root-relative path. */
export function getCanonicalUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean === "/" ? "" : clean}`;
}

/**
 * Build the `alternates.languages` object for Next.js Metadata.
 * Only includes locales whose paths are explicitly provided.
 *
 * fa-IR and en-US are active.
 * tr-TR and ar-SA are accepted but optional — pass only when the page exists.
 */
export function getAlternateLocales(
  faPath: string,
  enPath?: string,
  options?: { tr?: string; ar?: string },
): Record<string, string> {
  const faUrl = getCanonicalUrl(faPath);
  const result: Record<string, string> = {
    "fa-IR": faUrl,
    "x-default": faUrl,
  };
  if (enPath) result["en-US"] = getCanonicalUrl(enPath);
  if (options?.tr) result["tr-TR"] = getCanonicalUrl(options.tr);
  if (options?.ar) result["ar-SA"] = getCanonicalUrl(options.ar);
  return result;
}

// ── Metadata options ───────────────────────────────────────────────────────────

export type MetadataOptions = {
  title: string;
  description: string;
  /** Root-relative Farsi path (canonical). */
  faPath: string;
  /** Root-relative English path. */
  enPath?: string;
  keywords?: string[];
  /** Defaults to "fa_IR". */
  ogLocale?: OgLocale;
  /** Defaults to "website". */
  type?: "website" | "article";
};

// ── OG / Twitter builders ──────────────────────────────────────────────────────

export function getOpenGraph(opts: MetadataOptions) {
  const locale: OgLocale = opts.ogLocale ?? "fa_IR";
  const alternateLocale = locale === "en_US" ? ["fa_IR"] : ["en_US"];
  return {
    title: opts.title,
    description: opts.description,
    url: getCanonicalUrl(opts.faPath),
    siteName: SITE_NAME,
    locale,
    alternateLocale,
    type: (opts.type ?? "website") as "website" | "article",
    images: [{ url: OG_IMAGE, ...OG_IMAGE_DIMS }],
  };
}

export function getTwitterCard(opts: Pick<MetadataOptions, "title" | "description">) {
  return {
    card: "summary_large_image" as const,
    title: opts.title,
    description: opts.description,
    images: [OG_IMAGE],
  };
}

/**
 * Build a complete Next.js `Metadata` object.
 * Drop-in replacement for `pageMetadata()` with added keyword and locale support.
 */
export function getMetadata(opts: MetadataOptions): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    ...(opts.keywords?.length ? { keywords: opts.keywords } : {}),
    alternates: {
      canonical: getCanonicalUrl(opts.faPath),
      languages: getAlternateLocales(opts.faPath, opts.enPath),
    },
    openGraph: getOpenGraph(opts),
    twitter: getTwitterCard(opts),
  };
}

// ── JSON-LD: Breadcrumb ────────────────────────────────────────────────────────

export type BreadcrumbItem = { name: string; url: string };

export function buildBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ── JSON-LD: Organization with sub-entities ────────────────────────────────────

/**
 * Full TecPey Organization schema including all five sub-entities:
 * Exchange, Academy, AI Mentor, Trading Arena, Security Center.
 */
export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "FinancialService"],
    "@id": `${SITE_URL}/#organization`,
    name: "TecPey",
    alternateName: ["تک‌پی", "TecPey Exchange", "TecPey Crypto"],
    url: SITE_URL,
    logo: OG_IMAGE,
    image: OG_IMAGE,
    description:
      "تک‌پی، نقطه امن ورود به بازار رمزارز — صرافی، آکادمی، مربی هوشمند، آرنای معاملاتی و مرکز امنیت.",
    areaServed: { "@type": "Country", name: "Iran" },
    address: {
      "@type": "PostalAddress",
      streetAddress: "چهارراه تندست، کنار کریستال، دفتر تکنوپرداخت",
      addressLocality: "بابل",
      addressRegion: "مازندران",
      addressCountry: "IR",
    },
    telephone: "+98-11-32338026",
    email: "info@tecpey.ir",
    sameAs: [
      "https://t.me/tecpeyco",
      "https://instagram.com/tecpeyco",
      "https://discord.gg/tecpeyex",
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "خدمات تک‌پی",
      itemListElement: [
        {
          "@type": "Service",
          "@id": `${SITE_URL}/#exchange`,
          name: "TecPey Exchange",
          alternateName: "صرافی تک‌پی",
          url: SITE_URL,
          description:
            "صرافی رمزارز فارسی با قیمت لحظه‌ای، کارمزد شفاف و پشتیبانی محلی در مازندران.",
          serviceType: "Cryptocurrency Exchange",
          areaServed: "IR",
        },
        {
          "@type": "Service",
          "@id": `${SITE_URL}/#academy`,
          name: "TecPey Academy",
          alternateName: "آکادمی تک‌پی",
          url: `${SITE_URL}/academy`,
          description:
            "پلتفرم آموزش رایگان رمزارز به زبان فارسی؛ دوره‌های متنی، آزمون‌های تعاملی و مسیر یادگیری گام‌به‌گام.",
          serviceType: "Cryptocurrency Education",
        },
        {
          "@type": "Service",
          "@id": `${SITE_URL}/#ai-mentor`,
          name: "TecPey AI Mentor",
          alternateName: "مربی هوشمند تک‌پی",
          url: `${SITE_URL}/academy`,
          description:
            "مربی هوشمند مبتنی بر هوش مصنوعی که پروفایل یادگیری هر دانشجو را می‌شناسد و پاسخ‌های شخصی‌سازی‌شده ارائه می‌دهد.",
          serviceType: "AI-powered Learning Mentor",
        },
        {
          "@type": "Service",
          "@id": `${SITE_URL}/#trading-arena`,
          name: "TecPey Trading Arena",
          alternateName: "آرنای معاملاتی تک‌پی",
          url: `${SITE_URL}/academy`,
          description:
            "محیط تمرین معاملاتی مجازی برای یادگیری ترید بدون ریسک واقعی، با ابزارهای آموزشی حرفه‌ای.",
          serviceType: "Virtual Trading Practice",
        },
        {
          "@type": "Service",
          "@id": `${SITE_URL}/#security-center`,
          name: "TecPey Security Center",
          alternateName: "مرکز امنیت تک‌پی",
          url: `${SITE_URL}/security`,
          description:
            "مرکز آموزش امنیت رمزارز؛ راهنمای حفظ کیف پول، جلوگیری از فیشینگ و حفاظت از دارایی دیجیتال.",
          serviceType: "Crypto Security Education",
        },
      ],
    },
  };
}

// ── JSON-LD: FAQ ───────────────────────────────────────────────────────────────

export type FAQItem = { question: string; answer: string };

export function buildFAQSchema(items: FAQItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

// ── JSON-LD: Article ───────────────────────────────────────────────────────────

export type ArticleOptions = {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  modifiedAt?: string;
  authorName?: string;
  locale?: string;
};

export function buildArticleSchema(opts: ArticleOptions) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    url: opts.url,
    datePublished: opts.publishedAt,
    dateModified: opts.modifiedAt ?? opts.publishedAt,
    inLanguage: opts.locale ?? "fa-IR",
    author: {
      "@type": "Organization",
      name: opts.authorName ?? "تک‌پی",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: OG_IMAGE },
    },
  };
}

// ── Pre-built FAQ dataset — Persian (fa-IR) ────────────────────────────────────

export const TECPEY_FAQS: FAQItem[] = [
  {
    question: "صرافی ارز دیجیتال چیست؟",
    answer:
      "صرافی ارز دیجیتال یک پلتفرم آنلاین است که امکان خرید، فروش و مبادله رمزارزها مانند بیت‌کوین و تتر را فراهم می‌کند. در صرافی می‌توان قیمت لحظه‌ای رمزارزها را مشاهده کرد، سفارش گذاشت و دارایی‌های دیجیتال را مدیریت نمود.",
  },
  {
    question: "چگونه بیت‌کوین بخریم؟",
    answer:
      "برای خرید بیت‌کوین باید در یک صرافی معتبر حساب باز کنید، هویت خود را تأیید کنید، کیف پول دیجیتال داشته باشید و با واریز ریال یا تومان، بیت‌کوین بخرید. آکادمی تک‌پی راهنمای گام‌به‌گام برای اولین خرید رمزارز را به صورت رایگان ارائه می‌دهد.",
  },
  {
    question: "چگونه تتر بخریم؟",
    answer:
      "تتر (USDT) یک استیبل‌کوین است که ارزش آن برابر با یک دلار آمریکاست. برای خرید تتر می‌توانید در صرافی‌های ایرانی معتبر حساب باز کنید و با ریال تتر خریداری کنید. آکادمی تک‌پی آموزش کامل خرید تتر را به زبان فارسی ارائه می‌دهد.",
  },
  {
    question: "تفاوت ترید و سرمایه‌گذاری در رمزارز چیست؟",
    answer:
      "سرمایه‌گذاری به نگهداری رمزارز برای مدت طولانی اشاره دارد، در حالی که ترید (معامله‌گری) به خرید و فروش کوتاه‌مدت برای کسب سود از نوسانات قیمت اطلاق می‌شود. هر دو روش ریسک دارند و نیاز به دانش و مدیریت ریسک جدی دارند.",
  },
  {
    question: "آیا تک‌پی امن است؟",
    answer:
      "تک‌پی با رعایت استانداردهای امنیتی، شفافیت کارمزد، اطلاعات تماس رسمی و پشتیبانی محلی در مازندران طراحی شده است. مرکز امنیت تک‌پی آموزش‌های کاربردی برای حفاظت از حساب و دارایی دیجیتال ارائه می‌دهد.",
  },
  {
    question: "آکادمی تک‌پی چیست؟",
    answer:
      "آکادمی تک‌پی یک پلتفرم آموزشی رایگان است که مفاهیم رمزارز، ترید، امنیت کیف پول، مدیریت ریسک و بلاکچین را به زبان ساده فارسی توضیح می‌دهد. آکادمی شامل دوره‌های متنی، آزمون‌های تعاملی، آرنای معاملاتی مجازی و مربی هوشمند است.",
  },
  {
    question: "AI Mentor تک‌پی چیست؟",
    answer:
      "AI Mentor تک‌پی یک مربی هوشمند مبتنی بر هوش مصنوعی است که به سؤالات آموزشی شما درباره رمزارز، ترید، امنیت و مدیریت ریسک پاسخ می‌دهد. این مربی پروفایل یادگیری هر دانشجو را می‌شناسد و راهنمایی شخصی‌سازی‌شده ارائه می‌دهد.",
  },
];

// ── Pre-built FAQ dataset — English (en-US) ────────────────────────────────────

export const TECPEY_EN_FAQS: FAQItem[] = [
  {
    question: "What is TecPey?",
    answer:
      "TecPey is a Persian crypto exchange and education ecosystem based in Iran. It offers live cryptocurrency prices, a free Academy for learning about crypto, an AI Mentor, a virtual Trading Arena, and a Security Center — all in Persian with English support.",
  },
  {
    question: "What is TecPey Academy?",
    answer:
      "TecPey Academy is a free cryptocurrency education platform. It teaches Bitcoin, USDT, Ethereum, blockchain basics, trading, wallet security, and risk management through structured text courses, interactive quizzes, and a step-by-step learning path.",
  },
  {
    question: "Is TecPey suitable for crypto beginners?",
    answer:
      "Yes. TecPey is specifically designed for beginners. TecPey Academy starts from the basics and guides learners step by step. The Trading Arena allows safe practice without real financial risk. All educational content is free and risk-aware.",
  },
  {
    question: "What is TecPey AI Mentor?",
    answer:
      "TecPey AI Mentor is an AI-powered learning assistant embedded in the Academy. It answers your questions about cryptocurrency, trading, security, and risk management, and adapts its guidance based on your personal learning profile, quiz history, and Trading Arena results.",
  },
  {
    question: "What is TecPey Trading Arena?",
    answer:
      "TecPey Trading Arena is a virtual trading practice environment. Students can simulate buying and selling cryptocurrencies without using real money. It tracks performance metrics that feed into the AI Mentor's learning profile.",
  },
  {
    question: "Does TecPey promise profit?",
    answer:
      "No. TecPey does not promise profit or investment returns. All TecPey content is educational and designed for informed decision-making. Cryptocurrency markets involve significant risk. TecPey's full risk disclosure is available at tecpey.ir/risk-disclosure.",
  },
  {
    question: "How does TecPey help users learn crypto safely?",
    answer:
      "TecPey combines free education (Academy), simulated practice (Trading Arena), personalized AI guidance (AI Mentor), and security awareness (Security Center). This ecosystem helps users build knowledge before trading with real money, reducing the risk of common beginner mistakes.",
  },
];
