import type { Metadata } from "next";
import { getAlternateLocales } from "@/lib/seo";
import EnglishMarketsPageClient from "./MarketsPageClient";
import { getCurrencies, type CurrencyListResult } from "@/services/swap.services";

// getCurrencies() already degrades to a public-source fallback and never
// throws (see swap.services.ts), but the external backend it calls has no
// fetch timeout of its own. Race it against a local timeout so a slow or
// unreachable backend can never hold up this page's first byte beyond a few
// seconds — worst case, the client falls back to its normal client-side
// fetch exactly as it did before this change.
async function fetchInitialCurrencies(): Promise<CurrencyListResult | undefined> {
  return Promise.race([
    getCurrencies(1, 30, ""),
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), 3_000);
    }),
  ]);
}

export default async function EnglishMarketsPageRoute() {
  const initialCurrencies = await fetchInitialCurrencies();
  return <EnglishMarketsPageClient initialCurrencies={initialCurrencies} />;
}

export const metadata: Metadata = {
  title: "TecPey Markets | Live crypto prices and market data",
  description: "Review live crypto prices and market data on TecPey before making a trading or transfer decision.",
  alternates: { canonical: "https://tecpey.ir/en/markets", languages: getAlternateLocales("/markets", "/en/markets") },
};
