import MarketsPageClient from "./MarketsPageClient";
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

export default async function MarketsPageRoute() {
  const initialCurrencies = await fetchInitialCurrencies();
  return <MarketsPageClient initialCurrencies={initialCurrencies} />;
}
