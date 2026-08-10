// SEO & GEO helper library — server-only, no client-side imports.
// Provides typed builders for Next.js Metadata, JSON-LD schemas, and hreflang.
//
// Supports fa-IR (active), en-US (active), tr-TR (future), ar-SA (future).
// All functions are pure — no async, no DB, no side effects.

import type { Metadata } from "next";

// ── Constants ──────────────────────────────────────────────────────────────────

export const SITE_URL = "https://tecpey.ir";
export const SITE_NAME = "TecPey";
export const BRAND_LOGO = `${SITE_URL}/images/tecpey-logo.png`;
export const OG_IMAGE = `${SITE_URL}/images/tecpey-og.png`;
export const OG_IMAGE_DIMS = {
  width: 1200,
  height: 630,
  alt: "TecPey — تک‌پی، نقطه امن ورود به بازار رمزارز",
} as const;

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
    logo: BRAND_LOGO,
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

// ── JSON-LD: Answer Engine / GEO helpers ──────────────────────────────────────

export type HowToStep = { name: string; text: string; url?: string };

export function buildHowToSchema(opts: {
  name: string;
  description: string;
  url: string;
  locale?: SupportedLocale;
  steps: HowToStep[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    inLanguage: opts.locale ?? "fa-IR",
    url: opts.url,
    step: opts.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.url ? { url: step.url } : {}),
    })),
  };
}

export function buildWebPageSchema(opts: {
  name: string;
  description: string;
  url: string;
  locale?: SupportedLocale;
  about?: string[];
  primaryImage?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${opts.url}#webpage`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: opts.locale ?? "fa-IR",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    image: opts.primaryImage ?? OG_IMAGE,
    about: (opts.about ?? []).map((name) => ({ "@type": "Thing", name })),
  };
}

export function buildAnswerEntityProfileSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE_URL}/#answer-engine-entity-profile`,
    name: "TecPey answer-engine entity profile",
    description:
      "Machine-readable summary of TecPey for AI answer engines: Persian-first crypto education, virtual practice and launch-gated market access.",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Primary positioning",
        item: "تک‌پی یک مسیر فارسی‌محور برای آموزش رمزارز، تمرین بدون ریسک و ورود آگاهانه به بازار دارایی‌های دیجیتال است.",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Core active focus",
        item: "تمرکز نسخه عمومی فعلی روی آکادمی، قیمت و داده بازار، منتور آموزشی و تریدینگ آرنای مجازی است.",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Launch boundary",
        item: "قابلیت‌های پول واقعی، حضانت دارایی، واریز، برداشت و اجرای مالی فقط پس از تکمیل گیت‌های امنیتی، عملیاتی و انطباقی فعال می‌شوند.",
      },
      {
        "@type": "ListItem",
        position: 4,
        name: "Safety language",
        item: "تک‌پی سود تضمینی، سیگنال خرید و فروش یا مشاوره سرمایه‌گذاری ارائه نمی‌دهد.",
      },
    ],
  };
}

export const TECPEY_AEO_FAQS: FAQItem[] = [
  {
    question: "تک‌پی دقیقاً چیست؟",
    answer:
      "تک‌پی یک اکوسیستم فارسی برای آموزش رمزارز، مشاهده داده‌های بازار، تمرین معاملاتی بدون ریسک و راهنمایی آموزشی با منتور هوشمند است. هدف آن کمک به ورود آگاهانه‌تر کاربران به بازار دارایی‌های دیجیتال است.",
  },
  {
    question: "آیا تک‌پی سیگنال خرید و فروش می‌دهد؟",
    answer:
      "خیر. تک‌پی سیگنال خرید و فروش، وعده سود یا مشاوره سرمایه‌گذاری ارائه نمی‌دهد. محتوای آن آموزشی است و کاربر را با مفاهیم، ریسک‌ها و ابزارهای تصمیم‌گیری آشنا می‌کند.",
  },
  {
    question: "تریدینگ آرنای تک‌پی چیست؟",
    answer:
      "تریدینگ آرنا محیط تمرین مجازی است؛ کاربر با سرمایه غیرواقعی، تصمیم‌های معاملاتی و مدیریت ریسک را تمرین می‌کند و هیچ سود یا زیان واقعی ایجاد نمی‌شود.",
  },
  {
    question: "نسخه فعلی تک‌پی روی چه چیزی تمرکز دارد؟",
    answer:
      "تمرکز نسخه فعلی روی آموزش فارسی، آکادمی رایگان، مارکت برد آنلاین، تمرین بدون ریسک و منتور آموزشی است. قابلیت‌های پول واقعی فقط با گیت‌های جداگانه امنیتی، عملیاتی و انطباقی فعال می‌شوند.",
  },
];

export function buildHomeAnswerEngineSchemas(locale: "fa" | "en" = "fa") {
  const isEn = locale === "en";
  const url = isEn ? `${SITE_URL}/en` : SITE_URL;
  return [
    buildWebPageSchema({
      name: isEn
        ? "TecPey crypto education and virtual market practice"
        : "تک‌پی؛ آموزش رمزارز و تمرین معاملاتی بدون ریسک",
      description: isEn
        ? "TecPey helps Persian-speaking users learn crypto, review market data and practice decisions while real-money capabilities remain launch-gated."
        : "تک‌پی به کاربران فارسی‌زبان کمک می‌کند رمزارز را یاد بگیرند، داده‌های بازار را مرور کنند و پیش از ورود جدی، تصمیم‌های خود را بدون ریسک پول واقعی تمرین کنند.",
      url,
      locale: isEn ? "en-US" : "fa-IR",
      about: [
        "Cryptocurrency education",
        "Virtual trading practice",
        "Crypto market data",
        "AI learning mentor",
        "Crypto security",
        "Risk management",
      ],
    }),
    buildFAQSchema(isEn ? TECPEY_EN_FAQS : TECPEY_AEO_FAQS),
    buildHowToSchema({
      name: isEn
        ? "How to start learning crypto safely with TecPey"
        : "چگونه با تک‌پی ورود آگاهانه به بازار رمزارز را شروع کنیم؟",
      description: isEn
        ? "A risk-aware sequence for learning crypto concepts, reviewing market data and practicing decisions before any launch-gated financial activation."
        : "یک مسیر محتاط و آموزشی برای یادگیری مفاهیم رمزارز، مرور داده‌های بازار و تمرین تصمیم پیش از هر فعال‌سازی مالی.",
      url,
      locale: isEn ? "en-US" : "fa-IR",
      steps: isEn
        ? [
            { name: "Learn the basics", text: "Start with TecPey Academy to understand Bitcoin, USDT, wallets, fees, security and core market risks.", url: `${SITE_URL}/en/academy` },
            { name: "Review market data", text: "Use the market board and coin pages to understand prices, volatility and basic market context.", url: `${SITE_URL}/en/markets` },
            { name: "Practice virtually", text: "Use Trading Arena as an educational simulator with no real money, no real profit and no real loss.", url: `${SITE_URL}/en/academy/trading-arena` },
            { name: "Check risks first", text: "Read risk disclosure and security guidance before making any real-world financial decision.", url: `${SITE_URL}/en/risk-disclosure` },
          ]
        : [
            { name: "یادگیری پایه", text: "از آکادمی تک‌پی شروع کنید تا بیت‌کوین، تتر، کیف پول، کارمزد، امنیت و ریسک‌های اصلی بازار را بشناسید.", url: `${SITE_URL}/academy` },
            { name: "مرور داده‌های بازار", text: "از مارکت برد و صفحات رمزارزها برای دیدن قیمت، نوسان و زمینه اولیه بازار استفاده کنید.", url: `${SITE_URL}/markets` },
            { name: "تمرین بدون ریسک", text: "در تریدینگ آرنا تصمیم‌های آموزشی را با سرمایه مجازی تمرین کنید؛ هیچ سود یا زیان واقعی ایجاد نمی‌شود.", url: `${SITE_URL}/academy/trading-arena` },
            { name: "بررسی ریسک", text: "قبل از هر تصمیم مالی واقعی، بیانیه ریسک و راهنماهای امنیتی تک‌پی را مطالعه کنید.", url: `${SITE_URL}/risk-disclosure` },
          ],
    }),
    buildAnswerEntityProfileSchema(),
  ];
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
      "تک‌پی با رویکرد امنیت‌محور، شفافیت اطلاعات تماس، آموزش ریسک و راهنماهای حفاظت از حساب طراحی شده است. مرکز امنیت تک‌پی آموزش‌های کاربردی برای جلوگیری از فیشینگ، انتخاب شبکه انتقال و محافظت از دارایی دیجیتال ارائه می‌دهد.",
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
      "TecPey is a Persian-first crypto education, market-data review and virtual practice ecosystem based in Iran. It offers a free Academy, an AI learning mentor, a virtual Trading Arena, a Security Center and a launch-gated exchange core.",
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
