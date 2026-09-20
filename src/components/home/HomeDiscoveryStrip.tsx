"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Coins, Newspaper, Sparkles, Wrench } from "lucide-react";
import { CoinVisual } from "@/components/tecpey/CoinVisual";
import type { ContentLocale } from "@/lib/content-growth";
import type { LandingGrowthRadarModel } from "@/lib/landing-growth";

type DiscoveryMode = "coins" | "tools";

const copy = {
  fa: {
    badge: "کشف امروز",
    title: "کوین‌ها، ابزارها و خبرها؛ بدون شلوغی",
    partialTitle: "مسیرهای معتبرِ امروز",
    description: "چند مسیر منتخب برای ادامهٔ بررسی؛ فشرده، قابل پیگیری و به‌روز.",
    partialDescription: "فقط مسیرهای دارای شواهد معتبر نمایش داده می‌شوند؛ موارد دیگر پس از تکمیل بررسی اضافه خواهند شد.",
    groupLabel: "انتخاب نوع مسیرهای کشف",
    coins: "کوین‌ها",
    tools: "ابزارها",
    news: "خبرها",
    rank: "مسیر",
    score: "شاخص",
    updated: "به‌روزرسانی شواهد",
    ready: "آماده",
    degraded: "نیازمند تکمیل",
    available: "مسیر موجود",
    viewCoins: "همه کوین‌ها",
    viewTools: "همه ابزارها",
    viewNews: "خبرهای روز",
    educational: "انتخاب آموزشی؛ نه توصیه مالی.",
  },
  en: {
    badge: "Explore today",
    title: "Coins, tools and news—without the noise",
    partialTitle: "Verified routes available today",
    description: "A small set of current routes for deeper research, kept compact and traceable.",
    partialDescription: "Only routes backed by current evidence are shown; additional routes appear after review is complete.",
    groupLabel: "Choose a discovery route type",
    coins: "Coins",
    tools: "Tools",
    news: "News",
    rank: "Route",
    score: "Indicator",
    updated: "Evidence updated",
    ready: "Ready",
    degraded: "Needs review",
    available: "routes available",
    viewCoins: "All coins",
    viewTools: "All tools",
    viewNews: "Live news",
    educational: "Educational selection; not financial advice.",
  },
} as const;

function rankLabel(rank: number, locale: ContentLocale) {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(rank);
}

function evidenceDate(value: string, locale: ContentLocale) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function HomeDiscoveryStrip({
  locale,
  radar,
}: {
  locale: ContentLocale;
  radar?: LandingGrowthRadarModel;
}) {
  const [mode, setMode] = useState<DiscoveryMode>("coins");
  const strings = copy[locale];
  const isFa = locale === "fa";
  const coins = radar?.coins.slice(0, 5) ?? [];
  const tools = radar?.tools.slice(0, 5) ?? [];
  const hasAnyItems = coins.length > 0 || tools.length > 0;
  const isPartial = coins.length < 5 || tools.length < 5;
  const activeMode: DiscoveryMode = mode === "coins" && coins.length > 0
    ? "coins"
    : mode === "tools" && tools.length > 0
      ? "tools"
      : coins.length > 0
        ? "coins"
        : "tools";
  const activeItemCount = activeMode === "coins" ? coins.length : tools.length;

  if (!hasAnyItems) return null;

  const listHref = activeMode === "coins"
    ? isFa ? "/coins" : "/en/coins"
    : isFa ? "/trading-tools" : "/en/trading-tools";
  const listLabel = activeMode === "coins" ? strings.viewCoins : strings.viewTools;
  const newsHref = isFa ? "/crypto-news" : "/en/crypto-news";
  const Arrow = isFa ? ArrowLeft : ArrowRight;

  return (
    <section
      data-home-section="discovery"
      aria-labelledby={`home-discovery-title-${locale}`}
      className="tecpey-section relative z-10 py-5 sm:px-6 sm:py-7 lg:px-8"
    >
      <div className="tecpey-section-inner overflow-hidden rounded-[26px] border border-cyan-300/20 bg-[color:var(--tp-card)] p-3 shadow-[0_18px_55px_rgba(8,145,178,.10)] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-black text-cyan-800 dark:text-cyan-100 sm:text-xs">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {strings.badge}
            </div>
            <h2
              id={`home-discovery-title-${locale}`}
              className="mt-2 text-base font-black leading-6 text-[color:var(--tp-text)] sm:text-xl"
            >
              {isPartial ? strings.partialTitle : strings.title}
            </h2>
            <p className="mt-1 text-[11px] font-bold leading-5 text-[color:var(--tp-muted)] sm:text-sm">
              {isPartial ? strings.partialDescription : strings.description}
            </p>
          </div>

          <div
            role="group"
            aria-label={strings.groupLabel}
            className="grid grid-cols-3 rounded-2xl border border-cyan-300/15 bg-slate-950/[0.035] p-1 dark:bg-white/[0.035] sm:w-[360px]"
          >
            {(["coins", "tools"] as const).map((value) => {
              const selected = activeMode === value;
              const available = value === "coins" ? coins.length > 0 : tools.length > 0;
              const Icon = value === "coins" ? Coins : Wrench;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={!available}
                  disabled={!available}
                  onClick={() => setMode(value)}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-45 ${
                    selected
                      ? "bg-cyan-700 text-white shadow-sm dark:bg-cyan-500 dark:text-slate-950"
                      : "text-[color:var(--tp-muted)] hover:bg-cyan-500/10 hover:text-[color:var(--tp-text)]"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {value === "coins" ? strings.coins : strings.tools}
                </button>
              );
            })}
            <Link
              href={newsHref}
              aria-label={strings.viewNews}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-xs font-black text-[color:var(--tp-muted)] transition hover:bg-cyan-500/10 hover:text-[color:var(--tp-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <Newspaper className="h-4 w-4" aria-hidden="true" />
              {strings.news}
            </Link>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-5 sm:grid-cols-5 sm:gap-3" aria-live="polite">
          {activeMode === "coins"
            ? coins.map((coin, index) => {
                const rank = index + 1;
                const href = isFa ? `/coins/${coin.slug}` : `/en/coins/${coin.slug}`;
                const name = isFa ? coin.faName : coin.name;
                return (
                  <Link
                    key={coin.symbol}
                    href={href}
                    aria-label={`${name} (${coin.symbol})`}
                    className="tecpey-pressable group flex min-h-24 min-w-0 flex-col items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-500/[0.045] px-2 py-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:min-h-[112px]"
                  >
                    <CoinVisual
                      symbol={coin.symbol}
                      slug={coin.slug}
                      name={coin.name}
                      faName={coin.faName}
                      locale={locale}
                      variant="avatar"
                    />
                    <span className="mt-1.5 truncate text-xs font-black text-[color:var(--tp-text)]">
                      {coin.symbol}
                    </span>
                    <span className="sr-only">{strings.rank} {rankLabel(rank, locale)}</span>
                  </Link>
                );
              })
            : tools.map((tool, index) => {
                const rank = index + 1;
                const href = isFa ? `/trading-tools/${tool.slug}` : `/en/trading-tools/${tool.slug}`;
                return (
                  <Link
                    key={tool.slug}
                    href={href}
                    aria-label={tool.name}
                    className="tecpey-pressable group flex min-h-24 min-w-0 flex-col items-center justify-center rounded-2xl border border-blue-300/15 bg-blue-500/[0.045] px-2 py-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:min-h-[112px]"
                  >
                    <span
                      aria-hidden="true"
                      className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-cyan-300/25 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.34),transparent_30%),linear-gradient(145deg,#0f172a,#0e7490)] text-sm font-black text-white shadow-[0_9px_20px_rgba(8,145,178,.16)]"
                    >
                      <span>{tool.logo || tool.name.slice(0, 1)}</span>
                      <svg
                        viewBox="0 0 32 32"
                        className="pointer-events-none absolute inset-1 h-8 w-8 rounded-full bg-white p-0.5"
                        focusable="false"
                        aria-hidden="true"
                      >
                        <image
                          href={tool.logoUrl}
                          width="32"
                          height="32"
                          preserveAspectRatio="xMidYMid meet"
                          onError={(event) => {
                            event.currentTarget.ownerSVGElement?.style.setProperty("display", "none");
                          }}
                        />
                      </svg>
                    </span>
                    <span dir="ltr" className="mt-1.5 w-full truncate text-xs font-black text-[color:var(--tp-text)]">
                      {tool.name}
                    </span>
                    <span className="sr-only">{strings.rank} {rankLabel(rank, locale)}</span>
                  </Link>
                );
              })}
        </div>

        <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-cyan-300/10 pt-2.5 text-[10px] font-bold text-[color:var(--tp-muted)] sm:text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{strings.educational}</span>
            {radar?.evidence ? (
              <span className="inline-flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${!isPartial && radar.evidence.status === "ready" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                {strings.updated}: {evidenceDate(radar.evidence.updatedAt, locale)} · {!isPartial && radar.evidence.status === "ready" ? strings.ready : strings.degraded}
                {isPartial ? ` · ${rankLabel(activeItemCount, locale)}/${rankLabel(5, locale)} ${strings.available}` : null}
              </span>
            ) : null}
          </div>
          <Link href={listHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-black text-cyan-700 hover:bg-cyan-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-cyan-200">
            {listLabel}
            <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
