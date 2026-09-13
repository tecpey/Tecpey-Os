import type { MarketCurrency, CurrencyListResponse } from "@/types/market";
import { BITYCLE_PUBLIC_MARKET_FRESHNESS_MS, PUBLIC_MARKET_FRESHNESS_MS, normalizeMarketSymbol } from "@/lib/public-market-data";

export type StoryMarket = { symbol: string; price: number; change: number | null; marketCap: number | null; volume: number | null; updatedAt: string };
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
    return [{ symbol, price, updatedAt: updatedAt!, change: finiteMarketNumber(row.priceData?.changePercent ?? row.changePercent), marketCap: cap !== null && cap > 0 ? cap : null, volume: volume !== null && volume > 0 ? volume : null }];
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
