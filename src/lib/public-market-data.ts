import type { MarketCurrency } from "@/types/market";

export const PUBLIC_MARKET_SOURCE = "CoinGecko";
export const PUBLIC_MARKET_SOURCE_URL = "https://www.coingecko.com/";
export const PUBLIC_MARKET_FRESHNESS_MS = 5 * 60_000;

export type MarketPriceLocale = "fa-IR" | "en-US";

export function formatMarketPrice(
  value: unknown,
  locale: MarketPriceLocale,
): string | null {
  const price = Number(value ?? 0);
  if (!Number.isFinite(price) || price <= 0) return null;

  return new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 8,
    useGrouping: true,
  }).format(price);
}

type CoinGeckoMarket = {
  id?: unknown;
  symbol?: unknown;
  name?: unknown;
  image?: unknown;
  current_price?: unknown;
  market_cap?: unknown;
  market_cap_rank?: unknown;
  total_volume?: unknown;
  price_change_percentage_24h?: unknown;
  high_24h?: unknown;
  low_24h?: unknown;
  circulating_supply?: unknown;
  total_supply?: unknown;
  max_supply?: unknown;
  fully_diluted_valuation?: unknown;
  last_updated?: unknown;
};

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: unknown, max = 100): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeCoinGeckoMarkets(value: unknown): MarketCurrency[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): MarketCurrency[] => {
    if (!entry || typeof entry !== "object") return [];
    const coin = entry as CoinGeckoMarket;
    const id = cleanText(coin.id, 120);
    const symbol = cleanText(coin.symbol, 20).toUpperCase();
    const name = cleanText(coin.name, 120);
    const price = finiteNumber(coin.current_price);
    const updatedAt = cleanText(coin.last_updated, 40);
    const updatedMs = Date.parse(updatedAt);

    if (!id || !symbol || !name || price === null || price < 0) return [];
    if (!Number.isFinite(updatedMs) || Date.now() - updatedMs > PUBLIC_MARKET_FRESHNESS_MS) {
      return [];
    }

    const rank = finiteNumber(coin.market_cap_rank);
    const volume = finiteNumber(coin.total_volume);
    const marketCap = finiteNumber(coin.market_cap);
    const change = finiteNumber(coin.price_change_percentage_24h);
    const icon = cleanText(coin.image, 500);

    return [{
      id: `coingecko:${id}`,
      symbol,
      name,
      icon: /^https:\/\//.test(icon) ? icon : undefined,
      marketCap,
      volume,
      changePercent: change,
      price,
      rank,
      priceData: {
        symbol: `${symbol}USDT`,
        last: price,
        price,
        lastPrice: price,
        close: price,
        changePercent: change,
        volume,
        quoteVolume: volume,
        low24h: finiteNumber(coin.low_24h),
        high24h: finiteNumber(coin.high_24h),
        rank,
        timestamp: updatedAt,
        marketCap,
        circulatingSupply: finiteNumber(coin.circulating_supply),
        totalSupply: finiteNumber(coin.total_supply),
        maxSupply: finiteNumber(coin.max_supply),
        fdv: finiteNumber(coin.fully_diluted_valuation),
      },
      marketDataSource: PUBLIC_MARKET_SOURCE,
      marketDataSourceUrl: PUBLIC_MARKET_SOURCE_URL,
      marketDataUpdatedAt: updatedAt,
    }];
  });
}
