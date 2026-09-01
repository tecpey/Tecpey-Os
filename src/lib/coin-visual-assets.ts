import { coinGrowthCandidates, type CoinGrowthCandidate } from "@/data/coinGrowthCandidates";
import { normalizeMarketSymbol } from "@/lib/public-market-data";

type CompactCoinVisual = {
  symbol: string;
  slug: string;
  name: string;
  faName: string;
  asset?: CoinVisualAssetSource;
};

type CoinVisualSource = "iconscout-3d" | "cc0-svg" | "web3-icons" | "official" | "tecpey-vector" | "irt" | "remote";

type CoinVisualAssetSource = {
  src: string;
  source: CoinVisualSource;
  sourceLabel: string;
  license: string;
  sourceUrl: string;
};

export type CoinVisualAsset = {
  symbol: string;
  slug: string;
  name: string;
  faName: string;
  src?: string;
  isLocal: boolean;
  source: CoinVisualSource;
  sourceLabel: string;
  license?: string;
  sourceUrl?: string;
};

const iconScoutBase = "/images/tecpey/coin-packs/iconscout-3d";
const cc0Base = "/images/tecpey/coin-packs/cryptocurrency-icons";
const web3IconsBase = "/images/tecpey/coin-packs/web3-icons";
const officialBase = "/images/tecpey/coin-packs/official";

function iconScout3d(slug: string, sourceUrl: string): CoinVisualAssetSource {
  return {
    src: `${iconScoutBase}/${slug}.png`,
    source: "iconscout-3d",
    sourceLabel: "IconScout Free Cryptocurrency 3D Icon Pack",
    license: "IconScout Digital License",
    sourceUrl,
  };
}

function cc0Icon(slug: string): CoinVisualAssetSource {
  return {
    src: `${cc0Base}/${slug}.svg`,
    source: "cc0-svg",
    sourceLabel: "cryptocurrency-icons",
    license: "CC0-1.0",
    sourceUrl: "https://github.com/spothq/cryptocurrency-icons",
  };
}

function web3Icon(slug: string): CoinVisualAssetSource {
  return {
    src: `${web3IconsBase}/${slug}.svg`,
    source: "web3-icons",
    sourceLabel: "Web3 Icons Token Branded",
    license: "MIT",
    sourceUrl: "https://www.npmjs.com/package/@iconify-json/token-branded",
  };
}

function officialIcon(slug: string, sourceUrl: string): CoinVisualAssetSource {
  return {
    src: `${officialBase}/${slug}.svg`,
    source: "official",
    sourceLabel: "Official project brand asset",
    license: "Project brand asset terms",
    sourceUrl,
  };
}

function candidateAsset(candidate: CoinGrowthCandidate): CoinVisualAssetSource | undefined {
  if (!candidate.visualAsset || candidate.visualAsset.source === "tecpey-vector") return undefined;
  if (candidate.visualAsset.source === "cc0-svg") return cc0Icon(candidate.visualAsset.slug);
  if (candidate.visualAsset.source === "web3-icons") return web3Icon(candidate.visualAsset.slug);
  if (candidate.visualAsset.source === "official") {
    return officialIcon(candidate.visualAsset.slug, candidate.visualAsset.sourceUrl ?? candidate.officialWebsite);
  }
  if (candidate.visualAsset.source === "iconscout-3d") {
    return iconScout3d(candidate.visualAsset.slug, candidate.visualAsset.sourceUrl ?? "https://iconscout.com/free-3d-icon-pack/free-cryptocurrency-3d-icon-pack_73088");
  }
  return undefined;
}

const baseCoinVisuals: CompactCoinVisual[] = [
  {
    slug: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    faName: "بیت‌کوین",
    asset: iconScout3d("bitcoin", "https://cdn3d.iconscout.com/3d/free/thumb/free-bitcoin-3d-icon-png-download-2879622.png"),
  },
  {
    slug: "tether",
    symbol: "USDT",
    name: "Tether",
    faName: "تتر",
    asset: iconScout3d("tether", "https://cdn3d.iconscout.com/3d/free/thumb/free-tether-3d-icon-png-download-2879645.png"),
  },
  {
    slug: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    faName: "اتریوم",
    asset: iconScout3d("ethereum", "https://cdn3d.iconscout.com/3d/free/thumb/free-ethereum-3d-icon-png-download-2879620.png"),
  },
  { slug: "toncoin", symbol: "TON", name: "Toncoin", faName: "تون‌کوین", asset: web3Icon("toncoin") },
  { slug: "solana", symbol: "SOL", name: "Solana", faName: "سولانا", asset: cc0Icon("solana") },
  {
    slug: "xrp",
    symbol: "XRP",
    name: "XRP",
    faName: "ریپل / XRP",
    asset: iconScout3d("xrp", "https://cdn3d.iconscout.com/3d/free/thumb/free-xrp-3d-icon-png-download-2879626.png"),
  },
  {
    slug: "dogecoin",
    symbol: "DOGE",
    name: "Dogecoin",
    faName: "دوج‌کوین",
    asset: iconScout3d("dogecoin", "https://cdn3d.iconscout.com/3d/free/thumb/free-dogecoin-3d-icon-png-download-2879624.png"),
  },
  {
    slug: "bnb",
    symbol: "BNB",
    name: "BNB",
    faName: "بی‌ان‌بی",
    asset: iconScout3d("bnb", "https://cdn3d.iconscout.com/3d/free/thumb/free-binance-3d-icon-png-download-2879643.png"),
  },
  {
    slug: "cardano",
    symbol: "ADA",
    name: "Cardano",
    faName: "کاردانو",
    asset: iconScout3d("cardano", "https://cdn3d.iconscout.com/3d/free/thumb/free-cardano-3d-icon-png-download-2879642.png"),
  },
  {
    slug: "tron",
    symbol: "TRX",
    name: "TRON",
    faName: "ترون",
    asset: iconScout3d("tron", "https://cdn3d.iconscout.com/3d/free/thumb/free-tron-3d-icon-png-download-2879663.png"),
  },
  {
    slug: "avalanche",
    symbol: "AVAX",
    name: "Avalanche",
    faName: "آوالانچ",
    asset: iconScout3d("avalanche", "https://cdn3d.iconscout.com/3d/free/thumb/free-avalanche-3d-icon-png-download-2879631.png"),
  },
  {
    slug: "chainlink",
    symbol: "LINK",
    name: "Chainlink",
    faName: "چین‌لینک",
    asset: iconScout3d("chainlink", "https://cdn3d.iconscout.com/3d/free/thumb/free-chainlink-3d-icon-png-download-2879630.png"),
  },
  { slug: "polkadot", symbol: "DOT", name: "Polkadot", faName: "پولکادات", asset: cc0Icon("polkadot") },
  {
    slug: "litecoin",
    symbol: "LTC",
    name: "Litecoin",
    faName: "لایت‌کوین",
    asset: iconScout3d("litecoin", "https://cdn3d.iconscout.com/3d/free/thumb/free-litecoin-3d-icon-png-download-2879619.png"),
  },
  {
    slug: "bitcoin-cash",
    symbol: "BCH",
    name: "Bitcoin Cash",
    faName: "بیت‌کوین کش",
    asset: iconScout3d("bitcoin-cash", "https://cdn3d.iconscout.com/3d/free/thumb/free-btc-cash-3d-icon-png-download-2879635.png"),
  },
  { slug: "near", symbol: "NEAR", name: "NEAR Protocol", faName: "نیر پروتکل", asset: web3Icon("near") },
  { slug: "aptos", symbol: "APT", name: "Aptos", faName: "اپتوس", asset: web3Icon("aptos") },
  { slug: "sui", symbol: "SUI", name: "Sui", faName: "سویی", asset: web3Icon("sui") },
  { slug: "arbitrum", symbol: "ARB", name: "Arbitrum", faName: "آربیتروم", asset: web3Icon("arbitrum") },
  { slug: "optimism", symbol: "OP", name: "Optimism", faName: "آپتیمیسم", asset: web3Icon("optimism") },
  { slug: "cosmos", symbol: "ATOM", name: "Cosmos", faName: "کازموس", asset: cc0Icon("cosmos") },
  { slug: "pepe", symbol: "PEPE", name: "Pepe", faName: "پپه", asset: web3Icon("pepe") },
  { slug: "shiba-inu", symbol: "SHIB", name: "Shiba Inu", faName: "شیبا اینو", asset: web3Icon("shiba-inu") },
  {
    slug: "filecoin",
    symbol: "FIL",
    name: "Filecoin",
    faName: "فایل‌کوین",
    asset: iconScout3d("filecoin", "https://cdn3d.iconscout.com/3d/free/thumb/free-filecoin-3d-icon-png-download-2879634.png"),
  },
  {
    slug: "internet-computer",
    symbol: "ICP",
    name: "Internet Computer",
    faName: "اینترنت کامپیوتر",
    asset: cc0Icon("internet-computer"),
  },
  { slug: "injective", symbol: "INJ", name: "Injective", faName: "اینجکتیو", asset: web3Icon("injective") },
  { slug: "sei", symbol: "SEI", name: "Sei", faName: "سی", asset: web3Icon("sei") },
  {
    slug: "stellar",
    symbol: "XLM",
    name: "Stellar",
    faName: "استلار",
    asset: iconScout3d("stellar", "https://cdn3d.iconscout.com/3d/free/thumb/free-stellar-3d-icon-png-download-2879638.png"),
  },
  {
    slug: "uniswap",
    symbol: "UNI",
    name: "Uniswap",
    faName: "یونی‌سواپ",
    asset: iconScout3d("uniswap", "https://cdn3d.iconscout.com/3d/free/thumb/free-uniswap-3d-icon-png-download-2879644.png"),
  },
  {
    slug: "maker",
    symbol: "MKR",
    name: "Maker",
    faName: "میکر",
    asset: iconScout3d("maker", "https://cdn3d.iconscout.com/3d/free/thumb/free-maker-3d-icon-png-download-2879654.png"),
  },
];

const automatedCoinVisuals: CompactCoinVisual[] = coinGrowthCandidates.map((candidate) => ({
  slug: candidate.slug,
  symbol: candidate.symbol,
  name: candidate.name,
  faName: candidate.faName,
  asset: candidateAsset(candidate),
}));

const coinVisuals: CompactCoinVisual[] = [...baseCoinVisuals, ...automatedCoinVisuals];

function buildCoinAsset(coin: CompactCoinVisual, input?: { name?: string; faName?: string }): CoinVisualAsset {
  return {
    symbol: coin.symbol,
    slug: coin.slug,
    name: input?.name || coin.name,
    faName: input?.faName || coin.faName,
    src: coin.asset?.src,
    isLocal: true,
    source: coin.asset?.source ?? "tecpey-vector",
    sourceLabel: coin.asset?.sourceLabel ?? "TecPey generated vector fallback",
    license: coin.asset?.license,
    sourceUrl: coin.asset?.sourceUrl,
  };
}

const fallbackCoinVisual = buildCoinAsset(coinVisuals[0]);

export function getCoinVisualAsset(input: {
  symbol?: unknown;
  slug?: string;
  name?: string;
  faName?: string;
  remoteIcon?: string;
}) {
  const symbol = normalizeMarketSymbol(input.symbol);
  const coin =
    (input.slug ? coinVisuals.find((item) => item.slug === input.slug) : undefined) ??
    coinVisuals.find((item) => item.symbol === symbol);

  if (coin) {
    return buildCoinAsset(coin, input);
  }

  if (symbol === "IRT") {
    return {
      symbol: "IRT",
      slug: "irt",
      name: input.name || "Iranian Toman",
      faName: input.faName || "تومان",
      src: "/images/IRT.svg",
      isLocal: true,
      source: "irt" as const,
      sourceLabel: "TecPey toman asset",
    };
  }

  const remoteIcon = String(input.remoteIcon ?? "");
  if (remoteIcon && remoteIcon !== "/default-coin.svg") {
    return {
      symbol: symbol || input.name || fallbackCoinVisual.symbol,
      slug: String(input.slug ?? symbol.toLowerCase() ?? fallbackCoinVisual.slug),
      name: input.name || symbol || fallbackCoinVisual.name,
      faName: input.faName || input.name || symbol || fallbackCoinVisual.faName,
      src: remoteIcon,
      isLocal: false,
      source: "remote" as const,
      sourceLabel: "Remote market data icon",
    };
  }

  const safeSymbol = symbol || String(input.name ?? "TP").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "TP";
  return {
    symbol: safeSymbol,
    slug: String(input.slug ?? safeSymbol.toLowerCase()),
    name: input.name || safeSymbol,
    faName: input.faName || input.name || safeSymbol,
    isLocal: true,
    source: "tecpey-vector" as const,
    sourceLabel: "TecPey generated vector fallback",
  };
}
