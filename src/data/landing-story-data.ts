import type { MarketCurrency, CurrencyListResponse } from "@/types/market";
import { BITYCLE_PUBLIC_MARKET_FRESHNESS_MS, PUBLIC_MARKET_FRESHNESS_MS, normalizeMarketSymbol } from "@/lib/public-market-data";

export type StoryMarket = {
  symbol: string;
  price: number;
  change: number | null;
  marketCap: number | null;
  volume: number | null;
  high24h: number | null;
  low24h: number | null;
  rank: number | null;
  updatedAt: string;
};

const NEWS_COIN_IMAGE_SLUGS: Readonly<Record<string, string>> = Object.freeze({
  ADA: "cardano", APT: "aptos", ARB: "arbitrum", ATOM: "cosmos", AVAX: "avalanche",
  BCH: "bitcoin-cash", BNB: "bnb", BTC: "bitcoin", DOGE: "dogecoin", DOT: "polkadot",
  ETH: "ethereum", FIL: "filecoin", ICP: "internet-computer", INJ: "injective", LINK: "chainlink",
  LTC: "litecoin", MKR: "maker", NEAR: "near", OP: "optimism", PEPE: "pepe", SEI: "sei",
  SHIB: "shiba-inu", SOL: "solana", SUI: "sui", TON: "toncoin", TRX: "tron",
  UNI: "uniswap", USDT: "tether", XLM: "stellar", XRP: "xrp",
});

const NEWS_TOPIC_COVERS: Readonly<Record<string, string>> = Object.freeze({
  security: "crypto-exchange-security.jpg",
  wallets: "wallet-vs-exchange.jpg",
  scam: "crypto-scam-and-phishing.jpg",
  phishing: "crypto-scam-and-phishing.jpg",
  derivatives: "technical-analysis-basics.jpg",
  liquidity: "live-crypto-price-guide.jpg",
  macro: "live-crypto-price-guide.jpg",
  regulation: "compare.jpg",
  etf: "live-crypto-price-guide.jpg",
  institutional: "live-crypto-price-guide.jpg",
  technology: "what-is-blockchain.jpg",
});

const NEWS_FALLBACK_COVERS = [
  "what-is-bitcoin.jpg",
  "live-crypto-price-guide.jpg",
  "technical-analysis-basics.jpg",
  "risk-management-in-crypto.jpg",
] as const;

function stableCoverIndex(value: string): number {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.codePointAt(0)!) >>> 0;
  return hash % NEWS_FALLBACK_COVERS.length;
}

/** Selects an owned, topic-specific TecPey editorial image without implying publisher media rights. */
export function storyNewsThumbnail(input: {
  id: string;
  coinSymbols?: readonly string[];
  topicTags?: readonly string[];
}) {
  for (const rawSymbol of input.coinSymbols ?? []) {
    const symbol = rawSymbol.trim().toUpperCase();
    const slug = NEWS_COIN_IMAGE_SLUGS[symbol];
    if (slug) {
      return {
        src: `/images/tecpey/coins/${slug}.jpg`,
        subject: symbol,
        kind: "tecpey_editorial" as const,
      };
    }
  }
  for (const rawTopic of input.topicTags ?? []) {
    const topic = rawTopic.trim().toLowerCase();
    const cover = NEWS_TOPIC_COVERS[topic];
    if (cover) {
      return {
        src: `/images/tecpey/covers/${cover}`,
        subject: topic,
        kind: "tecpey_editorial" as const,
      };
    }
  }
  return {
    src: `/images/tecpey/covers/${NEWS_FALLBACK_COVERS[stableCoverIndex(input.id)]}`,
    subject: "market",
    kind: "tecpey_editorial" as const,
  };
}
export function finiteMarketNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
/** Never promote fetch time, absent values, or stale prices into market truth. */
export function storyMarketRows(payload: CurrencyListResponse | undefined, now: number): StoryMarket[] {
  const seen = new Set<string>();
  const maxAge = payload?.provenance?.provider?.toLowerCase() === "bitycle" ? BITYCLE_PUBLIC_MARKET_FRESHNESS_MS : PUBLIC_MARKET_FRESHNESS_MS;
  return (Array.isArray(payload?.data) ? payload.data : []).flatMap((row: MarketCurrency) => {
    const symbol = normalizeMarketSymbol(row.symbol ?? row.priceData?.symbol);
    const price = finiteMarketNumber(row.priceData?.last ?? row.priceData?.price ?? row.price);
    const updatedAt = row.marketDataUpdatedAt;
    const timestamp = typeof updatedAt === "string" ? Date.parse(updatedAt) : NaN;
    if (!/^[A-Z0-9]{1,20}$/.test(symbol) || seen.has(symbol) || price === null || price <= 0 || !Number.isFinite(timestamp) || timestamp > now + 30_000 || now - timestamp > maxAge) return [];
    seen.add(symbol);
    const cap = finiteMarketNumber(row.marketCap ?? row.priceData?.marketCap);
    const volume = finiteMarketNumber(row.volume ?? row.priceData?.quoteVolume ?? row.priceData?.volume);
    const parsedHigh24h = finiteMarketNumber(row.priceData?.high24h);
    const parsedLow24h = finiteMarketNumber(row.priceData?.low24h);
    const coherentRange = parsedHigh24h === null || parsedLow24h === null || parsedHigh24h >= parsedLow24h;
    const high24h = coherentRange ? parsedHigh24h : null;
    const low24h = coherentRange ? parsedLow24h : null;
    const rank = finiteMarketNumber(row.rank ?? row.priceData?.rank);
    return [{
      symbol,
      price,
      updatedAt: updatedAt!,
      change: finiteMarketNumber(row.priceData?.changePercent ?? row.changePercent),
      marketCap: cap !== null && cap > 0 ? cap : null,
      volume: volume !== null && volume > 0 ? volume : null,
      high24h: high24h !== null && high24h > 0 ? high24h : null,
      low24h: low24h !== null && low24h > 0 ? low24h : null,
      rank: rank !== null && Number.isInteger(rank) && rank > 0 ? rank : null,
    }];
  });
}
export function storyHeatmapRows(rows: StoryMarket[], metric: "marketCap" | "volume", excludeBtc: boolean) {
  return rows.filter(row => (!excludeBtc || row.symbol !== "BTC") && row[metric] !== null)
    .sort((a, b) => b[metric]! - a[metric]!).slice(0, 16);
}
export function storySafeLink(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u0020\\]/u.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
