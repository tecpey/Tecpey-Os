import { coinGrowthCandidates } from "@/data/coinGrowthCandidates";
import { toolGrowthCandidates } from "@/data/toolGrowthCandidates";

export type NewsTopicTag = {
  id: string;
  labelFa: string;
  labelEn: string;
  aliases: readonly string[];
  searchIntents: readonly string[];
};

export type NewsTaxonomyMatch = {
  coinSymbols: string[];
  coinSlugs: string[];
  toolSlugs: string[];
  topicTags: string[];
  searchIntents: string[];
  entityTags: string[];
  keywords: string[];
};

const CORE_COINS = [
  { symbol: "BTC", slug: "bitcoin", name: "Bitcoin", faName: "بیت‌کوین", aliases: ["btc", "bitcoin", "بیت کوین", "بیت‌کوین"] },
  { symbol: "ETH", slug: "ethereum", name: "Ethereum", faName: "اتریوم", aliases: ["eth", "ethereum", "ether", "اتریوم"] },
  { symbol: "USDT", slug: "tether", name: "Tether", faName: "تتر", aliases: ["usdt", "tether", "تتر"] },
  { symbol: "BNB", slug: "bnb", name: "BNB", faName: "بی‌ان‌بی", aliases: ["bnb", "binance coin", "بی ان بی", "بی‌ان‌بی"] },
  { symbol: "SOL", slug: "solana", name: "Solana", faName: "سولانا", aliases: ["solana", "سولانا"] },
  { symbol: "XRP", slug: "xrp", name: "XRP", faName: "ریپل", aliases: ["xrp", "ripple", "ریپل"] },
  { symbol: "DOGE", slug: "dogecoin", name: "Dogecoin", faName: "دوج‌کوین", aliases: ["doge", "dogecoin", "دوج کوین", "دوج‌کوین"] },
  { symbol: "ADA", slug: "cardano", name: "Cardano", faName: "کاردانو", aliases: ["cardano", "کاردانو"] },
  { symbol: "TON", slug: "toncoin", name: "Toncoin", faName: "تون‌کوین", aliases: ["toncoin", "ton coin", "تون کوین", "تون‌کوین"] },
  { symbol: "TRX", slug: "tron", name: "TRON", faName: "ترون", aliases: ["tron", "trx", "ترون"] },
] as const;

const TOPICS: readonly NewsTopicTag[] = [
  { id: "bitcoin", labelFa: "بیت‌کوین", labelEn: "Bitcoin", aliases: ["bitcoin", "btc", "بیت کوین", "بیت‌کوین"], searchIntents: ["قیمت بیت کوین", "اخبار بیت کوین", "bitcoin news"] },
  { id: "ethereum", labelFa: "اتریوم", labelEn: "Ethereum", aliases: ["ethereum", "ether", "eth", "اتریوم"], searchIntents: ["اخبار اتریوم", "ethereum news"] },
  { id: "stablecoins", labelFa: "استیبل‌کوین", labelEn: "Stablecoins", aliases: ["stablecoin", "stablecoins", "usdt", "usdc", "tether", "depeg", "استیبل", "تتر"], searchIntents: ["اخبار تتر", "stablecoin news"] },
  { id: "etf", labelFa: "ETF رمزارز", labelEn: "Crypto ETF", aliases: ["bitcoin etf", "ethereum etf", "spot etf", "etf inflow", "etf outflow", "صندوق بورسی", "ETF"], searchIntents: ["bitcoin etf news", "اخبار ETF بیت کوین"] },
  { id: "regulation", labelFa: "مقررات", labelEn: "Regulation", aliases: ["regulation", "regulatory", "sec", "cftc", "mica", "law", "court", "lawsuit", "مقررات", "قانون", "دادگاه", "شکایت"], searchIntents: ["crypto regulation news", "قوانین ارز دیجیتال"] },
  { id: "macro", labelFa: "اقتصاد کلان", labelEn: "Macro", aliases: ["federal reserve", "fed", "interest rate", "cpi", "inflation", "jobs report", "dollar index", "dxy", "نرخ بهره", "تورم", "فدرال رزرو"], searchIntents: ["fed crypto impact", "تاثیر نرخ بهره بر ارز دیجیتال"] },
  { id: "security", labelFa: "امنیت", labelEn: "Security", aliases: ["hack", "exploit", "phishing", "breach", "malware", "drainer", "rug pull", "scam", "هک", "فیشینگ", "اسکم", "کلاهبرداری", "امنیت"], searchIntents: ["crypto hack news", "اخبار هک ارز دیجیتال"] },
  { id: "exchanges", labelFa: "صرافی‌ها", labelEn: "Exchanges", aliases: ["exchange", "binance", "coinbase", "kraken", "okx", "bybit", "bitget", "صرافی", "بایننس", "کوین‌بیس"], searchIntents: ["crypto exchange news", "اخبار صرافی ارز دیجیتال"] },
  { id: "defi", labelFa: "دیفای", labelEn: "DeFi", aliases: ["defi", "decentralized finance", "lending protocol", "amm", "liquidity pool", "دیفای", "استخر نقدینگی"], searchIntents: ["defi news", "اخبار دیفای"] },
  { id: "layer-2", labelFa: "لایه دوم", labelEn: "Layer 2", aliases: ["layer 2", "layer-2", "rollup", "arbitrum", "optimism", "base chain", "zk rollup", "لایه دوم", "رول‌آپ"], searchIntents: ["layer 2 crypto news", "اخبار لایه دوم"] },
  { id: "onchain", labelFa: "آنچین", labelEn: "On-chain", aliases: ["on-chain", "onchain", "wallet flows", "exchange flow", "active addresses", "whale", "آنچین", "نهنگ", "جریان صرافی"], searchIntents: ["onchain bitcoin", "تحلیل آنچین بیت کوین"] },
  { id: "derivatives", labelFa: "مشتقات", labelEn: "Derivatives", aliases: ["futures", "options", "funding rate", "open interest", "liquidation", "perpetual", "فیوچرز", "آپشن", "فاندینگ", "اوپن اینترست", "لیکوئید"], searchIntents: ["crypto liquidations", "فاندینگ ارز دیجیتال"] },
  { id: "liquidity", labelFa: "نقدشوندگی", labelEn: "Liquidity", aliases: ["liquidity", "market depth", "spread", "slippage", "order book", "نقدینگی", "نقدشوندگی", "عمق بازار"], searchIntents: ["crypto liquidity", "نقدشوندگی ارز دیجیتال"] },
  { id: "institutional", labelFa: "سرمایه‌گذاری نهادی", labelEn: "Institutional", aliases: ["institutional", "blackrock", "fidelity", "microstrategy", "strategy inc", "treasury", "نهادی", "بلک‌راک"], searchIntents: ["institutional crypto adoption", "سرمایه گذاری نهادی بیت کوین"] },
  { id: "tokenization-rwa", labelFa: "RWA و توکن‌سازی", labelEn: "RWA & Tokenization", aliases: ["rwa", "real world assets", "tokenization", "tokenized treasury", "توکن سازی", "دارایی واقعی"], searchIntents: ["rwa crypto", "توکن سازی دارایی واقعی"] },
  { id: "ai-crypto", labelFa: "هوش مصنوعی و کریپتو", labelEn: "AI & Crypto", aliases: ["ai token", "artificial intelligence", "agentic", "ai agent", "decentralized ai", "هوش مصنوعی", "عامل هوشمند"], searchIntents: ["ai crypto coins", "ارزهای هوش مصنوعی"] },
  { id: "memecoins", labelFa: "میم‌کوین", labelEn: "Memecoins", aliases: ["memecoin", "meme coin", "dogecoin", "shiba", "pepe", "bonk", "میم کوین", "میم‌کوین"], searchIntents: ["trending memecoins", "میم کوین های ترند"] },
  { id: "mining", labelFa: "استخراج", labelEn: "Mining", aliases: ["mining", "miner", "hashrate", "difficulty", "ماینینگ", "استخراج", "هش ریت"], searchIntents: ["bitcoin mining news", "اخبار ماینینگ بیت کوین"] },
  { id: "staking", labelFa: "استیکینگ", labelEn: "Staking", aliases: ["staking", "validator", "restaking", "slashing", "استیکینگ", "اعتبارسنج"], searchIntents: ["staking crypto news", "استیکینگ ارز دیجیتال"] },
  { id: "wallets", labelFa: "کیف پول", labelEn: "Wallets", aliases: ["wallet", "hardware wallet", "metamask", "ledger", "trezor", "کیف پول", "متامسک"], searchIntents: ["crypto wallet security", "امنیت کیف پول ارز دیجیتال"] },
  { id: "payments", labelFa: "پرداخت", labelEn: "Payments", aliases: ["payments", "payment rail", "remittance", "merchant payments", "پرداخت", "حواله"], searchIntents: ["crypto payments", "پرداخت با ارز دیجیتال"] },
  { id: "nft-gaming", labelFa: "NFT و بازی", labelEn: "NFT & Gaming", aliases: ["nft", "gaming", "gamefi", "metaverse", "NFT", "گیم‌فای", "متاورس"], searchIntents: ["nft crypto news", "اخبار NFT"] },
  { id: "privacy", labelFa: "حریم خصوصی", labelEn: "Privacy", aliases: ["privacy coin", "zero knowledge", "zk proof", "monero", "حریم خصوصی", "دانش صفر"], searchIntents: ["privacy crypto", "ارزهای حریم خصوصی"] },
  { id: "adoption", labelFa: "پذیرش", labelEn: "Adoption", aliases: ["adoption", "merchant adoption", "government adoption", "legal tender", "پذیرش", "استفاده عمومی"], searchIntents: ["crypto adoption news", "پذیرش ارز دیجیتال"] },
];

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ـ]/g, "")
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ")
    .replace(/[_/–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function latinAliasMatch(haystack: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

function aliasMatch(haystack: string, alias: string): boolean {
  const needle = normalize(alias);
  if (!needle) return false;
  return /^[a-z0-9 .+#]+$/.test(needle)
    ? latinAliasMatch(haystack, needle)
    : haystack.includes(needle);
}

const COINS = (() => {
  const bySymbol = new Map<string, { symbol: string; slug: string; aliases: string[] }>();
  for (const coin of CORE_COINS) {
    bySymbol.set(coin.symbol, {
      symbol: coin.symbol,
      slug: coin.slug,
      aliases: [...coin.aliases, coin.name, coin.faName],
    });
  }
  for (const coin of coinGrowthCandidates) {
    const previous = bySymbol.get(coin.symbol);
    // Entity identity must not inherit generic narratives such as "defi",
    // "payments" or "layer-2". Those belong to TOPICS; treating them as
    // coin aliases pollutes the entity graph and creates false long-tail links.
    const aliases = [coin.symbol, coin.name, coin.faName, coin.slug];
    bySymbol.set(coin.symbol, {
      symbol: coin.symbol,
      slug: coin.slug,
      aliases: Array.from(new Set([...(previous?.aliases ?? []), ...aliases])),
    });
  }
  return Array.from(bySymbol.values());
})();

const TOOLS = toolGrowthCandidates.map((tool) => ({
  slug: slugify(tool.name),
  // Tool matching is identity-based. Categories/narratives are discovery
  // topics, not proof that a specific third-party tool is mentioned.
  aliases: Array.from(new Set([tool.name, tool.domain, slugify(tool.name)])),
}));

export const NEWS_TOPIC_TAXONOMY = TOPICS;

export function extractNewsTaxonomy(input: string): NewsTaxonomyMatch {
  const text = normalize(input);
  const coinMatches = COINS.filter((coin) => coin.aliases.some((alias) => aliasMatch(text, alias)));
  const toolMatches = TOOLS.filter((tool) => tool.aliases.some((alias) => aliasMatch(text, alias)));
  const topicMatches = TOPICS.filter((topic) => topic.aliases.some((alias) => aliasMatch(text, alias)));

  const coinSymbols = coinMatches.map((coin) => coin.symbol).sort();
  const coinSlugs = coinMatches.map((coin) => coin.slug).sort();
  const toolSlugs = toolMatches.map((tool) => tool.slug).sort();
  const topicTags = topicMatches.map((topic) => topic.id).sort();
  const searchIntents = Array.from(new Set(topicMatches.flatMap((topic) => topic.searchIntents))).slice(0, 24);
  const entityTags = [
    ...coinSymbols.map((symbol) => `coin:${symbol.toLowerCase()}`),
    ...toolSlugs.map((slug) => `tool:${slug}`),
    ...topicTags.map((tag) => `topic:${tag}`),
  ];
  const keywords = Array.from(new Set([
    ...coinMatches.flatMap((coin) => [coin.symbol, coin.slug]),
    ...toolMatches.map((tool) => tool.slug),
    ...topicMatches.flatMap((topic) => [topic.labelEn, topic.labelFa]),
    ...searchIntents,
  ])).filter(Boolean).slice(0, 40);

  return { coinSymbols, coinSlugs, toolSlugs, topicTags, searchIntents, entityTags, keywords };
}

export function coinSlugForSymbol(symbol: string): string {
  return COINS.find((coin) => coin.symbol === symbol.trim().toUpperCase())?.slug ?? symbol.trim().toLowerCase();
}

export function newsTaxonomyTagLabel(tag: string, locale: "fa" | "en"): string {
  const [kind, rawValue] = tag.split(":", 2);
  const value = rawValue || kind;
  if (kind === "coin") return value.toUpperCase();
  if (kind === "tool") {
    const tool = toolGrowthCandidates.find((candidate) => slugify(candidate.name) === value);
    return tool?.name ?? value.replace(/-/g, " ");
  }
  if (kind === "topic") {
    const topic = TOPICS.find((candidate) => candidate.id === value);
    return topic ? (locale === "fa" ? topic.labelFa : topic.labelEn) : value.replace(/-/g, " ");
  }
  return value.replace(/-/g, " ");
}
