"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, TrendingUp } from "lucide-react";
import { EnglishShell } from "../components/EnglishUI";
import { getCurrencies, type CurrencyListResult } from "@/services/swap.services";
import { CryptoAssetIcon } from "@/components/crypto/CryptoAssetIcon";
import IranMarketIntelligence from "@/components/markets/IranMarketIntelligence";
import MarketFreshnessStatus from "@/components/markets/MarketFreshnessStatus";
import { useMarketFreshnessClock } from "@/hooks/useMarketFreshnessClock";
import MarketDataProvenance from "@/components/markets/MarketDataProvenance";
import { getCoinVisualAsset } from "@/lib/coin-visual-assets";
import { coinSlugForSymbol } from "@/lib/news-taxonomy";
import { publicMarketQuoteCurrency, selectFreshPublicMarketRows, normalizeMarketSymbol } from "@/lib/public-market-data";

function useDebouncedValue<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatQuotedPrice(value: unknown, quote: "USD" | "USDT" | null) {
  const n = Number(value ?? 0);
  if (!quote || !Number.isFinite(n) || n <= 0) return "—";
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: n < 1 ? 6 : n < 10 ? 4 : 2 }).format(n);
  return quote === "USD" ? `$${amount}` : `${amount} USDT`;
}

function formatVolume(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export default function EnglishMarketsPageClient({
  initialCurrencies,
}: {
  initialCurrencies: CurrencyListResult | undefined;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 400);
  // initialCurrencies was prefetched on the server for exactly this default
  // view (empty query) — see src/app/en/markets/page.tsx.
  const now = useMarketFreshnessClock();
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["english-market-board", debouncedQuery],
    queryFn: async () => {
      const result = await getCurrencies(1, 30, debouncedQuery.trim());
      if (!result.data.length && !result.provenance) throw new Error("market_data_unavailable");
      return result;
    },
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });

  // Deliberately not passed as useQuery's own `initialData`: the QueryClient
  // in src/app/providers.tsx is a module-level singleton shared by every
  // request the server process handles, so seeding its cache from one
  // request's SSR snapshot would leak into another request's cache lookup
  // and diverge from that request's own client-side hydration — a real
  // hydration mismatch, reproduced while building this. Used here only as a
  // plain rendering fallback, which is deterministic per-request since it
  // comes straight from a prop.
  const effectiveResult = data ?? (debouncedQuery.trim() === "" ? initialCurrencies : undefined);
  const rows = useMemo(() => (effectiveResult?.data ?? []).filter((coin) => !["IRT", "USD"].includes(String(coin.symbol ?? ""))), [effectiveResult]);

  const fresh = new Set(selectFreshPublicMarketRows(rows, now));

  return (
    <EnglishShell>
      <main className="relative bg-transparent pb-16 pt-32">
        <div className="px-3 sm:px-5 lg:px-8">
          <div className="mx-auto max-w-[1480px]">
            <label className="relative mx-auto block max-w-3xl">
              <span className="sr-only">Search markets</span>
              <Search aria-hidden="true" className="pointer-events-none absolute start-5 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-500" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search coin, name or symbol..." className="h-13 w-full rounded-full border border-cyan-300/25 bg-white/65 ps-14 pe-5 text-sm font-bold text-slate-950 outline-none shadow-[0_16px_50px_rgba(8,145,178,.10)] backdrop-blur-xl placeholder:text-slate-500 focus-visible:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500/30 dark:bg-slate-950/60 dark:text-white" />
            </label>

            <header className="pb-5 pt-5 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100"><TrendingUp aria-hidden="true" className="h-4 w-4" />Market snapshots</div>
              <h1 className="mt-4 text-4xl font-black text-slate-950 dark:text-white sm:text-5xl">Online crypto market board</h1>
              <p className="mx-auto mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">Thirty major assets per page with available prices, market movement and source-aware coin identity for faster research.</p>
            </header>
          </div>
        </div>

        <IranMarketIntelligence />

        <div className="px-3 sm:px-5 lg:px-8">
          <div className="mx-auto max-w-[1480px]">
            <MarketFreshnessStatus rows={rows} now={now} locale="en" isFetching={isFetching} isError={isError} onRefresh={() => { void refetch(); }} />
            <section className="overflow-hidden rounded-[28px] border border-cyan-300/20 bg-white/58 shadow-[0_20px_70px_rgba(15,23,42,.08)] backdrop-blur-xl dark:bg-slate-950/58" aria-busy={isFetching} aria-label="Market assets">
              <div className="hidden grid-cols-[1.25fr_.9fr_.75fr_.75fr_.55fr] gap-3 border-b border-cyan-300/15 bg-white/25 px-5 py-3 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.025] dark:text-slate-400 lg:grid">
                <span>Asset</span><span>Price</span><span>24h change</span><span>Volume</span><span>Rank</span>
              </div>
              <div className="divide-y divide-cyan-300/15">
                {rows.map((coin, index) => {
                  const symbol = normalizeMarketSymbol(coin.symbol ?? coin.priceData?.symbol);
                  const visual = getCoinVisualAsset({ symbol, name: coin.name, remoteIcon: typeof coin.icon === "string" ? coin.icon : undefined });
                  const isFresh = fresh.has(coin);
                  const change = isFresh ? Number(coin.priceData?.changePercent ?? coin.changePercent) : Number.NaN;
                  const price = coin.priceData?.last ?? coin.priceData?.price ?? coin.last ?? coin.price;
                  const volume = isFresh ? Number(coin.priceData?.volume) : Number.NaN;
                  const rank = Number(coin.priceData?.rank ?? coin.rank ?? index + 1);
                  const slug = coinSlugForSymbol(symbol);
                  const href = slug ? `/en/coins/${slug}` : "/en/coins";
                  const changeClass = !Number.isFinite(change) ? "text-slate-500" : change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
                  const changeText = Number.isFinite(change) ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%` : "—";
                  const priceText = isFresh ? formatQuotedPrice(price, publicMarketQuoteCurrency(coin.marketDataSource)) : "—";
                  const volumeText = isFresh ? formatVolume(volume) : "—";
                  const rankText = `#${Number.isFinite(rank) && rank > 0 ? rank : index + 1}`;

                  return (
                    <a data-market-asset={symbol} data-price-current={isFresh} key={`${coin.id ?? symbol}:${index}`} href={href} className="group block min-w-0 px-4 py-4 transition-colors hover:bg-cyan-50/70 focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-700 dark:hover:bg-cyan-950/25 dark:focus-visible:outline-cyan-300 lg:grid lg:min-h-[62px] lg:grid-cols-[1.25fr_.9fr_.75fr_.75fr_.55fr] lg:items-center lg:gap-3 lg:px-5 lg:py-2">
                      <div className="lg:hidden">
                        <div className="flex min-w-0 items-start justify-between gap-4">
                          <span className="flex min-w-0 items-center gap-3"><CryptoAssetIcon symbol={symbol} name={coin.name} size="sm" assetSrc={visual.src} assetSource={visual.source} /><span className="min-w-0"><strong className="block truncate text-sm text-slate-950 dark:text-white">{symbol}</strong><span className="mt-0.5 block truncate text-xs font-bold text-slate-500 dark:text-slate-400">{coin.name}</span></span></span>
                          <span className="min-w-0 shrink-0 text-end"><span className="block text-[10px] font-semibold leading-5 text-slate-500 dark:text-slate-400">Price</span><strong aria-label={isFresh ? undefined : "Price unavailable"} className="block whitespace-nowrap text-sm text-slate-900 dark:text-white">{priceText}</strong></span>
                        </div>
                        <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-cyan-300/15 bg-white/45 p-3 dark:bg-white/[0.025]">
                          <div className="min-w-0"><dt className="text-[10px] font-semibold leading-5 text-slate-500 dark:text-slate-400">Change</dt><dd className={`mt-0.5 truncate text-xs font-black ${changeClass}`}>{changeText}</dd></div>
                          <div className="min-w-0"><dt className="text-[10px] font-semibold leading-5 text-slate-500 dark:text-slate-400">Volume</dt><dd className="mt-0.5 truncate text-xs font-bold text-slate-800 dark:text-slate-200">{volumeText}</dd></div>
                          <div className="min-w-0"><dt className="text-[10px] font-semibold leading-5 text-slate-500 dark:text-slate-400">Rank</dt><dd className="mt-0.5 truncate text-xs font-black text-slate-700 dark:text-slate-300">{rankText}</dd></div>
                        </dl>
                        <span className="mt-3 flex min-h-11 items-center justify-end text-xs font-black text-cyan-800 dark:text-cyan-200">View asset <span aria-hidden="true" className="ms-2">→</span></span>
                      </div>

                      <span className="hidden min-w-0 items-center gap-3 lg:flex"><CryptoAssetIcon symbol={symbol} name={coin.name} size="sm" assetSrc={visual.src} assetSource={visual.source} /><span className="min-w-0"><strong className="block truncate text-slate-950 dark:text-white">{symbol}</strong><span className="block truncate text-xs font-bold text-slate-500 dark:text-slate-400">{coin.name}</span></span></span>
                      <strong aria-label={isFresh ? undefined : "Price unavailable"} className="hidden text-slate-800 dark:text-slate-100 lg:block">{priceText}</strong>
                      <strong className={`hidden lg:block ${changeClass}`}>{changeText}</strong>
                      <span className="hidden font-bold text-slate-600 dark:text-slate-300 lg:block">{volumeText}</span>
                      <span className="hidden font-black text-slate-500 lg:block">{rankText}</span>
                    </a>
                  );
                })}
                {!rows.length && <div className="p-10 text-center text-sm font-black text-slate-500">{isFetching ? "Loading market data..." : "Market data is temporarily unavailable."}</div>}
              </div>
            </section>

            <MarketDataProvenance provenance={effectiveResult?.provenance} locale="en" />
          </div>
        </div>
      </main>
    </EnglishShell>
  );
}
