import CryptoPageClient from "./CryptoPageClient";
import { getCurrencies } from "@/services/swap.services";
import type { MarketCurrency } from "@/types/market";

type Props = { params: Promise<{ symbol: string }> };

// getCurrencies() already degrades to a public-source fallback and never
// throws (see swap.services.ts), but the external backend it calls has no
// fetch timeout of its own. Race it against a local timeout so a slow or
// unreachable backend can never hold up this page's first byte beyond a few
// seconds — worst case, the client falls back to its normal client-side
// price hook exactly as it did before this change.
async function fetchInitialCoin(symbol: string): Promise<MarketCurrency | undefined> {
  const result = await Promise.race([
    getCurrencies(1, 1, symbol),
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), 3_000);
    }),
  ]);
  return result?.data?.[0];
}

export default async function CryptoPageRoute({ params }: Props) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toLocaleUpperCase();
  const initialCoin = await fetchInitialCoin(symbol);
  return <CryptoPageClient symbol={symbol} initialCoin={initialCoin} />;
}
