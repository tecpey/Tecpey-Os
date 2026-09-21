"use client";

import Link from "next/link";
import { ArrowRight, LineChart, ShieldCheck } from "lucide-react";
import { CalmLandingHero } from "@/components/home/CalmLandingHero";
import { CalmLandingClose } from "@/components/home/CalmProductSections";
import { HomeProductStory } from "@/components/home/HomeProductStory";
import { useBaseCurrenciesPrice } from "@/hooks/useBaseCurrenciesPrice";
import { TecpeyMark } from "@/components/brand/TecpeyMark";
import { CoinVisual } from "@/components/tecpey/CoinVisual";
import {
  CryptoNewsCenter,
  HomeAiMentorSpotlight,
  HomeLearningJourney,
} from "@/components/home/TecpeyHomeAI";
import { HomeDiscoveryStrip } from "@/components/home/HomeDiscoveryStrip";
import { LandingGrowthRadar } from "@/components/home/LandingGrowthRadar";
import type { LandingGrowthRadarModel } from "@/lib/landing-growth";
import { formatMarketPrice, normalizeMarketSymbol } from "@/lib/public-market-data";
import type { MarketCurrency } from "@/types/market";
import { EnglishShell } from "./components/EnglishUI";

function usd(value: unknown) {
  const formatted = formatMarketPrice(value, "en-US");
  return formatted ? `$${formatted}` : "Receiving live price";
}

function resolveUsdPrice(row: MarketCurrency) {
  return (
    row?.priceData?.price ??
    row?.priceData?.last ??
    row?.priceData?.lastPrice ??
    row?.priceData?.close ??
    row?.last ??
    row?.lastPrice ??
    row?.price ??
    0
  );
}

function MarketLearningSnapshot() {
  const { currencies } = useBaseCurrenciesPrice([
    "BTCUSDT",
    "ETHUSDT",
    "USDTUSDT",
    "TONUSDT",
  ]);
  const fallback: MarketCurrency[] = [
    { symbol: "BTC", name: "Bitcoin", priceData: { last: 0 } },
    { symbol: "ETH", name: "Ethereum", priceData: { last: 0 } },
    { symbol: "USDT", name: "Tether", priceData: { last: null } },
    { symbol: "TON", name: "Toncoin", priceData: { last: 0 } },
  ];
  const rows = (currencies.length ? currencies : fallback).slice(0, 4);

  return (
    <section
      data-home-section="market-snapshot"
      aria-labelledby="home-market-snapshot-title-en"
      className="bg-[color:var(--tp-bg)] px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
    >
      <div className="mx-auto grid max-w-7xl gap-8 border-y border-[color:var(--tp-border)] py-8 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:py-10">
        <div>
          <div className="tecpey-kicker">
            <LineChart className="h-4 w-4" aria-hidden="true" />
            Educational market view
          </div>
          <h2
            id="home-market-snapshot-title-en"
            className="mt-5 text-balance text-2xl font-black leading-10 text-[color:var(--tp-text)] sm:text-3xl"
          >
            See the price. Understand the context before you decide.
          </h2>
          <p className="mt-3 max-w-xl text-sm font-semibold leading-8 text-[color:var(--tp-muted)]">
            These prices are reference data for learning and virtual practice.
            A price move by itself is not a reason to buy or sell.
          </p>
          <p className="mt-3 max-w-xl text-xs font-semibold leading-6 text-[color:var(--tp-muted)]">
            There is no real money involved here; no real money, real profit or real trade takes place in it, and it does not sell buy or sell signals.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/en/markets" className="tecpey-action-secondary tecpey-action-compact">
              Explore markets
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/en/academy" className="tecpey-action-ghost tecpey-action-compact">
              Learn before trading
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[color:var(--tp-border)] bg-[color:var(--tp-card)] shadow-[var(--tp-shadow-card)]">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--tp-border)] bg-[color:var(--tp-surface)] px-4 py-3">
            <div className="flex items-center gap-3">
              <TecpeyMark
                alt="TecPey"
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl object-contain"
                loading="eager"
              />
              <div>
                <p className="text-xs font-black text-[color:var(--tp-text)]">USD/USDT</p>
                <p className="text-[10px] font-bold text-[color:var(--tp-muted)]">
                  Reference data · educational practice
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black text-emerald-700 dark:text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Learning
            </span>
          </div>

          <div role="list" className="grid sm:grid-cols-2">
            {rows.map((coin, index) => {
              const symbol = normalizeMarketSymbol(
                coin?.symbol ?? coin?.priceData?.symbol,
              );
              return (
                <div
                  key={`${symbol}-${index}`}
                  role="listitem"
                  className="grid grid-cols-[42px_1fr_auto] items-center gap-3 border-b border-[color:var(--tp-border)] p-4 sm:odd:border-e sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <CoinVisual
                    symbol={symbol}
                    name={coin.name || symbol}
                    faName={coin.faName || coin.name || symbol}
                    variant="avatar"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[color:var(--tp-text)]">
                      {coin.name || symbol}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold text-[color:var(--tp-muted)]">
                      {symbol}
                    </span>
                  </span>
                  <span
                    dir="ltr"
                    className="text-sm font-black tabular-nums text-[color:var(--tp-text)]"
                  >
                    {usd(resolveUsdPrice(coin))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function EnglishLandingClient({
  schema,
  growthRadar,
}: {
  schema: React.ReactNode;
  growthRadar?: LandingGrowthRadarModel;
}) {
  return (
    <EnglishShell>
      {schema}
      <CalmLandingHero locale="en" />
      <HomeDiscoveryStrip locale="en" radar={growthRadar} />
      <MarketLearningSnapshot />
      <CryptoNewsCenter locale="en" compact />
      <HomeAiMentorSpotlight locale="en" compact />
      <HomeLearningJourney locale="en" compact />
      <LandingGrowthRadar locale="en" radar={growthRadar} />
      <HomeProductStory locale="en" />
      <CalmLandingClose locale="en" />
    </EnglishShell>
  );
}
