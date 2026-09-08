import type { MarketCurrency } from "@/types/market";

export const PUBLIC_MARKET_SOURCE = "CoinGecko";
export const PUBLIC_MARKET_SOURCE_URL = "https://www.coingecko.com/";
export const BITYCLE_MARKET_SOURCE = "Bitycle";
export const BITYCLE_MARKET_SOURCE_URL = "https://bitycle.com/";
export const PUBLIC_MARKET_FRESHNESS_MS = 5 * 60_000;
export const BITYCLE_PUBLIC_MARKET_FRESHNESS_MS = 2 * 60_000;

export type MarketPriceLocale = "fa-IR" | "en-US";

export function normalizeMarketSymbol(value: unknown): string {
  const symbol = String(value ?? "").trim().toUpperCase();
  if (!symbol || symbol === "USDT") return symbol;

  return symbol.replace(/[_/-]?USDT$/i, "");
}

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

type BitycleCurrency = {
  name?: unknown;
  symbol?: unknown;
  locale_name?: unknown;
  logo?: unknown;
};

type BitycleCurrencyInfo = {
  currency?: BitycleCurrency;
  rank?: unknown;
  price?: unknown;
  open_24h?: unknown;
  market_cap?: unknown;
  max_supply?: unknown;
  total_supply?: unknown;
  available_supply?: unknown;
  dominance?: unknown;
  volume_24h?: unknown;
  price_quote?: unknown;
  updated_at?: unknown;
};

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: unknown, max = 100): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeHttpsUrl(value: unknown): string | undefined {
  const url = cleanText(value, 500);
  return /^https:\/\//i.test(url) ? url : undefined;
}

function percentChange(current: number, open: number | null): number | null {
  if (open === null || open <= 0) return null;
  return ((current - open) / open) * 100;
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

export function normalizeBitycleCurrencyInfo(
  value: unknown,
  observedAt = new Date().toISOString(),
): MarketCurrency[] {
  const payload = value && typeof value === "object" && "data" in value
    ? (value as { data?: unknown }).data
    : value;
  if (!Array.isArray(payload)) return [];

  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs) || Date.now() - observedMs > BITYCLE_PUBLIC_MARKET_FRESHNESS_MS) {
    return [];
  }

  return payload.flatMap((entry): MarketCurrency[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as BitycleCurrencyInfo;
    const currency = row.currency && typeof row.currency === "object" ? row.currency : {};
    const symbol = cleanText(currency.symbol, 20).toUpperCase();
    const name = cleanText(currency.name, 120);
    const price = finiteNumber(row.price);
    const quote = cleanText(row.price_quote, 20).toUpperCase() || "USDT";

    if (!symbol || !name || price === null || price <= 0) return [];

    const open24h = finiteNumber(row.open_24h);
    const change = percentChange(price, open24h);
    const volume = finiteNumber(row.volume_24h);
    const marketCap = finiteNumber(row.market_cap);
    const rank = finiteNumber(row.rank);

    return [{
      id: `bitycle:${symbol.toLowerCase()}`,
      symbol,
      name,
      icon: safeHttpsUrl(currency.logo),
      marketCap,
      volume,
      changePercent: change,
      price,
      rank,
      priceData: {
        symbol: `${symbol}${quote}`,
        last: price,
        price,
        lastPrice: price,
        close: price,
        open: open24h,
        changePercent: change,
        volume,
        quoteVolume: volume,
        rank,
        timestamp: observedAt,
        marketCap,
        circulatingSupply: finiteNumber(row.available_supply),
        totalSupply: finiteNumber(row.total_supply),
        maxSupply: finiteNumber(row.max_supply),
        dominance: finiteNumber(row.dominance),
      },
      marketDataSource: BITYCLE_MARKET_SOURCE,
      marketDataSourceUrl: BITYCLE_MARKET_SOURCE_URL,
      marketDataUpdatedAt: observedAt,
    }];
  });
}
