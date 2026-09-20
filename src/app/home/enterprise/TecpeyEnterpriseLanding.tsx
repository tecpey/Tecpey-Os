"use client";

import Link from "next/link";
import { ArrowLeft, LineChart, ShieldCheck } from "lucide-react";
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

const academyHref = "/academy";

const marketRows = [
  { symbol: "BTC", name: "Bitcoin", fa: "بیت‌کوین" },
  { symbol: "ETH", name: "Ethereum", fa: "اتریوم" },
  { symbol: "USDT", name: "Tether", fa: "تتر" },
  { symbol: "TON", name: "Toncoin", fa: "تون‌کوین" },
];

function formatUsdPrice(value: unknown) {
  const formatted = formatMarketPrice(value, "en-US");
  return formatted ? `$${formatted}` : "در حال دریافت";
}

function normalizeSymbol(row: MarketCurrency) {
  return normalizeMarketSymbol(row?.symbol ?? row?.priceData?.symbol);
}

function resolveUsdLast(row: MarketCurrency) {
  return Number(
    row?.priceData?.last ??
      row?.priceData?.price ??
      row?.priceData?.lastPrice ??
      row?.priceData?.close ??
      row?.last ??
      row?.lastPrice ??
      row?.price ??
      0,
  );
}

function getMarketFallback(): MarketCurrency[] {
  return marketRows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    faName: row.fa,
    priceData: { last: null, changePercent: null },
  }));
}

function Hero() {
  return <CalmLandingHero locale="fa" />;
}

function MarketLearningSnapshot() {
  const { currencies } = useBaseCurrenciesPrice(["BTCUSDT", "ETHUSDT", "USDTUSDT", "TONUSDT"]);
  const rows = (currencies.length ? currencies : getMarketFallback()).slice(0, 4);

  return (
    <section
      data-home-section="market-snapshot"
      aria-labelledby="home-market-snapshot-title"
      className="bg-[color:var(--tp-bg)] px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
    >
      <div className="mx-auto grid max-w-7xl gap-8 border-y border-[color:var(--tp-border)] py-8 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:py-10">
        <div>
          <div className="tecpey-kicker">
            <LineChart className="h-4 w-4 text-[color:var(--tp-primary)]" aria-hidden="true" />
            نمای آموزشی بازار
          </div>
          <h2
            id="home-market-snapshot-title"
            className="mt-5 text-balance text-2xl font-black leading-10 text-[color:var(--tp-text)] sm:text-3xl"
          >
            قیمت را ببین؛ اما قبل از تصمیم، زمینه را بفهم.
          </h2>
          <p className="mt-3 max-w-xl text-sm font-semibold leading-8 text-[color:var(--tp-muted)]">
            این قیمت‌ها مرجع آموزشی برای آکادمی و تمرین مجازی‌اند. تغییر قیمت به‌تنهایی دلیل خرید یا فروش نیست.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/markets" className="tecpey-action-secondary tecpey-action-compact">
              مشاهده بازارها
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href={academyHref} className="tecpey-action-ghost tecpey-action-compact">
              یادگیری قبل از معامله
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
                <p className="text-xs font-black text-[color:var(--tp-text)]">USD / USDT</p>
                <p className="text-[10px] font-bold text-[color:var(--tp-muted)]">داده مرجع · تمرین آموزشی</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black text-emerald-700 dark:text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              آموزشی
            </span>
          </div>

          <dl className="grid sm:grid-cols-2">
            {rows.map((row, index) => {
              const symbol = normalizeSymbol(row);
              const faName =
                row?.faName ??
                row?.fa ??
                ({ BTC: "بیت‌کوین", ETH: "اتریوم", USDT: "تتر", TON: "تون‌کوین" } as Record<string, string>)[symbol] ??
                symbol;
              const name = row?.name ?? symbol;
              const price = resolveUsdLast(row);

              return (
                <div
                  key={`${symbol}-${index}`}
                  className="grid grid-cols-[42px_1fr_auto] items-center gap-3 border-b border-[color:var(--tp-border)] p-4 odd:sm:border-e sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <CoinVisual symbol={symbol} name={name} faName={faName} variant="avatar" />
                  <dt className="min-w-0">
                    <span className="block truncate text-sm font-black text-[color:var(--tp-text)]">{faName}</span>
                    <span dir="ltr" className="mt-0.5 block text-[10px] font-bold text-[color:var(--tp-muted)]">{symbol}</span>
                  </dt>
                  <dd dir="ltr" className="text-sm font-black tabular-nums text-[color:var(--tp-text)]">
                    {formatUsdPrice(price)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}

export default function TecpeyEnterpriseLanding({
  growthRadar,
}: {
  growthRadar?: LandingGrowthRadarModel;
}) {
  return (
    <main className="tecpey-enterprise min-h-screen bg-[color:var(--tp-bg)] text-[color:var(--tp-text)]">
      <Hero />
      <HomeDiscoveryStrip locale="fa" radar={growthRadar} />
      <MarketLearningSnapshot />
      <CryptoNewsCenter locale="fa" compact />
      <HomeAiMentorSpotlight locale="fa" compact />
      <HomeLearningJourney locale="fa" compact />
      <LandingGrowthRadar locale="fa" radar={growthRadar} />
      <HomeProductStory locale="fa" />
      <CalmLandingClose locale="fa" />
    </main>
  );
}
