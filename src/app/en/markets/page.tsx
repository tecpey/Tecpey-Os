"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, TrendingUp } from "lucide-react";
import { EnglishShell } from "../components/EnglishUI";
import { getCurrencies } from "@/services/swap.services";
import { CryptoAssetIcon } from "@/components/crypto/CryptoAssetIcon";
import { getCoinVisualAsset } from "@/lib/coin-visual-assets";
import { coinSlugForSymbol } from "@/lib/news-taxonomy";

function formatUsdPrice(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: n < 1 ? 6 : n < 10 ? 4 : 2 }).format(n)}`;
}

export default function EnglishMarketsPage() {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["english-market-board", query],
    queryFn: () => getCurrencies(1, 30, query.trim()),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
  const rows = useMemo(() => (data?.data ?? []).filter((coin) => !["IRT", "USD"].includes(String(coin.symbol ?? ""))), [data]);

  return (
    <EnglishShell>
      <main className="relative bg-transparent px-3 pb-16 pt-32 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <label className="relative mx-auto block max-w-3xl">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search coin, name or symbol..." className="h-13 w-full rounded-full border border-cyan-300/25 bg-white/65 pl-14 pr-5 text-sm font-bold text-slate-950 outline-none shadow-[0_16px_50px_rgba(8,145,178,.10)] backdrop-blur-xl placeholder:text-slate-500 focus:border-cyan-400 dark:bg-slate-950/60 dark:text-white" />
          </label>

          <header className="pb-5 pt-5 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100"><TrendingUp className="h-4 w-4" />Live Market Board</div>
            <h1 className="mt-4 text-4xl font-black text-slate-950 dark:text-white sm:text-5xl">Online crypto market board</h1>
            <p className="mx-auto mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">Thirty major assets per page with live price, market movement and source-aware coin identity for faster research.</p>
          </header>

          <section className="overflow-x-auto rounded-[28px] border border-cyan-300/20 bg-white/58 shadow-[0_20px_70px_rgba(15,23,42,.08)] backdrop-blur-xl dark:bg-slate-950/58" aria-busy={isFetching}>
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.25fr_.9fr_.75fr_.65fr] gap-3 border-b border-cyan-300/15 bg-white/25 px-5 py-3 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.025] dark:text-slate-400"><span>Asset</span><span>Price</span><span>24h change</span><span>Rank</span></div>
              <div className="divide-y divide-cyan-300/15">
                {rows.map((coin, index) => {
                  const symbol = String(coin.symbol ?? "").toUpperCase();
                  const visual = getCoinVisualAsset({ symbol, name: coin.name, remoteIcon: typeof coin.icon === "string" ? coin.icon : undefined });
                  const change = Number(coin.priceData?.changePercent ?? coin.changePercent);
                  const price = coin.priceData?.last ?? coin.priceData?.price ?? coin.last ?? coin.price;
                  const rank = Number(coin.priceData?.rank ?? coin.rank ?? index + 1);
                  const slug = coinSlugForSymbol(symbol);
                  return <a key={`${coin.id ?? symbol}:${index}`} href={slug ? `/en/coins/${slug}` : "/en/coins"} className="grid grid-cols-[1.25fr_.9fr_.75fr_.65fr] items-center gap-3 px-5 py-3 text-sm transition hover:bg-cyan-500/[0.06]">
                    <span className="flex min-w-0 items-center gap-3"><CryptoAssetIcon symbol={symbol} name={coin.name} size="sm" assetSrc={visual.src} assetSource={visual.source} /><span className="min-w-0"><strong className="block truncate text-slate-950 dark:text-white">{symbol}</strong><span className="block truncate text-xs font-bold text-slate-500 dark:text-slate-400">{coin.name}</span></span></span>
                    <strong className="text-slate-800 dark:text-slate-100">{formatUsdPrice(price)}</strong>
                    <strong className={!Number.isFinite(change) ? "text-slate-500" : change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{Number.isFinite(change) ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}</strong>
                    <span className="font-black text-slate-500">#{Number.isFinite(rank) && rank > 0 ? rank : index + 1}</span>
                  </a>;
                })}
                {!rows.length && <div className="p-10 text-center text-sm font-black text-slate-500">{isFetching ? "Loading live market data..." : "Market data is temporarily unavailable."}</div>}
              </div>
            </div>
          </section>
        </div>
      </main>
    </EnglishShell>
  );
}
