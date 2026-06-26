// TecPey entity definitions and bilingual keyword clusters.
// Pure module — no async, no DB, no side effects.
// Used by seo.ts, structured-data components, and future AI-search endpoints.

// ── Entity types ───────────────────────────────────────────────────────────────

export type EntityCategory = "exchange" | "education" | "ai" | "trading" | "security";

export type TecPeyEntity = {
  id: string;
  name: string;
  nameFa: string;
  alternateName: string[];
  descriptionEn: string;
  descriptionFa: string;
  url: string;
  category: EntityCategory;
  /** Verified sameAs links only. Placeholders are TODO comments, not empty strings. */
  sameAs: string[];
  keywordsEn: string[];
  keywordsFa: string[];
  audienceEn: string;
  audienceFa: string;
};

// ── Entity definitions ─────────────────────────────────────────────────────────

export const TECPEY_ENTITIES = {
  exchange: {
    id: "tecpey-exchange",
    name: "TecPey Exchange",
    nameFa: "صرافی تک‌پی",
    alternateName: ["TecPey", "TecPey Crypto Exchange", "تک‌پی", "صرافی تک‌پی"],
    descriptionEn:
      "Persian crypto exchange with live prices, transparent fees, and local support in Mazandaran, Iran.",
    descriptionFa:
      "صرافی رمزارز فارسی با قیمت لحظه‌ای، کارمزد شفاف و پشتیبانی محلی در مازندران.",
    url: "https://tecpey.ir",
    category: "exchange" as const,
    sameAs: [
      "https://t.me/tecpeyco",
      "https://instagram.com/tecpeyco",
      // TODO(sameAs): add Wikidata / CrunchBase / LinkedIn when available
    ],
    keywordsEn: [
      "crypto exchange",
      "bitcoin exchange",
      "usdt exchange",
      "persian crypto exchange",
      "iran crypto",
      "buy bitcoin iran",
      "buy usdt iran",
      "secure crypto exchange",
      "cryptocurrency trading platform",
    ],
    keywordsFa: [
      "صرافی ارز دیجیتال",
      "صرافی رمزارز",
      "خرید بیت کوین",
      "خرید تتر",
      "قیمت رمزارز",
      "بازار رمزارز",
      "صرافی ایرانی",
    ],
    audienceEn: "Persian-speaking users in Iran and the Iranian diaspora looking to buy, sell, or track cryptocurrencies.",
    audienceFa: "کاربران فارسی‌زبان در ایران و ایرانیان خارج از کشور که می‌خواهند رمزارز بخرند، بفروشند یا قیمت‌ها را دنبال کنند.",
  },
  academy: {
    id: "tecpey-academy",
    name: "TecPey Academy",
    nameFa: "آکادمی تک‌پی",
    alternateName: ["TecPey Crypto Academy", "آکادمی تک‌پی", "آموزشگاه تک‌پی"],
    descriptionEn:
      "Free Persian cryptocurrency education: beginner-to-advanced courses, quizzes, and a step-by-step learning path.",
    descriptionFa:
      "آموزش رایگان رمزارز به زبان فارسی از مبتدی تا حرفه‌ای؛ دوره‌های متنی، آزمون تعاملی و مسیر یادگیری گام‌به‌گام.",
    url: "https://tecpey.ir/academy",
    category: "education" as const,
    sameAs: [
      // TODO(sameAs): add LinkedIn Learning / Coursera profile when published
    ],
    keywordsEn: [
      "crypto education",
      "bitcoin tutorial",
      "trading course",
      "crypto academy",
      "blockchain course",
      "free crypto education",
      "crypto trading course",
      "crypto education platform",
      "learn cryptocurrency online",
    ],
    keywordsFa: [
      "آموزش ارز دیجیتال",
      "آموزش ترید",
      "آکادمی ارز دیجیتال",
      "آموزش بیت کوین",
      "دوره رمزارز",
      "آموزش بلاکچین",
      "آموزش رمزارز رایگان",
    ],
    audienceEn: "Crypto beginners and intermediate learners, especially Persian speakers, who want structured, risk-aware cryptocurrency education.",
    audienceFa: "مبتدیان و یادگیرندگان متوسط رمزارز، به‌ویژه فارسی‌زبانان، که به دنبال آموزش ساختارمند و آگاهانه نسبت به ریسک هستند.",
  },
  aiMentor: {
    id: "tecpey-ai-mentor",
    name: "TecPey AI Mentor",
    nameFa: "مربی هوشمند تک‌پی",
    alternateName: ["TecPey AI Tutor", "مربی هوش مصنوعی تک‌پی", "مربی ترید هوشمند"],
    descriptionEn:
      "AI-powered learning mentor that personalizes crypto education for each student based on their learning DNA, quiz results, and trading history.",
    descriptionFa:
      "مربی هوشمند مبتنی بر هوش مصنوعی که آموزش رمزارز را بر اساس پروفایل یادگیری، آزمون‌ها و سابقه ترید هر دانشجو شخصی‌سازی می‌کند.",
    url: "https://tecpey.ir/academy",
    category: "ai" as const,
    sameAs: [
      // TODO(sameAs): no public listing yet
    ],
    keywordsEn: [
      "AI crypto mentor",
      "crypto AI tutor",
      "personalized trading education",
      "AI trading coach",
      "crypto learning AI",
      "AI trading mentor",
    ],
    keywordsFa: [
      "مربی هوش مصنوعی رمزارز",
      "آموزش شخصی‌سازی شده ترید",
      "مربی ترید هوشمند",
      "AI Mentor رمزارز",
      "هوش مصنوعی آموزش کریپتو",
      "مربی هوشمند تک‌پی",
    ],
    audienceEn: "Crypto students who want personalized, adaptive learning guidance instead of generic tutorials.",
    audienceFa: "دانشجویان رمزارز که به دنبال راهنمایی یادگیری شخصی‌سازی‌شده و تطبیقی به جای آموزش‌های عمومی هستند.",
  },
  tradingArena: {
    id: "tecpey-trading-arena",
    name: "TecPey Trading Arena",
    nameFa: "آرنای معاملاتی تک‌پی",
    alternateName: ["TecPey Trading Simulator", "شبیه‌ساز معامله تک‌پی", "آرنای ترید"],
    descriptionEn:
      "Virtual trading practice environment for risk-free educational trading, with professional tools and performance tracking.",
    descriptionFa:
      "محیط تمرین معاملاتی مجازی برای یادگیری ترید بدون ریسک واقعی، با ابزارهای حرفه‌ای و پیگیری عملکرد.",
    url: "https://tecpey.ir/academy",
    category: "trading" as const,
    sameAs: [
      // TODO(sameAs): no public listing yet
    ],
    keywordsEn: [
      "trading practice",
      "virtual trading",
      "paper trading",
      "trading simulation",
      "crypto trading education",
      "paper trading crypto",
      "trading simulator",
      "risk-free trading practice",
    ],
    keywordsFa: [
      "تمرین ترید",
      "پراپ تریدینگ",
      "ترید مجازی",
      "آموزش معامله‌گری",
      "شبیه‌ساز ترید",
      "معامله بدون ریسک",
      "شبیه ساز معامله",
    ],
    audienceEn: "Crypto beginners and intermediate traders who want to practice buying and selling without real financial risk.",
    audienceFa: "مبتدیان و تریدرهای متوسطی که می‌خواهند خرید و فروش را بدون ریسک مالی واقعی تمرین کنند.",
  },
  securityCenter: {
    id: "tecpey-security-center",
    name: "TecPey Security Center",
    nameFa: "مرکز امنیت تک‌پی",
    alternateName: ["TecPey Crypto Security Hub", "مرکز امنیت رمزارز تک‌پی"],
    descriptionEn:
      "Crypto security education: wallet safety, phishing prevention, account protection, and risk disclosure.",
    descriptionFa:
      "آموزش امنیت رمزارز: امنیت کیف پول، پیشگیری از فیشینگ، حفاظت حساب و بیانیه ریسک.",
    url: "https://tecpey.ir/security",
    category: "security" as const,
    sameAs: [
      // TODO(sameAs): no public listing yet
    ],
    keywordsEn: [
      "crypto security",
      "wallet security",
      "phishing prevention",
      "crypto safety",
      "account protection",
      "crypto risk management",
      "secure crypto exchange",
    ],
    keywordsFa: [
      "امنیت رمزارز",
      "امنیت کیف پول",
      "جلوگیری از فیشینگ",
      "امنیت حساب ارز دیجیتال",
      "حفاظت دارایی دیجیتال",
    ],
    audienceEn: "Crypto beginners and existing crypto holders who want to protect their accounts, wallets, and assets from common threats.",
    audienceFa: "مبتدیان و دارندگان رمزارز که می‌خواهند حساب‌ها، کیف پول‌ها و دارایی‌های خود را از تهدیدات رایج محافظت کنند.",
  },
} as const satisfies Record<string, TecPeyEntity>;

// ── Persian search intent keyword clusters ─────────────────────────────────────

export const FA_KEYWORD_CLUSTERS = {
  exchange: [
    "صرافی ارز دیجیتال",
    "صرافی رمزارز",
    "بهترین صرافی ایرانی",
    "صرافی بیت کوین",
    "تک‌پی صرافی",
  ],
  buyBitcoin: [
    "خرید بیت کوین",
    "خرید بیت کوین در ایران",
    "قیمت خرید بیت کوین",
    "بیت کوین به تومان",
  ],
  buyUsdt: [
    "خرید تتر",
    "خرید تتر در ایران",
    "قیمت تتر",
    "تبدیل تومان به تتر",
    "تتر ایران",
  ],
  bitcoinPrice: [
    "قیمت بیت کوین",
    "قیمت بیت کوین امروز",
    "قیمت لحظه‌ای بیت کوین",
    "نرخ بیت کوین",
  ],
  usdtPrice: [
    "قیمت تتر",
    "قیمت تتر امروز",
    "قیمت دلار تتر",
    "نرخ تتر",
  ],
  cryptoEducation: [
    "آموزش ارز دیجیتال",
    "آموزش رمزارز",
    "آموزش بلاکچین",
    "آموزش کریپتو",
    "آموزش ارز دیجیتال رایگان",
  ],
  cryptoTrading: [
    "ترید ارز دیجیتال",
    "آموزش ترید",
    "ترید بیت کوین",
    "بازار رمزارز",
    "معامله‌گری رمزارز",
  ],
  tradingEducation: [
    "آموزش ترید",
    "یادگیری معامله‌گری",
    "مدیریت ریسک رمزارز",
    "تحلیل تکنیکال",
    "روانشناسی ترید",
  ],
  propTrading: [
    "پراپ تریدینگ",
    "پراپ تریدینگ ایران",
    "تمرین ترید مجازی",
    "شبیه‌ساز ترید",
  ],
  cryptoAcademy: [
    "آکادمی ارز دیجیتال",
    "دوره ارز دیجیتال",
    "آموزش معامله‌گری",
    "مدرسه رمزارز",
    "کلاس کریپتو",
  ],
  cryptoSecurity: [
    "امنیت رمزارز",
    "امنیت کیف پول",
    "جلوگیری از فیشینگ",
    "هک رمزارز",
    "حفاظت دارایی دیجیتال",
  ],
  aiMentor: [
    "مربی هوش مصنوعی",
    "AI Mentor رمزارز",
    "مربی ترید هوشمند",
    "آموزش شخصی‌سازی شده کریپتو",
  ],
} as const;

export type KeywordCluster = keyof typeof FA_KEYWORD_CLUSTERS;

// ── English search intent keyword clusters ─────────────────────────────────────

export const EN_KEYWORD_CLUSTERS = {
  exchange: [
    "crypto exchange",
    "cryptocurrency exchange",
    "bitcoin exchange",
    "secure crypto exchange",
    "persian crypto exchange",
  ],
  buyBitcoin: [
    "buy bitcoin",
    "buy bitcoin online",
    "how to buy bitcoin",
    "bitcoin purchase",
  ],
  buyUsdt: [
    "buy usdt",
    "buy tether",
    "buy usdt online",
    "how to buy usdt",
  ],
  bitcoinPrice: [
    "bitcoin price",
    "bitcoin price today",
    "live bitcoin price",
    "btc price",
  ],
  usdtPrice: [
    "usdt price",
    "tether price",
    "usdt rate",
    "tether rate today",
  ],
  cryptoPrices: [
    "cryptocurrency prices",
    "live crypto prices",
    "crypto market prices",
    "crypto price board",
  ],
  cryptoEducation: [
    "crypto education",
    "cryptocurrency tutorial",
    "learn crypto",
    "crypto course free",
    "crypto education platform",
  ],
  cryptoTrading: [
    "crypto trading",
    "learn crypto trading",
    "cryptocurrency trading course",
    "trading course for beginners",
  ],
  tradingSimulator: [
    "paper trading crypto",
    "trading simulator",
    "virtual trading",
    "risk-free trading practice",
  ],
  cryptoAcademy: [
    "crypto academy",
    "cryptocurrency academy",
    "AI trading mentor",
    "crypto learning platform",
  ],
  cryptoSecurity: [
    "crypto security",
    "crypto risk management",
    "wallet security",
    "phishing prevention crypto",
  ],
  aiMentor: [
    "AI trading mentor",
    "crypto AI tutor",
    "personalized crypto education",
    "AI crypto coach",
  ],
} as const;

export type EnKeywordCluster = keyof typeof EN_KEYWORD_CLUSTERS;

// ── Helpers: flatten clusters into keyword arrays for meta tags ────────────────

export function getKeywordsForClusters(...clusters: KeywordCluster[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const cluster of clusters) {
    for (const kw of FA_KEYWORD_CLUSTERS[cluster]) {
      if (!seen.has(kw)) {
        seen.add(kw);
        result.push(kw);
      }
    }
  }
  return result;
}

export function getEnKeywordsForClusters(...clusters: EnKeywordCluster[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const cluster of clusters) {
    for (const kw of EN_KEYWORD_CLUSTERS[cluster]) {
      if (!seen.has(kw)) {
        seen.add(kw);
        result.push(kw);
      }
    }
  }
  return result;
}
