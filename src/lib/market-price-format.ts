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
