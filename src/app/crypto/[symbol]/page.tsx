import CryptoPageClient from "./CryptoPageClient";
import { getCurrencies } from "@/services/swap.services";
import { normalizeMarketSymbol } from "@/lib/public-market-data";
import type { MarketCurrency } from "@/types/market";

type Props = { params: Promise<{ symbol: string }> };

async function fetchInitialCoin(symbol: string): Promise<MarketCurrency | undefined> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      getCurrencies(1, 5, symbol),
      new Promise<undefined>((resolve) => {
        timeoutId = setTimeout(() => resolve(undefined), 3_000);
      }),
    ]);

    return result?.data?.find(
      (coin) => normalizeMarketSymbol(coin.symbol) === symbol,
    );
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export default async function CryptoPageRoute({ params }: Props) {
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeMarketSymbol(rawSymbol);
  const initialCoin = symbol ? await fetchInitialCoin(symbol) : undefined;
  return <CryptoPageClient symbol={symbol || "BTC"} initialCoin={initialCoin} />;
}
