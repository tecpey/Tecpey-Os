"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search, TrendingUp, ShieldCheck, WalletCards } from "lucide-react";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";
import { EnglishShell } from "../components/EnglishUI";
import { NeonIcon } from "@/components/tecpey/NeonIcon";

function formatUsdPrice(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "Receiving live price";
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 }).format(n)}`;
}

export default function EnglishMarketsPage() {
  const [query, setQuery] = useState("");
  const initialPairs = ["BTCUSDT", "ETHUSDT", "USDTUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "TONUSDT", "ADAUSDT"];
  const { currencies, isLoading, isFetchingNextPage, setSearchQuery } = useBaseCurrenciesPrice(initialPairs);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query, setSearchQuery]);

  const visibleCurrencies = useMemo(() => {
    return (currencies ?? []).filter((coin: any) => !["IRT", "USD"].includes(coin?.symbol));
  }, [currencies]);

  return (
    <EnglishShell>
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-8 lg:grid-cols-[.9fr_1.1fr]">
            <div className="text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">
                <TrendingUp className="h-4 w-4" />
                Live Market Board
              </div>
              <h1 className="mt-6 text-4xl font-black leading-tight text-white sm:text-6xl">
                Online crypto market board
              </h1>
              <p className="mt-5 max-w-2xl text-lg font-bold leading-9 text-slate-300">
                Live crypto prices from TecPey market services. Search, compare and review major assets before trading.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: TrendingUp, title: "Live prices", text: "Updated market data" },
                  { icon: ShieldCheck, title: "Risk-aware", text: "Review before trading" },
                  { icon: WalletCards, title: "USDT view", text: "Prices shown in USD/USDT" },
                ].map((item) => (
                  <div key={item.title} className="rounded-3xl border border-cyan-300/15 bg-white/[0.04] p-4">
                    <NeonIcon icon={item.icon} size="sm" />
                    <h3 className="mt-3 font-black text-white">{item.title}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-400">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[34px] border border-cyan-300/20 bg-[#06111f] p-3 shadow-[0_30px_90px_rgba(34,211,238,.16)] sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white">TecPey Market Board</h2>
                  <p className="mt-1 text-sm font-bold text-slate-400">Live crypto market list · USD/USDT</p>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search coin or symbol..."
                    className="w-full rounded-2xl border border-cyan-300/25 bg-white/5 py-3 pl-11 pr-4 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300 sm:w-72"
                  />
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-3xl border border-white/10">
                <div className="grid grid-cols-[1.15fr_.85fr_.58fr] gap-1 bg-white/5 px-2 py-2 text-[10px] sm:px-4 sm:py-3 sm:text-xs font-black uppercase tracking-wide text-slate-400">
                  <span>Asset</span>
                  <span>Price / USD</span>
                  <span className="text-right">Change</span>
                </div>
                <div className="divide-y divide-white/10">
                  {((isLoading && !visibleCurrencies.length ? Array.from({ length: 8 }) : visibleCurrencies.slice(0, 12))).map((coin: any, index: number) => {
                    const symbol = coin?.symbol ?? coin?.priceData?.symbol?.replace("USDT", "") ?? "";
                    const name = coin?.name ?? symbol;
                    const rawSymbol = coin?.symbol ?? coin?.priceData?.symbol?.replace("USDT", "") ?? "";
                    const normalizedSymbol = String(rawSymbol).replace("USDT", "");
                    const price = normalizedSymbol === "USDT" ? 1 : (coin?.priceData?.last ?? coin?.priceData?.price ?? coin?.priceData?.lastPrice ?? coin?.priceData?.close ?? coin?.last ?? coin?.lastPrice ?? coin?.price ?? 0);
                    const change = Number(coin?.priceData?.changePercent ?? coin?.changePercent ?? 0);
                    if (!coin?.symbol && isLoading) {
                      return (
                        <div key={index} className="grid grid-cols-[1.15fr_.85fr_.58fr] gap-1 px-2 py-2 sm:px-4 sm:py-3">
                          <span className="h-5 rounded-full bg-white/10" />
                          <span className="h-5 rounded-full bg-white/10" />
                          <span className="h-5 rounded-full bg-white/10" />
                        </div>
                      );
                    }
                    return (
                      <div key={`${symbol}-${index}`} className="grid grid-cols-[1.15fr_.85fr_.58fr] items-center gap-1 px-2 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
                        <div>
                          <div className="truncate font-black text-white">{symbol}</div>
                          <div className="truncate text-[10px] font-bold text-slate-400 sm:text-xs">{name}</div>
                        </div>
                        <div className="truncate text-[11px] font-black text-slate-100 sm:text-sm">{formatUsdPrice(price)}</div>
                        <div className={`text-right text-[11px] font-black sm:text-sm ${change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {Number.isFinite(change) ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-4 text-xs font-bold text-slate-500">
                {isFetchingNextPage ? "Refreshing market data..." : "USD/USDT prices are informational and may change quickly."}
              </p>
            </div>
          </div>
        </div>
      </section>
    </EnglishShell>
  );
}
